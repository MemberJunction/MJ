/**************************************************************************************************
 * Migration: Predictive Studio — honest serving (publish records, scoring runs, monitoring results,
 * output bindings, the ML Models registry columns, model predictions as Feature Values)
 *
 *   1. MLModelPublishRecord  (MJ: ML Model Publish Records)  — the ledger of every human sign-off, every
 *                                                              applied publish or rollback, and every refused
 *                                                              publish attempt. Rows are never updated, except
 *                                                              that spDeleteEntityWithCoreDependencies clears
 *                                                              SignOffID, ReplacesModelID and TrainingRunID when
 *                                                              the referenced row is removed with its entity (D4-73).
 *      MLScoringRun          (MJ: ML Scoring Runs)          — one row per scoring call, dry runs and refusals
 *                                                              included.
 *      MLMonitoringResult    (MJ: ML Monitoring Results)    — one row per model per monitoring period.
 *      MLOutputBinding       (MJ: ML Output Bindings)       — how one surface shows a model's output.
 *   2. MLModel               + the registry entry (lineage, artifact hash and status, delivery, status reason),
 *                              the statuses KeepBaseline and Unevaluated, the serving flag of a pre-change model
 *   3. MLModel               duplicate (PipelineID, Version) rows renumbered, then one version per pipeline
 *   4. FeatureValue          + Role and MLModelID, added only when absent (another migration may add them first),
 *                              with their entity metadata rows under the same fixed IDs
 *   5. FeatureValue          the per-record, per-feature as-of index
 *   6. vwLatestFeatureValues and its read-only virtual entity MJ: Latest Feature Values
 *   7. spDeleteEntityWithCoreDependencies, re-created to clear the serving tables' rows when an entity is removed
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
-- 4. FeatureValue + Role and MLModelID
-- ============================================================================
-- Another migration may already have added these two columns, their constraints, their descriptions and
-- their entity metadata rows under the same IDs, so every object here is added only when it is absent and
-- this migration applies before or after it. The descriptions are added only when the column has none:
-- spUpdateExistingEntityFieldsFromSchema copies the extended property into EntityField.Description, so any
-- other string would overwrite the existing one on every database that runs both.
-- mj-standards-allow: existence-guard
IF COL_LENGTH(N'${flyway:defaultSchema}.FeatureValue', N'Role') IS NULL
    ALTER TABLE [${flyway:defaultSchema}].[FeatureValue]
        ADD [Role] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_FeatureValue_Role] DEFAULT (N'Champion');
GO
-- mj-standards-allow: existence-guard
IF OBJECT_ID(N'${flyway:defaultSchema}.CK_FeatureValue_Role', N'C') IS NULL
    ALTER TABLE [${flyway:defaultSchema}].[FeatureValue]
        ADD CONSTRAINT [CK_FeatureValue_Role] CHECK ([Role] IN (N'Champion', N'Challenger'));
GO
-- mj-standards-allow: existence-guard
IF COL_LENGTH(N'${flyway:defaultSchema}.FeatureValue', N'MLModelID') IS NULL
    ALTER TABLE [${flyway:defaultSchema}].[FeatureValue] ADD [MLModelID] UNIQUEIDENTIFIER NULL;
GO
-- mj-standards-allow: existence-guard
IF OBJECT_ID(N'${flyway:defaultSchema}.FK_FeatureValue_MLModel', N'F') IS NULL
    ALTER TABLE [${flyway:defaultSchema}].[FeatureValue]
        ADD CONSTRAINT [FK_FeatureValue_MLModel] FOREIGN KEY ([MLModelID])
                REFERENCES [${flyway:defaultSchema}].[MLModel] ([ID]);
GO
-- CodeGen creates this FK index on the database but writes it into its output only for a new or modified
-- entity, and the field rows above leave FeatureValue unmodified, so the index is written here.
-- Index for foreign key MLModelID in table FeatureValue
-- mj-standards-allow: existence-guard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_MLModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_MLModelID ON [${flyway:defaultSchema}].[FeatureValue] ([MLModelID]);
GO
-- mj-standards-allow: existence-guard
IF NOT EXISTS (SELECT 1 FROM sys.extended_properties
               WHERE [major_id] = OBJECT_ID(N'${flyway:defaultSchema}.FeatureValue') AND [name] = N'MS_Description'
                 AND [minor_id] = COLUMNPROPERTY(OBJECT_ID(N'${flyway:defaultSchema}.FeatureValue'), N'Role', 'ColumnId'))
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Champion for the production value of the record process; Challenger for a shadow score from its challenger, kept for comparison only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue',
    @level2type = N'COLUMN', @level2name = N'Role';
GO
-- mj-standards-allow: existence-guard
IF NOT EXISTS (SELECT 1 FROM sys.extended_properties
               WHERE [major_id] = OBJECT_ID(N'${flyway:defaultSchema}.FeatureValue') AND [name] = N'MS_Description'
                 AND [minor_id] = COLUMNPROPERTY(OBJECT_ID(N'${flyway:defaultSchema}.FeatureValue'), N'MLModelID', 'ColumnId'))
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The MJ: ML Models record that scored this value, for values written by an ML Model record process (the champion''s audit row or a shadow challenger''s row). NULL for values from AI prompts, which record their model in AIModelID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue',
    @level2type = N'COLUMN', @level2name = N'MLModelID';
GO

-- The entity metadata of the two columns, each row under its fixed ID and added only when absent, so the
-- CodeGen output below carries none of them and a database that has them already gains no duplicate.
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '234fb2ce-776d-4d36-b356-0fe1348132b4' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'Role')) BEGIN
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
            '234fb2ce-776d-4d36-b356-0fe1348132b4',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'Role',
            'Role',
            'Champion for the production value of the record process; Challenger for a shadow score from its challenger, kept for comparison only.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Champion',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '728338f3-7230-42c1-9ad1-6956afec40b7' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'MLModelID')) BEGIN
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
            '728338f3-7230-42c1-9ad1-6956afec40b7',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'MLModelID',
            'ML Model ID',
            'The MJ: ML Models record that scored this value, for values written by an ML Model record process (the champion''s audit row or a shadow challenger''s row). NULL for values from AI prompts, which record their model in AIModelID.',
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
GO

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] = '234FB2CE-776D-4D36-B356-0FE1348132B4' AND [Value] = 'Challenger')
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('77b68e90-506f-4019-b6a3-914699c91335', '234FB2CE-776D-4D36-B356-0FE1348132B4', 1, 'Challenger', 'Challenger', 'Check', GETUTCDATE(), GETUTCDATE());

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] = '234FB2CE-776D-4D36-B356-0FE1348132B4' AND [Value] = 'Champion')
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('13832682-906a-4d0f-a819-ce365aa93d97', '234FB2CE-776D-4D36-B356-0FE1348132B4', 2, 'Champion', 'Champion', 'Check', GETUTCDATE(), GETUTCDATE());

-- Idempotent: the Role field's values come from its CHECK constraint.
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='234FB2CE-776D-4D36-B356-0FE1348132B4';
GO

/* Create Entity Relationship: MJ: ML Models -> MJ: Feature Values (One To Many via MLModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '502b4788-9425-4cbf-8fbe-a5e8b0599f9c' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND [RelatedEntityJoinField] = 'MLModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('502b4788-9425-4cbf-8fbe-a5e8b0599f9c', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'MLModelID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
GO

-- ============================================================================
-- 5. FeatureValue: the latest value of one record's feature, by effective date
-- ============================================================================
CREATE NONCLUSTERED INDEX [IX_FeatureValue_Record_Feature_AsOf]
    ON [${flyway:defaultSchema}].[FeatureValue] ([EntityID], [RecordID], [FeatureName], [EffectiveAsOf] DESC, [ComputedAt] DESC)
    INCLUDE ([Source], [Role]);
GO

-- ============================================================================
-- 6. vwLatestFeatureValues and the MJ: Latest Feature Values virtual entity
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
-- 7. spDeleteEntityWithCoreDependencies: the serving tables (§5.9, D4-32)
-- ============================================================================
-- Sections 1, 2 and 4 add foreign keys into tables this proc deletes from when an entity is removed (MLModel,
-- MLTrainingRun, MLTrainingSnapshot, MLModelScoringBinding, Entity), so removing an entity whose pipeline has a
-- model with a publish record, a scoring run, a monitoring result or an output binding would fail on those FKs.
-- The proc clears them after the pipelines' own steps begin and before the binding, run, model and snapshot deletes:
--    - MLModelPublishRecord.ModelID -> MLModel (delete); .TrainingRunID -> MLTrainingRun (a run-level refusal, whose
--      ModelID is NULL, is deleted, since nulling its run would break CK_MLModelPublishRecord_Subject; a surviving
--      model's record that names the run is kept and loses only the link); .SignOffID -> MLModelPublishRecord,
--      .ReplacesModelID -> MLModel (null). These are the only mutations of a publish record (D4-73).
--    - MLModel.TrainingRunID -> MLTrainingRun, .TrainingSnapshotID -> MLTrainingSnapshot (null)
--    - FeatureValue.MLModelID -> MLModel (null, after the deleted models' Source = 'Model' rows are deleted; that
--      DELETE matches nothing until the Source CHECK admits 'Model', and holds D4-32's order from this migration on)
--    - MLOutputBinding.ModelID, MLMonitoringResult.ModelID -> MLModel (delete); MLScoringRun.ModelID -> MLModel
--      (delete: CK_MLScoringRun_Model forbids a null model on a run that is not refused)
--    - MLScoringRun.MLModelScoringBindingID -> MLModelScoringBinding, MLMonitoringResult.ChallengerRunID ->
--      MLTrainingRun (null)
--    - MLScoringRun.ScopeEntityID -> Entity (delete), in @Handled
-- The FKs into [User], MLPredictionUnit, MLEvaluationProtocol, ProcessRun and ScheduledJobRun need no step: the proc
-- deletes from none of those tables. The policy in
-- packages/CodeGenLib/src/__tests__/fixtures/entity-delete-fk-policy.json records every entry. The rest of the proc
-- is V202611101200's definition (V202611080314's plus EntityUniqueKey), unchanged.
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
      (N'ArchiveRunDetail.EntityID'), (N'AuditLog.EntityID'), (N'CalendarEventLink.EntityID'),
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
    -- CK_AIAgentSession_LinkBinding / CK_Conversation_LinkBinding: both columns or neither
    UPDATE [${flyway:defaultSchema}].[AIAgentSession] SET [LinkedEntityID] = NULL, [LinkedRecordID] = NULL WHERE [LinkedEntityID] = @EntityID;
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
    -- the only mutation of a publish record: spDeleteEntityWithCoreDependencies clears SignOffID/ReplacesModelID when the referenced row is removed with its entity (D4-73)
    UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [SignOffID] = NULL WHERE [SignOffID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLModelPublishRecord] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs) OR ([ModelID] IS NULL AND [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs))));
    UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [ReplacesModelID] = NULL WHERE [ReplacesModelID] IN (SELECT ID FROM @MLModelIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLModelPublishRecord] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs) OR ([ModelID] IS NULL AND [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs)));
    -- the rows left that name one of the runs have a ModelID, so clearing TrainingRunID keeps CK_MLModelPublishRecord_Subject (D4-73)
    UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [TrainingRunID] = NULL WHERE [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    -- another pipeline's model that names one of these runs or snapshots loses only the lineage link
    UPDATE [${flyway:defaultSchema}].[MLModel] SET [TrainingRunID] = NULL WHERE [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    UPDATE [${flyway:defaultSchema}].[MLModel] SET [TrainingSnapshotID] = NULL WHERE [TrainingSnapshotID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingSnapshot] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    -- the models' predictions are deleted before MLModelID is cleared on any other Feature Value (D4-32)
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [Source] = N'Model' AND [MLModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[FeatureValue] SET [MLModelID] = NULL WHERE [MLModelID] IN (SELECT ID FROM @MLModelIDs);
    -- output bindings, scoring runs (CK_MLScoringRun_Model forbids clearing a run's model) and monitoring results
    DELETE FROM [${flyway:defaultSchema}].[MLOutputBinding] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLScoringRun] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[MLScoringRun] SET [MLModelScoringBindingID] = NULL WHERE [MLModelScoringBindingID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [MLModelID] IN (SELECT ID FROM @MLModelIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLMonitoringResult] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[MLMonitoringResult] SET [ChallengerRunID] = NULL WHERE [ChallengerRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [MLModelID] IN (SELECT ID FROM @MLModelIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLModel] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    -- the pipelines' training snapshots; a run of another pipeline that names one loses only the link
    UPDATE [${flyway:defaultSchema}].[MLTrainingRun] SET [TrainingSnapshotID] = NULL WHERE [TrainingSnapshotID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingSnapshot] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingSnapshot] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingPipeline] WHERE [TargetEntityID] = @EntityID;
    -- scoring runs scoped to this entity, whatever model they ran (ScopeEntityID is NOT NULL)
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




























































/* =====================================================================================
 * EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * Entity and EntityField metadata for MJ: ML Model Publish Records, MJ: ML Scoring Runs,
 * MJ: ML Monitoring Results, MJ: ML Output Bindings and the virtual entity MJ: Latest Feature
 * Values; new fields of MJ: ML Models and MJ: Feature Values; value lists, entity relationships,
 * entity unique keys (including three for the training schema's existing unique constraints,
 * which the unique-key table was created without), field categories and descriptions; base
 * views, spCreate/spUpdate/spDelete (including spCreate/spUpdateEntityOrganicKey and
 * spDeleteAIPrompt, regenerated from the current schema), permissions and FK indexes.
 * Two CodeGen passes on a database built from scratch by mj migrate, in order: the first creates
 * the entities, views and procedures and chooses the new entities' name fields; the second adds
 * the related-name columns those choices make possible (MLModel, Model, ReplacesModel, ...) to the
 * base views of MJ: Feature Values, the four new entities, MJ: ML Model Scoring Bindings and
 * MJ: ML Training Runs, with their fields and procedures.
 * Do NOT edit by hand: if the DDL above changes, re-run CodeGen and replace this section.
 * Three hand edits (guards on PR 3's EntityUniqueKey rows), each marked "HAND EDIT" where it is, must be
 * re-applied after any regeneration: the three EntityUniqueKey inserts for the training schema's existing
 * constraints are guarded by ID or by (EntityID, Name).
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
         'd7ee5581-bb29-45d1-94ae-e5f2e99bdc68',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd7ee5581-bb29-45d1-94ae-e5f2e99bdc68', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d7ee5581-bb29-45d1-94ae-e5f2e99bdc68' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d7ee5581-bb29-45d1-94ae-e5f2e99bdc68' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d7ee5581-bb29-45d1-94ae-e5f2e99bdc68' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d7ee5581-bb29-45d1-94ae-e5f2e99bdc68' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d7ee5581-bb29-45d1-94ae-e5f2e99bdc68' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d7ee5581-bb29-45d1-94ae-e5f2e99bdc68' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         'cd0aea13-c20d-4015-80b6-88cf77adffe3',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'cd0aea13-c20d-4015-80b6-88cf77adffe3', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('cd0aea13-c20d-4015-80b6-88cf77adffe3' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('cd0aea13-c20d-4015-80b6-88cf77adffe3' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('cd0aea13-c20d-4015-80b6-88cf77adffe3' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('cd0aea13-c20d-4015-80b6-88cf77adffe3' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('cd0aea13-c20d-4015-80b6-88cf77adffe3' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('cd0aea13-c20d-4015-80b6-88cf77adffe3' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '3be035a4-4547-45b9-ab8c-c785b0eb53c1',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3be035a4-4547-45b9-ab8c-c785b0eb53c1', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('3be035a4-4547-45b9-ab8c-c785b0eb53c1' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('3be035a4-4547-45b9-ab8c-c785b0eb53c1' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('3be035a4-4547-45b9-ab8c-c785b0eb53c1' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('3be035a4-4547-45b9-ab8c-c785b0eb53c1' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('3be035a4-4547-45b9-ab8c-c785b0eb53c1' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('3be035a4-4547-45b9-ab8c-c785b0eb53c1' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '5501c7ed-0677-4e2d-a508-b3f16eb4ef24',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '5501c7ed-0677-4e2d-a508-b3f16eb4ef24', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('5501c7ed-0677-4e2d-a508-b3f16eb4ef24' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('5501c7ed-0677-4e2d-a508-b3f16eb4ef24' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('5501c7ed-0677-4e2d-a508-b3f16eb4ef24' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('5501c7ed-0677-4e2d-a508-b3f16eb4ef24' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('5501c7ed-0677-4e2d-a508-b3f16eb4ef24' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('5501c7ed-0677-4e2d-a508-b3f16eb4ef24' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

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

/* SQL text to insert 113 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe7a9d84-9bc5-4403-95a5-372ed70af251' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ID')) BEGIN
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
            'fe7a9d84-9bc5-4403-95a5-372ed70af251',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23f290d7-859f-474e-b7c2-a69524e4ebd3' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'EntityID')) BEGIN
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
            '23f290d7-859f-474e-b7c2-a69524e4ebd3',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd41a6710-aa48-4b58-b191-748b1c455040' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'RecordID')) BEGIN
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
            'd41a6710-aa48-4b58-b191-748b1c455040',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5390dcf5-7ec3-4398-985e-bd0e25b50c29' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'FeatureName')) BEGIN
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
            '5390dcf5-7ec3-4398-985e-bd0e25b50c29',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ba6b165-5c8e-498d-8e5c-825fbc51e17a' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Source')) BEGIN
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
            '4ba6b165-5c8e-498d-8e5c-825fbc51e17a',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30627b7b-42ed-45bc-856b-c9a52cb364a4' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Role')) BEGIN
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
            '30627b7b-42ed-45bc-856b-c9a52cb364a4',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fb3c9e7-9c70-4718-b69d-a5b815b9e6d2' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'EffectiveAsOf')) BEGIN
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
            '2fb3c9e7-9c70-4718-b69d-a5b815b9e6d2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '449f255c-ff2c-48d0-9552-79056e36a32b' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ComputedAt')) BEGIN
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
            '449f255c-ff2c-48d0-9552-79056e36a32b',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3e318c59-5e51-4b5c-977b-b57604fb3f4c' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'MLModelID')) BEGIN
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
            '3e318c59-5e51-4b5c-977b-b57604fb3f4c',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39039ec4-a370-4ecc-9b31-ffc639568fa3' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'RecordProcessID')) BEGIN
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
            '39039ec4-a370-4ecc-9b31-ffc639568fa3',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42e506e6-83f8-4207-91f1-ebf465942c9a' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueText')) BEGIN
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
            '42e506e6-83f8-4207-91f1-ebf465942c9a',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c91ed906-44f7-4d47-9f3a-8de5d58c1df2' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueNumeric')) BEGIN
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
            'c91ed906-44f7-4d47-9f3a-8de5d58c1df2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'db6dc8ec-a495-4912-a4f8-fcae8c41217a' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueDate')) BEGIN
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
            'db6dc8ec-a495-4912-a4f8-fcae8c41217a',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c73cd361-53ec-4a99-a68a-018e6c27b368' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueBoolean')) BEGIN
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
            'c73cd361-53ec-4a99-a68a-018e6c27b368',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '95803c68-01de-437b-b0bc-f353678b0ca0' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueJSON')) BEGIN
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
            '95803c68-01de-437b-b0bc-f353678b0ca0',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34224e52-b5b6-469c-adaa-44798fc552b8' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Confidence')) BEGIN
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
            '34224e52-b5b6-469c-adaa-44798fc552b8',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e953e7d-ddd0-4436-a27d-17b751c5d7b1' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'ID')) BEGIN
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
            '4e953e7d-ddd0-4436-a27d-17b751c5d7b1',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '29fb3dfd-4d4e-4a65-9a23-5163b3c9a854' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'ModelID')) BEGIN
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
            '29fb3dfd-4d4e-4a65-9a23-5163b3c9a854',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f33f2f0e-049d-4e19-bf92-420670ba2635' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'ModelVersion')) BEGIN
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
            'f33f2f0e-049d-4e19-bf92-420670ba2635',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5edf42f3-3778-4bb2-89b4-1ed1034e6da0' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'MLModelScoringBindingID')) BEGIN
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
            '5edf42f3-3778-4bb2-89b4-1ed1034e6da0',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cedda74f-b715-4c30-8295-14b338be94fb' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'ArtifactSha256')) BEGIN
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
            'cedda74f-b715-4c30-8295-14b338be94fb',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aef17108-5243-4f7a-b2f2-f083e9d862d7' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'FeatureSchemaHash')) BEGIN
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
            'aef17108-5243-4f7a-b2f2-f083e9d862d7',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b002b26-fba5-4644-883b-374851af1b1b' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'Path')) BEGIN
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
            '2b002b26-fba5-4644-883b-374851af1b1b',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41aa63cc-a5f1-4d92-a926-8d23f9c1f0be' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'ScopeKind')) BEGIN
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
            '41aa63cc-a5f1-4d92-a926-8d23f9c1f0be',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c8a0421-8834-4a4c-b2e8-02516563631f' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'ScopeEntityID')) BEGIN
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
            '1c8a0421-8834-4a4c-b2e8-02516563631f',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b2c81cf-0de1-4be5-99d7-95a9bccb93e4' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'Scope')) BEGIN
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
            '1b2c81cf-0de1-4be5-99d7-95a9bccb93e4',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f398a8d9-606b-45aa-b8c9-5a170086c352' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'EntityMapping')) BEGIN
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
            'f398a8d9-606b-45aa-b8c9-5a170086c352',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0acf5858-9ea5-4733-995f-43e801191fed' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'AsOfDate')) BEGIN
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
            '0acf5858-9ea5-4733-995f-43e801191fed',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6104daf5-c4af-46b3-9b34-0329d19fc861' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'ReadPolicy')) BEGIN
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
            '6104daf5-c4af-46b3-9b34-0329d19fc861',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd159a723-2a43-443b-a2a7-bfedfd34c146' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'DryRun')) BEGIN
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
            'd159a723-2a43-443b-a2a7-bfedfd34c146',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f345147-910e-497a-a041-2e3c000a26ca' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'RequestedBy')) BEGIN
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
            '0f345147-910e-497a-a041-2e3c000a26ca',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c0d44e9-f8c2-43c9-b415-d9e825f3b7fc' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'RequestedByUserID')) BEGIN
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
            '9c0d44e9-f8c2-43c9-b415-d9e825f3b7fc',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42c3c84f-313c-451b-9cfa-395da8e48429' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'ProcessRunID')) BEGIN
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
            '42c3c84f-313c-451b-9cfa-395da8e48429',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a3caa0e1-fe01-4404-b690-8cb325930861' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'ScheduledJobRunID')) BEGIN
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
            'a3caa0e1-fe01-4404-b690-8cb325930861',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd3793a1f-ae8b-494a-add8-92103765a85d' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'Status')) BEGIN
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
            'd3793a1f-ae8b-494a-add8-92103765a85d',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c9d6e47-0123-452e-9a0d-08d52061a0ab' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'Refusal')) BEGIN
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
            '3c9d6e47-0123-452e-9a0d-08d52061a0ab',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1fdeb082-1fb3-4dff-a64d-36bacdf7f808' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'Total')) BEGIN
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
            '1fdeb082-1fb3-4dff-a64d-36bacdf7f808',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1b634cc-97c2-49cd-bdfb-228e49bf5b30' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'Written')) BEGIN
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
            'b1b634cc-97c2-49cd-bdfb-228e49bf5b30',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b7ea6028-eac6-409b-b548-ed0fc0fd6b57' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'Failed')) BEGIN
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
            'b7ea6028-eac6-409b-b548-ed0fc0fd6b57',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d7650f9-c8d6-4ea7-81d9-4e9a5a261c85' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'Skipped')) BEGIN
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
            '8d7650f9-c8d6-4ea7-81d9-4e9a5a261c85',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fbfd9781-78db-4e2d-aac3-fffec2fb1e7e' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'FirstErrors')) BEGIN
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
            'fbfd9781-78db-4e2d-aac3-fffec2fb1e7e',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5913d26e-730f-467d-b989-712f90da71d6' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'StartedAt')) BEGIN
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
            '5913d26e-730f-467d-b989-712f90da71d6',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a136884-2df1-451f-a4c1-e974b71fe5d4' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'EndedAt')) BEGIN
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
            '1a136884-2df1-451f-a4c1-e974b71fe5d4',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31d0a1e4-693f-48cb-8abb-d6b2b90135f9' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = '__mj_CreatedAt')) BEGIN
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
            '31d0a1e4-693f-48cb-8abb-d6b2b90135f9',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7549d85b-e5b6-4985-a51c-d9dab04b28c3' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '7549d85b-e5b6-4985-a51c-d9dab04b28c3',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd3dd3a9-d7f0-4960-9669-7b55c88f0968' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'PredictionUnitID')) BEGIN
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
            'dd3dd3a9-d7f0-4960-9669-7b55c88f0968',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1426b3ca-0ac7-4bba-a37d-672247e0f5c1' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'EvaluationProtocolID')) BEGIN
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
            '1426b3ca-0ac7-4bba-a37d-672247e0f5c1',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18ebd619-0095-466c-b5da-e0c906f03bc0' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingSnapshotID')) BEGIN
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
            '18ebd619-0095-466c-b5da-e0c906f03bc0',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23978a23-0608-4f85-a6e5-bbadd641a421' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingRunID')) BEGIN
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
            '23978a23-0608-4f85-a6e5-bbadd641a421',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6fff1bcb-c55b-4956-b737-5b5335daec5d' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactSha256')) BEGIN
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
            '6fff1bcb-c55b-4956-b737-5b5335daec5d',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5fd3f19f-ed64-41d8-9fda-cecd3a416e6f' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'SnapshotHash')) BEGIN
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
            '5fd3f19f-ed64-41d8-9fda-cecd3a416e6f',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56843bc2-e0fc-4117-8464-bf4297e232eb' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'CodeVersion')) BEGIN
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
            '56843bc2-e0fc-4117-8464-bf4297e232eb',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5a88fb1-cdfe-4a79-8cda-6b04a90a3ddb' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'FeatureSchemaHash')) BEGIN
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
            'e5a88fb1-cdfe-4a79-8cda-6b04a90a3ddb',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bace5cae-2f4d-450a-acae-57d3d289f5d5' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'OutputSemantics')) BEGIN
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
            'bace5cae-2f4d-450a-acae-57d3d289f5d5',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5c096645-0ae7-4eb9-a421-cb1c2f8968f7' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Delivery')) BEGIN
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
            '5c096645-0ae7-4eb9-a421-cb1c2f8968f7',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd3e4f2ea-88ad-40a5-9ce5-37ff784a1aca' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'StatusReason')) BEGIN
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
            'd3e4f2ea-88ad-40a5-9ce5-37ff784a1aca',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7d61c57-fa85-44f6-9d3c-15cd57a745e4' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactStatus')) BEGIN
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
            'a7d61c57-fa85-44f6-9d3c-15cd57a745e4',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '334c9bb1-fb70-4d5d-a9c9-fa8404787a9d' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactCheckedAt')) BEGIN
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
            '334c9bb1-fb70-4d5d-a9c9-fa8404787a9d',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d1b8e9c-a59d-4dc8-9ef1-b351322dd651' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ServingWhileUnevaluated')) BEGIN
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
            '6d1b8e9c-a59d-4dc8-9ef1-b351322dd651',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58f2654a-15bb-4b42-a210-279e0d51dbb1' OR (EntityID = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND Name = 'ID')) BEGIN
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
            '58f2654a-15bb-4b42-a210-279e0d51dbb1',
            '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e32c4553-b310-47a0-b23e-8f065ee970aa' OR (EntityID = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND Name = 'ModelID')) BEGIN
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
            'e32c4553-b310-47a0-b23e-8f065ee970aa',
            '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '518eed19-b699-4f08-a923-218a5891f1a2' OR (EntityID = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND Name = 'Surface')) BEGIN
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
            '518eed19-b699-4f08-a923-218a5891f1a2',
            '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a2401385-d2e3-4699-b8d1-2035836faf81' OR (EntityID = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND Name = 'SortsBy')) BEGIN
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
            'a2401385-d2e3-4699-b8d1-2035836faf81',
            '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '370252bd-3494-4e7c-bff2-fb4f9181297e' OR (EntityID = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND Name = 'DriverDirectionRelativeTo')) BEGIN
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
            '370252bd-3494-4e7c-bff2-fb4f9181297e',
            '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '013a8198-d6e6-40ff-a680-0529c5e1d322' OR (EntityID = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND Name = 'Label')) BEGIN
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
            '013a8198-d6e6-40ff-a680-0529c5e1d322',
            '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63134327-014d-4e4a-8b52-8682e1b065fb' OR (EntityID = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND Name = '__mj_CreatedAt')) BEGIN
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
            '63134327-014d-4e4a-8b52-8682e1b065fb',
            '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c432b294-3b81-46d1-8d61-debd70f7d6de' OR (EntityID = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'c432b294-3b81-46d1-8d61-debd70f7d6de',
            '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e85a25de-176b-46f0-9972-4b6d5634f45e' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'ID')) BEGIN
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
            'e85a25de-176b-46f0-9972-4b6d5634f45e',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e6b7ae1-b468-42f7-8db8-ad2dedeff9f4' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'ModelID')) BEGIN
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
            '6e6b7ae1-b468-42f7-8db8-ad2dedeff9f4',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '49c26f6a-d2cd-41e7-aca0-a1aae11d33ca' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'ScheduledJobRunID')) BEGIN
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
            '49c26f6a-d2cd-41e7-aca0-a1aae11d33ca',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0dc6927-dea8-4f30-86f5-f444bb6a3753' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'Period')) BEGIN
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
            'a0dc6927-dea8-4f30-86f5-f444bb6a3753',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fbd837a5-2507-47f4-b592-24b7c508e411' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'PeriodGrain')) BEGIN
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
            'fbd837a5-2507-47f4-b592-24b7c508e411',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4825eb5-8388-41d9-b361-93f8cc25e58d' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'State')) BEGIN
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
            'e4825eb5-8388-41d9-b361-93f8cc25e58d',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf4a0fbe-7743-42cc-9a21-0a85132cd532' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'ScoredRows')) BEGIN
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
            'bf4a0fbe-7743-42cc-9a21-0a85132cd532',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '196649ef-91a7-4b86-a0ec-a536c56a5060' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'JoinedRows')) BEGIN
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
            '196649ef-91a7-4b86-a0ec-a536c56a5060',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5875ef0-b8e2-409e-bf7e-5714be5bd8a8' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'ExcludedInTrainingRows')) BEGIN
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
            'a5875ef0-b8e2-409e-bf7e-5714be5bd8a8',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3c78d2a-775e-4afe-9319-5d0d079bd745' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'PrimaryScore')) BEGIN
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
            'e3c78d2a-775e-4afe-9319-5d0d079bd745',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '76c0d82d-ca3f-4139-a521-dcce316de380' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'PrimaryValue')) BEGIN
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
            '76c0d82d-ca3f-4139-a521-dcce316de380',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5fcda53-c55d-4f96-b5e2-1711561c6323' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'PrimaryLower')) BEGIN
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
            'e5fcda53-c55d-4f96-b5e2-1711561c6323',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea397442-4e81-4662-bb3f-a66a8c861a8b' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'PrimaryUpper')) BEGIN
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
            'ea397442-4e81-4662-bb3f-a66a8c861a8b',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a1f5cd5-286f-46bf-a9b1-e5f29e99b339' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'TrackedMetrics')) BEGIN
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
            '9a1f5cd5-286f-46bf-a9b1-e5f29e99b339',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b36f73b1-379f-40bc-994b-31a6d137c4b3' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'Calibration')) BEGIN
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
            'b36f73b1-379f-40bc-994b-31a6d137c4b3',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8fe1e537-2227-447f-acd6-f0ef7effc26d' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'DriftLook')) BEGIN
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
            '8fe1e537-2227-447f-acd6-f0ef7effc26d',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a5ddca6-0359-43d0-98bd-96eac7fa3964' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'DriftAlarms')) BEGIN
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
            '5a5ddca6-0359-43d0-98bd-96eac7fa3964',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c8ce966-279b-4f2f-b42a-774eaa149286' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'Parity')) BEGIN
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
            '7c8ce966-279b-4f2f-b42a-774eaa149286',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cec3a62f-2d89-441b-b5c6-21230239331d' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'TriggersFired')) BEGIN
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
            'cec3a62f-2d89-441b-b5c6-21230239331d',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c993b8a-0a55-488d-b6c7-a8c74b26964b' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'ChallengerRunID')) BEGIN
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
            '7c993b8a-0a55-488d-b6c7-a8c74b26964b',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad8bb6c9-2ce2-43d5-8060-59ef4a02d283' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'ChallengerResult')) BEGIN
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
            'ad8bb6c9-2ce2-43d5-8060-59ef4a02d283',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb36bd59-f145-48d6-bbd0-d8b11cf105d2' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'RollbackCheck')) BEGIN
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
            'fb36bd59-f145-48d6-bbd0-d8b11cf105d2',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5cff6788-edff-4de5-b59c-1ad28417aa4d' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'ErrorMessage')) BEGIN
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
            '5cff6788-edff-4de5-b59c-1ad28417aa4d',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0347955-2c4c-4cd2-a70d-23beac18f966' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = '__mj_CreatedAt')) BEGIN
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
            'b0347955-2c4c-4cd2-a70d-23beac18f966',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26eaba0b-8134-452b-933f-6c96f8184356' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '26eaba0b-8134-452b-933f-6c96f8184356',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a2fe7b1f-be33-42e6-9ec3-d1e72912f29b' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'ID')) BEGIN
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
            'a2fe7b1f-be33-42e6-9ec3-d1e72912f29b',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1d605d1-ee28-477c-987b-b9b2931df177' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'ModelID')) BEGIN
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
            'b1d605d1-ee28-477c-987b-b9b2931df177',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8c9864ef-4e03-483a-addb-86ebbe34c9ee' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'TrainingRunID')) BEGIN
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
            '8c9864ef-4e03-483a-addb-86ebbe34c9ee',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '52e5a191-cad1-49b8-a38b-852a6b6088ad' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'Kind')) BEGIN
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
            '52e5a191-cad1-49b8-a38b-852a6b6088ad',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1af5e11a-17c2-42a8-ae95-a3be9ea4177f' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'Purpose')) BEGIN
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
            '1af5e11a-17c2-42a8-ae95-a3be9ea4177f',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3dac9cc6-05c4-483f-a95f-f116dbc57e17' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'ApproverKind')) BEGIN
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
            '3dac9cc6-05c4-483f-a95f-f116dbc57e17',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '45784fd0-09e1-47ca-894a-7d80138a7524' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'UserID')) BEGIN
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
            '45784fd0-09e1-47ca-894a-7d80138a7524',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9fc9ca75-5e5a-4ded-af9e-bde674246bf1' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'Initiator')) BEGIN
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
            '9fc9ca75-5e5a-4ded-af9e-bde674246bf1',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f195eab5-f0ce-4d69-a58c-7f84efebd5b1' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'RecordedAt')) BEGIN
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
            'f195eab5-f0ce-4d69-a58c-7f84efebd5b1',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41b98a5a-75ea-4a64-9c71-0a56eb4d3774' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'Decision')) BEGIN
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
            '41b98a5a-75ea-4a64-9c71-0a56eb4d3774',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '35919c9d-65ce-485f-8b30-34d4558baab2' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'Reason')) BEGIN
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
            '35919c9d-65ce-485f-8b30-34d4558baab2',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9395f9d6-d935-482b-a115-8179f3e072a8' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'GateDecision')) BEGIN
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
            '9395f9d6-d935-482b-a115-8179f3e072a8',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cab71a26-60ec-4338-9c4f-e538a06b89e9' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'Evidence')) BEGIN
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
            'cab71a26-60ec-4338-9c4f-e538a06b89e9',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8327c808-0032-4220-8ca3-7ac126c064b9' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'EvidenceSha256')) BEGIN
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
            '8327c808-0032-4220-8ca3-7ac126c064b9',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '54aba486-572b-4df0-864e-37767a8b8c50' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'OverridesFlags')) BEGIN
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
            '54aba486-572b-4df0-864e-37767a8b8c50',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c743a3d5-9d82-4064-b87c-fe639d4c2584' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'SignOffID')) BEGIN
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
            'c743a3d5-9d82-4064-b87c-fe639d4c2584',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0344714e-16ac-4943-be84-dfa4e7adbb3e' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'ReplacesModelID')) BEGIN
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
            '0344714e-16ac-4943-be84-dfa4e7adbb3e',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09dfc7e5-acaf-4272-9ce8-f98b3c4cbf30' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'Refusal')) BEGIN
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
            '09dfc7e5-acaf-4272-9ce8-f98b3c4cbf30',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ffc671bd-7bbd-445c-bdfc-ccee6f94339d' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'Transient')) BEGIN
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
            'ffc671bd-7bbd-445c-bdfc-ccee6f94339d',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6012ad6d-1cdd-4115-a92c-e1b5bdc3c849' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = '__mj_CreatedAt')) BEGIN
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
            '6012ad6d-1cdd-4115-a92c-e1b5bdc3c849',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'abe5b75f-4f81-47c8-8061-6e8ecea3c241' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'abe5b75f-4f81-47c8-8061-6e8ecea3c241',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

/* SQL text to sync entity unique keys (9 added, 0 updated, 0 removed) */
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('bda375df-8d6b-4fd4-b14e-15e40218f81d', '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', 'UQ_MLMonitoringResult_ModelPeriod', 'ModelID,PeriodGrain,Period', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('fee928f9-8766-47a9-9648-f927b380edee', '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', 'UQ_MLOutputBinding_ModelSurface', 'ModelID,Surface', NULL);
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = '0f23a073-fb39-491f-a810-ca89ecb627ed' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [Name] = 'UQ_MLEvaluationProtocol_Lineage_Version'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0f23a073-fb39-491f-a810-ca89ecb627ed', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'UQ_MLEvaluationProtocol_Lineage_Version', 'LineageRootID,Version', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('56cd0b8e-ad18-40c4-b9d1-f1bcfd9b1bcd', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'UX_MLModel_OneServingUnevaluatedPerPipeline', 'PipelineID', '([ServingWhileUnevaluated]=(1))');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('5613878f-510c-42fa-8de0-a471cc0f0dda', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'UX_MLModel_PipelineVersion', 'PipelineID,Version', NULL);
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = 'acaab55e-bcb3-457c-a974-072513fc7838' OR ([EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [Name] = 'UQ_MLPredictionUnit_Lineage_Version'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('acaab55e-bcb3-457c-a974-072513fc7838', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'UQ_MLPredictionUnit_Lineage_Version', 'LineageRootID,Version', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('76e7fdd3-b9a8-44e4-8c4f-350f13c032b2', 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', 'UX_MLModelPublishRecord_OnePublishPerRun', 'TrainingRunID', '([Kind]=''publish'' AND ([Purpose] IN (''publish'', ''adopt'')) AND [TrainingRunID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('4b85eb3f-0adc-40de-a69f-f89fb3ebe7c8', 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', 'UX_MLModelPublishRecord_OneRunOutcome', 'TrainingRunID', '([Purpose]=''evaluate'' AND [TrainingRunID] IS NOT NULL)');
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = '3a144a84-4e0c-4276-9ba7-8516304939e0' OR ([EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [Name] = 'UQ_MLTrainingSnapshot_ContentHash'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3a144a84-4e0c-4276-9ba7-8516304939e0', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'UQ_MLTrainingSnapshot_ContentHash', 'ContentHash', NULL);

/* SQL text to sync 5 entity field value row(s) for entity field ID A7D61C57-FA85-44F6-9D3C-15CD57A745E4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e1564152-5a53-4117-8980-9f0ad99dbbc0', 'A7D61C57-FA85-44F6-9D3C-15CD57A745E4', 1, 'hash-mismatch', 'hash-mismatch', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0bb4e184-1337-4323-b2a4-9dd581f6b864', 'A7D61C57-FA85-44F6-9D3C-15CD57A745E4', 2, 'legacy-local', 'legacy-local', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ef857e52-96c4-430c-953e-def180cb06e1', 'A7D61C57-FA85-44F6-9D3C-15CD57A745E4', 3, 'missing', 'missing', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3e4f9bd4-9ea4-4f1b-9cb3-82f69ab28d85', 'A7D61C57-FA85-44F6-9D3C-15CD57A745E4', 4, 'unverified', 'unverified', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fe31257e-1de8-4c09-9456-9c2292b26d4d', 'A7D61C57-FA85-44F6-9D3C-15CD57A745E4', 5, 'verified', 'verified', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A7D61C57-FA85-44F6-9D3C-15CD57A745E4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A7D61C57-FA85-44F6-9D3C-15CD57A745E4';

/* SQL text to sync 4 entity field value row(s) for entity field ID 8B0C0799-D66A-48BA-987D-C32D477E2A28 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('404f9d1b-6971-4643-b5eb-9d030fbd13a7', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 3, 'KeepBaseline', 'KeepBaseline', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('507c2cc2-45b6-4ca2-9d0f-bc90c43e5ca4', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 5, 'Unevaluated', 'Unevaluated', 'Check', GETUTCDATE(), GETUTCDATE());
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='C2CE99CA-0E5D-4227-B71D-55A34C1B1F84';
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='5F645BCA-78A6-4F2F-B01D-1AE7ED48BFC8';

/* SQL text to sync 3 entity field value row(s) for entity field ID 52E5A191-CAD1-49B8-A38B-852A6B6088AD */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('76521b58-3beb-4d4b-86ea-b0dd6ebe5ac3', '52E5A191-CAD1-49B8-A38B-852A6B6088AD', 1, 'publish', 'publish', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b622f3ec-43de-437d-9d66-660d6face674', '52E5A191-CAD1-49B8-A38B-852A6B6088AD', 2, 'refusal', 'refusal', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9acaf5b1-bf5f-4809-a72f-638c847d06eb', '52E5A191-CAD1-49B8-A38B-852A6B6088AD', 3, 'sign-off', 'sign-off', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 52E5A191-CAD1-49B8-A38B-852A6B6088AD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='52E5A191-CAD1-49B8-A38B-852A6B6088AD';

/* SQL text to sync 4 entity field value row(s) for entity field ID 1AF5E11A-17C2-42A8-AE95-A3BE9EA4177F */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4293a01e-2a57-4c8d-94bb-80cb79c8c48c', '1AF5E11A-17C2-42A8-AE95-A3BE9EA4177F', 1, 'adopt', 'adopt', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a321a9bf-e62a-47c3-9040-7dd7277e548e', '1AF5E11A-17C2-42A8-AE95-A3BE9EA4177F', 2, 'evaluate', 'evaluate', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5f71bd01-ced1-4ea5-88e3-9fab06f72ca3', '1AF5E11A-17C2-42A8-AE95-A3BE9EA4177F', 3, 'publish', 'publish', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('082e9eb3-9aa2-4a1c-8013-61471d2c7a4b', '1AF5E11A-17C2-42A8-AE95-A3BE9EA4177F', 4, 'rollback', 'rollback', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1AF5E11A-17C2-42A8-AE95-A3BE9EA4177F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1AF5E11A-17C2-42A8-AE95-A3BE9EA4177F';

/* SQL text to sync 5 entity field value row(s) for entity field ID 2B002B26-FBA5-4644-883B-374851AF1B1B */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7d2f2937-4b68-4978-b189-ce3ebd30fa10', '2B002B26-FBA5-4644-883B-374851AF1B1B', 1, 'monitoring', 'monitoring', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('76dd1fd9-aefd-4281-b3de-646e0e8c1766', '2B002B26-FBA5-4644-883B-374851AF1B1B', 2, 'parity', 'parity', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('72b57071-a250-426b-b418-dd30860ac972', '2B002B26-FBA5-4644-883B-374851AF1B1B', 3, 'predict', 'predict', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c84eadc4-db82-4c84-9163-c6c13447c2e3', '2B002B26-FBA5-4644-883B-374851AF1B1B', 4, 'record-process', 'record-process', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('851b8b0f-5066-4fd5-8c9e-1b54171b4ae9', '2B002B26-FBA5-4644-883B-374851AF1B1B', 5, 'score-record-set', 'score-record-set', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2B002B26-FBA5-4644-883B-374851AF1B1B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2B002B26-FBA5-4644-883B-374851AF1B1B';

/* SQL text to sync 3 entity field value row(s) for entity field ID 41AA63CC-A5F1-4D92-A926-8D23F9C1F0BE */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6ff6c5b6-0f08-418d-a998-e26f9988d81f', '41AA63CC-A5F1-4D92-A926-8D23F9C1F0BE', 1, 'filter', 'filter', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('486d983a-17d8-4ba3-9715-18bf8d4a1f3f', '41AA63CC-A5F1-4D92-A926-8D23F9C1F0BE', 2, 'record-ids', 'record-ids', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('49ac17da-143b-4e57-b682-fa2fd797136c', '41AA63CC-A5F1-4D92-A926-8D23F9C1F0BE', 3, 'view', 'view', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 41AA63CC-A5F1-4D92-A926-8D23F9C1F0BE */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='41AA63CC-A5F1-4D92-A926-8D23F9C1F0BE';

/* SQL text to sync 4 entity field value row(s) for entity field ID D3793A1F-AE8B-494A-ADD8-92103765A85D */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('26e75b23-7b96-4b26-b4e9-02dccb0c8284', 'D3793A1F-AE8B-494A-ADD8-92103765A85D', 1, 'completed', 'completed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('02d05d34-bd19-4833-ad17-fc7620c03ff4', 'D3793A1F-AE8B-494A-ADD8-92103765A85D', 2, 'failed', 'failed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('326dc7cb-fa8c-4b63-b17f-2a8262d9d2f6', 'D3793A1F-AE8B-494A-ADD8-92103765A85D', 3, 'refused', 'refused', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('392314ea-5c44-4247-a9d1-62a6cef332c5', 'D3793A1F-AE8B-494A-ADD8-92103765A85D', 4, 'running', 'running', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D3793A1F-AE8B-494A-ADD8-92103765A85D */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D3793A1F-AE8B-494A-ADD8-92103765A85D';

/* SQL text to sync 3 entity field value row(s) for entity field ID FBD837A5-2507-47F4-B592-24B7C508E411 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4bfa5758-8d42-4900-93a3-4f17a65d5e9c', 'FBD837A5-2507-47F4-B592-24B7C508E411', 1, 'month', 'month', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('232a07ed-acab-489a-b22c-73caf128ca6f', 'FBD837A5-2507-47F4-B592-24B7C508E411', 2, 'quarter', 'quarter', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('04135417-a843-4f11-af0f-90a3571b16e1', 'FBD837A5-2507-47F4-B592-24B7C508E411', 3, 'week', 'week', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID FBD837A5-2507-47F4-B592-24B7C508E411 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FBD837A5-2507-47F4-B592-24B7C508E411';

/* SQL text to sync 3 entity field value row(s) for entity field ID E4825EB5-8388-41D9-B361-93F8CC25E58D */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3eeb3c30-aff8-41ec-9600-ad1d03b53721', 'E4825EB5-8388-41D9-B361-93F8CC25E58D', 1, 'evaluated', 'evaluated', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('46f1b63a-5a09-4817-94f5-dbed321287b1', 'E4825EB5-8388-41D9-B361-93F8CC25E58D', 2, 'failed', 'failed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dffba5f3-a53c-48bf-a114-32c1426badd7', 'E4825EB5-8388-41D9-B361-93F8CC25E58D', 3, 'window-open', 'window-open', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E4825EB5-8388-41D9-B361-93F8CC25E58D */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E4825EB5-8388-41D9-B361-93F8CC25E58D';

/* SQL text to sync 4 entity field value row(s) for entity field ID 518EED19-B699-4F08-A923-218A5891F1A2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d858b737-29f6-460d-baca-5ddfe83f9f65', '518EED19-B699-4F08-A923-218A5891F1A2', 1, 'at-risk-list', 'at-risk-list', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2b68622c-ba31-4fe0-a54c-e7c1f3cc9be2', '518EED19-B699-4F08-A923-218A5891F1A2', 2, 'predictions-grid', 'predictions-grid', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4c69d9f0-533b-4a31-a579-f948a27f185d', '518EED19-B699-4F08-A923-218A5891F1A2', 3, 'record-panel', 'record-panel', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ff4cc76d-ca6c-4323-9cee-44d811281de2', '518EED19-B699-4F08-A923-218A5891F1A2', 4, 'why-badge', 'why-badge', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 518EED19-B699-4F08-A923-218A5891F1A2 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='518EED19-B699-4F08-A923-218A5891F1A2';

/* SQL text to sync 4 entity field value row(s) for entity field ID A2401385-D2E3-4699-B8D1-2035836FAF81 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('765dcc57-450c-4b07-a2fa-37808faec4a3', 'A2401385-D2E3-4699-B8D1-2035836FAF81', 1, 'adverse-probability-desc', 'adverse-probability-desc', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8eadccc0-43cf-4849-ab70-a48f9b33bd54', 'A2401385-D2E3-4699-B8D1-2035836FAF81', 2, 'none', 'none', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c3058f6d-2f8a-4c67-a2e8-d6ec900170ac', 'A2401385-D2E3-4699-B8D1-2035836FAF81', 3, 'score-asc', 'score-asc', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('83db509c-3148-46cd-a10d-fc69be6b2b9d', 'A2401385-D2E3-4699-B8D1-2035836FAF81', 4, 'score-desc', 'score-desc', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A2401385-D2E3-4699-B8D1-2035836FAF81 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A2401385-D2E3-4699-B8D1-2035836FAF81';

/* SQL text to sync 2 entity field value row(s) for entity field ID 370252BD-3494-4E7C-BFF2-FB4F9181297E */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('79d91d8a-9ac6-45b3-a30a-611038cf01a0', '370252BD-3494-4E7C-BFF2-FB4F9181297E', 1, 'adverse-class', 'adverse-class', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0e4ca327-47a4-4be8-a318-8443217a1786', '370252BD-3494-4E7C-BFF2-FB4F9181297E', 2, 'raw-contribution', 'raw-contribution', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 370252BD-3494-4E7C-BFF2-FB4F9181297E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='370252BD-3494-4E7C-BFF2-FB4F9181297E';

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


/* Create Entity Relationship: MJ: ML Prediction Units -> MJ: ML Models (One To Many via PredictionUnitID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7ccbb222-c3ca-4d22-8275-ad576ea76800' OR ([EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'PredictionUnitID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7ccbb222-c3ca-4d22-8275-ad576ea76800', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'PredictionUnitID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: ML Scoring Runs (One To Many via ScopeEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4119558f-83f1-44c8-ae12-a5858ed99b8a' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND [RelatedEntityJoinField] = 'ScopeEntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4119558f-83f1-44c8-ae12-a5858ed99b8a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', 'ScopeEntityID', 'One To Many', 1, 1, 94, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: ML Scoring Runs (One To Many via RequestedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a4437a87-1160-4463-abe9-662b85e0834e' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND [RelatedEntityJoinField] = 'RequestedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a4437a87-1160-4463-abe9-662b85e0834e', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', 'RequestedByUserID', 'One To Many', 1, 1, 130, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: ML Model Publish Records (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ffdd9123-a381-42f0-8a59-fb453c6a6dde' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND [RelatedEntityJoinField] = 'UserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ffdd9123-a381-42f0-8a59-fb453c6a6dde', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', 'UserID', 'One To Many', 1, 1, 131, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Snapshots -> MJ: ML Models (One To Many via TrainingSnapshotID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b5347753-7bc4-4998-8a25-ffe017363db5' OR ([EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'TrainingSnapshotID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b5347753-7bc4-4998-8a25-ffe017363db5', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'TrainingSnapshotID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Model Scoring Bindings -> MJ: ML Scoring Runs (One To Many via MLModelScoringBindingID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '40d5d9d8-8f0e-4c45-80a1-138bf94bfe6b' OR ([EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND [RelatedEntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND [RelatedEntityJoinField] = 'MLModelScoringBindingID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('40d5d9d8-8f0e-4c45-80a1-138bf94bfe6b', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', 'MLModelScoringBindingID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Scheduled Job Runs -> MJ: ML Scoring Runs (One To Many via ScheduledJobRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd3f3c562-7bbe-494b-9240-1ca35876aaa3' OR ([EntityID] = '05853432-5E13-4F2A-8618-77857ADF17FA' AND [RelatedEntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND [RelatedEntityJoinField] = 'ScheduledJobRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d3f3c562-7bbe-494b-9240-1ca35876aaa3', '05853432-5E13-4F2A-8618-77857ADF17FA', 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', 'ScheduledJobRunID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Scheduled Job Runs -> MJ: ML Monitoring Results (One To Many via ScheduledJobRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9bac8218-722f-4c24-af0e-e478621e0871' OR ([EntityID] = '05853432-5E13-4F2A-8618-77857ADF17FA' AND [RelatedEntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND [RelatedEntityJoinField] = 'ScheduledJobRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9bac8218-722f-4c24-af0e-e478621e0871', '05853432-5E13-4F2A-8618-77857ADF17FA', '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', 'ScheduledJobRunID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Evaluation Protocols -> MJ: ML Models (One To Many via EvaluationProtocolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd7c44551-690e-4a5e-b9ec-cead47304ea6' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'EvaluationProtocolID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d7c44551-690e-4a5e-b9ec-cead47304ea6', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'EvaluationProtocolID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Models (One To Many via TrainingRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c51eabdd-417e-46cd-bf53-2b5655e5ffcf' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'TrainingRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c51eabdd-417e-46cd-bf53-2b5655e5ffcf', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'TrainingRunID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Monitoring Results (One To Many via ChallengerRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f1a5cbbe-b345-4674-830a-d06d17c592d6' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND [RelatedEntityJoinField] = 'ChallengerRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f1a5cbbe-b345-4674-830a-d06d17c592d6', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', 'ChallengerRunID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Model Publish Records (One To Many via TrainingRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd39dd7b7-906b-4059-8a50-4b91273e3954' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND [RelatedEntityJoinField] = 'TrainingRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d39dd7b7-906b-4059-8a50-4b91273e3954', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', 'TrainingRunID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Models -> MJ: ML Scoring Runs (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6d6db91e-37d7-4d8d-b938-db2f357c4704' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6d6db91e-37d7-4d8d-b938-db2f357c4704', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', 'ModelID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Output Bindings (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '18dd9418-987b-4666-94ca-050155ac1773' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('18dd9418-987b-4666-94ca-050155ac1773', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', 'ModelID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Monitoring Results (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f2559b76-a097-45e8-a136-22780d5571d5' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f2559b76-a097-45e8-a136-22780d5571d5', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', 'ModelID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Model Publish Records (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0356f7e9-cc5a-484c-a069-58f9f25273ec' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0356f7e9-cc5a-484c-a069-58f9f25273ec', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', 'ModelID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Model Publish Records (One To Many via ReplacesModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fef6c2ee-5f28-4f1c-a83d-feedf63dcc81' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND [RelatedEntityJoinField] = 'ReplacesModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fef6c2ee-5f28-4f1c-a83d-feedf63dcc81', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', 'ReplacesModelID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Process Runs -> MJ: ML Scoring Runs (One To Many via ProcessRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f0a46c87-668c-4be2-b2f4-2a9c29fc6957' OR ([EntityID] = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND [RelatedEntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND [RelatedEntityJoinField] = 'ProcessRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f0a46c87-668c-4be2-b2f4-2a9c29fc6957', '9989A9A4-5546-4552-A765-B27EE399BFEA', 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', 'ProcessRunID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Model Publish Records -> MJ: ML Model Publish Records (One To Many via SignOffID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9783de46-ff35-4cee-b80f-9127f22c41ee' OR ([EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND [RelatedEntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND [RelatedEntityJoinField] = 'SignOffID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9783de46-ff35-4cee-b80f-9127f22c41ee', 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', 'SignOffID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
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
                                    ID = 'FE7A9D84-9BC5-4403-95A5-372ED70AF251';

/* SQL text to update virtual entity updated date for MJ: Latest Feature Values */
UPDATE [${flyway:defaultSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';

/* Set LLM-identified PKs for MJ: Latest Feature Values: ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                        SET IsPrimaryKey=0, IsUnique=0
                        WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND IsPrimaryKey=1 AND IsSoftPrimaryKey=0;
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET IsPrimaryKey=1, IsUnique=1, IsSoftPrimaryKey=1
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ID';

/* Set LLM-generated descriptions for MJ: Latest Feature Values (16 fields) */
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Unique identifier of the feature value record.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Unique identifier of the entity this feature was computed for.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='EntityID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Serialized primary key of the record this feature was computed for.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='RecordID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Name of the feature.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='FeatureName';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Origin of the value: Pipeline or Human.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Source';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Role of the score/value, such as Champion.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Role';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Effective instant from which this value applies to the record.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='EffectiveAsOf';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Timestamp when this feature value was computed.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ComputedAt';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Reference to the ML Model that produced or scored this feature value, if applicable.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='MLModelID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Reference to the Record Process (Feature Pipeline) that computed this feature value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='RecordProcessID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed value formatted as text or categorical string.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueText';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed value formatted as a floating-point numeric value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueNumeric';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed value formatted as a date/time offset.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueDate';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed value formatted as a boolean flag.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueBoolean';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed value formatted as a raw JSON string for complex objects.', [AutoUpdateDescription] = 0, ExtendedType='JSON'
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueJSON';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Confidence score associated with the computed feature value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Confidence';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FE7A9D84-9BC5-4403-95A5-372ED70AF251';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '23F290D7-859F-474E-B7C2-A69524E4EBD3';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D41A6710-AA48-4B58-B191-748B1C455040';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.FeatureName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5390DCF5-7EC3-4398-985E-BD0E25B50C29';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4BA6B165-5C8E-498D-8E5C-825FBC51E17A';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '30627B7B-42ED-45BC-856B-C9A52CB364A4';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.EffectiveAsOf 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2FB3C9E7-9C70-4718-B69D-A5B815B9E6D2';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ComputedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '449F255C-FF2C-48D0-9552-79056E36A32B';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.MLModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3E318C59-5E51-4B5C-977B-B57604FB3F4C';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.RecordProcessID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '39039EC4-A370-4ECC-9B31-FFC639568FA3';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueText 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Text)'
WHERE 
   ID = '42E506E6-83F8-4207-91F1-EBF465942C9A';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueNumeric 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Numeric)'
WHERE 
   ID = 'C91ED906-44F7-4D47-9F3A-8DE5D58C1DF2';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Date)'
WHERE 
   ID = 'DB6DC8EC-A495-4912-A4F8-FCAE8C41217A';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueBoolean 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Boolean)'
WHERE 
   ID = 'C73CD361-53EC-4A99-A68A-018E6C27B368';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (JSON)'
WHERE 
   ID = '95803C68-01DE-437B-B0BC-F353678B0CA0';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Confidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '34224E52-B5B6-469C-ADAA-44798FC552B8';

/* Set entity icon to fa-solid fa-bolt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa-solid fa-bolt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6ffbbf96-457e-5629-87d2-761e7e340241', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', 'FieldCategoryInfo', '{
  "Feature Details": {
    "description": "Specification and role of the data feature",
    "icon": "fa-solid fa-tag"
  },
  "Feature Values": {
    "description": "The computed feature values across various data types",
    "icon": "fa-solid fa-database"
  },
  "Pipeline Provenance": {
    "description": "Execution and pipeline provenance information",
    "icon": "fa-solid fa-code-branch"
  },
  "Record Context": {
    "description": "Contextual details and timestamps regarding the underlying record",
    "icon": "fa-solid fa-cube"
  },
  "System Metadata": {
    "description": "System-level identifiers and metadata",
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
  "Feature Details": "fa-solid fa-tag",
  "Feature Values": "fa-solid fa-database",
  "Pipeline Provenance": "fa-solid fa-code-branch",
  "Record Context": "fa-solid fa-cube",
  "System Metadata": "fa-solid fa-gear"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Update entity timestamp for MJ: Latest Feature Values after LLM decoration */
UPDATE [${flyway:defaultSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';

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
    DECLARE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [TemplateID], [CategoryID], [TypeID], [Status], [ResponseFormat], [ModelSpecificResponseFormat], [AIModelTypeID], [MinPowerRank], [SelectionStrategy], [PowerPreference], [ParallelizationMode], [ParallelCount], [ParallelConfigParam], [OutputType], [OutputExample], [ValidationBehavior], [MaxRetries], [RetryDelayMS], [RetryStrategy], [ResultSelectorPromptID], [EnableCaching], [CacheTTLSeconds], [CacheMatchType], [CacheSimilarityThreshold], [CacheMustMatchModel], [CacheMustMatchVendor], [CacheMustMatchAgent], [CacheMustMatchConfig], [PromptRole], [PromptPosition], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [IncludeLogProbs], [TopLogProbs], [FailoverStrategy], [FailoverMaxAttempts], [FailoverDelaySeconds], [FailoverModelStrategy], [FailoverErrorScope], [EffortLevel], [AssistantPrefill], [PrefillFallbackMode], [RequireSpecificModels], [PromptConfiguration], [TemplateDataCapture]
        FROM [${flyway:defaultSchema}].[AIPrompt]
        WHERE [ResultSelectorPromptID] = @ID

    OPEN cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPrompt] @ID = @MJAIPrompts_ResultSelectorPromptIDID, @Name = @MJAIPrompts_ResultSelectorPromptID_Name, @Description = @MJAIPrompts_ResultSelectorPromptID_Description, @TemplateID = @MJAIPrompts_ResultSelectorPromptID_TemplateID, @CategoryID = @MJAIPrompts_ResultSelectorPromptID_CategoryID, @TypeID = @MJAIPrompts_ResultSelectorPromptID_TypeID, @Status = @MJAIPrompts_ResultSelectorPromptID_Status, @ResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @ModelSpecificResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @AIModelTypeID = @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MinPowerRank = @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @SelectionStrategy = @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @PowerPreference = @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @ParallelizationMode = @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @ParallelCount = @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @ParallelConfigParam = @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @OutputType = @MJAIPrompts_ResultSelectorPromptID_OutputType, @OutputExample = @MJAIPrompts_ResultSelectorPromptID_OutputExample, @ValidationBehavior = @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MaxRetries = @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @RetryDelayMS = @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @RetryStrategy = @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @ResultSelectorPromptID_Clear = 1, @ResultSelectorPromptID = @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @EnableCaching = @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @CacheTTLSeconds = @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @CacheMatchType = @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @CacheSimilarityThreshold = @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @CacheMustMatchModel = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @CacheMustMatchVendor = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @CacheMustMatchAgent = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @CacheMustMatchConfig = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @PromptRole = @MJAIPrompts_ResultSelectorPromptID_PromptRole, @PromptPosition = @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @Temperature = @MJAIPrompts_ResultSelectorPromptID_Temperature, @TopP = @MJAIPrompts_ResultSelectorPromptID_TopP, @TopK = @MJAIPrompts_ResultSelectorPromptID_TopK, @MinP = @MJAIPrompts_ResultSelectorPromptID_MinP, @FrequencyPenalty = @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @Seed = @MJAIPrompts_ResultSelectorPromptID_Seed, @StopSequences = @MJAIPrompts_ResultSelectorPromptID_StopSequences, @IncludeLogProbs = @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @TopLogProbs = @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @FailoverStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @FailoverMaxAttempts = @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @FailoverDelaySeconds = @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @FailoverModelStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @FailoverErrorScope = @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @EffortLevel = @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @AssistantPrefill = @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @PrefillFallbackMode = @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @RequireSpecificModels = @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @PromptConfiguration = @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @TemplateDataCapture = @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture

        FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture
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
    DECLARE @MJFeatureValues_PromptID_EffectiveAsOf datetimeoffset
    DECLARE @MJFeatureValues_PromptID_InputAsOf datetimeoffset
    DECLARE @MJFeatureValues_PromptID_Role nvarchar(20)
    DECLARE @MJFeatureValues_PromptID_MLModelID uniqueidentifier
    DECLARE cascade_update_MJFeatureValues_PromptID_cursor CURSOR FOR
        SELECT [ID], [RecordProcessID], [EntityID], [RecordID], [FeatureName], [ValueText], [ValueNumeric], [ValueDate], [ValueBoolean], [ValueJSON], [Reasoning], [Confidence], [PromptID], [PromptVersionHash], [ConstraintHash], [ProcessRunID], [ProcessRunDetailID], [AIPromptRunID], [FeatureValueCacheID], [ComputedAt], [PipelineVersion], [AIModelID], [ParametersHash], [InputHash], [ValueKeyHash], [Source], [EffectiveAsOf], [InputAsOf], [Role], [MLModelID]
        FROM [${flyway:defaultSchema}].[FeatureValue]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJFeatureValues_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJFeatureValues_PromptID_cursor INTO @MJFeatureValues_PromptIDID, @MJFeatureValues_PromptID_RecordProcessID, @MJFeatureValues_PromptID_EntityID, @MJFeatureValues_PromptID_RecordID, @MJFeatureValues_PromptID_FeatureName, @MJFeatureValues_PromptID_ValueText, @MJFeatureValues_PromptID_ValueNumeric, @MJFeatureValues_PromptID_ValueDate, @MJFeatureValues_PromptID_ValueBoolean, @MJFeatureValues_PromptID_ValueJSON, @MJFeatureValues_PromptID_Reasoning, @MJFeatureValues_PromptID_Confidence, @MJFeatureValues_PromptID_PromptID, @MJFeatureValues_PromptID_PromptVersionHash, @MJFeatureValues_PromptID_ConstraintHash, @MJFeatureValues_PromptID_ProcessRunID, @MJFeatureValues_PromptID_ProcessRunDetailID, @MJFeatureValues_PromptID_AIPromptRunID, @MJFeatureValues_PromptID_FeatureValueCacheID, @MJFeatureValues_PromptID_ComputedAt, @MJFeatureValues_PromptID_PipelineVersion, @MJFeatureValues_PromptID_AIModelID, @MJFeatureValues_PromptID_ParametersHash, @MJFeatureValues_PromptID_InputHash, @MJFeatureValues_PromptID_ValueKeyHash, @MJFeatureValues_PromptID_Source, @MJFeatureValues_PromptID_EffectiveAsOf, @MJFeatureValues_PromptID_InputAsOf, @MJFeatureValues_PromptID_Role, @MJFeatureValues_PromptID_MLModelID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJFeatureValues_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateFeatureValue] @ID = @MJFeatureValues_PromptIDID, @RecordProcessID = @MJFeatureValues_PromptID_RecordProcessID, @EntityID = @MJFeatureValues_PromptID_EntityID, @RecordID = @MJFeatureValues_PromptID_RecordID, @FeatureName = @MJFeatureValues_PromptID_FeatureName, @ValueText = @MJFeatureValues_PromptID_ValueText, @ValueNumeric = @MJFeatureValues_PromptID_ValueNumeric, @ValueDate = @MJFeatureValues_PromptID_ValueDate, @ValueBoolean = @MJFeatureValues_PromptID_ValueBoolean, @ValueJSON = @MJFeatureValues_PromptID_ValueJSON, @Reasoning = @MJFeatureValues_PromptID_Reasoning, @Confidence = @MJFeatureValues_PromptID_Confidence, @PromptID_Clear = 1, @PromptID = @MJFeatureValues_PromptID_PromptID, @PromptVersionHash = @MJFeatureValues_PromptID_PromptVersionHash, @ConstraintHash = @MJFeatureValues_PromptID_ConstraintHash, @ProcessRunID = @MJFeatureValues_PromptID_ProcessRunID, @ProcessRunDetailID = @MJFeatureValues_PromptID_ProcessRunDetailID, @AIPromptRunID = @MJFeatureValues_PromptID_AIPromptRunID, @FeatureValueCacheID = @MJFeatureValues_PromptID_FeatureValueCacheID, @ComputedAt = @MJFeatureValues_PromptID_ComputedAt, @PipelineVersion = @MJFeatureValues_PromptID_PipelineVersion, @AIModelID = @MJFeatureValues_PromptID_AIModelID, @ParametersHash = @MJFeatureValues_PromptID_ParametersHash, @InputHash = @MJFeatureValues_PromptID_InputHash, @ValueKeyHash = @MJFeatureValues_PromptID_ValueKeyHash, @Source = @MJFeatureValues_PromptID_Source, @EffectiveAsOf = @MJFeatureValues_PromptID_EffectiveAsOf, @InputAsOf = @MJFeatureValues_PromptID_InputAsOf, @Role = @MJFeatureValues_PromptID_Role, @MLModelID = @MJFeatureValues_PromptID_MLModelID

        FETCH NEXT FROM cascade_update_MJFeatureValues_PromptID_cursor INTO @MJFeatureValues_PromptIDID, @MJFeatureValues_PromptID_RecordProcessID, @MJFeatureValues_PromptID_EntityID, @MJFeatureValues_PromptID_RecordID, @MJFeatureValues_PromptID_FeatureName, @MJFeatureValues_PromptID_ValueText, @MJFeatureValues_PromptID_ValueNumeric, @MJFeatureValues_PromptID_ValueDate, @MJFeatureValues_PromptID_ValueBoolean, @MJFeatureValues_PromptID_ValueJSON, @MJFeatureValues_PromptID_Reasoning, @MJFeatureValues_PromptID_Confidence, @MJFeatureValues_PromptID_PromptID, @MJFeatureValues_PromptID_PromptVersionHash, @MJFeatureValues_PromptID_ConstraintHash, @MJFeatureValues_PromptID_ProcessRunID, @MJFeatureValues_PromptID_ProcessRunDetailID, @MJFeatureValues_PromptID_AIPromptRunID, @MJFeatureValues_PromptID_FeatureValueCacheID, @MJFeatureValues_PromptID_ComputedAt, @MJFeatureValues_PromptID_PipelineVersion, @MJFeatureValues_PromptID_AIModelID, @MJFeatureValues_PromptID_ParametersHash, @MJFeatureValues_PromptID_InputHash, @MJFeatureValues_PromptID_ValueKeyHash, @MJFeatureValues_PromptID_Source, @MJFeatureValues_PromptID_EffectiveAsOf, @MJFeatureValues_PromptID_InputAsOf, @MJFeatureValues_PromptID_Role, @MJFeatureValues_PromptID_MLModelID
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

/* spCreate SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: spCreateEntityOrganicKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityOrganicKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityOrganicKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityOrganicKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityOrganicKey]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @MatchFieldNames nvarchar(500),
    @NormalizationStrategy nvarchar(50) = NULL,
    @CustomNormalizationExpression_Clear bit = 0,
    @CustomNormalizationExpression nvarchar(MAX) = NULL,
    @AutoCreateRelatedViewOnForm bit = NULL,
    @Sequence int = NULL,
    @Status nvarchar(20) = NULL,
    @Source nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityOrganicKey]
            (
                [ID],
                [EntityID],
                [Name],
                [Description],
                [MatchFieldNames],
                [NormalizationStrategy],
                [CustomNormalizationExpression],
                [AutoCreateRelatedViewOnForm],
                [Sequence],
                [Status],
                [Source]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @MatchFieldNames,
                ISNULL(@NormalizationStrategy, 'LowerCaseTrim'),
                CASE WHEN @CustomNormalizationExpression_Clear = 1 THEN NULL ELSE ISNULL(@CustomNormalizationExpression, NULL) END,
                ISNULL(@AutoCreateRelatedViewOnForm, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active'),
                ISNULL(@Source, 'Manual')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityOrganicKey]
            (
                [EntityID],
                [Name],
                [Description],
                [MatchFieldNames],
                [NormalizationStrategy],
                [CustomNormalizationExpression],
                [AutoCreateRelatedViewOnForm],
                [Sequence],
                [Status],
                [Source]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @MatchFieldNames,
                ISNULL(@NormalizationStrategy, 'LowerCaseTrim'),
                CASE WHEN @CustomNormalizationExpression_Clear = 1 THEN NULL ELSE ISNULL(@CustomNormalizationExpression, NULL) END,
                ISNULL(@AutoCreateRelatedViewOnForm, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active'),
                ISNULL(@Source, 'Manual')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityOrganicKeys] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Organic Keys */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: spUpdateEntityOrganicKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityOrganicKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityOrganicKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityOrganicKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityOrganicKey]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @MatchFieldNames nvarchar(500) = NULL,
    @NormalizationStrategy nvarchar(50) = NULL,
    @CustomNormalizationExpression_Clear bit = 0,
    @CustomNormalizationExpression nvarchar(MAX) = NULL,
    @AutoCreateRelatedViewOnForm bit = NULL,
    @Sequence int = NULL,
    @Status nvarchar(20) = NULL,
    @Source nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityOrganicKey]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [MatchFieldNames] = ISNULL(@MatchFieldNames, [MatchFieldNames]),
        [NormalizationStrategy] = ISNULL(@NormalizationStrategy, [NormalizationStrategy]),
        [CustomNormalizationExpression] = CASE WHEN @CustomNormalizationExpression_Clear = 1 THEN NULL ELSE ISNULL(@CustomNormalizationExpression, [CustomNormalizationExpression]) END,
        [AutoCreateRelatedViewOnForm] = ISNULL(@AutoCreateRelatedViewOnForm, [AutoCreateRelatedViewOnForm]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Status] = ISNULL(@Status, [Status]),
        [Source] = ISNULL(@Source, [Source])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityOrganicKeys] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityOrganicKeys]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityOrganicKey table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityOrganicKey]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityOrganicKey];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityOrganicKey
ON [${flyway:defaultSchema}].[EntityOrganicKey]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityOrganicKey]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityOrganicKey] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Organic Keys */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration];

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
    @Source nvarchar(20) = NULL,
    @EffectiveAsOf_Clear bit = 0,
    @EffectiveAsOf datetimeoffset = NULL,
    @InputAsOf_Clear bit = 0,
    @InputAsOf datetimeoffset = NULL,
    @Role nvarchar(20) = NULL,
    @MLModelID_Clear bit = 0,
    @MLModelID uniqueidentifier = NULL
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
                [MLModelID]
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
                ISNULL(@Source, 'Pipeline'),
                CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, NULL) END,
                CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, NULL) END,
                ISNULL(@Role, 'Champion'),
                CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, NULL) END
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
                [MLModelID]
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
                ISNULL(@Source, 'Pipeline'),
                CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, NULL) END,
                CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, NULL) END,
                ISNULL(@Role, 'Champion'),
                CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, NULL) END
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
    @Source nvarchar(20) = NULL,
    @EffectiveAsOf_Clear bit = 0,
    @EffectiveAsOf datetimeoffset = NULL,
    @InputAsOf_Clear bit = 0,
    @InputAsOf datetimeoffset = NULL,
    @Role nvarchar(20) = NULL,
    @MLModelID_Clear bit = 0,
    @MLModelID uniqueidentifier = NULL
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
        [Source] = ISNULL(@Source, [Source]),
        [EffectiveAsOf] = CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, [EffectiveAsOf]) END,
        [InputAsOf] = CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, [InputAsOf]) END,
        [Role] = ISNULL(@Role, [Role]),
        [MLModelID] = CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, [MLModelID]) END
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

