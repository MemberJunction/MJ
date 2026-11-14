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
 * spCreate/spUpdate/spDelete (spUpdate* in the single-write form, with the __mj_UpdatedAt trigger
 * guarded by IF NOT UPDATE, as V202611121645 made them), permissions and FK indexes.
 * Regenerated at the M4 start's merge of next (origin/next 24c627cc1a), because this migration now
 * runs after V202611121645__v6.3.x__Single_Write_spUpdate_And_Trigger_Guard: CodeGen ran on a
 * database built from scratch by mj migrate with the hand-written section above alone; a second
 * database built from scratch with this section appended emits nothing but the two SubtypeSelector
 * UPDATEs this section already carries (they are next's, OF4-9, kept as the first pass emitted them).
 * Do NOT edit by hand: if the DDL above changes, re-run CodeGen and replace this section.
 * Five hand edits, each marked "HAND EDIT" where it is, must be re-applied after any regeneration: the
 * three EntityUniqueKey inserts for the training schema's existing constraints are guarded by ID or by
 * (EntityID, Name) (D4-72); the MJ: Latest Feature Values EntityID field is inserted with
 * AutoUpdateRelatedEntityInfo = 0 (D4-80); and (5) the seven bounded-text columns of MJ: ML Models that
 * CodeGen may pick as the name field are set to AutoUpdateIsNameField = 0 (D4-110). Two generated blocks are deleted, not edited, whenever CodeGen
 * emits them (no marker): a "Set LLM-identified FKs" block for MJ: Latest Feature Values and an
 * MJ: Entities -> MJ: Latest Feature Values EntityRelationship derived from that FK (a relationship with no
 * FK behind it). The M4 start's regeneration emitted neither. One generated statement is deleted (no marker):
 * the LLM decoration's IsNameField = 1 on MJ: ML Models.TargetVariable. Kept, it gives every foreign key into
 * MLModel a joined name column, so CodeGen re-creates the base views and procedures of MJ: Feature Values,
 * MJ: ML Training Runs, MJ: ML Model Scoring Bindings and this migration's tables on the next run; ML Models
 * keeps no name field, as before this regeneration, and HAND EDIT (5) keeps CodeGen from choosing one.
 * ===================================================================================== */

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
         '7042c55d-02bf-4b68-b504-9d761720139d',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7042c55d-02bf-4b68-b504-9d761720139d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7042c55d-02bf-4b68-b504-9d761720139d' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7042c55d-02bf-4b68-b504-9d761720139d' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7042c55d-02bf-4b68-b504-9d761720139d' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7042c55d-02bf-4b68-b504-9d761720139d' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7042c55d-02bf-4b68-b504-9d761720139d' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7042c55d-02bf-4b68-b504-9d761720139d' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

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
         '4d8b302c-7f68-4b55-9149-f512fb8d89c5',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4d8b302c-7f68-4b55-9149-f512fb8d89c5', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4d8b302c-7f68-4b55-9149-f512fb8d89c5' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4d8b302c-7f68-4b55-9149-f512fb8d89c5' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4d8b302c-7f68-4b55-9149-f512fb8d89c5' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4d8b302c-7f68-4b55-9149-f512fb8d89c5' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4d8b302c-7f68-4b55-9149-f512fb8d89c5' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4d8b302c-7f68-4b55-9149-f512fb8d89c5' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         'bcdc0418-49ac-4c13-adde-85116bbe8acc',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'bcdc0418-49ac-4c13-adde-85116bbe8acc', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bcdc0418-49ac-4c13-adde-85116bbe8acc' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bcdc0418-49ac-4c13-adde-85116bbe8acc' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bcdc0418-49ac-4c13-adde-85116bbe8acc' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bcdc0418-49ac-4c13-adde-85116bbe8acc' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bcdc0418-49ac-4c13-adde-85116bbe8acc' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bcdc0418-49ac-4c13-adde-85116bbe8acc' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         'def7c9ed-9695-4e34-9a3c-a52ca82abf33',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'def7c9ed-9695-4e34-9a3c-a52ca82abf33', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('def7c9ed-9695-4e34-9a3c-a52ca82abf33' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('def7c9ed-9695-4e34-9a3c-a52ca82abf33' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('def7c9ed-9695-4e34-9a3c-a52ca82abf33' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('def7c9ed-9695-4e34-9a3c-a52ca82abf33' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('def7c9ed-9695-4e34-9a3c-a52ca82abf33' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('def7c9ed-9695-4e34-9a3c-a52ca82abf33' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0434a7ba-fca7-44d3-9dda-8b7103ffc5b7' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0434a7ba-fca7-44d3-9dda-8b7103ffc5b7',
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
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '972a7d1e-6e03-46e2-baa6-6788ea6f33f3' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
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
            '972a7d1e-6e03-46e2-baa6-6788ea6f33f3',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c52a0d7f-c0f4-4ccb-a54f-ba9d27f1d702' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'RecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c52a0d7f-c0f4-4ccb-a54f-ba9d27f1d702',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a081059e-d9e7-4537-b70c-c27b25eeb6c8' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'FeatureName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a081059e-d9e7-4537-b70c-c27b25eeb6c8',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8640f635-d5f3-4961-8a0d-dc1f92c1d62a' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Source')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8640f635-d5f3-4961-8a0d-dc1f92c1d62a',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0d54c2f3-3020-4b21-bbe6-e1b1af181ea5' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Role')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0d54c2f3-3020-4b21-bbe6-e1b1af181ea5',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be00305d-d778-49db-895c-da00f6ccd49c' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'EffectiveAsOf')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'be00305d-d778-49db-895c-da00f6ccd49c',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a33c34a9-6383-4327-a74f-c5117707218e' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ComputedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a33c34a9-6383-4327-a74f-c5117707218e',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d1597f1-2b9c-46c0-9e51-41ef541b3997' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'MLModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7d1597f1-2b9c-46c0-9e51-41ef541b3997',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb3ac9a6-0fcf-46a4-8dca-e1d2f90a4ba1' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'RecordProcessID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fb3ac9a6-0fcf-46a4-8dca-e1d2f90a4ba1',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8798649-c096-4f10-8a08-cba83ac103b4' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueText')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd8798649-c096-4f10-8a08-cba83ac103b4',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34f31948-c5a3-4c09-b44b-d3ae340917fc' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueNumeric')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '34f31948-c5a3-4c09-b44b-d3ae340917fc',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e7c6998-6ae8-4e0b-8fda-6bbc05ea955c' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4e7c6998-6ae8-4e0b-8fda-6bbc05ea955c',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b141819-fb8a-4329-84c1-8b7f3a62d70e' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueBoolean')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1b141819-fb8a-4329-84c1-8b7f3a62d70e',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c54d3bab-e664-48b7-a2cb-0074a1c2abb2' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c54d3bab-e664-48b7-a2cb-0074a1c2abb2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc9e0190-fb23-49e1-9fe3-64f584700634' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Confidence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dc9e0190-fb23-49e1-9fe3-64f584700634',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf8c10e6-1cae-4961-ab43-28e08333195e' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cf8c10e6-1cae-4961-ab43-28e08333195e',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '122d4d99-4966-4e76-a71e-e961c65bb4d1' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'ModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '122d4d99-4966-4e76-a71e-e961c65bb4d1',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1cb2e4e4-4e94-4418-8c70-b4549913a395' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'ModelVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1cb2e4e4-4e94-4418-8c70-b4549913a395',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0949a0c-6733-4a74-a0ac-ab5a4de85595' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'MLModelScoringBindingID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f0949a0c-6733-4a74-a0ac-ab5a4de85595',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74869984-f360-43db-9ea6-225fe302fcda' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'ArtifactSha256')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '74869984-f360-43db-9ea6-225fe302fcda',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a669174-7869-4a7e-9da9-1dc466c75a7b' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'FeatureSchemaHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1a669174-7869-4a7e-9da9-1dc466c75a7b',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ddef91ff-8d3c-4d9b-b15c-902ed9023908' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'Path')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ddef91ff-8d3c-4d9b-b15c-902ed9023908',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9fdcaeb5-6dad-4f6c-9708-223622245628' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'ScopeKind')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9fdcaeb5-6dad-4f6c-9708-223622245628',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '501922f3-c5b2-48bb-801b-43be0fe5510d' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'ScopeEntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '501922f3-c5b2-48bb-801b-43be0fe5510d',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0e57d04-6fa3-4359-93be-3cc77e00e5a6' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'Scope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b0e57d04-6fa3-4359-93be-3cc77e00e5a6',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '180a4a34-cf22-4afe-b814-e048ade4bfc9' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'EntityMapping')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '180a4a34-cf22-4afe-b814-e048ade4bfc9',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '061d98fa-0ac3-44dd-b5d7-1fb5729c51b7' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'AsOfDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '061d98fa-0ac3-44dd-b5d7-1fb5729c51b7',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e3057b2-e092-4a5b-9daa-1c3e5a9fd1f1' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'ReadPolicy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6e3057b2-e092-4a5b-9daa-1c3e5a9fd1f1',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f72eef20-9b5b-4ce5-8ac8-7f2b690b7fff' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'DryRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f72eef20-9b5b-4ce5-8ac8-7f2b690b7fff',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd287b7a6-4b2b-4dc5-a980-abe09963cdfe' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'RequestedBy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd287b7a6-4b2b-4dc5-a980-abe09963cdfe',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3f65a10-96bc-489f-bf1b-9e2a70d06b4c' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'RequestedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b3f65a10-96bc-489f-bf1b-9e2a70d06b4c',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '89ce5db2-b446-4b32-a311-fa06ae94cb98' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'ProcessRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '89ce5db2-b446-4b32-a311-fa06ae94cb98',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '174466ae-48f7-4a93-b37a-5125e5677fee' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'ScheduledJobRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '174466ae-48f7-4a93-b37a-5125e5677fee',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '01de1b92-0333-4a3e-b519-461899557f12' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '01de1b92-0333-4a3e-b519-461899557f12',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a53450e-9af2-44ce-a36b-3724f8d3bfe4' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'Refusal')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a53450e-9af2-44ce-a36b-3724f8d3bfe4',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bee75e21-1294-4020-83f3-dc5e178bb917' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'Total')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bee75e21-1294-4020-83f3-dc5e178bb917',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ab65817a-4fea-428b-8ecb-0fad9a7b03c7' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'Written')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ab65817a-4fea-428b-8ecb-0fad9a7b03c7',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0200e73-7e10-47d2-92e9-179f51675b62' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'Failed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a0200e73-7e10-47d2-92e9-179f51675b62',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa66e96d-0b5a-43b3-bc37-3a11e1383278' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'Skipped')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aa66e96d-0b5a-43b3-bc37-3a11e1383278',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '53582c64-ef66-4641-948a-99e655aa0faf' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'FirstErrors')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '53582c64-ef66-4641-948a-99e655aa0faf',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c7f34ebb-7e6d-4621-84ba-056debb92039' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'StartedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c7f34ebb-7e6d-4621-84ba-056debb92039',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e470ef32-7099-4efc-a6b4-ed1a128b9a21' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'EndedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e470ef32-7099-4efc-a6b4-ed1a128b9a21',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa5ff9ff-c0be-42e2-85d2-26263e4b6c32' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aa5ff9ff-c0be-42e2-85d2-26263e4b6c32',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6c1894e-bfa3-49ad-b1c1-97084101c4b9' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f6c1894e-bfa3-49ad-b1c1-97084101c4b9',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2db9c2f7-4871-4cab-97f8-6ee4e15d1f2f' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'PredictionUnitID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2db9c2f7-4871-4cab-97f8-6ee4e15d1f2f',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e2f8483d-bb3a-4f6c-ae90-df7ba136ca9b' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'EvaluationProtocolID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e2f8483d-bb3a-4f6c-ae90-df7ba136ca9b',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca3ba7f7-4bd9-48ec-857a-626327a6f711' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingSnapshotID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca3ba7f7-4bd9-48ec-857a-626327a6f711',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a96363dc-dc3f-4b34-8910-3c272a1c940e' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a96363dc-dc3f-4b34-8910-3c272a1c940e',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e31e57f1-a2ad-4339-8962-114c0e250104' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactSha256')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e31e57f1-a2ad-4339-8962-114c0e250104',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9525fe0c-d668-4794-8b99-c9e8804859d5' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'SnapshotHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9525fe0c-d668-4794-8b99-c9e8804859d5',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a39e349-6c6e-485d-b011-06f6ba5c49d1' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'CodeVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3a39e349-6c6e-485d-b011-06f6ba5c49d1',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '95cc6beb-2469-48e2-9f81-f7e20c8e25a7' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'FeatureSchemaHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '95cc6beb-2469-48e2-9f81-f7e20c8e25a7',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a809848-a03d-45c5-bd00-271526a3a5a0' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'OutputSemantics')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6a809848-a03d-45c5-bd00-271526a3a5a0',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '00bb2b02-5327-445d-86e5-29c3ef46c0ae' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Delivery')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '00bb2b02-5327-445d-86e5-29c3ef46c0ae',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b029d962-b395-4abb-9020-72a885698b13' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'StatusReason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b029d962-b395-4abb-9020-72a885698b13',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c8e8c3d8-bd29-4ede-917f-7a28806a1648' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c8e8c3d8-bd29-4ede-917f-7a28806a1648',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0d90030-da68-42e0-b752-a5a07ebc662e' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactCheckedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f0d90030-da68-42e0-b752-a5a07ebc662e',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '10087a32-d423-4c53-9c10-df421487a2f7' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ServingWhileUnevaluated')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '10087a32-d423-4c53-9c10-df421487a2f7',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ab539b2-b358-4ba8-8527-55dddc13141a' OR (EntityID = '7042C55D-02BF-4B68-B504-9D761720139D' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3ab539b2-b358-4ba8-8527-55dddc13141a',
            '7042C55D-02BF-4B68-B504-9D761720139D', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7042C55D-02BF-4B68-B504-9D761720139D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf25da89-c596-460d-bdea-14dc9f8316aa' OR (EntityID = '7042C55D-02BF-4B68-B504-9D761720139D' AND Name = 'ModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cf25da89-c596-460d-bdea-14dc9f8316aa',
            '7042C55D-02BF-4B68-B504-9D761720139D', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7042C55D-02BF-4B68-B504-9D761720139D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d1ccf12-61bf-4638-8e1a-2403b23f0011' OR (EntityID = '7042C55D-02BF-4B68-B504-9D761720139D' AND Name = 'Surface')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9d1ccf12-61bf-4638-8e1a-2403b23f0011',
            '7042C55D-02BF-4B68-B504-9D761720139D', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7042C55D-02BF-4B68-B504-9D761720139D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e22e6678-4dce-4609-a135-b12f0a45326d' OR (EntityID = '7042C55D-02BF-4B68-B504-9D761720139D' AND Name = 'SortsBy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e22e6678-4dce-4609-a135-b12f0a45326d',
            '7042C55D-02BF-4B68-B504-9D761720139D', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7042C55D-02BF-4B68-B504-9D761720139D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '07a99365-270c-4384-914e-8d782f86ac12' OR (EntityID = '7042C55D-02BF-4B68-B504-9D761720139D' AND Name = 'DriverDirectionRelativeTo')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '07a99365-270c-4384-914e-8d782f86ac12',
            '7042C55D-02BF-4B68-B504-9D761720139D', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7042C55D-02BF-4B68-B504-9D761720139D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b026829-76a5-4668-9fad-dd8558469496' OR (EntityID = '7042C55D-02BF-4B68-B504-9D761720139D' AND Name = 'Label')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1b026829-76a5-4668-9fad-dd8558469496',
            '7042C55D-02BF-4B68-B504-9D761720139D', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7042C55D-02BF-4B68-B504-9D761720139D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed35e770-f54e-4269-b26a-6228435c5245' OR (EntityID = '7042C55D-02BF-4B68-B504-9D761720139D' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ed35e770-f54e-4269-b26a-6228435c5245',
            '7042C55D-02BF-4B68-B504-9D761720139D', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7042C55D-02BF-4B68-B504-9D761720139D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7730bfed-50b5-44d3-9444-fc37713b4d5e' OR (EntityID = '7042C55D-02BF-4B68-B504-9D761720139D' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7730bfed-50b5-44d3-9444-fc37713b4d5e',
            '7042C55D-02BF-4B68-B504-9D761720139D', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7042C55D-02BF-4B68-B504-9D761720139D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad5c64f8-0ae0-46dd-b105-64dd5d08f6c5' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ad5c64f8-0ae0-46dd-b105-64dd5d08f6c5',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51f2d654-1280-4c6e-9efb-6ed9679cb1af' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'ModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '51f2d654-1280-4c6e-9efb-6ed9679cb1af',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '24f65c9c-60f8-4d69-80a0-6cffc8d75a6e' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'ScheduledJobRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '24f65c9c-60f8-4d69-80a0-6cffc8d75a6e',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68b7e3fd-162c-4578-80dc-67be3ac17a86' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'Period')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '68b7e3fd-162c-4578-80dc-67be3ac17a86',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '114ada3d-acfa-402f-9b7d-0fafa8d317c5' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'PeriodGrain')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '114ada3d-acfa-402f-9b7d-0fafa8d317c5',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd69fa5f7-2b59-4572-9fb3-5aea6365b1ed' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'State')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd69fa5f7-2b59-4572-9fb3-5aea6365b1ed',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34b66717-3805-4fa3-b22a-dfa091bab86c' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'ScoredRows')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '34b66717-3805-4fa3-b22a-dfa091bab86c',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5c019679-fe0b-406d-8cd5-cfc05634f9d2' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'JoinedRows')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5c019679-fe0b-406d-8cd5-cfc05634f9d2',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6ee6acf-b5cd-4c83-b6d5-37c6b3321421' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'ExcludedInTrainingRows')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a6ee6acf-b5cd-4c83-b6d5-37c6b3321421',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '05449cd5-e835-4e62-8580-76fc6132d7b5' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'PrimaryScore')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '05449cd5-e835-4e62-8580-76fc6132d7b5',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ddbf402c-e8f0-4b7f-ac8f-93eb3441a947' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'PrimaryValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ddbf402c-e8f0-4b7f-ac8f-93eb3441a947',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '301e02a0-acc2-42c1-acfb-a695da5a9941' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'PrimaryLower')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '301e02a0-acc2-42c1-acfb-a695da5a9941',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '13cb158b-20bc-44d3-8557-42767c72751f' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'PrimaryUpper')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '13cb158b-20bc-44d3-8557-42767c72751f',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '640bc248-da19-413b-b276-6308edbec4cd' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'TrackedMetrics')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '640bc248-da19-413b-b276-6308edbec4cd',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b37b866b-8d2d-4741-83d2-150df9685ec4' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'Calibration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b37b866b-8d2d-4741-83d2-150df9685ec4',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a9e1668-955e-4252-a44e-d873da9183f8' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'DriftLook')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5a9e1668-955e-4252-a44e-d873da9183f8',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68337e48-d990-4f62-a4ae-54f6c66907f8' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'DriftAlarms')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '68337e48-d990-4f62-a4ae-54f6c66907f8',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '433f4488-8682-45db-b5e6-c76d9d9801bd' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'Parity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '433f4488-8682-45db-b5e6-c76d9d9801bd',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9f252191-9f31-4172-8ad6-bc258fc5e375' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'TriggersFired')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9f252191-9f31-4172-8ad6-bc258fc5e375',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '54f45df2-cd51-437a-81d1-1b01a34eb101' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'ChallengerRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '54f45df2-cd51-437a-81d1-1b01a34eb101',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c7c25bb-a218-4da8-9e8c-67d4d84867bd' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'ChallengerResult')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2c7c25bb-a218-4da8-9e8c-67d4d84867bd',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7b48fe04-51b7-4a78-8d57-9dd78897e9d6' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'RollbackCheck')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7b48fe04-51b7-4a78-8d57-9dd78897e9d6',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1308ab88-a378-498f-b929-ff8c9b8aea91' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'ErrorMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1308ab88-a378-498f-b929-ff8c9b8aea91',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70022819-ab5d-450c-9773-5a67871c6a31' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '70022819-ab5d-450c-9773-5a67871c6a31',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '89e3a7a8-74bd-4b36-abd3-a4be0c0429ba' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '89e3a7a8-74bd-4b36-abd3-a4be0c0429ba',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e5d3d94-9d84-4b20-9ce5-f3ba58bf66d4' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0e5d3d94-9d84-4b20-9ce5-f3ba58bf66d4',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e229ab69-fb14-434e-9b3b-2014e51b40c7' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'ModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e229ab69-fb14-434e-9b3b-2014e51b40c7',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e2706f8-2498-4fab-b8f5-c349cdb215c4' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'TrainingRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5e2706f8-2498-4fab-b8f5-c349cdb215c4',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09f085ee-9424-4863-97dc-c5f332ed142a' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'Kind')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '09f085ee-9424-4863-97dc-c5f332ed142a',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a881f7a8-1eb9-4a63-a323-36c122b109d4' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'Purpose')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a881f7a8-1eb9-4a63-a323-36c122b109d4',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8d9d433-15a5-4420-ad9a-22a26bbff041' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'ApproverKind')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd8d9d433-15a5-4420-ad9a-22a26bbff041',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66524100-50ff-4e59-9d1f-a3e2f02a8fe0' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '66524100-50ff-4e59-9d1f-a3e2f02a8fe0',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26f11178-4a8c-4d12-bae0-89034787289e' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'Initiator')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '26f11178-4a8c-4d12-bae0-89034787289e',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4875d852-8870-4b19-bb63-2865fe767221' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'RecordedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4875d852-8870-4b19-bb63-2865fe767221',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d66e797-7855-4ae7-9ca9-ba565970ff4d' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'Decision')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3d66e797-7855-4ae7-9ca9-ba565970ff4d',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bcc98010-4a6a-4a38-822a-b1c21a40ba2f' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'Reason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bcc98010-4a6a-4a38-822a-b1c21a40ba2f',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c6ab6a17-1c5a-4ec7-a358-40dff247700f' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'GateDecision')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c6ab6a17-1c5a-4ec7-a358-40dff247700f',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74ca8896-7dec-4f42-a2ee-4c9bdc87a222' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'Evidence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '74ca8896-7dec-4f42-a2ee-4c9bdc87a222',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d7c841d-9318-402e-9dc0-243c70da0dcb' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'EvidenceSha256')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3d7c841d-9318-402e-9dc0-243c70da0dcb',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6304309-0143-4867-9840-803c186f3a3c' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'OverridesFlags')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a6304309-0143-4867-9840-803c186f3a3c',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fbb7fa13-37a1-4e01-b303-a72d74494b9b' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'SignOffID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fbb7fa13-37a1-4e01-b303-a72d74494b9b',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5acf602e-fc83-45dc-aa7d-82ecee98e204' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'ReplacesModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5acf602e-fc83-45dc-aa7d-82ecee98e204',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a86e6fd-48eb-4934-8640-5e87c8238d50' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'Refusal')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7a86e6fd-48eb-4934-8640-5e87c8238d50',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5142a74-009b-41ba-ae56-ab1c0e400413' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'Transient')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd5142a74-009b-41ba-ae56-ab1c0e400413',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ede4bc8-2806-409d-afaf-321b1cb386ad' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3ede4bc8-2806-409d-afaf-321b1cb386ad',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fbf65f04-4e55-447d-b0ae-f77f60ecd8e2' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fbf65f04-4e55-447d-b0ae-f77f60ecd8e2',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.TargetVariable the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel (D4-110)
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'TargetVariable' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.ProblemType the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel (D4-110)
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'ProblemType' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.Status the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel (D4-110)
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'Status' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.ArtifactSha256 the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel (D4-110)
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'ArtifactSha256' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.SnapshotHash the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel (D4-110)
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'SnapshotHash' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.FeatureSchemaHash the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel (D4-110)
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'FeatureSchemaHash' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.ArtifactStatus the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel (D4-110)
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'ArtifactStatus' AND [IsNameField] = 0;

