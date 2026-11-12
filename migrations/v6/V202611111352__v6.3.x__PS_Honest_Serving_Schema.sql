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
 *   4. FeatureValue          the per-record, per-feature as-of index (over FeatureValue.Role and MLModelID, which
 *                              V202611101901__v6.3.x__Task_Security_Saga_Shadow_Scoring adds with their metadata rows)
 *   5. vwLatestFeatureValues and its read-only virtual entity MJ: Latest Feature Values
 *   6. spDeleteEntityWithCoreDependencies, re-created to clear the serving tables' rows when an entity is removed
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
-- 6. spDeleteEntityWithCoreDependencies: the serving tables (§5.9, D4-32)
-- ============================================================================
-- Sections 1 and 2 add foreign keys into tables this proc deletes from when an entity is removed (MLModel,
-- MLTrainingRun, MLTrainingSnapshot, MLModelScoringBinding, Entity), so removing an entity whose pipeline has a
-- model with a publish record, a scoring run, a monitoring result or an output binding would fail on those FKs.
-- (FeatureValue.MLModelID -> MLModel is V202611101901's, whose procedure already clears it.)
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
-- is V202611101901's body, whose one addition over V202611101200 is the FeatureValue.MLModelID clear (kept below,
-- after the Source = 'Model' delete), unchanged.
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
 * Values; new fields of MJ: ML Models; value lists, entity relationships, entity unique keys
 * (including three for the training schema's existing unique constraints, which the unique-key
 * table was created without), field categories and descriptions; base views,
 * spCreate/spUpdate/spDelete, permissions and FK indexes.
 * Regenerated at the M1 merge of next (origin/next 5fd5335a5f) on databases built from scratch by
 * mj migrate: the first pass ran on the hand-written section alone; a second pass, on a database
 * with the first pass applied, emitted the excluded spDeleteAIConfiguration below and the deleted
 * relationship named in the hand-edit paragraph.
 * Excluded (not this migration's): spDeleteAIConfiguration, which both passes emitted, the first
 * with a cascade update of AIPromptModel.ConfigurationID and the second with the cascade delete
 * that the committed V202610231210 body already has; a database built with neither copy emits
 * nothing on the next CodeGen run.
 * Do NOT edit by hand: if the DDL above changes, re-run CodeGen and replace this section.
 * Four hand edits, each marked "HAND EDIT" where it is, must be re-applied after any regeneration: the
 * three EntityUniqueKey inserts for the training schema's existing constraints are guarded by ID or by
 * (EntityID, Name) (D4-72), and the MJ: Latest Feature Values EntityID field is inserted with
 * AutoUpdateRelatedEntityInfo = 0 (D4-80). Two generated blocks are deleted, not edited (no marker): CodeGen's
 * "Set LLM-identified FKs" block for MJ: Latest Feature Values and the MJ: Entities -> MJ: Latest Feature Values
 * EntityRelationship it derived from that FK (a relationship with no FK behind it).
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
         'e5e2d347-0c92-4f1c-8e02-e9e57b424fb5',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e5e2d347-0c92-4f1c-8e02-e9e57b424fb5', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e5e2d347-0c92-4f1c-8e02-e9e57b424fb5' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e5e2d347-0c92-4f1c-8e02-e9e57b424fb5' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e5e2d347-0c92-4f1c-8e02-e9e57b424fb5' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e5e2d347-0c92-4f1c-8e02-e9e57b424fb5' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e5e2d347-0c92-4f1c-8e02-e9e57b424fb5' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e5e2d347-0c92-4f1c-8e02-e9e57b424fb5' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         'decd6134-517e-462f-81b2-b25f25abacef',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'decd6134-517e-462f-81b2-b25f25abacef', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('decd6134-517e-462f-81b2-b25f25abacef' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('decd6134-517e-462f-81b2-b25f25abacef' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('decd6134-517e-462f-81b2-b25f25abacef' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('decd6134-517e-462f-81b2-b25f25abacef' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('decd6134-517e-462f-81b2-b25f25abacef' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('decd6134-517e-462f-81b2-b25f25abacef' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '12871566-23dd-482d-9476-8b0d65b032a1',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '12871566-23dd-482d-9476-8b0d65b032a1', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('12871566-23dd-482d-9476-8b0d65b032a1' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('12871566-23dd-482d-9476-8b0d65b032a1' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('12871566-23dd-482d-9476-8b0d65b032a1' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('12871566-23dd-482d-9476-8b0d65b032a1' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('12871566-23dd-482d-9476-8b0d65b032a1' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('12871566-23dd-482d-9476-8b0d65b032a1' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '065395f1-91d9-4a30-a89f-89bd6ddcfacd',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '065395f1-91d9-4a30-a89f-89bd6ddcfacd', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('065395f1-91d9-4a30-a89f-89bd6ddcfacd' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('065395f1-91d9-4a30-a89f-89bd6ddcfacd' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('065395f1-91d9-4a30-a89f-89bd6ddcfacd' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('065395f1-91d9-4a30-a89f-89bd6ddcfacd' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('065395f1-91d9-4a30-a89f-89bd6ddcfacd' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('065395f1-91d9-4a30-a89f-89bd6ddcfacd' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ca35a28-9ea4-4308-ae1d-01abc617bd43' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9ca35a28-9ea4-4308-ae1d-01abc617bd43',
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

      -- HAND EDIT (4) (re-apply after any tail regeneration): AutoUpdateRelatedEntityInfo = 0 pins this view field's relationship, so CodeGen's LLM decoration never infers a soft FK on MJ: Latest Feature Values.EntityID (the real FK is FeatureValue.EntityID, which spDeleteEntityWithCoreDependencies already covers; D4-80)
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '397f9a39-4ab6-4b53-910b-88c08857f35b' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
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
            '397f9a39-4ab6-4b53-910b-88c08857f35b',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de6dce9b-c554-445e-a851-1016f7c0e9cb' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'RecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'de6dce9b-c554-445e-a851-1016f7c0e9cb',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d426438-10a0-4bbb-8373-882f802f2d08' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'FeatureName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6d426438-10a0-4bbb-8373-882f802f2d08',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '033ae2ed-ce1d-4ae6-a259-b7760e07cd91' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Source')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '033ae2ed-ce1d-4ae6-a259-b7760e07cd91',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22f8ca06-5b32-403d-9e38-0112a7dddcdc' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Role')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '22f8ca06-5b32-403d-9e38-0112a7dddcdc',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0a80581-8f2c-4458-8146-a96ce6297dd2' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'EffectiveAsOf')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a0a80581-8f2c-4458-8146-a96ce6297dd2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8bcfa9fe-8fb5-4745-bfee-642c9678b888' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ComputedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8bcfa9fe-8fb5-4745-bfee-642c9678b888',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5da1e621-5844-4edf-844b-27f0a1b8d191' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'MLModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5da1e621-5844-4edf-844b-27f0a1b8d191',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '902d63b4-c0f2-48fa-aeb4-ce6c24d0ddaf' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'RecordProcessID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '902d63b4-c0f2-48fa-aeb4-ce6c24d0ddaf',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '415bf917-772b-45aa-bb4c-07d90cd6f332' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueText')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '415bf917-772b-45aa-bb4c-07d90cd6f332',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7b0626c-504f-4785-b6ed-f88199d85770' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueNumeric')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a7b0626c-504f-4785-b6ed-f88199d85770',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82fc60ac-87cf-4b69-bbfa-60c33efce219' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '82fc60ac-87cf-4b69-bbfa-60c33efce219',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '493616b2-3e64-43c5-bbb7-866f90097fd6' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueBoolean')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '493616b2-3e64-43c5-bbb7-866f90097fd6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a604764-2f98-4092-b239-08bf6c36d061' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a604764-2f98-4092-b239-08bf6c36d061',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be41006a-78f7-4028-ade8-e7ef381491dd' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Confidence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'be41006a-78f7-4028-ade8-e7ef381491dd',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4bb7cc02-f8b5-45ee-b50f-467fb0e66ab0' OR (EntityID = '065395F1-91D9-4A30-A89F-89BD6DDCFACD' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4bb7cc02-f8b5-45ee-b50f-467fb0e66ab0',
            '065395F1-91D9-4A30-A89F-89BD6DDCFACD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '955b6472-46f2-4f58-a162-573c52d2bd96' OR (EntityID = '065395F1-91D9-4A30-A89F-89BD6DDCFACD' AND Name = 'ModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '955b6472-46f2-4f58-a162-573c52d2bd96',
            '065395F1-91D9-4A30-A89F-89BD6DDCFACD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bd55b357-bd1f-4e05-90ea-9b4bca0dcb91' OR (EntityID = '065395F1-91D9-4A30-A89F-89BD6DDCFACD' AND Name = 'Surface')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bd55b357-bd1f-4e05-90ea-9b4bca0dcb91',
            '065395F1-91D9-4A30-A89F-89BD6DDCFACD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f819b7b7-255a-4f17-ba6f-47eff5ab02f0' OR (EntityID = '065395F1-91D9-4A30-A89F-89BD6DDCFACD' AND Name = 'SortsBy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f819b7b7-255a-4f17-ba6f-47eff5ab02f0',
            '065395F1-91D9-4A30-A89F-89BD6DDCFACD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee042840-473e-4a44-bc67-9be8d4ec809e' OR (EntityID = '065395F1-91D9-4A30-A89F-89BD6DDCFACD' AND Name = 'DriverDirectionRelativeTo')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ee042840-473e-4a44-bc67-9be8d4ec809e',
            '065395F1-91D9-4A30-A89F-89BD6DDCFACD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '87e4c721-0b3d-4339-a7d5-bdd13402f6fc' OR (EntityID = '065395F1-91D9-4A30-A89F-89BD6DDCFACD' AND Name = 'Label')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '87e4c721-0b3d-4339-a7d5-bdd13402f6fc',
            '065395F1-91D9-4A30-A89F-89BD6DDCFACD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3137a604-6cc3-447e-96fa-94a3ba057940' OR (EntityID = '065395F1-91D9-4A30-A89F-89BD6DDCFACD' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3137a604-6cc3-447e-96fa-94a3ba057940',
            '065395F1-91D9-4A30-A89F-89BD6DDCFACD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56c3e9c7-e8cd-4ae6-8a99-3993760bc96b' OR (EntityID = '065395F1-91D9-4A30-A89F-89BD6DDCFACD' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '56c3e9c7-e8cd-4ae6-8a99-3993760bc96b',
            '065395F1-91D9-4A30-A89F-89BD6DDCFACD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a01ce6c-997e-44d2-a387-acfe3954f6b3' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6a01ce6c-997e-44d2-a387-acfe3954f6b3',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '336d3a67-ee7c-4e6d-a656-2a4c4fc04ba8' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'ModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '336d3a67-ee7c-4e6d-a656-2a4c4fc04ba8',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef596c07-010b-443e-aeb5-d2b6fee0d264' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'ScheduledJobRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ef596c07-010b-443e-aeb5-d2b6fee0d264',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '59df1165-fae1-475c-a8df-d426f4133a55' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'Period')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '59df1165-fae1-475c-a8df-d426f4133a55',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '93e5ee5a-5bc0-4ff5-af1c-9fb7b3f3a315' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'PeriodGrain')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '93e5ee5a-5bc0-4ff5-af1c-9fb7b3f3a315',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ce60caf-7083-4af5-84d0-dbbb78d38424' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'State')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0ce60caf-7083-4af5-84d0-dbbb78d38424',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '088f8203-3148-4bf0-8a0d-63831a894a83' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'ScoredRows')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '088f8203-3148-4bf0-8a0d-63831a894a83',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2f59d964-a806-42df-91ac-cedebf84b246' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'JoinedRows')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2f59d964-a806-42df-91ac-cedebf84b246',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd3193b4b-3917-4a02-a7f3-e03a0cf4fc75' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'ExcludedInTrainingRows')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd3193b4b-3917-4a02-a7f3-e03a0cf4fc75',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d30fb11-f763-405b-8a28-bcc076752aad' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'PrimaryScore')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5d30fb11-f763-405b-8a28-bcc076752aad',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6cb8c911-98cc-464e-88f9-5b88c9e283f4' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'PrimaryValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6cb8c911-98cc-464e-88f9-5b88c9e283f4',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e720d1bf-bc35-4e78-8538-190bba35f20f' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'PrimaryLower')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e720d1bf-bc35-4e78-8538-190bba35f20f',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1e9058d-5da3-48ce-9bad-02677a155426' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'PrimaryUpper')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd1e9058d-5da3-48ce-9bad-02677a155426',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3cc8f36-408f-4ebd-86dc-920629e69924' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'TrackedMetrics')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e3cc8f36-408f-4ebd-86dc-920629e69924',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '19475a33-37d5-4d27-b9ad-cf2632e638c6' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'Calibration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '19475a33-37d5-4d27-b9ad-cf2632e638c6',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb4c026b-3248-4b88-9a40-b7c4f76f3005' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'DriftLook')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bb4c026b-3248-4b88-9a40-b7c4f76f3005',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b148ce29-b7ec-42f1-aeb5-b470f8a46e65' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'DriftAlarms')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b148ce29-b7ec-42f1-aeb5-b470f8a46e65',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd83113e3-638a-4630-820c-17a1dbf6ec9d' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'Parity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd83113e3-638a-4630-820c-17a1dbf6ec9d',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '92db3e2c-15b6-4f1f-95e1-2a6a1f4900ab' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'TriggersFired')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '92db3e2c-15b6-4f1f-95e1-2a6a1f4900ab',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ba756c96-33d0-49e7-a65d-13c0d6e98b50' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'ChallengerRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ba756c96-33d0-49e7-a65d-13c0d6e98b50',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6cc70889-8b8d-416f-84d6-db5d280eb097' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'ChallengerResult')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6cc70889-8b8d-416f-84d6-db5d280eb097',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b79ed335-218e-4a65-adf2-7e12b75f977f' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'RollbackCheck')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b79ed335-218e-4a65-adf2-7e12b75f977f',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3baa43bd-5ae6-4a95-b7c5-1f599866bc21' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'ErrorMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3baa43bd-5ae6-4a95-b7c5-1f599866bc21',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34abb363-1d45-4188-838a-2e0802e33328' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '34abb363-1d45-4188-838a-2e0802e33328',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d18eb92-5d28-4fa4-8b8d-85f69b78630a' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1d18eb92-5d28-4fa4-8b8d-85f69b78630a',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '548a3848-dd9e-40af-b595-92c82e5cfacf' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'PredictionUnitID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '548a3848-dd9e-40af-b595-92c82e5cfacf',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e1ce3aa-bdb4-4c9b-83dc-3ae7fcb7fcc3' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'EvaluationProtocolID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0e1ce3aa-bdb4-4c9b-83dc-3ae7fcb7fcc3',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a20fdc66-2f73-425c-a94b-469dcb4a81c6' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingSnapshotID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a20fdc66-2f73-425c-a94b-469dcb4a81c6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd626480-2baf-4c71-a435-62b257d1dacf' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dd626480-2baf-4c71-a435-62b257d1dacf',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca8c88a6-577f-44fc-8858-20192942d650' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactSha256')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca8c88a6-577f-44fc-8858-20192942d650',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a00c9fe-cd17-47fa-a2e0-feaa10e908d9' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'SnapshotHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0a00c9fe-cd17-47fa-a2e0-feaa10e908d9',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2973a999-43c0-4efb-a506-b05520f505a0' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'CodeVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2973a999-43c0-4efb-a506-b05520f505a0',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed5915ae-b68e-4b2a-8fd4-eff04af86955' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'FeatureSchemaHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ed5915ae-b68e-4b2a-8fd4-eff04af86955',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32c59860-48a1-493a-809a-45e48927bb36' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'OutputSemantics')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '32c59860-48a1-493a-809a-45e48927bb36',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5d464d6-9051-4f2b-98f3-b60cb09bcab6' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Delivery')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd5d464d6-9051-4f2b-98f3-b60cb09bcab6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b6b2d10-d331-4435-b9ac-bd9a628feddd' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'StatusReason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1b6b2d10-d331-4435-b9ac-bd9a628feddd',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3319949a-ba87-4466-b69f-a33004277473' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3319949a-ba87-4466-b69f-a33004277473',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df55ae39-1605-4698-94ef-f29dae84c1fe' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactCheckedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'df55ae39-1605-4698-94ef-f29dae84c1fe',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd859fd16-228e-432d-9c3e-5f0b446275e2' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ServingWhileUnevaluated')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd859fd16-228e-432d-9c3e-5f0b446275e2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4dbbccc-095c-4377-9c07-18b1948aadcc' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e4dbbccc-095c-4377-9c07-18b1948aadcc',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2611c57c-0436-482e-91b6-4a7429d59637' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'ModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2611c57c-0436-482e-91b6-4a7429d59637',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '06713152-56eb-4dc5-98e6-a301899c8995' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'ModelVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '06713152-56eb-4dc5-98e6-a301899c8995',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70e4a8e4-174c-4b1d-a1ce-8684ee8b7d91' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'MLModelScoringBindingID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '70e4a8e4-174c-4b1d-a1ce-8684ee8b7d91',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0eac564f-2aa7-4f0a-bec2-05f1122cd359' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'ArtifactSha256')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0eac564f-2aa7-4f0a-bec2-05f1122cd359',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1782dbd3-5ac8-4715-9ff0-4f3963dfe5e7' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'FeatureSchemaHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1782dbd3-5ac8-4715-9ff0-4f3963dfe5e7',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b5f47716-e4d8-46bc-9e2f-61ff3b58d622' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'Path')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b5f47716-e4d8-46bc-9e2f-61ff3b58d622',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bae86173-e1f2-4995-bd2b-1d340fb0568b' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'ScopeKind')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bae86173-e1f2-4995-bd2b-1d340fb0568b',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5081c172-ff24-4563-beab-771985123c77' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'ScopeEntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5081c172-ff24-4563-beab-771985123c77',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb83999a-3498-48b8-9737-bd71ebe3fc37' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'Scope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bb83999a-3498-48b8-9737-bd71ebe3fc37',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '145fabda-17b8-44a9-b482-606edeeb573d' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'EntityMapping')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '145fabda-17b8-44a9-b482-606edeeb573d',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '165d7253-3fe2-479e-bd1c-f74c3e8b68a2' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'AsOfDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '165d7253-3fe2-479e-bd1c-f74c3e8b68a2',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b56856fa-5bf7-463a-a26f-2a3515607ebc' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'ReadPolicy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b56856fa-5bf7-463a-a26f-2a3515607ebc',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f7d3cc9-241a-4d70-8e1f-f04e8561611b' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'DryRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4f7d3cc9-241a-4d70-8e1f-f04e8561611b',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e563490f-262a-440b-bef8-7efb3960bf1a' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'RequestedBy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e563490f-262a-440b-bef8-7efb3960bf1a',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5b13ef4-ff85-4f10-b2d2-9183335ecc64' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'RequestedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c5b13ef4-ff85-4f10-b2d2-9183335ecc64',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb34a2f5-dce2-4450-b3c0-662185df8f4c' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'ProcessRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cb34a2f5-dce2-4450-b3c0-662185df8f4c',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '13a86b9b-0f44-4529-8c39-cf2453994595' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'ScheduledJobRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '13a86b9b-0f44-4529-8c39-cf2453994595',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c2599d7-d68e-4af9-99dc-d1d17bc657aa' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3c2599d7-d68e-4af9-99dc-d1d17bc657aa',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81f6b935-ed99-45fb-8124-c76df9ebc913' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'Refusal')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '81f6b935-ed99-45fb-8124-c76df9ebc913',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f984897e-c610-4380-b9de-c61de388a947' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'Total')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f984897e-c610-4380-b9de-c61de388a947',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b9b0ce29-6c88-4880-b88e-f25a81103903' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'Written')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b9b0ce29-6c88-4880-b88e-f25a81103903',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c27d12b-d80a-4965-ab07-7ef4575969ab' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'Failed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7c27d12b-d80a-4965-ab07-7ef4575969ab',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30004c6f-7eee-4cab-b0a4-c1d592a8f508' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'Skipped')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '30004c6f-7eee-4cab-b0a4-c1d592a8f508',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b6c849ad-8002-42e9-9edc-9b95a3b6c93d' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'FirstErrors')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b6c849ad-8002-42e9-9edc-9b95a3b6c93d',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c45c9668-e978-47a4-95d1-deef90c54f86' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'StartedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c45c9668-e978-47a4-95d1-deef90c54f86',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'edf8727d-8545-4252-85a4-10f3e53b0824' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'EndedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'edf8727d-8545-4252-85a4-10f3e53b0824',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d3951b3-0789-4b79-8d0e-8cf0175f24af' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1d3951b3-0789-4b79-8d0e-8cf0175f24af',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ebe90952-887e-420c-b66c-a8601cfe8d5a' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ebe90952-887e-420c-b66c-a8601cfe8d5a',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f434efb3-e04d-46bd-bce9-ff34653ed57f' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f434efb3-e04d-46bd-bce9-ff34653ed57f',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eaa84387-e334-4a20-82f4-7d6f3e516613' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'ModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eaa84387-e334-4a20-82f4-7d6f3e516613',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3e6099d1-edde-40c1-bb87-5d705bb55f53' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'TrainingRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3e6099d1-edde-40c1-bb87-5d705bb55f53',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26f84077-f615-4e10-9285-a23dca8d9042' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'Kind')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '26f84077-f615-4e10-9285-a23dca8d9042',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e6a435b5-24e4-4f0f-aea0-552aa89ba85f' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'Purpose')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e6a435b5-24e4-4f0f-aea0-552aa89ba85f',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ba82721-1014-4cc0-8f39-d7921ee8b55f' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'ApproverKind')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7ba82721-1014-4cc0-8f39-d7921ee8b55f',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '545a16d6-8edc-4b3b-8349-8f6f2686cd87' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '545a16d6-8edc-4b3b-8349-8f6f2686cd87',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ecc5a231-d543-4013-b78c-4c3d77977e78' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'Initiator')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ecc5a231-d543-4013-b78c-4c3d77977e78',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dce5a2c9-4ab0-450e-b927-2a113646696c' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'RecordedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dce5a2c9-4ab0-450e-b927-2a113646696c',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0eee995e-24e4-433e-b52c-9438e5ce4917' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'Decision')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0eee995e-24e4-433e-b52c-9438e5ce4917',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ab1aa4b-fb9e-450a-85e8-0236bdedf89f' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'Reason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3ab1aa4b-fb9e-450a-85e8-0236bdedf89f',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c8b5df93-8e3f-49ee-bb2c-69d9841d8821' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'GateDecision')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c8b5df93-8e3f-49ee-bb2c-69d9841d8821',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb59206d-0ca9-4e98-be54-787fac7cef49' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'Evidence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cb59206d-0ca9-4e98-be54-787fac7cef49',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5387965e-bc4a-47e4-abb5-755c1c708b4c' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'EvidenceSha256')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5387965e-bc4a-47e4-abb5-755c1c708b4c',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96ba0cd7-a5a3-41d0-b073-5ba34b2b1990' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'OverridesFlags')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '96ba0cd7-a5a3-41d0-b073-5ba34b2b1990',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1097f7aa-e041-4a06-9714-4997635c435a' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'SignOffID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1097f7aa-e041-4a06-9714-4997635c435a',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea7b63bb-7b70-4dfe-97bc-241c8f8394d8' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'ReplacesModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ea7b63bb-7b70-4dfe-97bc-241c8f8394d8',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '72561a57-61cc-4142-a58a-f308e846231b' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'Refusal')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '72561a57-61cc-4142-a58a-f308e846231b',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c3c9c704-838a-4e6b-a494-16c9ee6e2c45' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'Transient')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c3c9c704-838a-4e6b-a494-16c9ee6e2c45',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '698eef32-8786-4eda-b81a-51b6e0caa52d' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '698eef32-8786-4eda-b81a-51b6e0caa52d',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63492f90-d8b7-4d25-94ca-1d5687958df4' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '63492f90-d8b7-4d25-94ca-1d5687958df4',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c50c8bc5-1328-43b5-a26f-fbae338fbd72', '065395F1-91D9-4A30-A89F-89BD6DDCFACD', 'UQ_MLOutputBinding_ModelSurface', 'ModelID,Surface', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f5b10900-c41d-48c7-ad91-3be2ca8b5705', '12871566-23DD-482D-9476-8B0D65B032A1', 'UQ_MLMonitoringResult_ModelPeriod', 'ModelID,PeriodGrain,Period', NULL);
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = 'ea81a27b-721e-4b5d-a008-2a4dde7c5846' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [Name] = 'UQ_MLEvaluationProtocol_Lineage_Version'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('ea81a27b-721e-4b5d-a008-2a4dde7c5846', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'UQ_MLEvaluationProtocol_Lineage_Version', 'LineageRootID,Version', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c22631b2-6668-4b42-8d1d-f790cfda3d11', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'UX_MLModel_OneServingUnevaluatedPerPipeline', 'PipelineID', '([ServingWhileUnevaluated]=(1))');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('721ca96a-2f11-489b-8cf3-4ea67444c9a8', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'UX_MLModel_PipelineVersion', 'PipelineID,Version', NULL);
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = 'c59430a3-374b-4732-882a-97ca5f281ba8' OR ([EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [Name] = 'UQ_MLPredictionUnit_Lineage_Version'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c59430a3-374b-4732-882a-97ca5f281ba8', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'UQ_MLPredictionUnit_Lineage_Version', 'LineageRootID,Version', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('de0c2d4a-7325-4afd-98e2-e971c5f60bee', 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', 'UX_MLModelPublishRecord_OnePublishPerRun', 'TrainingRunID', '([Kind]=''publish'' AND ([Purpose] IN (''publish'', ''adopt'')) AND [TrainingRunID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('53f1743f-b443-4a3a-994b-d72f5ecbde3b', 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', 'UX_MLModelPublishRecord_OneRunOutcome', 'TrainingRunID', '([Purpose]=''evaluate'' AND [TrainingRunID] IS NOT NULL)');
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = 'f13e161f-f63c-4249-82e2-ca49fe578c76' OR ([EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [Name] = 'UQ_MLTrainingSnapshot_ContentHash'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f13e161f-f63c-4249-82e2-ca49fe578c76', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'UQ_MLTrainingSnapshot_ContentHash', 'ContentHash', NULL);

/* SQL text to sync 4 entity field value row(s) for entity field ID 8B0C0799-D66A-48BA-987D-C32D477E2A28 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f389637f-8490-449f-931f-fae2bdf65adb', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 3, 'KeepBaseline', 'KeepBaseline', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('67c555af-5b57-4142-b8c7-4c598ae52634', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 5, 'Unevaluated', 'Unevaluated', 'Check', GETUTCDATE(), GETUTCDATE());
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='C2CE99CA-0E5D-4227-B71D-55A34C1B1F84';
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='5F645BCA-78A6-4F2F-B01D-1AE7ED48BFC8';

/* SQL text to sync 3 entity field value row(s) for entity field ID 26F84077-F615-4E10-9285-A23DCA8D9042 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f8138166-c02f-4934-a3ab-5b80c7f6c179', '26F84077-F615-4E10-9285-A23DCA8D9042', 1, 'publish', 'publish', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ff01f3f9-7410-499a-a093-63edde7161d3', '26F84077-F615-4E10-9285-A23DCA8D9042', 2, 'refusal', 'refusal', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('85f1c50d-3956-4128-a483-1ec35cdd6d62', '26F84077-F615-4E10-9285-A23DCA8D9042', 3, 'sign-off', 'sign-off', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 26F84077-F615-4E10-9285-A23DCA8D9042 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='26F84077-F615-4E10-9285-A23DCA8D9042';

/* SQL text to sync 4 entity field value row(s) for entity field ID E6A435B5-24E4-4F0F-AEA0-552AA89BA85F */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('50d47857-b5f9-49b7-834c-b9e6c0bb3bd4', 'E6A435B5-24E4-4F0F-AEA0-552AA89BA85F', 1, 'adopt', 'adopt', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a5e41e86-4627-4be6-b518-aacd84712cca', 'E6A435B5-24E4-4F0F-AEA0-552AA89BA85F', 2, 'evaluate', 'evaluate', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('894a969f-32ae-436e-9c54-8edd2b3bec7a', 'E6A435B5-24E4-4F0F-AEA0-552AA89BA85F', 3, 'publish', 'publish', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e31042b8-68ae-4796-8a63-1e9239a9aca8', 'E6A435B5-24E4-4F0F-AEA0-552AA89BA85F', 4, 'rollback', 'rollback', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E6A435B5-24E4-4F0F-AEA0-552AA89BA85F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E6A435B5-24E4-4F0F-AEA0-552AA89BA85F';

/* SQL text to sync 5 entity field value row(s) for entity field ID B5F47716-E4D8-46BC-9E2F-61FF3B58D622 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1f309102-06bb-4f5a-b8bb-40a96e01cc24', 'B5F47716-E4D8-46BC-9E2F-61FF3B58D622', 1, 'monitoring', 'monitoring', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d5198cfa-e343-4415-8ae6-506ae0f61187', 'B5F47716-E4D8-46BC-9E2F-61FF3B58D622', 2, 'parity', 'parity', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b13e7afd-37b7-4bcd-8057-dea6852af5c2', 'B5F47716-E4D8-46BC-9E2F-61FF3B58D622', 3, 'predict', 'predict', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('db4f459b-301d-47be-80d2-de02d4762ef1', 'B5F47716-E4D8-46BC-9E2F-61FF3B58D622', 4, 'record-process', 'record-process', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6560bbfa-65af-4d74-b3e2-c71f856a15a4', 'B5F47716-E4D8-46BC-9E2F-61FF3B58D622', 5, 'score-record-set', 'score-record-set', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B5F47716-E4D8-46BC-9E2F-61FF3B58D622 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B5F47716-E4D8-46BC-9E2F-61FF3B58D622';

/* SQL text to sync 3 entity field value row(s) for entity field ID BAE86173-E1F2-4995-BD2B-1D340FB0568B */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3e157c56-d1a3-4b59-8e3b-9e65407d52a4', 'BAE86173-E1F2-4995-BD2B-1D340FB0568B', 1, 'filter', 'filter', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('453a7db8-886d-48b1-82b1-19c953f18a98', 'BAE86173-E1F2-4995-BD2B-1D340FB0568B', 2, 'record-ids', 'record-ids', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('35978f2e-92ae-4e37-8e83-93d64323384b', 'BAE86173-E1F2-4995-BD2B-1D340FB0568B', 3, 'view', 'view', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BAE86173-E1F2-4995-BD2B-1D340FB0568B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BAE86173-E1F2-4995-BD2B-1D340FB0568B';

/* SQL text to sync 4 entity field value row(s) for entity field ID 3C2599D7-D68E-4AF9-99DC-D1D17BC657AA */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e26a8d9b-a446-438e-8de6-1d253353dffe', '3C2599D7-D68E-4AF9-99DC-D1D17BC657AA', 1, 'completed', 'completed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a1d7510e-e98c-4e84-98e5-ee8ef4380385', '3C2599D7-D68E-4AF9-99DC-D1D17BC657AA', 2, 'failed', 'failed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4c3e09b7-3c6e-417f-be2a-6b010dadefa0', '3C2599D7-D68E-4AF9-99DC-D1D17BC657AA', 3, 'refused', 'refused', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b6e4bb7d-aacf-4017-93bc-3fda7f81084a', '3C2599D7-D68E-4AF9-99DC-D1D17BC657AA', 4, 'running', 'running', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3C2599D7-D68E-4AF9-99DC-D1D17BC657AA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3C2599D7-D68E-4AF9-99DC-D1D17BC657AA';

/* SQL text to sync 3 entity field value row(s) for entity field ID 93E5EE5A-5BC0-4FF5-AF1C-9FB7B3F3A315 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1cc49511-84fb-4843-96b1-8967b5ff0ae4', '93E5EE5A-5BC0-4FF5-AF1C-9FB7B3F3A315', 1, 'month', 'month', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('330028e0-8a7e-42e3-b99d-ce9764880afd', '93E5EE5A-5BC0-4FF5-AF1C-9FB7B3F3A315', 2, 'quarter', 'quarter', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5d9acbda-73cc-4e55-80b6-afe52261ff40', '93E5EE5A-5BC0-4FF5-AF1C-9FB7B3F3A315', 3, 'week', 'week', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 93E5EE5A-5BC0-4FF5-AF1C-9FB7B3F3A315 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='93E5EE5A-5BC0-4FF5-AF1C-9FB7B3F3A315';

/* SQL text to sync 3 entity field value row(s) for entity field ID 0CE60CAF-7083-4AF5-84D0-DBBB78D38424 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b015075a-3d1b-4c96-88a3-c82cbabedcc6', '0CE60CAF-7083-4AF5-84D0-DBBB78D38424', 1, 'evaluated', 'evaluated', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ca3217c7-1d6e-4971-9af1-3850606d771c', '0CE60CAF-7083-4AF5-84D0-DBBB78D38424', 2, 'failed', 'failed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ba0ff0c8-3a4f-4bc7-84bb-7f97611cc139', '0CE60CAF-7083-4AF5-84D0-DBBB78D38424', 3, 'window-open', 'window-open', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0CE60CAF-7083-4AF5-84D0-DBBB78D38424 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0CE60CAF-7083-4AF5-84D0-DBBB78D38424';

/* SQL text to sync 4 entity field value row(s) for entity field ID BD55B357-BD1F-4E05-90EA-9B4BCA0DCB91 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('30d27528-da9e-4f57-9019-c2f77ce9e4c3', 'BD55B357-BD1F-4E05-90EA-9B4BCA0DCB91', 1, 'at-risk-list', 'at-risk-list', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bb50202d-31e3-4bfa-ae84-ddb20a28d354', 'BD55B357-BD1F-4E05-90EA-9B4BCA0DCB91', 2, 'predictions-grid', 'predictions-grid', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0377427a-e6ec-49d8-9f95-755ec3a1ea99', 'BD55B357-BD1F-4E05-90EA-9B4BCA0DCB91', 3, 'record-panel', 'record-panel', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d87b1689-9c25-4d5d-ab34-70181afb499b', 'BD55B357-BD1F-4E05-90EA-9B4BCA0DCB91', 4, 'why-badge', 'why-badge', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BD55B357-BD1F-4E05-90EA-9B4BCA0DCB91 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BD55B357-BD1F-4E05-90EA-9B4BCA0DCB91';

/* SQL text to sync 4 entity field value row(s) for entity field ID F819B7B7-255A-4F17-BA6F-47EFF5AB02F0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1711258b-a6b8-4cbd-a563-b3a46785675d', 'F819B7B7-255A-4F17-BA6F-47EFF5AB02F0', 1, 'adverse-probability-desc', 'adverse-probability-desc', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('67279ba2-02f5-44e6-979c-0c2d1d64d151', 'F819B7B7-255A-4F17-BA6F-47EFF5AB02F0', 2, 'none', 'none', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1d28d5a4-6027-459a-869b-3d7cc92d77b4', 'F819B7B7-255A-4F17-BA6F-47EFF5AB02F0', 3, 'score-asc', 'score-asc', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2fde04dd-e0d7-49a3-ac97-4f97365bb86a', 'F819B7B7-255A-4F17-BA6F-47EFF5AB02F0', 4, 'score-desc', 'score-desc', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F819B7B7-255A-4F17-BA6F-47EFF5AB02F0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F819B7B7-255A-4F17-BA6F-47EFF5AB02F0';

/* SQL text to sync 2 entity field value row(s) for entity field ID EE042840-473E-4A44-BC67-9BE8D4EC809E */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b9099099-8098-494c-bd87-5be4ce5146ac', 'EE042840-473E-4A44-BC67-9BE8D4EC809E', 1, 'adverse-class', 'adverse-class', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ff44cc5d-7096-4176-9004-2a65591c47e3', 'EE042840-473E-4A44-BC67-9BE8D4EC809E', 2, 'raw-contribution', 'raw-contribution', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID EE042840-473E-4A44-BC67-9BE8D4EC809E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='EE042840-473E-4A44-BC67-9BE8D4EC809E';

/* SQL text to sync 5 entity field value row(s) for entity field ID 3319949A-BA87-4466-B69F-A33004277473 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('554d98a1-557b-4861-a6b2-fdbc5ad3c5c4', '3319949A-BA87-4466-B69F-A33004277473', 1, 'hash-mismatch', 'hash-mismatch', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('34c76834-4a8d-4f0c-bb4f-57254363b4ec', '3319949A-BA87-4466-B69F-A33004277473', 2, 'legacy-local', 'legacy-local', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('585acbd3-366c-4f0c-8bc8-2527f8d676f5', '3319949A-BA87-4466-B69F-A33004277473', 3, 'missing', 'missing', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4fd2618d-cf9f-423d-828c-10f05dc2c9de', '3319949A-BA87-4466-B69F-A33004277473', 4, 'unverified', 'unverified', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7224d649-77ad-4c33-bbb9-fc6fec6bcc9d', '3319949A-BA87-4466-B69F-A33004277473', 5, 'verified', 'verified', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3319949A-BA87-4466-B69F-A33004277473 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3319949A-BA87-4466-B69F-A33004277473';

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
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '609825f4-7e18-41bc-b833-fd73ae43da0b' OR ([EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'PredictionUnitID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('609825f4-7e18-41bc-b833-fd73ae43da0b', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'PredictionUnitID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: ML Scoring Runs (One To Many via ScopeEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '87833f51-68f3-4606-a759-5d459cd6e820' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND [RelatedEntityJoinField] = 'ScopeEntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('87833f51-68f3-4606-a759-5d459cd6e820', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'DECD6134-517E-462F-81B2-B25F25ABACEF', 'ScopeEntityID', 'One To Many', 1, 1, 94, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: ML Scoring Runs (One To Many via RequestedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f9347e61-9b9a-46a0-9d60-62c99af7d5b6' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND [RelatedEntityJoinField] = 'RequestedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f9347e61-9b9a-46a0-9d60-62c99af7d5b6', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'DECD6134-517E-462F-81B2-B25F25ABACEF', 'RequestedByUserID', 'One To Many', 1, 1, 130, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: ML Model Publish Records (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c589e7ba-05a9-401a-b1c9-98f2d128ce5a' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND [RelatedEntityJoinField] = 'UserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c589e7ba-05a9-401a-b1c9-98f2d128ce5a', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', 'UserID', 'One To Many', 1, 1, 131, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Snapshots -> MJ: ML Models (One To Many via TrainingSnapshotID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6b629c22-b3e8-4a10-8cb0-05a9d3c13cf1' OR ([EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'TrainingSnapshotID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6b629c22-b3e8-4a10-8cb0-05a9d3c13cf1', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'TrainingSnapshotID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Model Scoring Bindings -> MJ: ML Scoring Runs (One To Many via MLModelScoringBindingID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '10406549-2ad8-4e90-9123-239ba0054070' OR ([EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND [RelatedEntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND [RelatedEntityJoinField] = 'MLModelScoringBindingID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('10406549-2ad8-4e90-9123-239ba0054070', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'DECD6134-517E-462F-81B2-B25F25ABACEF', 'MLModelScoringBindingID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Scheduled Job Runs -> MJ: ML Monitoring Results (One To Many via ScheduledJobRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bd9e2bae-7c90-4353-b747-8a9b11e799ad' OR ([EntityID] = '05853432-5E13-4F2A-8618-77857ADF17FA' AND [RelatedEntityID] = '12871566-23DD-482D-9476-8B0D65B032A1' AND [RelatedEntityJoinField] = 'ScheduledJobRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bd9e2bae-7c90-4353-b747-8a9b11e799ad', '05853432-5E13-4F2A-8618-77857ADF17FA', '12871566-23DD-482D-9476-8B0D65B032A1', 'ScheduledJobRunID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Scheduled Job Runs -> MJ: ML Scoring Runs (One To Many via ScheduledJobRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '47d39844-764a-4abb-9f7e-b229c9275498' OR ([EntityID] = '05853432-5E13-4F2A-8618-77857ADF17FA' AND [RelatedEntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND [RelatedEntityJoinField] = 'ScheduledJobRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('47d39844-764a-4abb-9f7e-b229c9275498', '05853432-5E13-4F2A-8618-77857ADF17FA', 'DECD6134-517E-462F-81B2-B25F25ABACEF', 'ScheduledJobRunID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Evaluation Protocols -> MJ: ML Models (One To Many via EvaluationProtocolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '26031b2e-3e9f-4054-9f83-6a614d8a1995' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'EvaluationProtocolID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('26031b2e-3e9f-4054-9f83-6a614d8a1995', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'EvaluationProtocolID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Monitoring Results (One To Many via ChallengerRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '29e63ae4-8a76-4cc7-8584-e7c7c722ae64' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = '12871566-23DD-482D-9476-8B0D65B032A1' AND [RelatedEntityJoinField] = 'ChallengerRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('29e63ae4-8a76-4cc7-8584-e7c7c722ae64', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', '12871566-23DD-482D-9476-8B0D65B032A1', 'ChallengerRunID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Models (One To Many via TrainingRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f17d6928-f03b-4414-a25d-6e61074366c1' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'TrainingRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f17d6928-f03b-4414-a25d-6e61074366c1', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'TrainingRunID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Model Publish Records (One To Many via TrainingRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c1a5f264-f37a-4d6f-805e-0db3f64ab350' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND [RelatedEntityJoinField] = 'TrainingRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c1a5f264-f37a-4d6f-805e-0db3f64ab350', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', 'TrainingRunID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Models -> MJ: ML Output Bindings (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '735b7070-e055-4a75-8967-7002ddd32e09' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('735b7070-e055-4a75-8967-7002ddd32e09', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '065395F1-91D9-4A30-A89F-89BD6DDCFACD', 'ModelID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Models -> MJ: ML Monitoring Results (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9aa80575-46c7-48c8-b2f6-81bd46d3c9ac' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = '12871566-23DD-482D-9476-8B0D65B032A1' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9aa80575-46c7-48c8-b2f6-81bd46d3c9ac', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '12871566-23DD-482D-9476-8B0D65B032A1', 'ModelID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Scoring Runs (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd69a4642-5aa7-4175-93a7-096db0b2f37a' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d69a4642-5aa7-4175-93a7-096db0b2f37a', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'DECD6134-517E-462F-81B2-B25F25ABACEF', 'ModelID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Model Publish Records (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '243685d7-a2fb-49cd-95de-0544361b9a21' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('243685d7-a2fb-49cd-95de-0544361b9a21', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', 'ModelID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Model Publish Records (One To Many via ReplacesModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0d00354c-adb5-4d24-bd12-3b63afe4c661' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND [RelatedEntityJoinField] = 'ReplacesModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0d00354c-adb5-4d24-bd12-3b63afe4c661', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', 'ReplacesModelID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Process Runs -> MJ: ML Scoring Runs (One To Many via ProcessRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '989537a1-fc5a-4fff-af5d-5531fcccef69' OR ([EntityID] = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND [RelatedEntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND [RelatedEntityJoinField] = 'ProcessRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('989537a1-fc5a-4fff-af5d-5531fcccef69', '9989A9A4-5546-4552-A765-B27EE399BFEA', 'DECD6134-517E-462F-81B2-B25F25ABACEF', 'ProcessRunID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Model Publish Records -> MJ: ML Model Publish Records (One To Many via SignOffID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4ec6f4db-135a-4d83-82e7-6a472292beab' OR ([EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND [RelatedEntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND [RelatedEntityJoinField] = 'SignOffID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4ec6f4db-135a-4d83-82e7-6a472292beab', 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', 'SignOffID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
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
                                    ID = '9CA35A28-9EA4-4308-AE1D-01ABC617BD43';

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
                         SET Description='Unique identifier of the champion feature value record.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='The entity of the record this feature was computed for.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='EntityID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Serialized primary key of the record this feature was computed for.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='RecordID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Name of the computed feature.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='FeatureName';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Origin of the value: Pipeline (computed by Feature Pipeline) or Human.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Source';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Role classification of the feature value (e.g., Champion).', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Role';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Timestamp from which this value is considered active and effective.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='EffectiveAsOf';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Timestamp when the feature value was computed.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ComputedAt';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Optional reference to the ML Model that computed or scored this value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='MLModelID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Identifier of the Record Process or Feature Pipeline that generated the value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='RecordProcessID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed value formatted as text for categorical or textual features.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueText';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed numeric floating-point value for numeric and score features.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueNumeric';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed datetimeoffset value for date and timestamp features.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueDate';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed boolean flag value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueBoolean';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed complex value formatted as a JSON string.', [AutoUpdateDescription] = 0, ExtendedType='JSON'
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueJSON';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Confidence score associated with this computed feature value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Confidence';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9CA35A28-9EA4-4308-AE1D-01ABC617BD43';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity'
WHERE 
   ID = '397F9A39-4AB6-4B53-910B-88C08857F35B';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DE6DCE9B-C554-445E-A851-1016F7C0E9CB';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.FeatureName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6D426438-10A0-4BBB-8373-882F802F2D08';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '033AE2ED-CE1D-4AE6-A259-B7760E07CD91';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '22F8CA06-5B32-403D-9E38-0112A7DDDCDC';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.EffectiveAsOf 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A0A80581-8F2C-4458-8146-A96CE6297DD2';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ComputedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8BCFA9FE-8FB5-4745-BFEE-642C9678B888';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.MLModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5DA1E621-5844-4EDF-844B-27F0A1B8D191';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.RecordProcessID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '902D63B4-C0F2-48FA-AEB4-CE6C24D0DDAF';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueText 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Text)'
WHERE 
   ID = '415BF917-772B-45AA-BB4C-07D90CD6F332';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueNumeric 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Numeric)'
WHERE 
   ID = 'A7B0626C-504F-4785-B6ED-F88199D85770';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Date)'
WHERE 
   ID = '82FC60AC-87CF-4B69-BBFA-60C33EFCE219';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueBoolean 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Boolean)'
WHERE 
   ID = '493616B2-3E64-43C5-BBB7-866F90097FD6';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (JSON)'
WHERE 
   ID = '8A604764-2F98-4092-B239-08BF6C36D061';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Confidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Insights',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BE41006A-78F7-4028-ADE8-E7EF381491DD';

/* Set entity icon to fa-solid fa-star-half-stroke */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa-solid fa-star-half-stroke', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6ffbbf96-457e-5629-87d2-761e7e340241', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', 'FieldCategoryInfo', '{
  "AI Insights": {
    "description": "Machine learning and model inference assessment metadata",
    "icon": "fa-solid fa-brain"
  },
  "Feature Details": {
    "description": "Feature naming and role definitions",
    "icon": "fa-solid fa-list-check"
  },
  "Feature Values": {
    "description": "Multi-type materialized values of the feature",
    "icon": "fa-solid fa-chart-column"
  },
  "Pipeline Provenance": {
    "description": "Process pipelines and models responsible for computing values",
    "icon": "fa-solid fa-diagram-project"
  },
  "Record Context": {
    "description": "Target entity, record context, and temporal provenance",
    "icon": "fa-solid fa-database"
  },
  "System Metadata": {
    "description": "Internal identifiers and system tracking metadata",
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
  "AI Insights": "fa-solid fa-brain",
  "Feature Details": "fa-solid fa-list-check",
  "Feature Values": "fa-solid fa-chart-column",
  "Pipeline Provenance": "fa-solid fa-diagram-project",
  "Record Context": "fa-solid fa-database",
  "System Metadata": "fa-solid fa-gear"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Update entity timestamp for MJ: Latest Feature Values after LLM decoration */
UPDATE [${flyway:defaultSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';

/* Update attributes on "MJ: Conversations" from additionalSchemaInfo */
UPDATE [${flyway:defaultSchema}].[Entity]
                              SET [__mj_UpdatedAt] = GETUTCDATE(), [SubtypeSelector] = '{"Path": "TypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "TypeID.DriverClass", "BaseClass": "ConversationTypeDriver"}}'
                              WHERE [ID] = '13248F34-2837-EF11-86D4-6045BDEE16E6';

/* Update attributes on "MJ: Comments" from additionalSchemaInfo */
UPDATE [${flyway:defaultSchema}].[Entity]
                              SET [__mj_UpdatedAt] = GETUTCDATE(), [SubtypeSelector] = '{"Path": "CommentTypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "CommentTypeID.DriverClass", "BaseClass": "CommentTypeDriver"}, "UIDriver": {"Path": "CommentTypeID.UIDriverClass"}}'
                              WHERE [ID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229';

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

/* SQL text to update entity field related entity name field map for entity field ID 545A16D6-8EDC-4B3B-8349-8F6F2686CD87 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='545A16D6-8EDC-4B3B-8349-8F6F2686CD87', @RelatedEntityNameFieldMap='User';

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

/* SQL text to update entity field related entity name field map for entity field ID 548A3848-DD9E-40AF-B595-92C82E5CFACF */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='548A3848-DD9E-40AF-B595-92C82E5CFACF', @RelatedEntityNameFieldMap='PredictionUnit';

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

/* SQL text to update entity field related entity name field map for entity field ID EF596C07-010B-443E-AEB5-D2B6FEE0D264 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EF596C07-010B-443E-AEB5-D2B6FEE0D264', @RelatedEntityNameFieldMap='ScheduledJobRun';

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

/* SQL text to update entity field related entity name field map for entity field ID 70E4A8E4-174C-4B1D-A1CE-8684EE8B7D91 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='70E4A8E4-174C-4B1D-A1CE-8684EE8B7D91', @RelatedEntityNameFieldMap='MLModelScoringBinding';

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

/* SQL text to update entity field related entity name field map for entity field ID 5081C172-FF24-4563-BEAB-771985123C77 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5081C172-FF24-4563-BEAB-771985123C77', @RelatedEntityNameFieldMap='ScopeEntity';

/* SQL text to update entity field related entity name field map for entity field ID 0E1CE3AA-BDB4-4C9B-83DC-3AE7FCB7FCC3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0E1CE3AA-BDB4-4C9B-83DC-3AE7FCB7FCC3', @RelatedEntityNameFieldMap='EvaluationProtocol';

/* SQL text to update entity field related entity name field map for entity field ID A20FDC66-2F73-425C-A94B-469DCB4A81C6 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A20FDC66-2F73-425C-A94B-469DCB4A81C6', @RelatedEntityNameFieldMap='TrainingSnapshot';

/* SQL text to update entity field related entity name field map for entity field ID C5B13EF4-FF85-4F10-B2D2-9183335ECC64 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C5B13EF4-FF85-4F10-B2D2-9183335ECC64', @RelatedEntityNameFieldMap='RequestedByUser';

/* SQL text to update entity field related entity name field map for entity field ID 13A86B9B-0F44-4529-8C39-CF2453994595 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='13A86B9B-0F44-4529-8C39-CF2453994595', @RelatedEntityNameFieldMap='ScheduledJobRun';

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '75df27a1-6edf-49e5-b361-f6a161885e86' OR (EntityID = '12871566-23DD-482D-9476-8B0D65B032A1' AND Name = 'ScheduledJobRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '75df27a1-6edf-49e5-b361-f6a161885e86',
            '12871566-23DD-482D-9476-8B0D65B032A1', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ec56217-45c2-44d6-9a2c-aac3417ee1cf' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'PredictionUnit')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8ec56217-45c2-44d6-9a2c-aac3417ee1cf',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1438c75a-81b1-462e-a7fc-92c5d54bf3c8' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'EvaluationProtocol')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1438c75a-81b1-462e-a7fc-92c5d54bf3c8',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'baaa72f2-ae65-4178-9e82-951211b42f51' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'baaa72f2-ae65-4178-9e82-951211b42f51',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '29e41f1f-9094-4b80-b9b3-31634df4391d' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'MLModelScoringBinding')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '29e41f1f-9094-4b80-b9b3-31634df4391d',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3da1e3e1-f507-4d23-b00f-7d3f3c1d0d27' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'ScopeEntity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3da1e3e1-f507-4d23-b00f-7d3f3c1d0d27',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2580793a-0eb0-4fe7-a046-559f92023b6d' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'RequestedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2580793a-0eb0-4fe7-a046-559f92023b6d',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a3f640aa-97d2-4cb3-b9b0-b6c439a090e8' OR (EntityID = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND Name = 'ScheduledJobRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a3f640aa-97d2-4cb3-b9b0-b6c439a090e8',
            'DECD6134-517E-462F-81B2-B25F25ABACEF', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08f197d0-a5d9-48c2-a523-f2002ed1d3b5' OR (EntityID = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '08f197d0-a5d9-48c2-a523-f2002ed1d3b5',
            'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5'),
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
               WHERE ID = '0CE60CAF-7083-4AF5-84D0-DBBB78D38424'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '088F8203-3148-4BF0-8A0D-63831A894A83'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2F59D964-A806-42DF-91AC-CEDEBF84B246'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6CB8C911-98CC-464E-88F9-5B88C9E283F4'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '87E4C721-0B3D-4339-A7D5-BDD13402F6FC'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '87E4C721-0B3D-4339-A7D5-BDD13402F6FC'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '065395F1-91D9-4A30-A89F-89BD6DDCFACD'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B5F47716-E4D8-46BC-9E2F-61FF3B58D622'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4F7D3CC9-241A-4D70-8E1F-F04E8561611B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3C2599D7-D68E-4AF9-99DC-D1D17BC657AA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F984897E-C610-4380-B9DE-C61DE388A947'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B9B0CE29-6C88-4880-B88E-F25A81103903'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7C27D12B-D80A-4965-AB07-7EF4575969AB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C45C9668-E978-47A4-95D1-DEEF90C54F86'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7BA82721-1014-4CC0-8F39-D7921EE8B55F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DCE5A2C9-4AB0-450E-B927-2A113646696C'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F434EFB3-E04D-46BD-BCE9-FF34653ED57F';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = 'EAA84387-E334-4A20-82F4-7D6F3E516613';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.TrainingRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Run'
WHERE 
   ID = '3E6099D1-EDDE-40C1-BB87-5D705BB55F53';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Kind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '26F84077-F615-4E10-9285-A23DCA8D9042';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Purpose 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E6A435B5-24E4-4F0F-AEA0-552AA89BA85F';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ApproverKind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval and Actor',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7BA82721-1014-4CC0-8F39-D7921EE8B55F';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval and Actor',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = '545A16D6-8EDC-4B3B-8349-8F6F2686CD87';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Initiator 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval and Actor',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'ECC5A231-D543-4013-B78C-4C3D77977E78';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.RecordedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DCE5A2C9-4AB0-450E-B927-2A113646696C';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Decision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Evaluation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0EEE995E-24E4-433E-B52C-9438E5CE4917';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Reason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Evaluation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3AB1AA4B-FB9E-450A-85E8-0236BDEDF89F';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.GateDecision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'C8B5DF93-8E3F-49EE-BB2C-69D9841D8821';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Evidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'CB59206D-0CA9-4E98-BE54-787FAC7CEF49';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.EvidenceSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Evaluation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evidence SHA256'
WHERE 
   ID = '5387965E-BC4A-47E4-ABB5-755C1C708B4C';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.OverridesFlags 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '96BA0CD7-A5A3-41D0-B073-5BA34B2B1990';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.SignOffID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Sign Off'
WHERE 
   ID = '1097F7AA-E041-4A06-9714-4997635C435A';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ReplacesModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Replaces Model'
WHERE 
   ID = 'EA7B63BB-7B70-4DFE-97BC-241C8F8394D8';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Refusal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '72561A57-61CC-4142-A58A-F308E846231B';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Transient 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C3C9C704-838A-4E6B-A494-16C9EE6E2C45';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '698EEF32-8786-4EDA-B81A-51B6E0CAA52D';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '63492F90-D8B7-4D25-94CA-1D5687958DF4';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval and Actor',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name'
WHERE 
   ID = '08F197D0-A5D9-48C2-A523-F2002ED1D3B5';

/* Set entity icon to fa fa-history */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-history', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b5fcfca4-016d-5a34-b376-fed0accb0ebd', 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', 'FieldCategoryInfo', '{
  "Approval and Actor": {
    "description": "Information regarding who initiated or approved the action.",
    "icon": "fa fa-user-shield"
  },
  "Audit and Evaluation": {
    "description": "Detailed audit trail data, evaluations, decisions, and evidence snapshots.",
    "icon": "fa fa-shield-alt"
  },
  "Publish Details": {
    "description": "Core publish ledger metadata including kind, purpose, and timing.",
    "icon": "fa fa-info-circle"
  },
  "Publish References": {
    "description": "References to models, training runs, sign-offs, and replaced models.",
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
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('deddf128-e280-5cea-8241-4d4f33344809', 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5', 'FieldCategoryIcons', '{
  "Approval and Actor": "fa fa-user-shield",
  "Audit and Evaluation": "fa fa-shield-alt",
  "Publish Details": "fa fa-info-circle",
  "Publish References": "fa fa-link",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'E5E2D347-0C92-4F1C-8E02-E9E57B424FB5';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4BB7CC02-F8B5-45EE-B50F-467FB0E66AB0';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Output Binding Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = '955B6472-46F2-4F58-A162-573C52D2BD96';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.Surface 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Output Binding Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BD55B357-BD1F-4E05-90EA-9B4BCA0DCB91';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.SortsBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Output Binding Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F819B7B7-255A-4F17-BA6F-47EFF5AB02F0';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.DriverDirectionRelativeTo 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Output Binding Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EE042840-473E-4A44-BC67-9BE8D4EC809E';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.Label 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Output Binding Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '87E4C721-0B3D-4339-A7D5-BDD13402F6FC';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3137A604-6CC3-447E-96FA-94A3BA057940';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '56C3E9C7-E8CD-4AE6-8A99-3993760BC96B';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('d52baae2-f311-5d42-ae22-68eacf29dfca', '065395F1-91D9-4A30-A89F-89BD6DDCFACD', 'FieldCategoryInfo', '{
  "Output Binding Configuration": {
    "description": "Configuration settings determining how model outputs are displayed and sorted on surfaces",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed identifiers and audit timestamps",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8e08267c-d12b-5645-a187-241893b99134', '065395F1-91D9-4A30-A89F-89BD6DDCFACD', 'FieldCategoryIcons', '{
  "Output Binding Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '065395F1-91D9-4A30-A89F-89BD6DDCFACD';

/* Set categories for 26 fields */

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6A01CE6C-997E-44D2-A387-ACFE3954F6B3';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = '336D3A67-EE7C-4E6D-A656-2A4C4FC04BA8';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScheduledJobRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EF596C07-010B-443E-AEB5-D2B6FEE0D264';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Period 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '59DF1165-FAE1-475C-A8DF-D426F4133A55';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PeriodGrain 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '93E5EE5A-5BC0-4FF5-AF1C-9FB7B3F3A315';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.State 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0CE60CAF-7083-4AF5-84D0-DBBB78D38424';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScoredRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '088F8203-3148-4BF0-8A0D-63831A894A83';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.JoinedRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2F59D964-A806-42DF-91AC-CEDEBF84B246';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ExcludedInTrainingRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D3193B4B-3917-4A02-A7F3-E03A0CF4FC75';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '5D30FB11-F763-405B-8A28-BCC076752AAD';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6CB8C911-98CC-464E-88F9-5B88C9E283F4';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryLower 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Lower Bound'
WHERE 
   ID = 'E720D1BF-BC35-4E78-8538-190BBA35F20F';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryUpper 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Upper Bound'
WHERE 
   ID = 'D1E9058D-5DA3-48CE-9BAD-02677A155426';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.TrackedMetrics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'E3CC8F36-408F-4EBD-86DC-920629E69924';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Calibration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation & Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '19475A33-37D5-4D27-B9AD-CF2632E638C6';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.DriftLook 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift & Parity Analysis',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'BB4C026B-3248-4B88-9A40-B7C4F76F3005';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.DriftAlarms 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift & Parity Analysis',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'B148CE29-B7EC-42F1-AEB5-B470F8A46E65';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Parity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift & Parity Analysis',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'D83113E3-638A-4630-820C-17A1DBF6EC9D';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.TriggersFired 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers & Automated Checks',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '92DB3E2C-15B6-4F1F-95E1-2A6A1F4900AB';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ChallengerRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers & Automated Checks',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BA756C96-33D0-49E7-A65D-13C0D6E98B50';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ChallengerResult 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers & Automated Checks',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '6CC70889-8B8D-416F-84D6-DB5D280EB097';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.RollbackCheck 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers & Automated Checks',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'B79ED335-218E-4A65-ADF2-7E12B75F977F';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers & Automated Checks',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3BAA43BD-5AE6-4A95-B7C5-1F599866BC21';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '34ABB363-1D45-4188-838A-2E0802E33328';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1D18EB92-5D28-4FA4-8B8D-85F69B78630A';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScheduledJobRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '75DF27A1-6EDF-49E5-B361-F6A161885E86';

/* Set entity icon to fa fa-chart-line */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-chart-line', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '12871566-23DD-482D-9476-8B0D65B032A1';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1dba6a58-a46c-5672-8a3b-7a76efcc9023', '12871566-23DD-482D-9476-8B0D65B032A1', 'FieldCategoryInfo', '{
  "Drift & Parity Analysis": {
    "description": "Input drift statistics, drift alarms, and scoring parity checks",
    "icon": "fa fa-search"
  },
  "Evaluation & Metrics": {
    "description": "Scored row counts, outcome joins, primary scores, and tracked model metrics",
    "icon": "fa fa-chart-bar"
  },
  "Monitoring Context": {
    "description": "Contextual details regarding the model, job run, period, and state of monitoring",
    "icon": "fa fa-clock"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Triggers & Automated Checks": {
    "description": "Fired triggers, challenger model results, rollback checks, and error logs",
    "icon": "fa fa-bolt"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('739b8c2b-0968-5e4a-8910-627f72a98ea0', '12871566-23DD-482D-9476-8B0D65B032A1', 'FieldCategoryIcons', '{
  "Drift & Parity Analysis": "fa fa-search",
  "Evaluation & Metrics": "fa fa-chart-bar",
  "Monitoring Context": "fa fa-clock",
  "System Metadata": "fa fa-cog",
  "Triggers & Automated Checks": "fa fa-bolt"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '12871566-23DD-482D-9476-8B0D65B032A1';

/* Set categories for 33 fields */

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E4DBBCCC-095C-4377-9C07-18B1948AADCC';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = '2611C57C-0436-482E-91B6-4A7429D59637';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ModelVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Execution Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '06713152-56EB-4DC5-98E6-A301899C8995';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.MLModelScoringBindingID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scoring Binding'
WHERE 
   ID = '70E4A8E4-174C-4B1D-A1CE-8684EE8B7D91';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ArtifactSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact SHA-256'
WHERE 
   ID = '0EAC564F-2AA7-4F0A-BEC2-05F1122CD359';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.FeatureSchemaHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Execution Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1782DBD3-5AC8-4715-9FF0-4F3963DFE5E7';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Path 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Execution Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B5F47716-E4D8-46BC-9E2F-61FF3B58D622';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.DryRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Execution Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4F7D3CC9-241A-4D70-8E1F-F04E8561611B';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.MLModelScoringBinding 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Execution Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '29E41F1F-9094-4B80-B9B3-31634DF4391D';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeKind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope and Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BAE86173-E1F2-4995-BD2B-1D340FB0568B';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope and Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scope Entity'
WHERE 
   ID = '5081C172-FF24-4563-BEAB-771985123C77';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Scope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope and Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'BB83999A-3498-48B8-9737-BD71EBE3FC37';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.EntityMapping 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope and Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '145FABDA-17B8-44A9-B482-606EDEEB573D';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.AsOfDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope and Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '165D7253-3FE2-479E-BD1C-F74C3E8B68A2';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ReadPolicy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope and Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'B56856FA-5BF7-463A-A26F-2A3515607EBC';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope and Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scope Entity Name'
WHERE 
   ID = '3DA1E3E1-F507-4D23-B00F-7D3F3C1D0D27';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status and Results',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3C2599D7-D68E-4AF9-99DC-D1D17BC657AA';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Refusal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status and Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '81F6B935-ED99-45FB-8124-C76DF9EBC913';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Total 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Records'
WHERE 
   ID = 'F984897E-C610-4380-B9DE-C61DE388A947';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Written 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Written Records'
WHERE 
   ID = 'B9B0CE29-6C88-4880-B88E-F25A81103903';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Failed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Failed Records'
WHERE 
   ID = '7C27D12B-D80A-4965-AB07-7EF4575969AB';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Skipped 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Skipped Records'
WHERE 
   ID = '30004C6F-7EEE-4CAB-B0A4-C1D592A8F508';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.FirstErrors 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status and Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'B6C849AD-8002-42E9-9EDC-9B95A3B6C93D';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ProcessRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Process Run'
WHERE 
   ID = 'CB34A2F5-DCE2-4450-B3C0-662185DF8F4C';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScheduledJobRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Job Run'
WHERE 
   ID = '13A86B9B-0F44-4529-8C39-CF2453994595';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScheduledJobRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Job Run Details'
WHERE 
   ID = 'A3F640AA-97D2-4CB3-B9B0-B6C439A090E8';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Requestors',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'E563490F-262A-440B-BEF8-7EFB3960BF1A';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Requestors',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested By User'
WHERE 
   ID = 'C5B13EF4-FF85-4F10-B2D2-9183335ECC64';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Requestors',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested By User Details'
WHERE 
   ID = '2580793A-0EB0-4FE7-A046-559F92023B6D';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Requestors',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C45C9668-E978-47A4-95D1-DEEF90C54F86';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Requestors',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EDF8727D-8545-4252-85A4-10F3E53B0824';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1D3951B3-0789-4B79-8D0E-8CF0175F24AF';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EBE90952-887E-420C-B66C-A8601CFE8D5A';

/* Set entity icon to fa fa-chart-line */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-chart-line', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('d2261878-8f35-53cd-aabe-88867090465c', 'DECD6134-517E-462F-81B2-B25F25ABACEF', 'FieldCategoryInfo', '{
  "Execution Status and Results": {
    "description": "Run status metrics, counts, errors, and output results",
    "icon": "fa fa-tachometer-alt"
  },
  "Model and Execution Details": {
    "description": "Information regarding the specific model version, scoring bindings, and execution parameters",
    "icon": "fa fa-sliders-h"
  },
  "Scope and Configuration": {
    "description": "Configuration details, scope definitions, and feature reading policies",
    "icon": "fa fa-database"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Timeline and Requestors": {
    "description": "Start and end times alongside information about who requested the run",
    "icon": "fa fa-clock"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4c9bc78f-eb14-5f23-873a-7a7340b3983d', 'DECD6134-517E-462F-81B2-B25F25ABACEF', 'FieldCategoryIcons', '{
  "Execution Status and Results": "fa fa-tachometer-alt",
  "Model and Execution Details": "fa fa-sliders-h",
  "Scope and Configuration": "fa fa-database",
  "System Metadata": "fa fa-cog",
  "Timeline and Requestors": "fa fa-clock"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'DECD6134-517E-462F-81B2-B25F25ABACEF';

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: ML Models.PredictionUnitID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '548A3848-DD9E-40AF-B595-92C82E5CFACF';

-- UPDATE Entity Field Category Info MJ: ML Models.EvaluationProtocolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0E1CE3AA-BDB4-4C9B-83DC-3AE7FCB7FCC3';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingSnapshotID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A20FDC66-2F73-425C-A94B-469DCB4A81C6';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DD626480-2BAF-4C71-A435-62B257D1DACF';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact SHA256'
WHERE 
   ID = 'CA8C88A6-577F-44FC-8858-20192942D650';

-- UPDATE Entity Field Category Info MJ: ML Models.SnapshotHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0A00C9FE-CD17-47FA-A2E0-FEAA10E908D9';

-- UPDATE Entity Field Category Info MJ: ML Models.CodeVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '2973A999-43C0-4EFB-A506-B05520F505A0';

-- UPDATE Entity Field Category Info MJ: ML Models.FeatureSchemaHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ED5915AE-B68E-4B2A-8FD4-EFF04AF86955';

-- UPDATE Entity Field Category Info MJ: ML Models.OutputSemantics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '32C59860-48A1-493A-809A-45E48927BB36';

-- UPDATE Entity Field Category Info MJ: ML Models.Delivery 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'D5D464D6-9051-4F2B-98F3-B60CB09BCAB6';

-- UPDATE Entity Field Category Info MJ: ML Models.StatusReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1B6B2D10-D331-4435-B9AC-BD9A628FEDDD';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3319949A-BA87-4466-B69F-A33004277473';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactCheckedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DF55AE39-1605-4698-94EF-F29DAE84C1FE';

-- UPDATE Entity Field Category Info MJ: ML Models.ServingWhileUnevaluated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D859FD16-228E-432D-9C3E-5F0B446275E2';

-- UPDATE Entity Field Category Info MJ: ML Models.PredictionUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8EC56217-45C2-44D6-9A2C-AAC3417EE1CF';

-- UPDATE Entity Field Category Info MJ: ML Models.EvaluationProtocol 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1438C75A-81B1-462E-A7FC-92C5D54BF3C8';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingSnapshot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BAAA72F2-AE65-4178-9E82-951211B42F51';