/* Base View Permissions SQL for MJ: Latest Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Latest Feature Values
-- Item: Permissions for vwLatestFeatureValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

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
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelPublishRecord_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelPublishRecord_ModelID ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([ModelID]);

-- Index for foreign key TrainingRunID in table MLModelPublishRecord
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelPublishRecord_TrainingRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelPublishRecord_TrainingRunID ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([TrainingRunID]);

-- Index for foreign key UserID in table MLModelPublishRecord
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelPublishRecord_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelPublishRecord_UserID ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([UserID]);

-- Index for foreign key SignOffID in table MLModelPublishRecord
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelPublishRecord_SignOffID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelPublishRecord_SignOffID ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([SignOffID]);

-- Index for foreign key ReplacesModelID in table MLModelPublishRecord
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelPublishRecord_ReplacesModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelPublishRecord_ReplacesModelID ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([ReplacesModelID]);

/* SQL text to update entity field related entity name field map for entity field ID 45784FD0-09E1-47CA-894A-7D80138A7524 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='45784FD0-09E1-47CA-894A-7D80138A7524', @RelatedEntityNameFieldMap='User';

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
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_PipelineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_PipelineID ON [${flyway:defaultSchema}].[MLModel] ([PipelineID]);

-- Index for foreign key AlgorithmID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_AlgorithmID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_AlgorithmID ON [${flyway:defaultSchema}].[MLModel] ([AlgorithmID]);

-- Index for foreign key ArtifactFileID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_ArtifactFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_ArtifactFileID ON [${flyway:defaultSchema}].[MLModel] ([ArtifactFileID]);

-- Index for foreign key PredictionUnitID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_PredictionUnitID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_PredictionUnitID ON [${flyway:defaultSchema}].[MLModel] ([PredictionUnitID]);

-- Index for foreign key EvaluationProtocolID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_EvaluationProtocolID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_EvaluationProtocolID ON [${flyway:defaultSchema}].[MLModel] ([EvaluationProtocolID]);

-- Index for foreign key TrainingSnapshotID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_TrainingSnapshotID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_TrainingSnapshotID ON [${flyway:defaultSchema}].[MLModel] ([TrainingSnapshotID]);

-- Index for foreign key TrainingRunID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_TrainingRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_TrainingRunID ON [${flyway:defaultSchema}].[MLModel] ([TrainingRunID]);

/* SQL text to update entity field related entity name field map for entity field ID DD3DD3A9-D7F0-4960-9669-7B55C88F0968 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DD3DD3A9-D7F0-4960-9669-7B55C88F0968', @RelatedEntityNameFieldMap='PredictionUnit';

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
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLMonitoringResult_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLMonitoringResult]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLMonitoringResult_ModelID ON [${flyway:defaultSchema}].[MLMonitoringResult] ([ModelID]);

-- Index for foreign key ScheduledJobRunID in table MLMonitoringResult
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLMonitoringResult_ScheduledJobRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLMonitoringResult]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLMonitoringResult_ScheduledJobRunID ON [${flyway:defaultSchema}].[MLMonitoringResult] ([ScheduledJobRunID]);

-- Index for foreign key ChallengerRunID in table MLMonitoringResult
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLMonitoringResult_ChallengerRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLMonitoringResult]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLMonitoringResult_ChallengerRunID ON [${flyway:defaultSchema}].[MLMonitoringResult] ([ChallengerRunID]);

/* SQL text to update entity field related entity name field map for entity field ID 49C26F6A-D2CD-41E7-ACA0-A1AAE11D33CA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='49C26F6A-D2CD-41E7-ACA0-A1AAE11D33CA', @RelatedEntityNameFieldMap='ScheduledJobRun';

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
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLOutputBinding_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLOutputBinding]')
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
        [Label] = ISNULL(@Label, [Label])
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
    UPDATE
        [${flyway:defaultSchema}].[MLOutputBinding]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLOutputBinding] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
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
        [Transient] = ISNULL(@Transient, [Transient])
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
    UPDATE
        [${flyway:defaultSchema}].[MLModelPublishRecord]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLModelPublishRecord] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
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

/* SQL text to update entity field related entity name field map for entity field ID 1426B3CA-0AC7-4BBA-A37D-672247E0F5C1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1426B3CA-0AC7-4BBA-A37D-672247E0F5C1', @RelatedEntityNameFieldMap='EvaluationProtocol';

/* SQL text to update entity field related entity name field map for entity field ID 18EBD619-0095-466C-B5DA-E0C906F03BC0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='18EBD619-0095-466C-B5DA-E0C906F03BC0', @RelatedEntityNameFieldMap='TrainingSnapshot';

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
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END
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
    UPDATE
        [${flyway:defaultSchema}].[MLMonitoringResult]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLMonitoringResult] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
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
        [ServingWhileUnevaluated] = ISNULL(@ServingWhileUnevaluated, [ServingWhileUnevaluated])
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
    UPDATE
        [${flyway:defaultSchema}].[MLModel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLModel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
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
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_ModelID ON [${flyway:defaultSchema}].[MLScoringRun] ([ModelID]);

-- Index for foreign key MLModelScoringBindingID in table MLScoringRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_MLModelScoringBindingID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_MLModelScoringBindingID ON [${flyway:defaultSchema}].[MLScoringRun] ([MLModelScoringBindingID]);

-- Index for foreign key ScopeEntityID in table MLScoringRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_ScopeEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_ScopeEntityID ON [${flyway:defaultSchema}].[MLScoringRun] ([ScopeEntityID]);

-- Index for foreign key RequestedByUserID in table MLScoringRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_RequestedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_RequestedByUserID ON [${flyway:defaultSchema}].[MLScoringRun] ([RequestedByUserID]);

-- Index for foreign key ProcessRunID in table MLScoringRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_ProcessRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_ProcessRunID ON [${flyway:defaultSchema}].[MLScoringRun] ([ProcessRunID]);

-- Index for foreign key ScheduledJobRunID in table MLScoringRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_ScheduledJobRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_ScheduledJobRunID ON [${flyway:defaultSchema}].[MLScoringRun] ([ScheduledJobRunID]);

/* SQL text to update entity field related entity name field map for entity field ID 5EDF42F3-3778-4BB2-89B4-1ED1034E6DA0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5EDF42F3-3778-4BB2-89B4-1ED1034E6DA0', @RelatedEntityNameFieldMap='MLModelScoringBinding';

/* SQL text to update entity field related entity name field map for entity field ID 1C8A0421-8834-4A4C-B2E8-02516563631F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1C8A0421-8834-4A4C-B2E8-02516563631F', @RelatedEntityNameFieldMap='ScopeEntity';

/* SQL text to update entity field related entity name field map for entity field ID 9C0D44E9-F8C2-43C9-B415-D9E825F3B7FC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9C0D44E9-F8C2-43C9-B415-D9E825F3B7FC', @RelatedEntityNameFieldMap='RequestedByUser';

/* SQL text to update entity field related entity name field map for entity field ID A3CAA0E1-FE01-4404-B690-8CB325930861 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A3CAA0E1-FE01-4404-B690-8CB325930861', @RelatedEntityNameFieldMap='ScheduledJobRun';

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
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END
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
    UPDATE
        [${flyway:defaultSchema}].[MLScoringRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLScoringRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
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

/* SQL text to insert 9 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18c6e3f0-5cb6-45fd-b5e3-d427bf6a1dff' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'MLModelScoringBinding')) BEGIN
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
            '18c6e3f0-5cb6-45fd-b5e3-d427bf6a1dff',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '45bdda1f-3b6f-4413-9812-89768b0daf9e' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'ScopeEntity')) BEGIN
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
            '45bdda1f-3b6f-4413-9812-89768b0daf9e',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af78c2c1-7b49-498f-9ea2-e0de55f0a2b3' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'RequestedByUser')) BEGIN
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
            'af78c2c1-7b49-498f-9ea2-e0de55f0a2b3',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ac37c0d-0e3e-4141-a22e-f6d8b4553ac1' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'ScheduledJobRun')) BEGIN
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
            '8ac37c0d-0e3e-4141-a22e-f6d8b4553ac1',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c54e37f9-baf8-4f85-9eb8-dff9818264eb' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'PredictionUnit')) BEGIN
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
            'c54e37f9-baf8-4f85-9eb8-dff9818264eb',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7f1c845c-ce40-4ae8-86ad-0a24ebf7b472' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'EvaluationProtocol')) BEGIN
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
            '7f1c845c-ce40-4ae8-86ad-0a24ebf7b472',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '887895fb-f273-4019-b9bb-7392827080f4' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingSnapshot')) BEGIN
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
            '887895fb-f273-4019-b9bb-7392827080f4',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2336c95f-4550-474e-a1d1-25146caf331d' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'ScheduledJobRun')) BEGIN
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
            '2336c95f-4550-474e-a1d1-25146caf331d',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c0019bbc-72aa-407e-b96a-92bde22064c3' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'User')) BEGIN
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
            'c0019bbc-72aa-407e-b96a-92bde22064c3',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E4825EB5-8388-41D9-B361-93F8CC25E58D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BF4A0FBE-7743-42CC-9A21-0A85132CD532'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '196649EF-91A7-4B86-A0EC-A536C56A5060'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '76C0D82D-CA3F-4139-A521-DCCE316DE380'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2B002B26-FBA5-4644-883B-374851AF1B1B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D3793A1F-AE8B-494A-ADD8-92103765A85D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1FDEB082-1FB3-4DFF-A64D-36BACDF7F808'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B1B634CC-97C2-49CD-BDFB-228E49BF5B30'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B7EA6028-EAC6-409B-B548-ED0FC0FD6B57'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5913D26E-730F-467D-B989-712F90DA71D6'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '052AA3EF-9B41-44C7-AC90-F9039D30A625'
               AND AutoUpdateIsNameField = 1;

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: ML Models.PredictionUnitID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prediction Unit'
WHERE 
   ID = 'DD3DD3A9-D7F0-4960-9669-7B55C88F0968';

-- UPDATE Entity Field Category Info MJ: ML Models.EvaluationProtocolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol'
WHERE 
   ID = '1426B3CA-0AC7-4BBA-A37D-672247E0F5C1';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingSnapshotID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Snapshot'
WHERE 
   ID = '18EBD619-0095-466C-B5DA-E0C906F03BC0';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Run'
WHERE 
   ID = '23978A23-0608-4F85-A6E5-BBADD641A421';

-- UPDATE Entity Field Category Info MJ: ML Models.PredictionUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prediction Unit Details'
WHERE 
   ID = 'C54E37F9-BAF8-4F85-9EB8-DFF9818264EB';

-- UPDATE Entity Field Category Info MJ: ML Models.EvaluationProtocol 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol Details'
WHERE 
   ID = '7F1C845C-CE40-4AE8-86AD-0A24EBF7B472';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingSnapshot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Snapshot Details'
WHERE 
   ID = '887895FB-F273-4019-B9BB-7392827080F4';

-- UPDATE Entity Field Category Info MJ: ML Models.StatusReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D3E4F2EA-88AD-40A5-9CE5-37FF784A1ACA';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A7D61C57-FA85-44F6-9D3C-15CD57A745E4';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactCheckedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '334C9BB1-FB70-4D5D-A9C9-FA8404787A9D';

-- UPDATE Entity Field Category Info MJ: ML Models.ServingWhileUnevaluated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6D1B8E9C-A59D-4DC8-9EF1-B351322DD651';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact SHA-256'
WHERE 
   ID = '6FFF1BCB-C55B-4956-B737-5B5335DAEC5D';

-- UPDATE Entity Field Category Info MJ: ML Models.SnapshotHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5FD3F19F-ED64-41D8-9FDA-CECD3A416E6F';

-- UPDATE Entity Field Category Info MJ: ML Models.CodeVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '56843BC2-E0FC-4117-8464-BF4297E232EB';

-- UPDATE Entity Field Category Info MJ: ML Models.FeatureSchemaHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E5A88FB1-CDFE-4A79-8CDA-6B04A90A3DDB';

-- UPDATE Entity Field Category Info MJ: ML Models.OutputSemantics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'BACE5CAE-2F4D-450A-ACAE-57D3D289F5D5';

-- UPDATE Entity Field Category Info MJ: ML Models.Delivery 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '5C096645-0AE7-4EB9-A421-CB1C2F8968F7';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F195EAB5-F0CE-4D69-A58C-7F84EFEBD5B1'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '013A8198-D6E6-40FF-A680-0529C5E1D322'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '013A8198-D6E6-40FF-A680-0529C5E1D322'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 26 fields */

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E85A25DE-176B-46F0-9972-4B6D5634F45E';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = '6E6B7AE1-B468-42F7-8DB8-AD2DEDEFF9F4';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScheduledJobRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '49C26F6A-D2CD-41E7-ACA0-A1AAE11D33CA';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Period 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A0DC6927-DEA8-4F30-86F5-F444BB6A3753';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PeriodGrain 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FBD837A5-2507-47F4-B592-24B7C508E411';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.State 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E4825EB5-8388-41D9-B361-93F8CC25E58D';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScoredRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BF4A0FBE-7743-42CC-9A21-0A85132CD532';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.JoinedRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '196649EF-91A7-4B86-A0EC-A536C56A5060';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ExcludedInTrainingRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A5875EF0-B8E2-409E-BF7E-5714BE5BD8A8';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'E3C78D2A-775E-4AFE-9319-5D0D079BD745';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '76C0D82D-CA3F-4139-A521-DCCE316DE380';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryLower 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Lower Bound'
WHERE 
   ID = 'E5FCDA53-C55D-4F96-B5E2-1711561C6323';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryUpper 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Upper Bound'