/* SQL text to sync entity unique keys (9 added, 0 updated, 0 removed) */
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('048a01cf-a26d-49f5-aa86-82cfa1ff1ad0', '4D8B302C-7F68-4B55-9149-F512FB8D89C5', 'UX_MLModelPublishRecord_OnePublishPerRun', 'TrainingRunID', '([Kind]=''publish'' AND ([Purpose] IN (''publish'', ''adopt'')) AND [TrainingRunID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('fc99c4b0-3525-4c52-a1ad-c33bd6777fc6', '4D8B302C-7F68-4B55-9149-F512FB8D89C5', 'UX_MLModelPublishRecord_OneRunOutcome', 'TrainingRunID', '([Purpose]=''evaluate'' AND [TrainingRunID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0a60b704-ee88-4757-8b78-285adb53a445', '7042C55D-02BF-4B68-B504-9D761720139D', 'UQ_MLOutputBinding_ModelSurface', 'ModelID,Surface', NULL);
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = '1f23ed6a-90a2-424b-9d4f-3cf6adc275f5' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [Name] = 'UQ_MLEvaluationProtocol_Lineage_Version'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1f23ed6a-90a2-424b-9d4f-3cf6adc275f5', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'UQ_MLEvaluationProtocol_Lineage_Version', 'LineageRootID,Version', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('ec40e867-0025-4900-9d34-cc74b9f0d556', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'UX_MLModel_OneServingUnevaluatedPerPipeline', 'PipelineID', '([ServingWhileUnevaluated]=(1))');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('e7787432-5298-41e2-a2d4-fbc810d492ff', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'UX_MLModel_PipelineVersion', 'PipelineID,Version', NULL);
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = '91b14930-d7eb-4bb5-89e0-3778097909d4' OR ([EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [Name] = 'UQ_MLPredictionUnit_Lineage_Version'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('91b14930-d7eb-4bb5-89e0-3778097909d4', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'UQ_MLPredictionUnit_Lineage_Version', 'LineageRootID,Version', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('4c3ff281-285d-45ff-8eec-07e191c9c807', 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', 'UQ_MLMonitoringResult_ModelPeriod', 'ModelID,PeriodGrain,Period', NULL);
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = 'dc08f1f7-108c-4f65-a48d-76d4b3c8d648' OR ([EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [Name] = 'UQ_MLTrainingSnapshot_ContentHash'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('dc08f1f7-108c-4f65-a48d-76d4b3c8d648', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'UQ_MLTrainingSnapshot_ContentHash', 'ContentHash', NULL);

/* SQL text to sync 3 entity field value row(s) for entity field ID 114ADA3D-ACFA-402F-9B7D-0FAFA8D317C5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ec370692-a600-480b-9caf-353ec30b6d4e', '114ADA3D-ACFA-402F-9B7D-0FAFA8D317C5', 1, 'month', 'month', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a6de0c04-8623-474c-b068-5eb3f6f1a6a6', '114ADA3D-ACFA-402F-9B7D-0FAFA8D317C5', 2, 'quarter', 'quarter', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('90780e93-db54-4bfb-b7fb-6dab98005a35', '114ADA3D-ACFA-402F-9B7D-0FAFA8D317C5', 3, 'week', 'week', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 114ADA3D-ACFA-402F-9B7D-0FAFA8D317C5 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='114ADA3D-ACFA-402F-9B7D-0FAFA8D317C5';

/* SQL text to sync 3 entity field value row(s) for entity field ID D69FA5F7-2B59-4572-9FB3-5AEA6365B1ED */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b51ff521-c0f4-45f1-a974-e9fc53b250cc', 'D69FA5F7-2B59-4572-9FB3-5AEA6365B1ED', 1, 'evaluated', 'evaluated', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('998880ee-35f9-4d87-9f4f-5affff21c462', 'D69FA5F7-2B59-4572-9FB3-5AEA6365B1ED', 2, 'failed', 'failed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('10af5e8b-7931-41cc-ab78-47aead3053f8', 'D69FA5F7-2B59-4572-9FB3-5AEA6365B1ED', 3, 'window-open', 'window-open', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D69FA5F7-2B59-4572-9FB3-5AEA6365B1ED */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D69FA5F7-2B59-4572-9FB3-5AEA6365B1ED';

/* SQL text to sync 4 entity field value row(s) for entity field ID 9D1CCF12-61BF-4638-8E1A-2403B23F0011 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2c684e95-095a-4ad1-a935-2177b68d35bc', '9D1CCF12-61BF-4638-8E1A-2403B23F0011', 1, 'at-risk-list', 'at-risk-list', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('710d45c4-3ed6-421d-99c0-816668eb2a27', '9D1CCF12-61BF-4638-8E1A-2403B23F0011', 2, 'predictions-grid', 'predictions-grid', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c4a7a065-c297-4675-999a-266364ec4cb4', '9D1CCF12-61BF-4638-8E1A-2403B23F0011', 3, 'record-panel', 'record-panel', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eb9cb365-cf3f-4d10-9d48-50695ff416e6', '9D1CCF12-61BF-4638-8E1A-2403B23F0011', 4, 'why-badge', 'why-badge', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 9D1CCF12-61BF-4638-8E1A-2403B23F0011 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='9D1CCF12-61BF-4638-8E1A-2403B23F0011';

/* SQL text to sync 4 entity field value row(s) for entity field ID E22E6678-4DCE-4609-A135-B12F0A45326D */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3e588997-a6ab-450c-9cbe-94adbc03f406', 'E22E6678-4DCE-4609-A135-B12F0A45326D', 1, 'adverse-probability-desc', 'adverse-probability-desc', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f1ac205c-e77e-4699-8a96-866672b75728', 'E22E6678-4DCE-4609-A135-B12F0A45326D', 2, 'none', 'none', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('aa11d069-5576-4b0e-ac67-09303ff190ed', 'E22E6678-4DCE-4609-A135-B12F0A45326D', 3, 'score-asc', 'score-asc', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('53451038-edcf-4cf7-8271-d70c3f8d6474', 'E22E6678-4DCE-4609-A135-B12F0A45326D', 4, 'score-desc', 'score-desc', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E22E6678-4DCE-4609-A135-B12F0A45326D */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E22E6678-4DCE-4609-A135-B12F0A45326D';

/* SQL text to sync 2 entity field value row(s) for entity field ID 07A99365-270C-4384-914E-8D782F86AC12 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('91cb0f28-8ed1-4857-8840-46435ee27829', '07A99365-270C-4384-914E-8D782F86AC12', 1, 'adverse-class', 'adverse-class', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5bb03f81-4a07-45e8-a4b7-0f458846ab86', '07A99365-270C-4384-914E-8D782F86AC12', 2, 'raw-contribution', 'raw-contribution', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 07A99365-270C-4384-914E-8D782F86AC12 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='07A99365-270C-4384-914E-8D782F86AC12';

/* SQL text to sync 5 entity field value row(s) for entity field ID C8E8C3D8-BD29-4EDE-917F-7A28806A1648 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4757ca3b-5970-4051-be05-569795217dab', 'C8E8C3D8-BD29-4EDE-917F-7A28806A1648', 1, 'hash-mismatch', 'hash-mismatch', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('92c7fdd4-a6ed-49bf-91e2-42b0c9da3759', 'C8E8C3D8-BD29-4EDE-917F-7A28806A1648', 2, 'legacy-local', 'legacy-local', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5627d662-2aa2-48b7-b363-1af237409f5e', 'C8E8C3D8-BD29-4EDE-917F-7A28806A1648', 3, 'missing', 'missing', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9a27279a-582e-4b21-b485-84c7a643af6a', 'C8E8C3D8-BD29-4EDE-917F-7A28806A1648', 4, 'unverified', 'unverified', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ec61fb2b-35bb-4f27-b88c-04a85e38a801', 'C8E8C3D8-BD29-4EDE-917F-7A28806A1648', 5, 'verified', 'verified', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C8E8C3D8-BD29-4EDE-917F-7A28806A1648 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C8E8C3D8-BD29-4EDE-917F-7A28806A1648';

/* SQL text to sync 4 entity field value row(s) for entity field ID 8B0C0799-D66A-48BA-987D-C32D477E2A28 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b1c4f50c-29ff-461d-8066-49c1b1cb1a6c', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 3, 'KeepBaseline', 'KeepBaseline', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6c4bdda8-a837-4490-931f-caf7e4d804d9', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 5, 'Unevaluated', 'Unevaluated', 'Check', GETUTCDATE(), GETUTCDATE());
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='C2CE99CA-0E5D-4227-B71D-55A34C1B1F84';
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='5F645BCA-78A6-4F2F-B01D-1AE7ED48BFC8';

/* SQL text to sync 3 entity field value row(s) for entity field ID 09F085EE-9424-4863-97DC-C5F332ED142A */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0e9d8425-462a-4e72-af84-2953b4f152cb', '09F085EE-9424-4863-97DC-C5F332ED142A', 1, 'publish', 'publish', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('47e31b17-aa5f-4db9-bb64-faddf396cae7', '09F085EE-9424-4863-97DC-C5F332ED142A', 2, 'refusal', 'refusal', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d1dcd487-2d2b-4b54-b53a-3363c12b5288', '09F085EE-9424-4863-97DC-C5F332ED142A', 3, 'sign-off', 'sign-off', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 09F085EE-9424-4863-97DC-C5F332ED142A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='09F085EE-9424-4863-97DC-C5F332ED142A';

/* SQL text to sync 4 entity field value row(s) for entity field ID A881F7A8-1EB9-4A63-A323-36C122B109D4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e0e87ce9-fb00-4855-9c76-4f4531ed7ab6', 'A881F7A8-1EB9-4A63-A323-36C122B109D4', 1, 'adopt', 'adopt', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2abd0cd7-4db9-4811-87ea-b398dbca636b', 'A881F7A8-1EB9-4A63-A323-36C122B109D4', 2, 'evaluate', 'evaluate', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('51106bf0-2638-4c01-beac-11d011890f89', 'A881F7A8-1EB9-4A63-A323-36C122B109D4', 3, 'publish', 'publish', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9852ca8d-7d4d-4036-97c4-4748849ae209', 'A881F7A8-1EB9-4A63-A323-36C122B109D4', 4, 'rollback', 'rollback', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A881F7A8-1EB9-4A63-A323-36C122B109D4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A881F7A8-1EB9-4A63-A323-36C122B109D4';

/* SQL text to sync 5 entity field value row(s) for entity field ID DDEF91FF-8D3C-4D9B-B15C-902ED9023908 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('72d19dd1-c9b7-4e95-ab67-8059f8375ed8', 'DDEF91FF-8D3C-4D9B-B15C-902ED9023908', 1, 'monitoring', 'monitoring', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6aa125cc-352f-406d-8d36-aed8467f719f', 'DDEF91FF-8D3C-4D9B-B15C-902ED9023908', 2, 'parity', 'parity', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ffd895c4-f9fe-4370-a8f5-971b1f45ad92', 'DDEF91FF-8D3C-4D9B-B15C-902ED9023908', 3, 'predict', 'predict', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('026152d8-efaa-488e-a79f-1544568ac856', 'DDEF91FF-8D3C-4D9B-B15C-902ED9023908', 4, 'record-process', 'record-process', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('91d84799-668a-4a9e-9f55-dbf987551a78', 'DDEF91FF-8D3C-4D9B-B15C-902ED9023908', 5, 'score-record-set', 'score-record-set', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID DDEF91FF-8D3C-4D9B-B15C-902ED9023908 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='DDEF91FF-8D3C-4D9B-B15C-902ED9023908';

/* SQL text to sync 3 entity field value row(s) for entity field ID 9FDCAEB5-6DAD-4F6C-9708-223622245628 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('36bab8e8-71b9-4c87-b84f-f9a68c3effba', '9FDCAEB5-6DAD-4F6C-9708-223622245628', 1, 'filter', 'filter', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('08df2a84-59b0-4d00-9c6f-ce842c97d0df', '9FDCAEB5-6DAD-4F6C-9708-223622245628', 2, 'record-ids', 'record-ids', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('218da8b6-86f0-417f-bb03-55c169952b7a', '9FDCAEB5-6DAD-4F6C-9708-223622245628', 3, 'view', 'view', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 9FDCAEB5-6DAD-4F6C-9708-223622245628 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='9FDCAEB5-6DAD-4F6C-9708-223622245628';

/* SQL text to sync 4 entity field value row(s) for entity field ID 01DE1B92-0333-4A3E-B519-461899557F12 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d48da1aa-82fe-4c2b-98b5-8cdb32904227', '01DE1B92-0333-4A3E-B519-461899557F12', 1, 'completed', 'completed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('823f7505-2b11-4982-a5dd-9a427a9fde97', '01DE1B92-0333-4A3E-B519-461899557F12', 2, 'failed', 'failed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('58496aeb-9c2a-4441-bb3f-c8cd057c6164', '01DE1B92-0333-4A3E-B519-461899557F12', 3, 'refused', 'refused', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('779fb884-ffaa-4bc5-a02a-674afa4e3457', '01DE1B92-0333-4A3E-B519-461899557F12', 4, 'running', 'running', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 01DE1B92-0333-4A3E-B519-461899557F12 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='01DE1B92-0333-4A3E-B519-461899557F12';

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
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0ffab396-3afc-450e-8452-76e7c27797ec' OR ([EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'PredictionUnitID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0ffab396-3afc-450e-8452-76e7c27797ec', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'PredictionUnitID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: ML Scoring Runs (One To Many via ScopeEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '17957691-20c3-4a0f-b279-036349516edc' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND [RelatedEntityJoinField] = 'ScopeEntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('17957691-20c3-4a0f-b279-036349516edc', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', 'ScopeEntityID', 'One To Many', 1, 1, 95, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: ML Scoring Runs (One To Many via RequestedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '054b51b1-1eb3-4432-b11e-9ccfbf8cf138' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND [RelatedEntityJoinField] = 'RequestedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('054b51b1-1eb3-4432-b11e-9ccfbf8cf138', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', 'RequestedByUserID', 'One To Many', 1, 1, 131, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: ML Model Publish Records (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c1c0a03a-b8fc-46d3-8c1c-145b37e6e6d1' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND [RelatedEntityJoinField] = 'UserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c1c0a03a-b8fc-46d3-8c1c-145b37e6e6d1', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '4D8B302C-7F68-4B55-9149-F512FB8D89C5', 'UserID', 'One To Many', 1, 1, 132, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Snapshots -> MJ: ML Models (One To Many via TrainingSnapshotID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '63689fc3-04c4-4f36-a7fe-68e7dff8cf14' OR ([EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'TrainingSnapshotID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('63689fc3-04c4-4f36-a7fe-68e7dff8cf14', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'TrainingSnapshotID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Model Scoring Bindings -> MJ: ML Scoring Runs (One To Many via MLModelScoringBindingID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '960862a0-57bc-4b87-9578-b1e0d325c37e' OR ([EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND [RelatedEntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND [RelatedEntityJoinField] = 'MLModelScoringBindingID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('960862a0-57bc-4b87-9578-b1e0d325c37e', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', 'MLModelScoringBindingID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Scheduled Job Runs -> MJ: ML Scoring Runs (One To Many via ScheduledJobRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f3d04c29-cc27-4ae5-b9c4-e13e196d3f54' OR ([EntityID] = '05853432-5E13-4F2A-8618-77857ADF17FA' AND [RelatedEntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND [RelatedEntityJoinField] = 'ScheduledJobRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f3d04c29-cc27-4ae5-b9c4-e13e196d3f54', '05853432-5E13-4F2A-8618-77857ADF17FA', 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', 'ScheduledJobRunID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Scheduled Job Runs -> MJ: ML Monitoring Results (One To Many via ScheduledJobRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '86f0fca3-6677-4ef5-aff3-0fd2bd55a4d9' OR ([EntityID] = '05853432-5E13-4F2A-8618-77857ADF17FA' AND [RelatedEntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND [RelatedEntityJoinField] = 'ScheduledJobRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('86f0fca3-6677-4ef5-aff3-0fd2bd55a4d9', '05853432-5E13-4F2A-8618-77857ADF17FA', 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', 'ScheduledJobRunID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Evaluation Protocols -> MJ: ML Models (One To Many via EvaluationProtocolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2fde58ac-8a90-4e80-872c-e9148580c081' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'EvaluationProtocolID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2fde58ac-8a90-4e80-872c-e9148580c081', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'EvaluationProtocolID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Models (One To Many via TrainingRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7c354345-160a-4b4b-af85-c816e4b9a351' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'TrainingRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7c354345-160a-4b4b-af85-c816e4b9a351', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'TrainingRunID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Monitoring Results (One To Many via ChallengerRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '78d3efe4-a3dc-40c4-9ad1-5ceaa7554dc4' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND [RelatedEntityJoinField] = 'ChallengerRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('78d3efe4-a3dc-40c4-9ad1-5ceaa7554dc4', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', 'ChallengerRunID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Model Publish Records (One To Many via TrainingRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ab38c165-d718-4789-8a04-a0c3315d6596' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND [RelatedEntityJoinField] = 'TrainingRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ab38c165-d718-4789-8a04-a0c3315d6596', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', '4D8B302C-7F68-4B55-9149-F512FB8D89C5', 'TrainingRunID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Models -> MJ: ML Scoring Runs (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8d3b374a-ece6-426a-92fb-b0cfc399551f' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8d3b374a-ece6-426a-92fb-b0cfc399551f', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', 'ModelID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Output Bindings (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1a61e1f3-ba5d-4420-82c1-6e99ecfb6bdd' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = '7042C55D-02BF-4B68-B504-9D761720139D' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1a61e1f3-ba5d-4420-82c1-6e99ecfb6bdd', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '7042C55D-02BF-4B68-B504-9D761720139D', 'ModelID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Monitoring Results (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9109ef32-d108-4f1b-983d-c97e7c79af65' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9109ef32-d108-4f1b-983d-c97e7c79af65', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', 'ModelID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Models -> MJ: ML Model Publish Records (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '95234976-14db-4f51-ae1f-45062b29c525' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('95234976-14db-4f51-ae1f-45062b29c525', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '4D8B302C-7F68-4B55-9149-F512FB8D89C5', 'ModelID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Model Publish Records (One To Many via ReplacesModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b929aea6-ea1a-4273-8c80-583bba717248' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND [RelatedEntityJoinField] = 'ReplacesModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b929aea6-ea1a-4273-8c80-583bba717248', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '4D8B302C-7F68-4B55-9149-F512FB8D89C5', 'ReplacesModelID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Process Runs -> MJ: ML Scoring Runs (One To Many via ProcessRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1b130a84-9771-47df-bcb4-9aea3add39ca' OR ([EntityID] = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND [RelatedEntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND [RelatedEntityJoinField] = 'ProcessRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1b130a84-9771-47df-bcb4-9aea3add39ca', '9989A9A4-5546-4552-A765-B27EE399BFEA', 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', 'ProcessRunID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Model Publish Records -> MJ: ML Model Publish Records (One To Many via SignOffID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4c53401f-29a7-45c0-870c-08c9cdb61637' OR ([EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND [RelatedEntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND [RelatedEntityJoinField] = 'SignOffID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4c53401f-29a7-45c0-870c-08c9cdb61637', '4D8B302C-7F68-4B55-9149-F512FB8D89C5', '4D8B302C-7F68-4B55-9149-F512FB8D89C5', 'SignOffID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
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
                                    ID = '0434A7BA-FCA7-44D3-9DDA-8B7103FFC5B7';

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
                         SET Description='Unique identifier for the underlying champion feature value record.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Identifier of the entity that this feature value belongs to.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='EntityID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Serialized primary key of the target record this feature was computed for.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='RecordID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Name of the feature.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='FeatureName';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Origin of the feature value (e.g., Pipeline or Human).', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Source';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Role of the feature value (e.g., Champion).', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Role';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Timestamp indicating the point in time from which this feature value is considered effective.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='EffectiveAsOf';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Timestamp when the feature value was computed.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ComputedAt';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Reference identifier of the ML model that produced this feature score, if applicable.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='MLModelID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Reference identifier of the Record Process (Feature Pipeline) that generated this value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='RecordProcessID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed value represented as text or categorical string.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueText';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed value represented as a numeric floating-point number.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueNumeric';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed value represented as a date/time timestamp.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueDate';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed value represented as a boolean flag.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueBoolean';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed value represented as a JSON document or structure.', [AutoUpdateDescription] = 0, ExtendedType='JSON'
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueJSON';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Confidence score associated with this computed value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Confidence';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0434A7BA-FCA7-44D3-9DDA-8B7103FFC5B7';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '972A7D1E-6E03-46E2-BAA6-6788EA6F33F3';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C52A0D7F-C0F4-4CCB-A54F-BA9D27F1D702';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.FeatureName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A081059E-D9E7-4537-B70C-C27B25EEB6C8';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8640F635-D5F3-4961-8A0D-DC1F92C1D62A';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0D54C2F3-3020-4B21-BBE6-E1B1AF181EA5';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.EffectiveAsOf 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BE00305D-D778-49DB-895C-DA00F6CCD49C';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ComputedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A33C34A9-6383-4327-A74F-C5117707218E';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.MLModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7D1597F1-2B9C-46C0-9E51-41EF541B3997';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.RecordProcessID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FB3AC9A6-0FCF-46A4-8DCA-E1D2F90A4BA1';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueText 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Text)'
WHERE 
   ID = 'D8798649-C096-4F10-8A08-CBA83AC103B4';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueNumeric 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Numeric)'
WHERE 
   ID = '34F31948-C5A3-4C09-B44B-D3AE340917FC';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Date)'
WHERE 
   ID = '4E7C6998-6AE8-4E0B-8FDA-6BBC05EA955C';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueBoolean 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Boolean)'
WHERE 
   ID = '1B141819-FB8A-4329-84C1-8B7F3A62D70E';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (JSON)'
WHERE 
   ID = 'C54D3BAB-E664-48B7-A2CB-0074A1C2ABB2';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Confidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Insights',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DC9E0190-FB23-49E1-9FE3-64F584700634';

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
    "description": "Scores, confidence, and telemetry produced by AI computation.",
    "icon": "fa-solid fa-brain"
  },
  "Feature Details": {
    "description": "Attributes detailing the specific feature definition and identity.",
    "icon": "fa-solid fa-cube"
  },
  "Feature Values": {
    "description": "The computed feature payload across various data formats.",
    "icon": "fa-solid fa-list-check"
  },
  "Pipeline Provenance": {
    "description": "Lineage tracing the model or process responsible for calculating the value.",
    "icon": "fa-solid fa-diagram-project"
  },
  "Record Context": {
    "description": "Information identifying the target entity, record, role, and temporal context.",
    "icon": "fa-solid fa-database"
  },
  "System Metadata": {
    "description": "Unique identifiers and internal system tracking properties.",
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
  "Feature Details": "fa-solid fa-cube",
  "Feature Values": "fa-solid fa-list-check",
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

/* SQL text to update entity field related entity name field map for entity field ID 66524100-50FF-4E59-9D1F-A3E2F02A8FE0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='66524100-50FF-4E59-9D1F-A3E2F02A8FE0', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 2DB9C2F7-4871-4CAB-97F8-6EE4E15D1F2F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2DB9C2F7-4871-4CAB-97F8-6EE4E15D1F2F', @RelatedEntityNameFieldMap='PredictionUnit';

/* SQL text to update entity field related entity name field map for entity field ID 24F65C9C-60F8-4D69-80A0-6CFFC8D75A6E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='24F65C9C-60F8-4D69-80A0-6CFFC8D75A6E', @RelatedEntityNameFieldMap='ScheduledJobRun';

/* SQL text to update entity field related entity name field map for entity field ID F0949A0C-6733-4A74-A0AC-AB5A4DE85595 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F0949A0C-6733-4A74-A0AC-AB5A4DE85595', @RelatedEntityNameFieldMap='MLModelScoringBinding';

/* SQL text to update entity field related entity name field map for entity field ID E2F8483D-BB3A-4F6C-AE90-DF7BA136CA9B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E2F8483D-BB3A-4F6C-AE90-DF7BA136CA9B', @RelatedEntityNameFieldMap='EvaluationProtocol';

/* SQL text to update entity field related entity name field map for entity field ID 501922F3-C5B2-48BB-801B-43BE0FE5510D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='501922F3-C5B2-48BB-801B-43BE0FE5510D', @RelatedEntityNameFieldMap='ScopeEntity';

/* SQL text to update entity field related entity name field map for entity field ID B3F65A10-96BC-489F-BF1B-9E2A70D06B4C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B3F65A10-96BC-489F-BF1B-9E2A70D06B4C', @RelatedEntityNameFieldMap='RequestedByUser';

/* SQL text to update entity field related entity name field map for entity field ID CA3BA7F7-4BD9-48EC-857A-626327A6F711 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CA3BA7F7-4BD9-48EC-857A-626327A6F711', @RelatedEntityNameFieldMap='TrainingSnapshot';

/* SQL text to update entity field related entity name field map for entity field ID 174466AE-48F7-4A93-B37A-5125E5677FEE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='174466AE-48F7-4A93-B37A-5125E5677FEE', @RelatedEntityNameFieldMap='ScheduledJobRun';

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

/* SQL text to insert 9 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2df23c1-ac08-432b-8434-f8cf2c22eb48' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'MLModelScoringBinding')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f2df23c1-ac08-432b-8434-f8cf2c22eb48',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3793ed5d-7ea3-4bc4-8263-b981ea4df91d' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'ScopeEntity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3793ed5d-7ea3-4bc4-8263-b981ea4df91d',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1321f22c-e4d3-45a8-9450-f4f0f88b9cb8' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'RequestedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1321f22c-e4d3-45a8-9450-f4f0f88b9cb8',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c95cf3f-61ab-41a4-b32e-527f28b8e927' OR (EntityID = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND Name = 'ScheduledJobRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2c95cf3f-61ab-41a4-b32e-527f28b8e927',
            'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa990c48-bcc3-43a1-be83-eba239d8e4a3' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'PredictionUnit')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fa990c48-bcc3-43a1-be83-eba239d8e4a3',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aaa53018-e665-4d30-93fe-e7953960e435' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'EvaluationProtocol')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aaa53018-e665-4d30-93fe-e7953960e435',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ad99cdd-04c9-40b0-b773-e135a1d46f45' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9ad99cdd-04c9-40b0-b773-e135a1d46f45',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '348d4443-8ff4-4b64-bd1a-5e3ff907179e' OR (EntityID = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND Name = 'ScheduledJobRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '348d4443-8ff4-4b64-bd1a-5e3ff907179e',
            'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3e0f4279-dac5-43f4-97a5-cbbc26745430' OR (EntityID = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3e0f4279-dac5-43f4-97a5-cbbc26745430',
            '4D8B302C-7F68-4B55-9149-F512FB8D89C5', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5'),
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
               WHERE ID = 'DDEF91FF-8D3C-4D9B-B15C-902ED9023908'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '01DE1B92-0333-4A3E-B519-461899557F12'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BEE75E21-1294-4020-83F3-DC5E178BB917'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C7F34EBB-7E6D-4621-84BA-056DEBB92039'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D69FA5F7-2B59-4572-9FB3-5AEA6365B1ED'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '34B66717-3805-4FA3-B22A-DFA091BAB86C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5C019679-FE0B-406D-8CD5-CFC05634F9D2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DDBF402C-E8F0-4B7F-AC8F-93EB3441A947'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '1B026829-76A5-4668-9FAD-DD8558469496'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1B026829-76A5-4668-9FAD-DD8558469496'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '7042C55D-02BF-4B68-B504-9D761720139D'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D8D9D433-15A5-4420-AD9A-22A26BBFF041'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4875D852-8870-4B19-BB63-2865FE767221'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3D66E797-7855-4AE7-9CA9-BA565970FF4D'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: ML Models.PredictionUnitID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2DB9C2F7-4871-4CAB-97F8-6EE4E15D1F2F';

-- UPDATE Entity Field Category Info MJ: ML Models.EvaluationProtocolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E2F8483D-BB3A-4F6C-AE90-DF7BA136CA9B';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingSnapshotID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CA3BA7F7-4BD9-48EC-857A-626327A6F711';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A96363DC-DC3F-4B34-8910-3C272A1C940E';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact SHA-256'
WHERE 
   ID = 'E31E57F1-A2AD-4339-8962-114C0E250104';

-- UPDATE Entity Field Category Info MJ: ML Models.SnapshotHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9525FE0C-D668-4794-8B99-C9E8804859D5';

-- UPDATE Entity Field Category Info MJ: ML Models.CodeVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '3A39E349-6C6E-485D-B011-06F6BA5C49D1';

-- UPDATE Entity Field Category Info MJ: ML Models.FeatureSchemaHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '95CC6BEB-2469-48E2-9F81-F7E20C8E25A7';

-- UPDATE Entity Field Category Info MJ: ML Models.OutputSemantics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '6A809848-A03D-45C5-BD00-271526A3A5A0';

-- UPDATE Entity Field Category Info MJ: ML Models.Delivery 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '00BB2B02-5327-445D-86E5-29C3EF46C0AE';

-- UPDATE Entity Field Category Info MJ: ML Models.StatusReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B029D962-B395-4ABB-9020-72A885698B13';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C8E8C3D8-BD29-4EDE-917F-7A28806A1648';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactCheckedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F0D90030-DA68-42E0-B752-A5A07EBC662E';

-- UPDATE Entity Field Category Info MJ: ML Models.ServingWhileUnevaluated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Training & Performance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '10087A32-D423-4C53-9C10-DF421487A2F7';

-- UPDATE Entity Field Category Info MJ: ML Models.PredictionUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FA990C48-BCC3-43A1-BE83-EBA239D8E4A3';

-- UPDATE Entity Field Category Info MJ: ML Models.EvaluationProtocol 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AAA53018-E665-4D30-93FE-E7953960E435';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingSnapshot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9AD99CDD-04C9-40B0-B773-E135A1D46F45';

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0E5D3D94-9D84-4B20-9CE5-F3BA58BF66D4';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = 'E229AB69-FB14-434E-9B3B-2014E51B40C7';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.TrainingRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Run'
WHERE 
   ID = '5E2706F8-2498-4FAB-B8F5-C349CDB215C4';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.SignOffID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Sign Off'
WHERE 
   ID = 'FBB7FA13-37A1-4E01-B303-A72D74494B9B';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ReplacesModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Replaces Model'
WHERE 
   ID = '5ACF602E-FC83-45DC-AA7D-82ECEE98E204';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Kind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '09F085EE-9424-4863-97DC-C5F332ED142A';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Purpose 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A881F7A8-1EB9-4A63-A323-36C122B109D4';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ApproverKind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D8D9D433-15A5-4420-AD9A-22A26BBFF041';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '66524100-50FF-4E59-9D1F-A3E2F02A8FE0';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3E0F4279-DAC5-43F4-97A5-CBBC26745430';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Initiator 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '26F11178-4A8C-4D12-BAE0-89034787289E';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.RecordedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4875D852-8870-4B19-BB63-2865FE767221';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Decision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Decisions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3D66E797-7855-4AE7-9CA9-BA565970FF4D';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Reason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Decisions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BCC98010-4A6A-4A38-822A-B1C21A40BA2F';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.GateDecision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Decisions',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'C6AB6A17-1C5A-4EC7-A358-40DFF247700F';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Evidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Decisions',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '74CA8896-7DEC-4F42-A2EE-4C9BDC87A222';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.EvidenceSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Decisions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evidence SHA-256'
WHERE 
   ID = '3D7C841D-9318-402E-9DC0-243C70DA0DCB';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.OverridesFlags 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Decisions',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'A6304309-0143-4867-9840-803C186F3A3C';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Refusal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Decisions',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '7A86E6FD-48EB-4934-8640-5E87C8238D50';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Transient 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Decisions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D5142A74-009B-41BA-AE56-AB1C0E400413';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3EDE4BC8-2806-409D-AFAF-321B1CB386AD';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FBF65F04-4E55-447D-B0AE-F77F60ECD8E2';

/* Set entity icon to fa fa-history */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-history', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('dcee6871-c335-55b8-95d3-3146ef038f70', '4D8B302C-7F68-4B55-9149-F512FB8D89C5', 'FieldCategoryInfo', '{
  "Audit and Decisions": {
    "description": "Audit trails, gate decisions, evidence snapshots, and refusal payloads",
    "icon": "fa fa-shield-alt"
  },
  "Publish Details": {
    "description": "Core publish action attributes, initiators, and timestamps",
    "icon": "fa fa-info-circle"
  },
  "Publish References": {
    "description": "Foreign references to models, training runs, and sign-offs",
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
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3ad49c77-ad71-5a22-988c-c5808e1f2391', '4D8B302C-7F68-4B55-9149-F512FB8D89C5', 'FieldCategoryIcons', '{
  "Audit and Decisions": "fa fa-shield-alt",
  "Publish Details": "fa fa-info-circle",
  "Publish References": "fa fa-link",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '4D8B302C-7F68-4B55-9149-F512FB8D89C5';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3AB539B2-B358-4BA8-8527-55DDDC13141A';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'ML Output Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = 'CF25DA89-C596-460D-BDEA-14DC9F8316AA';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.Surface 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'ML Output Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9D1CCF12-61BF-4638-8E1A-2403B23F0011';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.SortsBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'ML Output Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E22E6678-4DCE-4609-A135-B12F0A45326D';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.DriverDirectionRelativeTo 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'ML Output Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '07A99365-270C-4384-914E-8D782F86AC12';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.Label 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'ML Output Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1B026829-76A5-4668-9FAD-DD8558469496';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ED35E770-F54E-4269-B26A-6228435C5245';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7730BFED-50B5-44D3-9444-FC37713B4D5E';

/* Set entity icon to fa fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '7042C55D-02BF-4B68-B504-9D761720139D';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '7042C55D-02BF-4B68-B504-9D761720139D' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('12cc5068-6c1e-5854-b632-97cc1ff0888e', '7042C55D-02BF-4B68-B504-9D761720139D', 'FieldCategoryInfo', '{
  "ML Output Configuration": {
    "description": "Configuration settings determining how model outputs are displayed and structured on different surfaces",
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
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '7042C55D-02BF-4B68-B504-9D761720139D' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c4313688-31e2-5c2f-ae5e-7b4435763930', '7042C55D-02BF-4B68-B504-9D761720139D', 'FieldCategoryIcons', '{
  "ML Output Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '7042C55D-02BF-4B68-B504-9D761720139D';

/* Set categories for 26 fields */

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AD5C64F8-0AE0-46DD-B105-64DD5D08F6C5';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = '51F2D654-1280-4C6E-9EFB-6ED9679CB1AF';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScheduledJobRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '24F65C9C-60F8-4D69-80A0-6CFFC8D75A6E';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Period 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '68B7E3FD-162C-4578-80DC-67BE3AC17A86';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PeriodGrain 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '114ADA3D-ACFA-402F-9B7D-0FAFA8D317C5';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.State 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D69FA5F7-2B59-4572-9FB3-5AEA6365B1ED';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScoredRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Outcomes',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '34B66717-3805-4FA3-B22A-DFA091BAB86C';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.JoinedRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Outcomes',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5C019679-FE0B-406D-8CD5-CFC05634F9D2';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ExcludedInTrainingRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Outcomes',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A6EE6ACF-B5CD-4C83-B6D5-37C6B3321421';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Outcomes',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '05449CD5-E835-4E62-8580-76FC6132D7B5';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Outcomes',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DDBF402C-E8F0-4B7F-AC8F-93EB3441A947';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryLower 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Outcomes',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Lower Bound'
WHERE 
   ID = '301E02A0-ACC2-42C1-ACFB-A695DA5A9941';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryUpper 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Outcomes',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Upper Bound'
WHERE 
   ID = '13CB158B-20BC-44D3-8557-42767C72751F';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.TrackedMetrics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Outcomes',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '640BC248-DA19-413B-B276-6308EDBEC4CD';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Calibration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics & Outcomes',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'B37B866B-8D2D-4741-83D2-150DF9685EC4';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.DriftLook 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift & Parity',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '5A9E1668-955E-4252-A44E-D873DA9183F8';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.DriftAlarms 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift & Parity',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '68337E48-D990-4F62-A4AE-54F6C66907F8';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Parity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift & Parity',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '433F4488-8682-45DB-B5E6-C76D9D9801BD';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.TriggersFired 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers & Actions',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '9F252191-9F31-4172-8AD6-BC258FC5E375';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ChallengerRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers & Actions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '54F45DF2-CD51-437A-81D1-1B01A34EB101';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ChallengerResult 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers & Actions',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '2C7C25BB-A218-4DA8-9E8C-67D4D84867BD';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.RollbackCheck 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers & Actions',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '7B48FE04-51B7-4A78-8D57-9DD78897E9D6';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1308AB88-A378-498F-B929-FF8C9B8AEA91';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '70022819-AB5D-450C-9773-5A67871C6A31';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '89E3A7A8-74BD-4B36-ABD3-A4BE0C0429BA';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScheduledJobRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '348D4443-8FF4-4B64-BD1A-5E3FF907179E';

/* Set entity icon to fa fa-chart-line */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-chart-line', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a506a6b4-ede4-5472-9037-a6ccbc3f4dab', 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', 'FieldCategoryInfo', '{
  "Drift & Parity": {
    "description": "Input drift statistics, alarms, and parity checks",
    "icon": "fa fa-wave-square"
  },
  "Metrics & Outcomes": {
    "description": "Scored rows, outcome joins, primary scores, tracked metrics, and calibration reports",
    "icon": "fa fa-chart-bar"
  },
  "Monitoring Period & Status": {
    "description": "Information regarding the monitoring time window, grain, state, and errors",
    "icon": "fa fa-calendar"
  },
  "System Metadata": {
    "description": "System-managed audit and relationship identifiers",
    "icon": "fa fa-cog"
  },
  "Triggers & Actions": {
    "description": "Fired triggers, challenger runs, results, and rollback evaluations",
    "icon": "fa fa-bolt"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('00c2d93a-558a-5552-84cc-deee8b4dbb36', 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33', 'FieldCategoryIcons', '{
  "Drift & Parity": "fa fa-wave-square",
  "Metrics & Outcomes": "fa fa-chart-bar",
  "Monitoring Period & Status": "fa fa-calendar",
  "System Metadata": "fa fa-cog",
  "Triggers & Actions": "fa fa-bolt"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'DEF7C9ED-9695-4E34-9A3C-A52CA82ABF33';

/* Set categories for 33 fields */

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CF8C10E6-1CAE-4961-AB43-28E08333195E';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = '122D4D99-4966-4E76-A71E-E961C65BB4D1';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ModelVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1CB2E4E4-4E94-4418-8C70-B4549913A395';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.MLModelScoringBindingID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Model Scoring Binding'
WHERE 
   ID = 'F0949A0C-6733-4A74-A0AC-AB5A4DE85595';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ArtifactSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact SHA-256'
WHERE 
   ID = '74869984-F360-43DB-9EA6-225FE302FCDA';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.FeatureSchemaHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1A669174-7869-4A7E-9DA9-1DC466C75A7B';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Path 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DDEF91FF-8D3C-4D9B-B15C-902ED9023908';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.MLModelScoringBinding 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Model Scoring Binding Name'
WHERE 
   ID = 'F2DF23C1-AC08-432B-8434-F8CF2C22EB48';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeKind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Parameters',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9FDCAEB5-6DAD-4F6C-9708-223622245628';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Parameters',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scope Entity'
WHERE 
   ID = '501922F3-C5B2-48BB-801B-43BE0FE5510D';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Scope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Parameters',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'B0E57D04-6FA3-4359-93BE-3CC77E00E5A6';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.EntityMapping 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Parameters',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '180A4A34-CF22-4AFE-B814-E048ADE4BFC9';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.AsOfDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Parameters',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '061D98FA-0AC3-44DD-B5D7-1FB5729C51B7';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ReadPolicy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Parameters',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '6E3057B2-E092-4A5B-9DAA-1C3E5A9FD1F1';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.DryRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Parameters',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F72EEF20-9B5B-4CE5-8AC8-7F2B690B7FFF';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Parameters',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scope Entity Name'
WHERE 
   ID = '3793ED5D-7EA3-4BC4-8263-B981EA4DF91D';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request and Execution Context',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'D287B7A6-4B2B-4DC5-A980-ABE09963CDFE';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request and Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested By User'
WHERE 
   ID = 'B3F65A10-96BC-489F-BF1B-9E2A70D06B4C';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ProcessRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request and Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Process Run'
WHERE 
   ID = '89CE5DB2-B446-4B32-A311-FA06AE94CB98';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScheduledJobRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request and Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Job Run'
WHERE 
   ID = '174466AE-48F7-4A93-B37A-5125E5677FEE';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request and Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested By User Name'
WHERE 
   ID = '1321F22C-E4D3-45A8-9450-F4F0F88B9CB8';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScheduledJobRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request and Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Job Run Name'
WHERE 
   ID = '2C95CF3F-61AB-41A4-B32E-527F28B8E927';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Results',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '01DE1B92-0333-4A3E-B519-461899557F12';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Refusal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Refusal Details',
   ExtendedType = 'JSON'
WHERE 
   ID = '8A53450E-9AF2-44CE-A36B-3724F8D3BFE4';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Total 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Records'
WHERE 
   ID = 'BEE75E21-1294-4020-83F3-DC5E178BB917';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Written 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Written Records'
WHERE 
   ID = 'AB65817A-4FEA-428B-8ECB-0FAD9A7B03C7';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Failed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Failed Records'
WHERE 
   ID = 'A0200E73-7E10-47D2-92E9-179F51675B62';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Skipped 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Skipped Records'
WHERE 
   ID = 'AA66E96D-0B5A-43B3-BC37-3A11E1383278';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.FirstErrors 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '53582C64-EF66-4641-948A-99E655AA0FAF';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Results',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C7F34EBB-7E6D-4621-84BA-056DEBB92039';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Results',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E470EF32-7099-4EFC-A6B4-ED1A128B9A21';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AA5FF9FF-C0BE-42E2-85D2-26263E4B6C32';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F6C1894E-BFA3-49AD-B1C1-97084101C4B9';

/* Set entity icon to fa fa-cogs */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-cogs', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0dd7cd85-8a1d-5260-82ed-76085ebe4a19', 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', 'FieldCategoryInfo', '{
  "Model and Configuration": {
    "description": "Specific model version, artifacts, hashes, and pathway configurations used for scoring",
    "icon": "fa fa-cube"
  },
  "Request and Execution Context": {
    "description": "Information about who initiated the run and associated job process identifiers",
    "icon": "fa fa-user-clock"
  },
  "Scoring Scope and Parameters": {
    "description": "Defines the scope of records, mappings, read policies, and execution mode",
    "icon": "fa fa-crosshairs"
  },
  "Status and Results": {
    "description": "Run execution metrics, processing counts, success/failure status, and timing details",
    "icon": "fa fa-chart-bar"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6411f9e1-05f1-5d8b-97df-aafc26061bbc', 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC', 'FieldCategoryIcons', '{
  "Model and Configuration": "fa fa-cube",
  "Request and Execution Context": "fa fa-user-clock",
  "Scoring Scope and Parameters": "fa fa-crosshairs",
  "Status and Results": "fa fa-chart-bar",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'BCDC0418-49AC-4C13-ADDE-85116BBE8ACC';