WHERE 
   ID = 'EA397442-4E81-4662-BB3F-A66A8C861A8B';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.TrackedMetrics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '9A1F5CD5-286F-46BF-A9B1-E5F29E99B339';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Calibration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'B36F73B1-379F-40BC-994B-31A6D137C4B3';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.DriftLook 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift and Parity Checks',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '8FE1E537-2227-447F-ACD6-F0EF7EFFC26D';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.DriftAlarms 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift and Parity Checks',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '5A5DDCA6-0359-43D0-98BD-96EAC7FA3964';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Parity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift and Parity Checks',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '7C8CE966-279B-4F2F-B42A-774EAA149286';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.TriggersFired 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers and Automation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'CEC3A62F-2D89-441B-B5C6-21230239331D';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ChallengerRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers and Automation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7C993B8A-0A55-488D-B6C7-A8C74B26964B';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ChallengerResult 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers and Automation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'AD8BB6C9-2CE2-43D5-8060-59EF4A02D283';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.RollbackCheck 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers and Automation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'FB36BD59-F145-48D6-BBD0-D8B11CF105D2';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5CFF6788-EDFF-4DE5-B59C-1AD28417AA4D';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B0347955-2C4C-4CD2-A70D-23BEAC18F966';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '26EABA0B-8134-452B-933F-6C96F8184356';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScheduledJobRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2336C95F-4550-474E-A1D1-25146CAF331D';

/* Set entity icon to fa fa-chart-line */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-chart-line', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('d677a7af-e018-5fc5-8e90-a0b7379a2ded', '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', 'FieldCategoryInfo', '{
  "Drift and Parity Checks": {
    "description": "Input drift statistics, alarms, and parity evaluation results",
    "icon": "fa fa-exclamation-triangle"
  },
  "Evaluation Metrics": {
    "description": "Scored rows, primary metrics, tracked metrics, and calibration reports",
    "icon": "fa fa-chart-bar"
  },
  "Model Configuration": {
    "description": "Model identification and monitoring job run settings",
    "icon": "fa fa-cogs"
  },
  "Monitoring Period": {
    "description": "Time period, grain, state, and status of the monitoring run",
    "icon": "fa fa-calendar-alt"
  },
  "Triggers and Automation": {
    "description": "Fired triggers, challenger models, and automated rollback checks",
    "icon": "fa fa-bolt"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9715c82e-8b02-571e-8f40-4208e28bb282', '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', 'FieldCategoryIcons', '{
  "Drift and Parity Checks": "fa fa-exclamation-triangle",
  "Evaluation Metrics": "fa fa-chart-bar",
  "Model Configuration": "fa fa-cogs",
  "Monitoring Period": "fa fa-calendar-alt",
  "Triggers and Automation": "fa fa-bolt"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '58F2654A-15BB-4B42-A210-279E0D51DBB1';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Output Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = 'E32C4553-B310-47A0-B23E-8F065EE970AA';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.Surface 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Output Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '518EED19-B699-4F08-A923-218A5891F1A2';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.SortsBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Output Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A2401385-D2E3-4699-B8D1-2035836FAF81';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.DriverDirectionRelativeTo 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Output Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '370252BD-3494-4E7C-BFF2-FB4F9181297E';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.Label 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Output Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '013A8198-D6E6-40FF-A680-0529C5E1D322';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '63134327-014D-4E4A-8B52-8682E1B065FB';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C432B294-3B81-46D1-8D61-DEBD70F7D6DE';

/* Set entity icon to fa fa-chart-bar */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-chart-bar', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('78259ec8-904e-5964-8bed-8be66a1f421a', '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', 'FieldCategoryInfo', '{
  "Output Configuration": {
    "description": "Configuration settings determining how model outputs are displayed and sorted on surfaces",
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
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8f065c72-0bb0-5d3f-b30a-00f1832bed0c', '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', 'FieldCategoryIcons', '{
  "Output Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24';

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A2FE7B1F-BE33-42E6-9EC3-D1E72912F29B';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = 'B1D605D1-EE28-477C-987B-B9B2931DF177';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.TrainingRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Run'
WHERE 
   ID = '8C9864EF-4E03-483A-ADDB-86EBBE34C9EE';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ReplacesModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Replaces Model'
WHERE 
   ID = '0344714E-16AC-4943-BE84-DFA4E7ADBB3E';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.SignOffID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Sign-Off'
WHERE 
   ID = 'C743A3D5-9D82-4064-B87C-FE639D4C2584';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Kind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish & Action Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '52E5A191-CAD1-49B8-A38B-852A6B6088AD';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Purpose 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish & Action Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1AF5E11A-17C2-42A8-AE95-A3BE9EA4177F';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Decision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish & Action Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '41B98A5A-75EA-4A64-9C71-0A56EB4D3774';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Reason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish & Action Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '35919C9D-65CE-485F-8B30-34D4558BAAB2';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ApproverKind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authorization & Actor',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3DAC9CC6-05C4-483F-A95F-F116DBC57E17';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authorization & Actor',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = '45784FD0-09E1-47CA-894A-7D80138A7524';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Initiator 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authorization & Actor',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '9FC9CA75-5E5A-4DED-AF9E-BDE674246BF1';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authorization & Actor',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Info'
WHERE 
   ID = 'C0019BBC-72AA-407E-B96A-92BDE22064C3';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.GateDecision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Trail & Evidence',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '9395F9D6-D935-482B-A115-8179F3E072A8';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Evidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Trail & Evidence',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'CAB71A26-60EC-4338-9C4F-E538A06B89E9';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.EvidenceSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Trail & Evidence',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evidence SHA-256'
WHERE 
   ID = '8327C808-0032-4220-8CA3-7AC126C064B9';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.OverridesFlags 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Trail & Evidence',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '54ABA486-572B-4DF0-864E-37767A8B8C50';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Refusal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Trail & Evidence',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '09DFC7E5-ACAF-4272-9CE8-F98B3C4CBF30';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Transient 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Trail & Evidence',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FFC671BD-7BBD-445C-BDFC-CCEE6F94339D';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.RecordedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F195EAB5-F0CE-4D69-A58C-7F84EFEBD5B1';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6012AD6D-1CDD-4115-A92C-E1B5BDC3C849';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ABE5B75F-4F81-47C8-8061-6E8ECEA3C241';

/* Set entity icon to fa fa-history */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-history', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a86c13b2-e08b-5bfb-aa2b-d3ad5c6d6e85', 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', 'FieldCategoryInfo', '{
  "Audit Trail & Evidence": {
    "description": "JSON evidence snapshots, gate decisions, and refusal logs",
    "icon": "fa fa-file-contract"
  },
  "Authorization & Actor": {
    "description": "Information on who initiated or approved the action",
    "icon": "fa fa-user-shield"
  },
  "Model References": {
    "description": "References to associated models, training runs, and sign-offs",
    "icon": "fa fa-cube"
  },
  "Publish & Action Details": {
    "description": "Details regarding the publish kind, purpose, and decisions",
    "icon": "fa fa-tasks"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('f296e88c-db8c-5b49-8e91-91ee8b9cfe11', 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', 'FieldCategoryIcons', '{
  "Audit Trail & Evidence": "fa fa-file-contract",
  "Authorization & Actor": "fa fa-user-shield",
  "Model References": "fa fa-cube",
  "Publish & Action Details": "fa fa-tasks",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68';

/* Set categories for 33 fields */

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4E953E7D-DDD0-4436-A27D-17B751C5D7B1';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = '29FB3DFD-4D4E-4A65-9A23-5163B3C9A854';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ModelVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F33F2F0E-049D-4E19-BF92-420670BA2635';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.MLModelScoringBindingID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Model Scoring Binding'
WHERE 
   ID = '5EDF42F3-3778-4BB2-89B4-1ED1034E6DA0';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ArtifactSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact SHA-256'
WHERE 
   ID = 'CEDDA74F-B715-4C30-8295-14B338BE94FB';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.FeatureSchemaHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AEF17108-5243-4F7A-B2F2-F083E9D862D7';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.MLModelScoringBinding 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Model Scoring Binding Details'
WHERE 
   ID = '18C6E3F0-5CB6-45FD-B5E3-D427BF6A1DFF';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Path 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2B002B26-FBA5-4644-883B-374851AF1B1B';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeKind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '41AA63CC-A5F1-4D92-A926-8D23F9C1F0BE';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scope Entity'
WHERE 
   ID = '1C8A0421-8834-4A4C-B2E8-02516563631F';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Scope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '1B2C81CF-0DE1-4BE5-99D7-95A9BCCB93E4';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.EntityMapping 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'F398A8D9-606B-45AA-B8C9-5A170086C352';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.AsOfDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0ACF5858-9EA5-4733-995F-43E801191FED';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ReadPolicy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '6104DAF5-C4AF-46B3-9B34-0329D19FC861';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.DryRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D159A723-2A43-443B-A2A7-BFEDFD34C146';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '0F345147-910E-497A-A041-2E3C000A26CA';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested By User'
WHERE 
   ID = '9C0D44E9-F8C2-43C9-B415-D9E825F3B7FC';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ProcessRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Process Run'
WHERE 
   ID = '42C3C84F-313C-451B-9CFA-395DA8E48429';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScheduledJobRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Job Run'
WHERE 
   ID = 'A3CAA0E1-FE01-4404-B690-8CB325930861';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scope Entity Details'
WHERE 
   ID = '45BDDA1F-3B6F-4413-9812-89768B0DAF9E';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested By User Details'
WHERE 
   ID = 'AF78C2C1-7B49-498F-9EA2-E0DE55F0A2B3';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScheduledJobRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Job Run Details'
WHERE 
   ID = '8AC37C0D-0E3E-4141-A22E-F6D8B4553AC1';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results and Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D3793A1F-AE8B-494A-ADD8-92103765A85D';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Refusal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results and Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '3C9D6E47-0123-452E-9A0D-08D52061A0AB';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Total 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results and Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Records'
WHERE 
   ID = '1FDEB082-1FB3-4DFF-A64D-36BACDF7F808';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Written 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results and Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Written Records'
WHERE 
   ID = 'B1B634CC-97C2-49CD-BDFB-228E49BF5B30';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Failed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results and Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Failed Records'
WHERE 
   ID = 'B7EA6028-EAC6-409B-B548-ED0FC0FD6B57';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Skipped 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results and Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Skipped Records'
WHERE 
   ID = '8D7650F9-C8D6-4EA7-81D9-4E9A5A261C85';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.FirstErrors 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results and Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'FBFD9781-78DB-4E2D-AAC3-FFFEC2FB1E7E';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results and Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5913D26E-730F-467D-B989-712F90DA71D6';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results and Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1A136884-2DF1-451F-A4C1-E974B71FE5D4';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '31D0A1E4-693F-48CB-8ABB-D6B2B90135F9';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7549D85B-E5B6-4985-A51C-D9DAB04B28C3';

/* Set entity icon to fa fa-cogs */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-cogs', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('05085614-c793-5513-9ae0-fc9f66853ed8', 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', 'FieldCategoryInfo', '{
  "Execution Results and Metrics": {
    "description": "Metrics, processing counts, errors, status, and execution timeline",
    "icon": "fa fa-chart-bar"
  },
  "Model Configuration": {
    "description": "Information regarding the machine learning model version and artifacts used for scoring",
    "icon": "fa fa-brain"
  },
  "Scoring Scope and Context": {
    "description": "Details defining the target records, caller path, read policies, and trigger context",
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
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a9a116d7-fa1f-5fea-b4b1-dfa7252a2380', 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', 'FieldCategoryIcons', '{
  "Execution Results and Metrics": "fa fa-chart-bar",
  "Model Configuration": "fa fa-brain",
  "Scoring Scope and Context": "fa fa-crosshairs",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3';


/* ---------------------------------- second CodeGen pass ---------------------------------- */

/* SQL text to update entity field related entity name field map for entity field ID 728338F3-7230-42C1-9AD1-6956AFEC40B7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='728338F3-7230-42C1-9AD1-6956AFEC40B7', @RelatedEntityNameFieldMap='MLModel';

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
    MJMLModel_MLModelID.[TargetVariable] AS [MLModel]
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
    [${flyway:defaultSchema}].[MLModel] AS MJMLModel_MLModelID
  ON
    [f].[MLModelID] = MJMLModel_MLModelID.[ID]
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
    @Source nvarchar(20) = NULL,
    @EffectiveAsOf_Clear bit = 0,
    @EffectiveAsOf datetimeoffset = NULL,
    @InputAsOf_Clear bit = 0,
    @InputAsOf datetimeoffset = NULL,
    @Role nvarchar(20) = NULL,
    @MLModelID_Clear bit = 0,
    @MLModelID uniqueidentifier = NULL
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
                [MLModelID]
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
                ISNULL(@Source, 'Pipeline'),
                CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, NULL) END,
                CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, NULL) END,
                ISNULL(@Role, 'Champion'),
                CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, NULL) END
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
                [MLModelID]
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
                ISNULL(@Source, 'Pipeline'),
                CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, NULL) END,
                CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, NULL) END,
                ISNULL(@Role, 'Champion'),
                CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, NULL) END
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
    @Source nvarchar(20) = NULL,
    @EffectiveAsOf_Clear bit = 0,
    @EffectiveAsOf datetimeoffset = NULL,
    @InputAsOf_Clear bit = 0,
    @InputAsOf datetimeoffset = NULL,
    @Role nvarchar(20) = NULL,
    @MLModelID_Clear bit = 0,
    @MLModelID uniqueidentifier = NULL
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
        [Source] = ISNULL(@Source, [Source]),
        [EffectiveAsOf] = CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, [EffectiveAsOf]) END,
        [InputAsOf] = CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, [InputAsOf]) END,
        [Role] = ISNULL(@Role, [Role]),
        [MLModelID] = CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, [MLModelID]) END
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

/* SQL text to update entity field related entity name field map for entity field ID B1D605D1-EE28-477C-987B-B9B2931DF177 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B1D605D1-EE28-477C-987B-B9B2931DF177', @RelatedEntityNameFieldMap='Model';

/* SQL text to update entity field related entity name field map for entity field ID 86FD001C-52E7-4A71-A475-F5C4878B7CC4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='86FD001C-52E7-4A71-A475-F5C4878B7CC4', @RelatedEntityNameFieldMap='MLModel';

/* SQL text to update entity field related entity name field map for entity field ID 6E6B7AE1-B468-42F7-8DB8-AD2DEDEFF9F4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6E6B7AE1-B468-42F7-8DB8-AD2DEDEFF9F4', @RelatedEntityNameFieldMap='Model';

/* SQL text to update entity field related entity name field map for entity field ID E32C4553-B310-47A0-B23E-8F065EE970AA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E32C4553-B310-47A0-B23E-8F065EE970AA', @RelatedEntityNameFieldMap='Model';

/* SQL text to update entity field related entity name field map for entity field ID 0344714E-16AC-4943-BE84-DFA4E7ADBB3E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0344714E-16AC-4943-BE84-DFA4E7ADBB3E', @RelatedEntityNameFieldMap='ReplacesModel';

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
    m.*,
    MJMLModel_ModelID.[TargetVariable] AS [Model]
FROM
    [${flyway:defaultSchema}].[MLOutputBinding] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLModel] AS MJMLModel_ModelID
  ON
    [m].[ModelID] = MJMLModel_ModelID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLOutputBindings] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLOutputBindings] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLOutputBindings] FROM [cdp_UI]
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

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLOutputBindings] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLOutputBindings] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLOutputBindings] FROM [cdp_UI]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLOutputBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLOutputBinding] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLOutputBinding] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Output Bindings */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLOutputBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLOutputBinding] FROM [cdp_Integration]
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
        [Label] = ISNULL(@Label, [Label])
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLOutputBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLOutputBinding] FROM [cdp_Integration]
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
    UPDATE
        [${flyway:defaultSchema}].[MLOutputBinding]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLOutputBinding] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Output Bindings */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLOutputBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLOutputBinding] FROM [cdp_Integration]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLOutputBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLOutputBinding] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLOutputBinding] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Output Bindings */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLOutputBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLOutputBinding] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLOutputBinding] TO [cdp_Developer], [cdp_Integration];

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
    MJMLModel_MLModelID.[TargetVariable] AS [MLModel],
    MJRecordProcess_RecordProcessID.[Name] AS [RecordProcess],
    MJEntity_TargetEntityID.[Name] AS [TargetEntity]
FROM
    [${flyway:defaultSchema}].[MLModelScoringBinding] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLModel] AS MJMLModel_MLModelID
  ON
    [m].[MLModelID] = MJMLModel_MLModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RecordProcess] AS MJRecordProcess_RecordProcessID
  ON
    [m].[RecordProcessID] = MJRecordProcess_RecordProcessID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_TargetEntityID
  ON
    [m].[TargetEntityID] = MJEntity_TargetEntityID.[ID]
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
    @MLModelID uniqueidentifier,
    @RecordProcessID_Clear bit = 0,
    @RecordProcessID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetColumn_Clear bit = 0,
    @TargetColumn nvarchar(255) = NULL,
    @Mode nvarchar(20) = NULL,
    @MaterializedResultID_Clear bit = 0,
    @MaterializedResultID uniqueidentifier = NULL,
    @LastScoredAt_Clear bit = 0,
    @LastScoredAt datetimeoffset = NULL,
    @LastRowCount_Clear bit = 0,
    @LastRowCount int = NULL
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
                [MLModelID],
                [RecordProcessID],
                [TargetEntityID],
                [TargetColumn],
                [Mode],
                [MaterializedResultID],
                [LastScoredAt],
                [LastRowCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MLModelID,
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetColumn_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumn, NULL) END,
                ISNULL(@Mode, 'OnDemand'),
                CASE WHEN @MaterializedResultID_Clear = 1 THEN NULL ELSE ISNULL(@MaterializedResultID, NULL) END,
                CASE WHEN @LastScoredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastScoredAt, NULL) END,
                CASE WHEN @LastRowCount_Clear = 1 THEN NULL ELSE ISNULL(@LastRowCount, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLModelScoringBinding]
            (
                [MLModelID],
                [RecordProcessID],
                [TargetEntityID],
                [TargetColumn],
                [Mode],
                [MaterializedResultID],
                [LastScoredAt],
                [LastRowCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MLModelID,
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetColumn_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumn, NULL) END,
                ISNULL(@Mode, 'OnDemand'),
                CASE WHEN @MaterializedResultID_Clear = 1 THEN NULL ELSE ISNULL(@MaterializedResultID, NULL) END,
                CASE WHEN @LastScoredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastScoredAt, NULL) END,
                CASE WHEN @LastRowCount_Clear = 1 THEN NULL ELSE ISNULL(@LastRowCount, NULL) END
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
    @MLModelID uniqueidentifier = NULL,
    @RecordProcessID_Clear bit = 0,
    @RecordProcessID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetColumn_Clear bit = 0,
    @TargetColumn nvarchar(255) = NULL,
    @Mode nvarchar(20) = NULL,
    @MaterializedResultID_Clear bit = 0,
    @MaterializedResultID uniqueidentifier = NULL,
    @LastScoredAt_Clear bit = 0,
    @LastScoredAt datetimeoffset = NULL,
    @LastRowCount_Clear bit = 0,
    @LastRowCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLModelScoringBinding]
    SET
        [MLModelID] = ISNULL(@MLModelID, [MLModelID]),
        [RecordProcessID] = CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, [RecordProcessID]) END,
        [TargetEntityID] = CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, [TargetEntityID]) END,
        [TargetColumn] = CASE WHEN @TargetColumn_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumn, [TargetColumn]) END,
        [Mode] = ISNULL(@Mode, [Mode]),
        [MaterializedResultID] = CASE WHEN @MaterializedResultID_Clear = 1 THEN NULL ELSE ISNULL(@MaterializedResultID, [MaterializedResultID]) END,
        [LastScoredAt] = CASE WHEN @LastScoredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastScoredAt, [LastScoredAt]) END,
        [LastRowCount] = CASE WHEN @LastRowCount_Clear = 1 THEN NULL ELSE ISNULL(@LastRowCount, [LastRowCount]) END
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
    UPDATE
        [${flyway:defaultSchema}].[MLModelScoringBinding]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLModelScoringBinding] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
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
    MJMLModel_ModelID.[TargetVariable] AS [Model],
    MJScheduledJobRun_ScheduledJobRunID.[ScheduledJob] AS [ScheduledJobRun]
FROM
    [${flyway:defaultSchema}].[MLMonitoringResult] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLModel] AS MJMLModel_ModelID
  ON
    [m].[ModelID] = MJMLModel_ModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwScheduledJobRuns] AS MJScheduledJobRun_ScheduledJobRunID
  ON
    [m].[ScheduledJobRunID] = MJScheduledJobRun_ScheduledJobRunID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLMonitoringResults] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLMonitoringResults] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLMonitoringResults] FROM [cdp_UI]
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

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLMonitoringResults] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLMonitoringResults] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLMonitoringResults] FROM [cdp_UI]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLMonitoringResult] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLMonitoringResult] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLMonitoringResult] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Monitoring Results */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLMonitoringResult] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLMonitoringResult] FROM [cdp_Integration]
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
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLMonitoringResult] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLMonitoringResult] FROM [cdp_Integration]
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
    UPDATE
        [${flyway:defaultSchema}].[MLMonitoringResult]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLMonitoringResult] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Monitoring Results */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLMonitoringResult] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLMonitoringResult] FROM [cdp_Integration]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLMonitoringResult] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLMonitoringResult] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLMonitoringResult] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Monitoring Results */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLMonitoringResult] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLMonitoringResult] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLMonitoringResult] TO [cdp_Developer], [cdp_Integration];

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
    MJMLModel_ModelID.[TargetVariable] AS [Model],
    MJUser_UserID.[Name] AS [User],
    MJMLModel_ReplacesModelID.[TargetVariable] AS [ReplacesModel]
FROM
    [${flyway:defaultSchema}].[MLModelPublishRecord] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLModel] AS MJMLModel_ModelID
  ON
    [m].[ModelID] = MJMLModel_ModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [m].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLModel] AS MJMLModel_ReplacesModelID
  ON
    [m].[ReplacesModelID] = MJMLModel_ReplacesModelID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelPublishRecords] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelPublishRecords] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelPublishRecords] FROM [cdp_UI]
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

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelPublishRecords] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelPublishRecords] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelPublishRecords] FROM [cdp_UI]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelPublishRecord] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelPublishRecord] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelPublishRecord] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Model Publish Records */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelPublishRecord] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelPublishRecord] FROM [cdp_Integration]
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
        [Transient] = ISNULL(@Transient, [Transient])
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelPublishRecord] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelPublishRecord] FROM [cdp_Integration]
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
    UPDATE
        [${flyway:defaultSchema}].[MLModelPublishRecord]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLModelPublishRecord] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Model Publish Records */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelPublishRecord] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelPublishRecord] FROM [cdp_Integration]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelPublishRecord] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelPublishRecord] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelPublishRecord] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Model Publish Records */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelPublishRecord] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelPublishRecord] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelPublishRecord] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 29FB3DFD-4D4E-4A65-9A23-5163B3C9A854 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='29FB3DFD-4D4E-4A65-9A23-5163B3C9A854', @RelatedEntityNameFieldMap='Model';

/* SQL text to update entity field related entity name field map for entity field ID 237CF3C4-7600-4C67-A368-73B9830FF3C2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='237CF3C4-7600-4C67-A368-73B9830FF3C2', @RelatedEntityNameFieldMap='ResultingModel';

/* Base View SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: vwMLTrainingRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Training Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLTrainingRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLTrainingRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLTrainingRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLTrainingRuns]
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID.[Name] AS [Pipeline],
    MJMLModel_ResultingModelID.[TargetVariable] AS [ResultingModel],
    MJExperimentSessionIteration_ExperimentSessionIterationID.[Label] AS [ExperimentSessionIteration],
    MJMLAlgorithm_AlgorithmID.[Name] AS [Algorithm],
    MJMLTrainingSnapshot_TrainingSnapshotID.[ContentHash] AS [TrainingSnapshot],
    MJMLEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol]
FROM
    [${flyway:defaultSchema}].[MLTrainingRun] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_PipelineID
  ON
    [m].[PipelineID] = MJMLTrainingPipeline_PipelineID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLModel] AS MJMLModel_ResultingModelID
  ON
    [m].[ResultingModelID] = MJMLModel_ResultingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ExperimentSessionIteration] AS MJExperimentSessionIteration_ExperimentSessionIterationID
  ON
    [m].[ExperimentSessionIterationID] = MJExperimentSessionIteration_ExperimentSessionIterationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLTrainingSnapshot] AS MJMLTrainingSnapshot_TrainingSnapshotID
  ON
    [m].[TrainingSnapshotID] = MJMLTrainingSnapshot_TrainingSnapshotID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJMLEvaluationProtocol_EvaluationProtocolID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: Permissions for vwMLTrainingRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: spCreateMLTrainingRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLTrainingRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLTrainingRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingRun]
    @ID uniqueidentifier = NULL,
    @PipelineID uniqueidentifier,
    @ResultingModelID_Clear bit = 0,
    @ResultingModelID uniqueidentifier = NULL,
    @ExperimentSessionIterationID_Clear bit = 0,
    @ExperimentSessionIterationID uniqueidentifier = NULL,
    @FeaturesUsed_Clear bit = 0,
    @FeaturesUsed nvarchar(MAX) = NULL,
    @AlgorithmID uniqueidentifier,
    @Hyperparameters_Clear bit = 0,
    @Hyperparameters nvarchar(MAX) = NULL,
    @ValidationResults_Clear bit = 0,
    @ValidationResults nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ComputeCost_Clear bit = 0,
    @ComputeCost decimal(18, 6) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @TrainingSnapshotID_Clear bit = 0,
    @TrainingSnapshotID uniqueidentifier = NULL,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL,
    @CodeVersion_Clear bit = 0,
    @CodeVersion nvarchar(MAX) = NULL,
    @ComputeSeconds_Clear bit = 0,
    @ComputeSeconds decimal(18, 3) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingRun]
            (
                [ID],
                [PipelineID],
                [ResultingModelID],
                [ExperimentSessionIterationID],
                [FeaturesUsed],
                [AlgorithmID],
                [Hyperparameters],
                [ValidationResults],
                [Status],
                [StartedAt],
                [CompletedAt],
                [ComputeCost],
                [TokensUsed],
                [Notes],
                [TrainingSnapshotID],
                [EvaluationProtocolID],
                [CodeVersion],
                [ComputeSeconds]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PipelineID,
                CASE WHEN @ResultingModelID_Clear = 1 THEN NULL ELSE ISNULL(@ResultingModelID, NULL) END,
                CASE WHEN @ExperimentSessionIterationID_Clear = 1 THEN NULL ELSE ISNULL(@ExperimentSessionIterationID, NULL) END,
                CASE WHEN @FeaturesUsed_Clear = 1 THEN NULL ELSE ISNULL(@FeaturesUsed, NULL) END,
                @AlgorithmID,
                CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, NULL) END,
                CASE WHEN @ValidationResults_Clear = 1 THEN NULL ELSE ISNULL(@ValidationResults, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, NULL) END,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END,
                CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, NULL) END,
                CASE WHEN @ComputeSeconds_Clear = 1 THEN NULL ELSE ISNULL(@ComputeSeconds, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingRun]
            (
                [PipelineID],
                [ResultingModelID],
                [ExperimentSessionIterationID],
                [FeaturesUsed],
                [AlgorithmID],
                [Hyperparameters],
                [ValidationResults],
                [Status],
                [StartedAt],
                [CompletedAt],
                [ComputeCost],
                [TokensUsed],
                [Notes],
                [TrainingSnapshotID],
                [EvaluationProtocolID],
                [CodeVersion],
                [ComputeSeconds]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PipelineID,
                CASE WHEN @ResultingModelID_Clear = 1 THEN NULL ELSE ISNULL(@ResultingModelID, NULL) END,
                CASE WHEN @ExperimentSessionIterationID_Clear = 1 THEN NULL ELSE ISNULL(@ExperimentSessionIterationID, NULL) END,
                CASE WHEN @FeaturesUsed_Clear = 1 THEN NULL ELSE ISNULL(@FeaturesUsed, NULL) END,
                @AlgorithmID,
                CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, NULL) END,
                CASE WHEN @ValidationResults_Clear = 1 THEN NULL ELSE ISNULL(@ValidationResults, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, NULL) END,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END,
                CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, NULL) END,
                CASE WHEN @ComputeSeconds_Clear = 1 THEN NULL ELSE ISNULL(@ComputeSeconds, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLTrainingRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Training Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: spUpdateMLTrainingRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLTrainingRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLTrainingRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingRun]
    @ID uniqueidentifier,
    @PipelineID uniqueidentifier = NULL,
    @ResultingModelID_Clear bit = 0,
    @ResultingModelID uniqueidentifier = NULL,
    @ExperimentSessionIterationID_Clear bit = 0,
    @ExperimentSessionIterationID uniqueidentifier = NULL,
    @FeaturesUsed_Clear bit = 0,
    @FeaturesUsed nvarchar(MAX) = NULL,
    @AlgorithmID uniqueidentifier = NULL,
    @Hyperparameters_Clear bit = 0,
    @Hyperparameters nvarchar(MAX) = NULL,
    @ValidationResults_Clear bit = 0,
    @ValidationResults nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ComputeCost_Clear bit = 0,
    @ComputeCost decimal(18, 6) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @TrainingSnapshotID_Clear bit = 0,
    @TrainingSnapshotID uniqueidentifier = NULL,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL,
    @CodeVersion_Clear bit = 0,
    @CodeVersion nvarchar(MAX) = NULL,
    @ComputeSeconds_Clear bit = 0,
    @ComputeSeconds decimal(18, 3) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingRun]
    SET
        [PipelineID] = ISNULL(@PipelineID, [PipelineID]),
        [ResultingModelID] = CASE WHEN @ResultingModelID_Clear = 1 THEN NULL ELSE ISNULL(@ResultingModelID, [ResultingModelID]) END,
        [ExperimentSessionIterationID] = CASE WHEN @ExperimentSessionIterationID_Clear = 1 THEN NULL ELSE ISNULL(@ExperimentSessionIterationID, [ExperimentSessionIterationID]) END,
        [FeaturesUsed] = CASE WHEN @FeaturesUsed_Clear = 1 THEN NULL ELSE ISNULL(@FeaturesUsed, [FeaturesUsed]) END,
        [AlgorithmID] = ISNULL(@AlgorithmID, [AlgorithmID]),
        [Hyperparameters] = CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, [Hyperparameters]) END,
        [ValidationResults] = CASE WHEN @ValidationResults_Clear = 1 THEN NULL ELSE ISNULL(@ValidationResults, [ValidationResults]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [ComputeCost] = CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, [ComputeCost]) END,
        [TokensUsed] = CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, [TokensUsed]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [TrainingSnapshotID] = CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, [TrainingSnapshotID]) END,
        [EvaluationProtocolID] = CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, [EvaluationProtocolID]) END,
        [CodeVersion] = CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, [CodeVersion]) END,
        [ComputeSeconds] = CASE WHEN @ComputeSeconds_Clear = 1 THEN NULL ELSE ISNULL(@ComputeSeconds, [ComputeSeconds]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLTrainingRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLTrainingRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLTrainingRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLTrainingRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLTrainingRun
ON [${flyway:defaultSchema}].[MLTrainingRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLTrainingRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Training Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: spDeleteMLTrainingRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLTrainingRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLTrainingRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLTrainingRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Training Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

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
    MJMLModel_ModelID.[TargetVariable] AS [Model],
    MJMLModelScoringBinding_MLModelScoringBindingID.[TargetColumn] AS [MLModelScoringBinding],
    MJEntity_ScopeEntityID.[Name] AS [ScopeEntity],
    MJUser_RequestedByUserID.[Name] AS [RequestedByUser],
    MJScheduledJobRun_ScheduledJobRunID.[ScheduledJob] AS [ScheduledJobRun]
FROM
    [${flyway:defaultSchema}].[MLScoringRun] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLModel] AS MJMLModel_ModelID
  ON
    [m].[ModelID] = MJMLModel_ModelID.[ID]
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
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLScoringRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLScoringRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLScoringRuns] FROM [cdp_UI]
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

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLScoringRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLScoringRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLScoringRuns] FROM [cdp_UI]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLScoringRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLScoringRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLScoringRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Scoring Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLScoringRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLScoringRun] FROM [cdp_Integration]
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
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLScoringRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLScoringRun] FROM [cdp_Integration]
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
    UPDATE
        [${flyway:defaultSchema}].[MLScoringRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLScoringRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Scoring Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLScoringRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLScoringRun] FROM [cdp_Integration]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLScoringRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLScoringRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLScoringRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Scoring Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLScoringRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLScoringRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLScoringRun] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 8 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f5310a5-26be-4681-bbfd-610760da593a' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'MLModel')) BEGIN
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
            '5f5310a5-26be-4681-bbfd-610760da593a',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA'),
            'MLModel',
            'ML Model',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a42726c-55ed-417c-81d6-6eb1375969e9' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'ResultingModel')) BEGIN
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
            '7a42726c-55ed-417c-81d6-6eb1375969e9',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'),
            'ResultingModel',
            'Resulting Model',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf6dd5cd-342b-4685-ae11-5699831af5ab' OR (EntityID = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3' AND Name = 'Model')) BEGIN
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
            'bf6dd5cd-342b-4685-ae11-5699831af5ab',
            'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CD0AEA13-C20D-4015-80B6-88CF77ADFFE3'),
            'Model',
            'Model',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f5593b3-2d16-4dd2-94ac-2c72a4c1784f' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'MLModel')) BEGIN
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
            '1f5593b3-2d16-4dd2-94ac-2c72a4c1784f',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'MLModel',
            'ML Model',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25cd5d7f-0bf4-4a77-a1e9-b49215da6074' OR (EntityID = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24' AND Name = 'Model')) BEGIN
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
            '25cd5d7f-0bf4-4a77-a1e9-b49215da6074',
            '5501C7ED-0677-4E2D-A508-B3F16EB4EF24', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '5501C7ED-0677-4E2D-A508-B3F16EB4EF24'),
            'Model',
            'Model',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d97503c-f049-4838-816b-7a25fc803998' OR (EntityID = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1' AND Name = 'Model')) BEGIN
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
            '4d97503c-f049-4838-816b-7a25fc803998',
            '3BE035A4-4547-45B9-AB8C-C785B0EB53C1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BE035A4-4547-45B9-AB8C-C785B0EB53C1'),
            'Model',
            'Model',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e8658892-ee23-47f7-843c-981561fa1ee7' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'Model')) BEGIN
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
            'e8658892-ee23-47f7-843c-981561fa1ee7',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
            'Model',
            'Model',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c2fc440d-e35a-4ef4-a499-82fccc9a6f9c' OR (EntityID = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68' AND Name = 'ReplacesModel')) BEGIN
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
            'c2fc440d-e35a-4ef4-a499-82fccc9a6f9c',
            'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7EE5581-BB29-45D1-94AE-E5F2E99BDC68'),
            'ReplacesModel',
            'Replaces Model',
            NULL,
            'nvarchar',
            1000,
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
               WHERE ID = 'E8658892-EE23-47F7-843C-981561FA1EE7'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4D97503C-F049-4838-816B-7A25FC803998'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Model 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model References',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E8658892-EE23-47F7-843C-981561FA1EE7';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ReplacesModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model References',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C2FC440D-E35A-4EF4-A499-82FCCC9A6F9C';

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.MLModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5F5310A5-26BE-4681-BBFD-610760DA593A';

/* Set categories for 3 fields */

-- UPDATE Entity Field Category Info MJ: Feature Values.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '234FB2CE-776D-4D36-B356-0FE1348132B4';

-- UPDATE Entity Field Category Info MJ: Feature Values.MLModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Insights',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '728338F3-7230-42C1-9AD1-6956AFEC40B7';

-- UPDATE Entity Field Category Info MJ: Feature Values.MLModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Insights',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Model Name'
WHERE 
   ID = '1F5593B3-2D16-4DD2-94AC-2C72A4C1784F';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '25CD5D7F-0BF4-4A77-A1E9-B49215DA6074'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Model 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4D97503C-F049-4838-816B-7A25FC803998';

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Model 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BF6DD5CD-342B-4685-AE11-5699831AF5AB';

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.Model 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Output Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '25CD5D7F-0BF4-4A77-A1E9-B49215DA6074';

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ResultingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7A42726C-55ED-417C-81D6-6EB1375969E9';

