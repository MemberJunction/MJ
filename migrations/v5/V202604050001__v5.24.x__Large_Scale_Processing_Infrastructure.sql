-- Large-Scale Processing Infrastructure
--
-- 1. Extend ContentProcessRun with resume/progress/cancellation columns
-- 2. Add ContentProcessRunDetail for per-source tracking within a run
-- 3. Add ContentProcessRunPromptRun junction table linking to AIPromptRun
-- 4. Extend DuplicateRun with progress/resume columns
-- 5. Extend DuplicateRunDetail with start/end timestamps
--

----------------------------------------------------------------------
-- 1. ContentProcessRun extensions
----------------------------------------------------------------------

ALTER TABLE ${flyway:defaultSchema}.ContentProcessRun
    ADD StartedByUserID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_ContentProcessRun_User FOREIGN KEY REFERENCES ${flyway:defaultSchema}.[User](ID),
        TotalItemCount INT NULL,
        LastProcessedOffset INT NULL CONSTRAINT DF_ContentProcessRun_LastProcessedOffset DEFAULT 0,
        BatchSize INT NULL CONSTRAINT DF_ContentProcessRun_BatchSize DEFAULT 100,
        ErrorCount INT NULL CONSTRAINT DF_ContentProcessRun_ErrorCount DEFAULT 0,
        ErrorMessage NVARCHAR(MAX) NULL,
        CancellationRequested BIT NOT NULL CONSTRAINT DF_ContentProcessRun_CancellationRequested DEFAULT 0,
        Configuration NVARCHAR(MAX) NULL;
GO

-- Extended Properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The user who triggered this pipeline run. NULL for system-initiated runs.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='StartedByUserID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total number of content items to process in this run. Used for progress percentage calculation.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='TotalItemCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'StartRow offset of the last successfully completed batch. Used for resume-from-crash: next batch starts at this offset. Reset to 0 on new runs.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='LastProcessedOffset';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of content items processed per batch. Configurable per run, default 100.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='BatchSize';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Running count of errors encountered during processing. Used by the circuit breaker to halt the pipeline if error rate exceeds the configured threshold.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='ErrorCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Error details if the run failed. Includes error messages, stack traces, or circuit breaker trigger reason.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='ErrorMessage';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When set to 1, the pipeline stops after completing the current batch. Used for pause and cancel operations. The Status column reflects the final state (Paused or Cancelled).',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='CancellationRequested';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON snapshot of the pipeline configuration used for this run. Conforms to the IContentProcessRunConfiguration interface. Includes batch size, rate limits, error thresholds, and duplicate detection settings.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='Configuration';

----------------------------------------------------------------------
-- 2. ContentProcessRunDetail
----------------------------------------------------------------------

CREATE TABLE ${flyway:defaultSchema}.ContentProcessRunDetail (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ContentProcessRunID UNIQUEIDENTIFIER NOT NULL,
    ContentSourceID UNIQUEIDENTIFIER NOT NULL,
    ContentSourceTypeID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    ItemsProcessed INT NOT NULL DEFAULT 0,
    ItemsTagged INT NOT NULL DEFAULT 0,
    ItemsVectorized INT NOT NULL DEFAULT 0,
    TagsCreated INT NOT NULL DEFAULT 0,
    ErrorCount INT NOT NULL DEFAULT 0,
    StartTime DATETIMEOFFSET NULL,
    EndTime DATETIMEOFFSET NULL,
    TotalTokensUsed INT NOT NULL DEFAULT 0,
    TotalCost DECIMAL(18, 6) NOT NULL DEFAULT 0,
    CONSTRAINT PK_ContentProcessRunDetail PRIMARY KEY (ID),
    CONSTRAINT FK_ContentProcessRunDetail_Run FOREIGN KEY (ContentProcessRunID) REFERENCES ${flyway:defaultSchema}.ContentProcessRun(ID),
    CONSTRAINT FK_ContentProcessRunDetail_Source FOREIGN KEY (ContentSourceID) REFERENCES ${flyway:defaultSchema}.ContentSource(ID),
    CONSTRAINT FK_ContentProcessRunDetail_SourceType FOREIGN KEY (ContentSourceTypeID) REFERENCES ${flyway:defaultSchema}.ContentSourceType(ID)
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Per-content-source tracking within a pipeline run. Each source processed during a ContentProcessRun gets one detail record with item counts, timing, token usage, and cost rollups.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The parent pipeline run this detail belongs to.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ContentProcessRunID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The content source being processed in this detail record.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ContentSourceID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The type of content source (RSS Feed, Entity, Website, Cloud Storage, etc.).',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ContentSourceTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Processing status: Pending, Running, Completed, Failed, or Skipped.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total content items processed for this source during the run.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ItemsProcessed';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of content items successfully tagged by the LLM.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ItemsTagged';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of content items successfully embedded and upserted to the vector database.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ItemsVectorized';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of new ContentItemTag records created during LLM tagging.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='TagsCreated';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of errors encountered while processing this source.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ErrorCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When processing started for this source within the pipeline run.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='StartTime';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When processing completed for this source within the pipeline run.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='EndTime';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Rollup of all tokens used across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='TotalTokensUsed';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Rollup of all costs across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='TotalCost';

----------------------------------------------------------------------
-- 3. ContentProcessRunPromptRun (Junction)
----------------------------------------------------------------------

CREATE TABLE ${flyway:defaultSchema}.ContentProcessRunPromptRun (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ContentProcessRunDetailID UNIQUEIDENTIFIER NOT NULL,
    AIPromptRunID UNIQUEIDENTIFIER NOT NULL,
    RunType NVARCHAR(20) NOT NULL,
    CONSTRAINT PK_ContentProcessRunPromptRun PRIMARY KEY (ID),
    CONSTRAINT FK_ContentProcessRunPromptRun_Detail FOREIGN KEY (ContentProcessRunDetailID) REFERENCES ${flyway:defaultSchema}.ContentProcessRunDetail(ID),
    CONSTRAINT FK_ContentProcessRunPromptRun_PromptRun FOREIGN KEY (AIPromptRunID) REFERENCES ${flyway:defaultSchema}.AIPromptRun(ID),
    CONSTRAINT CK_ContentProcessRunPromptRun_RunType CHECK (RunType IN ('Tag', 'Embed'))
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Links ContentProcessRunDetail records to their associated AIPromptRun records. Each LLM tagging call and embedding call creates an AIPromptRun, and this junction table provides the FK relationship for cost/token analytics.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunPromptRun';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The content process run detail record this prompt run is associated with.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunPromptRun', @level2type=N'COLUMN', @level2name='ContentProcessRunDetailID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The AI prompt run record containing token usage, cost, model, vendor, and execution details for this call.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunPromptRun', @level2type=N'COLUMN', @level2name='AIPromptRunID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this AIPromptRun was for LLM tagging (Tag) or text embedding (Embed).',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunPromptRun', @level2type=N'COLUMN', @level2name='RunType';

----------------------------------------------------------------------
-- 4. DuplicateRun extensions
----------------------------------------------------------------------

ALTER TABLE ${flyway:defaultSchema}.DuplicateRun
    ADD TotalItemCount INT NULL,
        ProcessedItemCount INT NULL CONSTRAINT DF_DuplicateRun_ProcessedItemCount DEFAULT 0,
        LastProcessedOffset INT NULL CONSTRAINT DF_DuplicateRun_LastProcessedOffset DEFAULT 0,
        BatchSize INT NULL CONSTRAINT DF_DuplicateRun_BatchSize DEFAULT 100,
        CancellationRequested BIT NOT NULL CONSTRAINT DF_DuplicateRun_CancellationRequested DEFAULT 0;
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total entity records to check for duplicates in this run.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRun', @level2type=N'COLUMN', @level2name='TotalItemCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of records checked so far. Used for progress percentage.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRun', @level2type=N'COLUMN', @level2name='ProcessedItemCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Resume cursor for large-scale duplicate detection. Stores the offset of the last completed batch.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRun', @level2type=N'COLUMN', @level2name='LastProcessedOffset';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of records processed per batch during duplicate detection.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRun', @level2type=N'COLUMN', @level2name='BatchSize';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When set to 1, duplicate detection stops after the current batch. Used for pause/cancel.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRun', @level2type=N'COLUMN', @level2name='CancellationRequested';

----------------------------------------------------------------------
-- 5. DuplicateRunDetail extensions
----------------------------------------------------------------------

ALTER TABLE ${flyway:defaultSchema}.DuplicateRunDetail
    ADD StartedAt DATETIMEOFFSET NULL,
        EndedAt DATETIMEOFFSET NULL;
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When processing started for this specific record during duplicate detection.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRunDetail', @level2type=N'COLUMN', @level2name='StartedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When processing completed for this specific record during duplicate detection.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRunDetail', @level2type=N'COLUMN', @level2name='EndedAt';






























































-- CODE GEN RUN
/* SQL generated to create new entity MJ: Content Process Run Prompt Runs */

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
         [AllowUserSearchAPI]
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
         'e3df2cfb-3afb-4868-adbd-94f133f52acc',
         'MJ: Content Process Run Prompt Runs',
         'Content Process Run Prompt Runs',
         'Links ContentProcessRunDetail records to their associated AIPromptRun records. Each LLM tagging call and embedding call creates an AIPromptRun, and this junction table provides the FK relationship for cost/token analytics.',
         NULL,
         'ContentProcessRunPromptRun',
         'vwContentProcessRunPromptRuns',
         '${flyway:defaultSchema}',
         1,
         0
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
      )
   

/* SQL generated to add new entity MJ: Content Process Run Prompt Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e3df2cfb-3afb-4868-adbd-94f133f52acc', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Prompt Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e3df2cfb-3afb-4868-adbd-94f133f52acc', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Prompt Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e3df2cfb-3afb-4868-adbd-94f133f52acc', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Prompt Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e3df2cfb-3afb-4868-adbd-94f133f52acc', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Content Process Run Details */

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
         [AllowUserSearchAPI]
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
         '89ba838a-7953-4462-a2d2-9517828e0ed0',
         'MJ: Content Process Run Details',
         'Content Process Run Details',
         'Per-content-source tracking within a pipeline run. Each source processed during a ContentProcessRun gets one detail record with item counts, timing, token usage, and cost rollups.',
         NULL,
         'ContentProcessRunDetail',
         'vwContentProcessRunDetails',
         '${flyway:defaultSchema}',
         1,
         0
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
      )
   

/* SQL generated to add new entity MJ: Content Process Run Details to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '89ba838a-7953-4462-a2d2-9517828e0ed0', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Details for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('89ba838a-7953-4462-a2d2-9517828e0ed0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Details for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('89ba838a-7953-4462-a2d2-9517828e0ed0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Details for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('89ba838a-7953-4462-a2d2-9517828e0ed0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
UPDATE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ADD CONSTRAINT [DF___mj_ContentProcessRunPromptRun___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
UPDATE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ADD CONSTRAINT [DF___mj_ContentProcessRunPromptRun___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
UPDATE [${flyway:defaultSchema}].[ContentProcessRunDetail] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ADD CONSTRAINT [DF___mj_ContentProcessRunDetail___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
UPDATE [${flyway:defaultSchema}].[ContentProcessRunDetail] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ADD CONSTRAINT [DF___mj_ContentProcessRunDetail___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd5576c9-f65f-4500-9c90-00c91dab30ea' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TotalItemCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dd5576c9-f65f-4500-9c90-00c91dab30ea',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            100031,
            'TotalItemCount',
            'Total Item Count',
            'Total entity records to check for duplicates in this run.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9564a81e-09eb-4766-83a5-68a71d69ce9c' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ProcessedItemCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9564a81e-09eb-4766-83a5-68a71d69ce9c',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            100032,
            'ProcessedItemCount',
            'Processed Item Count',
            'Number of records checked so far. Used for progress percentage.',
            'int',
            4,
            10,
            0,
            1,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '625a7a89-d9db-4b47-a953-c187334a1201' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LastProcessedOffset')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '625a7a89-d9db-4b47-a953-c187334a1201',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            100033,
            'LastProcessedOffset',
            'Last Processed Offset',
            'Resume cursor for large-scale duplicate detection. Stores the offset of the last completed batch.',
            'int',
            4,
            10,
            0,
            1,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8922df59-2401-443f-bcc6-9fce8c7e7773' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'BatchSize')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8922df59-2401-443f-bcc6-9fce8c7e7773',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            100034,
            'BatchSize',
            'Batch Size',
            'Number of records processed per batch during duplicate detection.',
            'int',
            4,
            10,
            0,
            1,
            '(100)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '078164ed-7aee-436d-a4a6-587f51123df6' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CancellationRequested')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '078164ed-7aee-436d-a4a6-587f51123df6',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            100035,
            'CancellationRequested',
            'Cancellation Requested',
            'When set to 1, duplicate detection stops after the current batch. Used for pause/cancel.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c7540dc-91b0-4475-ad71-474a18ce833d' OR (EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'StartedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7c7540dc-91b0-4475-ad71-474a18ce833d',
            '31248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Run Details
            100024,
            'StartedAt',
            'Started At',
            'When processing started for this specific record during duplicate detection.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9f20c70e-d8d3-4a31-9bd8-53d9daf0bbcf' OR (EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EndedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9f20c70e-d8d3-4a31-9bd8-53d9daf0bbcf',
            '31248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Run Details
            100025,
            'EndedAt',
            'Ended At',
            'When processing completed for this specific record during duplicate detection.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be3938fa-821d-4677-b2b3-40b49f6749c4' OR (EntityID = 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'be3938fa-821d-4677-b2b3-40b49f6749c4',
            'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', -- Entity: MJ: Content Process Run Prompt Runs
            100001,
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
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea0e3c91-3614-44a4-acd0-a3147c734b63' OR (EntityID = 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC' AND Name = 'ContentProcessRunDetailID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ea0e3c91-3614-44a4-acd0-a3147c734b63',
            'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', -- Entity: MJ: Content Process Run Prompt Runs
            100002,
            'ContentProcessRunDetailID',
            'Content Process Run Detail ID',
            'The content process run detail record this prompt run is associated with.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '89BA838A-7953-4462-A2D2-9517828E0ED0',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2e294c31-7ffb-4e3f-8dad-b4c0a8cf87e7' OR (EntityID = 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC' AND Name = 'AIPromptRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2e294c31-7ffb-4e3f-8dad-b4c0a8cf87e7',
            'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', -- Entity: MJ: Content Process Run Prompt Runs
            100003,
            'AIPromptRunID',
            'AI Prompt Run ID',
            'The AI prompt run record containing token usage, cost, model, vendor, and execution details for this call.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '11951303-1ca3-4f4d-a08b-a0a52c7bbf20' OR (EntityID = 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC' AND Name = 'RunType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '11951303-1ca3-4f4d-a08b-a0a52c7bbf20',
            'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', -- Entity: MJ: Content Process Run Prompt Runs
            100004,
            'RunType',
            'Run Type',
            'Whether this AIPromptRun was for LLM tagging (Tag) or text embedding (Embed).',
            'nvarchar',
            40,
            0,
            0,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5efe618-c081-4fd8-82ba-778ec10160e9' OR (EntityID = 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f5efe618-c081-4fd8-82ba-778ec10160e9',
            'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', -- Entity: MJ: Content Process Run Prompt Runs
            100005,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '99dfed1e-3a40-4805-94da-ad53f39de35a' OR (EntityID = 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '99dfed1e-3a40-4805-94da-ad53f39de35a',
            'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', -- Entity: MJ: Content Process Run Prompt Runs
            100006,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ea50a58-6845-45c2-a366-a03c3e0e0498' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9ea50a58-6845-45c2-a366-a03c3e0e0498',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100001,
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
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '01ec6e30-f839-4916-8480-2e557d2b5a7a' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'ContentProcessRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '01ec6e30-f839-4916-8480-2e557d2b5a7a',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100002,
            'ContentProcessRunID',
            'Content Process Run ID',
            'The parent pipeline run this detail belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd835fdb9-9175-4aa2-b6d1-b8c96c1a5757' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'ContentSourceID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd835fdb9-9175-4aa2-b6d1-b8c96c1a5757',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100003,
            'ContentSourceID',
            'Content Source ID',
            'The content source being processed in this detail record.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5200b57b-1055-4f1f-a28c-230c6743908f' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'ContentSourceTypeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5200b57b-1055-4f1f-a28c-230c6743908f',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100004,
            'ContentSourceTypeID',
            'Content Source Type ID',
            'The type of content source (RSS Feed, Entity, Website, Cloud Storage, etc.).',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '52b62d85-0f1e-41ca-a4ad-c69fd716cd13' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '52b62d85-0f1e-41ca-a4ad-c69fd716cd13',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100005,
            'Status',
            'Status',
            'Processing status: Pending, Running, Completed, Failed, or Skipped.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a498819f-2ed8-4bef-bf2b-890e50095fdb' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'ItemsProcessed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a498819f-2ed8-4bef-bf2b-890e50095fdb',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100006,
            'ItemsProcessed',
            'Items Processed',
            'Total content items processed for this source during the run.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f4daad0-5d51-4205-a209-52b1065c001c' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'ItemsTagged')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0f4daad0-5d51-4205-a209-52b1065c001c',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100007,
            'ItemsTagged',
            'Items Tagged',
            'Number of content items successfully tagged by the LLM.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b4d3d1f6-4356-4493-b540-b5267a01fa3c' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'ItemsVectorized')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b4d3d1f6-4356-4493-b540-b5267a01fa3c',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100008,
            'ItemsVectorized',
            'Items Vectorized',
            'Number of content items successfully embedded and upserted to the vector database.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '21263ded-7e9b-4c00-a86b-1269e7f83d1a' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'TagsCreated')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '21263ded-7e9b-4c00-a86b-1269e7f83d1a',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100009,
            'TagsCreated',
            'Tags Created',
            'Number of new ContentItemTag records created during LLM tagging.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '016d6925-df59-4975-93dc-cb0375e2e9bd' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'ErrorCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '016d6925-df59-4975-93dc-cb0375e2e9bd',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100010,
            'ErrorCount',
            'Error Count',
            'Number of errors encountered while processing this source.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '07f644dd-298b-481b-9b67-a33880841a94' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'StartTime')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '07f644dd-298b-481b-9b67-a33880841a94',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100011,
            'StartTime',
            'Start Time',
            'When processing started for this source within the pipeline run.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0038218f-4a4c-44f6-9bd0-242bb62b3188' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'EndTime')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0038218f-4a4c-44f6-9bd0-242bb62b3188',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100012,
            'EndTime',
            'End Time',
            'When processing completed for this source within the pipeline run.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '43641629-e537-43aa-9a8e-026927226ba6' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'TotalTokensUsed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '43641629-e537-43aa-9a8e-026927226ba6',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100013,
            'TotalTokensUsed',
            'Total Tokens Used',
            'Rollup of all tokens used across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b67e54f4-63b3-4710-b99e-977a1941314c' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'TotalCost')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b67e54f4-63b3-4710-b99e-977a1941314c',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100014,
            'TotalCost',
            'Total Cost',
            'Rollup of all costs across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.',
            'decimal',
            9,
            18,
            6,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e76c5f42-9167-49d9-b34c-d1d421814cc7' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e76c5f42-9167-49d9-b34c-d1d421814cc7',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100015,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '062f37e8-ae92-4d72-b165-42ae22dab28c' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '062f37e8-ae92-4d72-b165-42ae22dab28c',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100016,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7e27144-e536-4db5-b6a3-330790655202' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'StartedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f7e27144-e536-4db5-b6a3-330790655202',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100018,
            'StartedByUserID',
            'Started By User ID',
            'The user who triggered this pipeline run. NULL for system-initiated runs.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca5452e5-a4f2-4ca6-846d-5a86d1ca387b' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'TotalItemCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca5452e5-a4f2-4ca6-846d-5a86d1ca387b',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100019,
            'TotalItemCount',
            'Total Item Count',
            'Total number of content items to process in this run. Used for progress percentage calculation.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31b437b5-efee-4999-9968-58e90cfa30ab' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'LastProcessedOffset')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '31b437b5-efee-4999-9968-58e90cfa30ab',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100020,
            'LastProcessedOffset',
            'Last Processed Offset',
            'StartRow offset of the last successfully completed batch. Used for resume-from-crash: next batch starts at this offset. Reset to 0 on new runs.',
            'int',
            4,
            10,
            0,
            1,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16650d26-eded-41d5-97fc-e53c62c6d016' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'BatchSize')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '16650d26-eded-41d5-97fc-e53c62c6d016',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100021,
            'BatchSize',
            'Batch Size',
            'Number of content items processed per batch. Configurable per run, default 100.',
            'int',
            4,
            10,
            0,
            1,
            '(100)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3b58510-58f3-4593-a1bc-f87823b436e6' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ErrorCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f3b58510-58f3-4593-a1bc-f87823b436e6',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100022,
            'ErrorCount',
            'Error Count',
            'Running count of errors encountered during processing. Used by the circuit breaker to halt the pipeline if error rate exceeds the configured threshold.',
            'int',
            4,
            10,
            0,
            1,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81213b1c-ffc7-4f9f-b15d-8868064ca713' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ErrorMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '81213b1c-ffc7-4f9f-b15d-8868064ca713',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100023,
            'ErrorMessage',
            'Error Message',
            'Error details if the run failed. Includes error messages, stack traces, or circuit breaker trigger reason.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09a96b7a-d618-470d-8d2b-fc47b9bbe0e9' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'CancellationRequested')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '09a96b7a-d618-470d-8d2b-fc47b9bbe0e9',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100024,
            'CancellationRequested',
            'Cancellation Requested',
            'When set to 1, the pipeline stops after completing the current batch. Used for pause and cancel operations. The Status column reflects the final state (Paused or Cancelled).',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b3a4aec-9a9f-4b72-b294-841c21d58c5b' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Configuration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2b3a4aec-9a9f-4b72-b294-841c21d58c5b',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100025,
            'Configuration',
            'Configuration',
            'JSON snapshot of the pipeline configuration used for this run. Conforms to the IContentProcessRunConfiguration interface. Includes batch size, rate limits, error thresholds, and duplicate detection settings.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert entity field value with ID 651de716-4c49-4efc-a743-b6ee50592b29 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('651de716-4c49-4efc-a743-b6ee50592b29', '11951303-1CA3-4F4D-A08B-A0A52C7BBF20', 1, 'Embed', 'Embed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID a0482bbf-41bc-4f37-9c5f-c8084d63b7ce */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a0482bbf-41bc-4f37-9c5f-c8084d63b7ce', '11951303-1CA3-4F4D-A08B-A0A52C7BBF20', 2, 'Tag', 'Tag', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 11951303-1CA3-4F4D-A08B-A0A52C7BBF20 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='11951303-1CA3-4F4D-A08B-A0A52C7BBF20'


/* Create Entity Relationship: MJ: Users -> MJ: Content Process Runs (One To Many via StartedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0bd4f506-a66f-4c1d-94ae-538c2fda199a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0bd4f506-a66f-4c1d-94ae-538c2fda199a', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'StartedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Content Process Run Details -> MJ: Content Process Run Prompt Runs (One To Many via ContentProcessRunDetailID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dd16d049-bce5-4109-bfc8-c886cddd3a12'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dd16d049-bce5-4109-bfc8-c886cddd3a12', '89BA838A-7953-4462-A2D2-9517828E0ED0', 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', 'ContentProcessRunDetailID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Content Process Runs -> MJ: Content Process Run Details (One To Many via ContentProcessRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b9e372a8-ee42-46b6-a747-2dda6a9d5389'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b9e372a8-ee42-46b6-a747-2dda6a9d5389', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', '89BA838A-7953-4462-A2D2-9517828E0ED0', 'ContentProcessRunID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Content Sources -> MJ: Content Process Run Details (One To Many via ContentSourceID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a42e0c31-7cd2-4ade-b2a5-78bac8452305'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a42e0c31-7cd2-4ade-b2a5-78bac8452305', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', '89BA838A-7953-4462-A2D2-9517828E0ED0', 'ContentSourceID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Content Source Types -> MJ: Content Process Run Details (One To Many via ContentSourceTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9d24dfcb-95d1-4ac8-9090-74c63f9c309b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9d24dfcb-95d1-4ac8-9090-74c63f9c309b', 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', '89BA838A-7953-4462-A2D2-9517828E0ED0', 'ContentSourceTypeID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: AI Prompt Runs -> MJ: Content Process Run Prompt Runs (One To Many via AIPromptRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '32c93543-d704-4c72-8512-61c2c5c5d5e9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('32c93543-d704-4c72-8512-61c2c5c5d5e9', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', 'AIPromptRunID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
 
 


/* Index for Foreign Keys for ContentProcessRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentProcessRunID in table ContentProcessRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentProcessRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentProcessRunID ON [${flyway:defaultSchema}].[ContentProcessRunDetail] ([ContentProcessRunID]);

-- Index for foreign key ContentSourceID in table ContentProcessRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentSourceID ON [${flyway:defaultSchema}].[ContentProcessRunDetail] ([ContentSourceID]);

-- Index for foreign key ContentSourceTypeID in table ContentProcessRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentSourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentSourceTypeID ON [${flyway:defaultSchema}].[ContentProcessRunDetail] ([ContentSourceTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 01EC6E30-F839-4916-8480-2E557D2B5A7A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='01EC6E30-F839-4916-8480-2E557D2B5A7A', @RelatedEntityNameFieldMap='ContentProcessRun'

/* Index for Foreign Keys for ContentProcessRunPromptRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentProcessRunDetailID in table ContentProcessRunPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRunPromptRun_ContentProcessRunDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRunPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRunPromptRun_ContentProcessRunDetailID ON [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ([ContentProcessRunDetailID]);

-- Index for foreign key AIPromptRunID in table ContentProcessRunPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRunPromptRun_AIPromptRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRunPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRunPromptRun_AIPromptRunID ON [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ([AIPromptRunID]);

/* SQL text to update entity field related entity name field map for entity field ID 2E294C31-7FFB-4E3F-8DAD-B4C0A8CF87E7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2E294C31-7FFB-4E3F-8DAD-B4C0A8CF87E7', @RelatedEntityNameFieldMap='AIPromptRun'

/* Index for Foreign Keys for ContentProcessRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SourceID in table ContentProcessRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRun_SourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRun_SourceID ON [${flyway:defaultSchema}].[ContentProcessRun] ([SourceID]);

-- Index for foreign key StartedByUserID in table ContentProcessRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRun_StartedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRun_StartedByUserID ON [${flyway:defaultSchema}].[ContentProcessRun] ([StartedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID F7E27144-E536-4DB5-B6A3-330790655202 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F7E27144-E536-4DB5-B6A3-330790655202', @RelatedEntityNameFieldMap='StartedByUser'

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
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentProcessRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentProcessRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentProcessRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentProcessRuns]
AS
SELECT
    c.*,
    MJContentSource_SourceID.[Name] AS [Source],
    MJUser_StartedByUserID.[Name] AS [StartedByUser]
FROM
    [${flyway:defaultSchema}].[ContentProcessRun] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS MJContentSource_SourceID
  ON
    [c].[SourceID] = MJContentSource_SourceID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_StartedByUserID
  ON
    [c].[StartedByUserID] = MJUser_StartedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: Permissions for vwContentProcessRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRun]
    @ID uniqueidentifier = NULL,
    @SourceID uniqueidentifier,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @Status nvarchar(100),
    @ProcessedItems int,
    @StartedByUserID uniqueidentifier,
    @TotalItemCount int,
    @LastProcessedOffset int,
    @BatchSize int,
    @ErrorCount int,
    @ErrorMessage nvarchar(MAX),
    @CancellationRequested bit = NULL,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRun]
            (
                [ID],
                [SourceID],
                [StartTime],
                [EndTime],
                [Status],
                [ProcessedItems],
                [StartedByUserID],
                [TotalItemCount],
                [LastProcessedOffset],
                [BatchSize],
                [ErrorCount],
                [ErrorMessage],
                [CancellationRequested],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SourceID,
                @StartTime,
                @EndTime,
                @Status,
                @ProcessedItems,
                @StartedByUserID,
                @TotalItemCount,
                @LastProcessedOffset,
                @BatchSize,
                @ErrorCount,
                @ErrorMessage,
                ISNULL(@CancellationRequested, 0),
                @Configuration
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRun]
            (
                [SourceID],
                [StartTime],
                [EndTime],
                [Status],
                [ProcessedItems],
                [StartedByUserID],
                [TotalItemCount],
                [LastProcessedOffset],
                [BatchSize],
                [ErrorCount],
                [ErrorMessage],
                [CancellationRequested],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SourceID,
                @StartTime,
                @EndTime,
                @Status,
                @ProcessedItems,
                @StartedByUserID,
                @TotalItemCount,
                @LastProcessedOffset,
                @BatchSize,
                @ErrorCount,
                @ErrorMessage,
                ISNULL(@CancellationRequested, 0),
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentProcessRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRun] TO [cdp_Developer], [cdp_Integration]



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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRun]
    @ID uniqueidentifier,
    @SourceID uniqueidentifier,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @Status nvarchar(100),
    @ProcessedItems int,
    @StartedByUserID uniqueidentifier,
    @TotalItemCount int,
    @LastProcessedOffset int,
    @BatchSize int,
    @ErrorCount int,
    @ErrorMessage nvarchar(MAX),
    @CancellationRequested bit,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRun]
    SET
        [SourceID] = @SourceID,
        [StartTime] = @StartTime,
        [EndTime] = @EndTime,
        [Status] = @Status,
        [ProcessedItems] = @ProcessedItems,
        [StartedByUserID] = @StartedByUserID,
        [TotalItemCount] = @TotalItemCount,
        [LastProcessedOffset] = @LastProcessedOffset,
        [BatchSize] = @BatchSize,
        [ErrorCount] = @ErrorCount,
        [ErrorMessage] = @ErrorMessage,
        [CancellationRequested] = @CancellationRequested,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentProcessRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentProcessRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentProcessRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentProcessRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentProcessRun
ON [${flyway:defaultSchema}].[ContentProcessRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentProcessRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRun] TO [cdp_Developer], [cdp_Integration]



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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentProcessRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRun] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID D835FDB9-9175-4AA2-B6D1-B8C96C1A5757 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D835FDB9-9175-4AA2-B6D1-B8C96C1A5757', @RelatedEntityNameFieldMap='ContentSource'

/* Base View SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: vwContentProcessRunPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Process Run Prompt Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentProcessRunPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentProcessRunPromptRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns]
AS
SELECT
    c.*,
    MJAIPromptRun_AIPromptRunID.[RunName] AS [AIPromptRun]
FROM
    [${flyway:defaultSchema}].[ContentProcessRunPromptRun] AS c
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS MJAIPromptRun_AIPromptRunID
  ON
    [c].[AIPromptRunID] = MJAIPromptRun_AIPromptRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: Permissions for vwContentProcessRunPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentProcessRunPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRunPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRunPromptRun]
    @ID uniqueidentifier = NULL,
    @ContentProcessRunDetailID uniqueidentifier,
    @AIPromptRunID uniqueidentifier,
    @RunType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
            (
                [ID],
                [ContentProcessRunDetailID],
                [AIPromptRunID],
                [RunType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentProcessRunDetailID,
                @AIPromptRunID,
                @RunType
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
            (
                [ContentProcessRunDetailID],
                [AIPromptRunID],
                [RunType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentProcessRunDetailID,
                @AIPromptRunID,
                @RunType
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRunPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Process Run Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRunPromptRun] TO [cdp_Developer], [cdp_Integration]



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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentProcessRunPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRunPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRunPromptRun]
    @ID uniqueidentifier,
    @ContentProcessRunDetailID uniqueidentifier,
    @AIPromptRunID uniqueidentifier,
    @RunType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
    SET
        [ContentProcessRunDetailID] = @ContentProcessRunDetailID,
        [AIPromptRunID] = @AIPromptRunID,
        [RunType] = @RunType
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRunPromptRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRunPromptRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentProcessRunPromptRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentProcessRunPromptRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentProcessRunPromptRun
ON [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentProcessRunPromptRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Process Run Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRunPromptRun] TO [cdp_Developer], [cdp_Integration]



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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Process Run Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 5200B57B-1055-4F1F-A28C-230C6743908F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5200B57B-1055-4F1F-A28C-230C6743908F', @RelatedEntityNameFieldMap='ContentSourceType'

/* Base View SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: vwContentProcessRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Process Run Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentProcessRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentProcessRunDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentProcessRunDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentProcessRunDetails]
AS
SELECT
    c.*,
    MJContentProcessRun_ContentProcessRunID.[Source] AS [ContentProcessRun],
    MJContentSource_ContentSourceID.[Name] AS [ContentSource],
    MJContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType]
FROM
    [${flyway:defaultSchema}].[ContentProcessRunDetail] AS c
INNER JOIN
    [${flyway:defaultSchema}].[vwContentProcessRuns] AS MJContentProcessRun_ContentProcessRunID
  ON
    [c].[ContentProcessRunID] = MJContentProcessRun_ContentProcessRunID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS MJContentSource_ContentSourceID
  ON
    [c].[ContentSourceID] = MJContentSource_ContentSourceID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSourceType] AS MJContentSourceType_ContentSourceTypeID
  ON
    [c].[ContentSourceTypeID] = MJContentSourceType_ContentSourceTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: Permissions for vwContentProcessRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRunDetail]
    @ID uniqueidentifier = NULL,
    @ContentProcessRunID uniqueidentifier,
    @ContentSourceID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @ItemsProcessed int = NULL,
    @ItemsTagged int = NULL,
    @ItemsVectorized int = NULL,
    @TagsCreated int = NULL,
    @ErrorCount int = NULL,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @TotalTokensUsed int = NULL,
    @TotalCost decimal(18, 6) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRunDetail]
            (
                [ID],
                [ContentProcessRunID],
                [ContentSourceID],
                [ContentSourceTypeID],
                [Status],
                [ItemsProcessed],
                [ItemsTagged],
                [ItemsVectorized],
                [TagsCreated],
                [ErrorCount],
                [StartTime],
                [EndTime],
                [TotalTokensUsed],
                [TotalCost]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentProcessRunID,
                @ContentSourceID,
                @ContentSourceTypeID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@ItemsProcessed, 0),
                ISNULL(@ItemsTagged, 0),
                ISNULL(@ItemsVectorized, 0),
                ISNULL(@TagsCreated, 0),
                ISNULL(@ErrorCount, 0),
                @StartTime,
                @EndTime,
                ISNULL(@TotalTokensUsed, 0),
                ISNULL(@TotalCost, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRunDetail]
            (
                [ContentProcessRunID],
                [ContentSourceID],
                [ContentSourceTypeID],
                [Status],
                [ItemsProcessed],
                [ItemsTagged],
                [ItemsVectorized],
                [TagsCreated],
                [ErrorCount],
                [StartTime],
                [EndTime],
                [TotalTokensUsed],
                [TotalCost]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentProcessRunID,
                @ContentSourceID,
                @ContentSourceTypeID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@ItemsProcessed, 0),
                ISNULL(@ItemsTagged, 0),
                ISNULL(@ItemsVectorized, 0),
                ISNULL(@TagsCreated, 0),
                ISNULL(@ErrorCount, 0),
                @StartTime,
                @EndTime,
                ISNULL(@TotalTokensUsed, 0),
                ISNULL(@TotalCost, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentProcessRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Process Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration]



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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail]
    @ID uniqueidentifier,
    @ContentProcessRunID uniqueidentifier,
    @ContentSourceID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @Status nvarchar(20),
    @ItemsProcessed int,
    @ItemsTagged int,
    @ItemsVectorized int,
    @TagsCreated int,
    @ErrorCount int,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRunDetail]
    SET
        [ContentProcessRunID] = @ContentProcessRunID,
        [ContentSourceID] = @ContentSourceID,
        [ContentSourceTypeID] = @ContentSourceTypeID,
        [Status] = @Status,
        [ItemsProcessed] = @ItemsProcessed,
        [ItemsTagged] = @ItemsTagged,
        [ItemsVectorized] = @ItemsVectorized,
        [TagsCreated] = @TagsCreated,
        [ErrorCount] = @ErrorCount,
        [StartTime] = @StartTime,
        [EndTime] = @EndTime,
        [TotalTokensUsed] = @TotalTokensUsed,
        [TotalCost] = @TotalCost
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentProcessRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentProcessRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentProcessRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentProcessRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentProcessRunDetail
ON [${flyway:defaultSchema}].[ContentProcessRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentProcessRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Process Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration]



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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentProcessRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRunDetail] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Process Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRunDetail] TO [cdp_Integration]



/* Index for Foreign Keys for DuplicateRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DuplicateRunID in table DuplicateRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRunDetail_DuplicateRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRunDetail_DuplicateRunID ON [${flyway:defaultSchema}].[DuplicateRunDetail] ([DuplicateRunID]);

/* Index for Foreign Keys for DuplicateRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID ON [${flyway:defaultSchema}].[DuplicateRun] ([EntityID]);

-- Index for foreign key StartedByUserID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID ON [${flyway:defaultSchema}].[DuplicateRun] ([StartedByUserID]);

-- Index for foreign key SourceListID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID ON [${flyway:defaultSchema}].[DuplicateRun] ([SourceListID]);

-- Index for foreign key ApprovedByUserID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID ON [${flyway:defaultSchema}].[DuplicateRun] ([ApprovedByUserID]);

/* Base View SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: vwDuplicateRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Duplicate Run Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DuplicateRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDuplicateRunDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetails]
AS
SELECT
    d.*,
    MJDuplicateRun_DuplicateRunID.[Entity] AS [DuplicateRun]
FROM
    [${flyway:defaultSchema}].[DuplicateRunDetail] AS d
INNER JOIN
    [${flyway:defaultSchema}].[vwDuplicateRuns] AS MJDuplicateRun_DuplicateRunID
  ON
    [d].[DuplicateRunID] = MJDuplicateRun_DuplicateRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: Permissions for vwDuplicateRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDuplicateRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetail]
    @ID uniqueidentifier = NULL,
    @DuplicateRunID uniqueidentifier,
    @RecordID nvarchar(500),
    @MatchStatus nvarchar(20) = NULL,
    @SkippedReason nvarchar(MAX),
    @MatchErrorMessage nvarchar(MAX),
    @MergeStatus nvarchar(20) = NULL,
    @MergeErrorMessage nvarchar(MAX),
    @RecordMetadata nvarchar(MAX),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetail]
            (
                [ID],
                [DuplicateRunID],
                [RecordID],
                [MatchStatus],
                [SkippedReason],
                [MatchErrorMessage],
                [MergeStatus],
                [MergeErrorMessage],
                [RecordMetadata],
                [StartedAt],
                [EndedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DuplicateRunID,
                @RecordID,
                ISNULL(@MatchStatus, 'Pending'),
                @SkippedReason,
                @MatchErrorMessage,
                ISNULL(@MergeStatus, 'Not Applicable'),
                @MergeErrorMessage,
                @RecordMetadata,
                @StartedAt,
                @EndedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetail]
            (
                [DuplicateRunID],
                [RecordID],
                [MatchStatus],
                [SkippedReason],
                [MatchErrorMessage],
                [MergeStatus],
                [MergeErrorMessage],
                [RecordMetadata],
                [StartedAt],
                [EndedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DuplicateRunID,
                @RecordID,
                ISNULL(@MatchStatus, 'Pending'),
                @SkippedReason,
                @MatchErrorMessage,
                ISNULL(@MergeStatus, 'Not Applicable'),
                @MergeErrorMessage,
                @RecordMetadata,
                @StartedAt,
                @EndedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Duplicate Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]



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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDuplicateRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail]
    @ID uniqueidentifier,
    @DuplicateRunID uniqueidentifier,
    @RecordID nvarchar(500),
    @MatchStatus nvarchar(20),
    @SkippedReason nvarchar(MAX),
    @MatchErrorMessage nvarchar(MAX),
    @MergeStatus nvarchar(20),
    @MergeErrorMessage nvarchar(MAX),
    @RecordMetadata nvarchar(MAX),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetail]
    SET
        [DuplicateRunID] = @DuplicateRunID,
        [RecordID] = @RecordID,
        [MatchStatus] = @MatchStatus,
        [SkippedReason] = @SkippedReason,
        [MatchErrorMessage] = @MatchErrorMessage,
        [MergeStatus] = @MergeStatus,
        [MergeErrorMessage] = @MergeErrorMessage,
        [RecordMetadata] = @RecordMetadata,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDuplicateRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDuplicateRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDuplicateRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDuplicateRunDetail
ON [${flyway:defaultSchema}].[DuplicateRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DuplicateRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Duplicate Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]



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
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DuplicateRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDuplicateRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDuplicateRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDuplicateRuns]
AS
SELECT
    d.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJUser_StartedByUserID.[Name] AS [StartedByUser],
    MJList_SourceListID.[Name] AS [SourceList],
    MJUser_ApprovedByUserID.[Name] AS [ApprovedByUser]
FROM
    [${flyway:defaultSchema}].[DuplicateRun] AS d
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [d].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_StartedByUserID
  ON
    [d].[StartedByUserID] = MJUser_StartedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[List] AS MJList_SourceListID
  ON
    [d].[SourceListID] = MJList_SourceListID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ApprovedByUserID
  ON
    [d].[ApprovedByUserID] = MJUser_ApprovedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* Base View Permissions SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: Permissions for vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRun]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @StartedByUserID uniqueidentifier,
    @SourceListID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @EndedAt datetimeoffset,
    @ApprovalStatus nvarchar(20) = NULL,
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(20) = NULL,
    @ProcessingErrorMessage nvarchar(MAX),
    @TotalItemCount int,
    @ProcessedItemCount int,
    @LastProcessedOffset int,
    @BatchSize int,
    @CancellationRequested bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRun]
            (
                [ID],
                [EntityID],
                [StartedByUserID],
                [SourceListID],
                [StartedAt],
                [EndedAt],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingErrorMessage],
                [TotalItemCount],
                [ProcessedItemCount],
                [LastProcessedOffset],
                [BatchSize],
                [CancellationRequested]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @StartedByUserID,
                @SourceListID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @EndedAt,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovalComments,
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                @ProcessingErrorMessage,
                @TotalItemCount,
                @ProcessedItemCount,
                @LastProcessedOffset,
                @BatchSize,
                ISNULL(@CancellationRequested, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRun]
            (
                [EntityID],
                [StartedByUserID],
                [SourceListID],
                [StartedAt],
                [EndedAt],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingErrorMessage],
                [TotalItemCount],
                [ProcessedItemCount],
                [LastProcessedOffset],
                [BatchSize],
                [CancellationRequested]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @StartedByUserID,
                @SourceListID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @EndedAt,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovalComments,
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                @ProcessingErrorMessage,
                @TotalItemCount,
                @ProcessedItemCount,
                @LastProcessedOffset,
                @BatchSize,
                ISNULL(@CancellationRequested, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDuplicateRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] TO [cdp_Developer], [cdp_Integration]



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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRun]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @StartedByUserID uniqueidentifier,
    @SourceListID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @ApprovalStatus nvarchar(20),
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(20),
    @ProcessingErrorMessage nvarchar(MAX),
    @TotalItemCount int,
    @ProcessedItemCount int,
    @LastProcessedOffset int,
    @BatchSize int,
    @CancellationRequested bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRun]
    SET
        [EntityID] = @EntityID,
        [StartedByUserID] = @StartedByUserID,
        [SourceListID] = @SourceListID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovalComments] = @ApprovalComments,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingErrorMessage] = @ProcessingErrorMessage,
        [TotalItemCount] = @TotalItemCount,
        [ProcessedItemCount] = @ProcessedItemCount,
        [LastProcessedOffset] = @LastProcessedOffset,
        [BatchSize] = @BatchSize,
        [CancellationRequested] = @CancellationRequested
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDuplicateRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDuplicateRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDuplicateRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDuplicateRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDuplicateRun
ON [${flyway:defaultSchema}].[DuplicateRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DuplicateRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] TO [cdp_Developer], [cdp_Integration]



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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDuplicateRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DuplicateRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Duplicate Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail] TO [cdp_Integration]



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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DuplicateRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] TO [cdp_Integration]



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
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia
    DECLARE @MJAIPromptRunMedias_PromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRunMedia]
        WHERE [PromptRunID] = @ID
    
    OPEN cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia] @ID = @MJAIPromptRunMedias_PromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ParentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ParentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsed int
    DECLARE @MJAIPromptRuns_ParentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ParentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_Success bit
    DECLARE @MJAIPromptRuns_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ParentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ParentID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ParentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopK int
    DECLARE @MJAIPromptRuns_ParentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_Seed int
    DECLARE @MJAIPromptRuns_ParentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_LogProbs bit
    DECLARE @MJAIPromptRuns_ParentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ParentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ParentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ParentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ParentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ParentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ParentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_Cancelled bit
    DECLARE @MJAIPromptRuns_ParentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ParentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_CacheHit bit
    DECLARE @MJAIPromptRuns_ParentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ParentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ParentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ParentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ParentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_QueueTime int
    DECLARE @MJAIPromptRuns_ParentID_PromptTime int
    DECLARE @MJAIPromptRuns_ParentID_CompletionTime int
    DECLARE @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_EffortLevel int
    DECLARE @MJAIPromptRuns_ParentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AssistantPrefill nvarchar(MAX)
    DECLARE cascade_update_MJAIPromptRuns_ParentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ParentIDID, @PromptID = @MJAIPromptRuns_ParentID_PromptID, @ModelID = @MJAIPromptRuns_ParentID_ModelID, @VendorID = @MJAIPromptRuns_ParentID_VendorID, @AgentID = @MJAIPromptRuns_ParentID_AgentID, @ConfigurationID = @MJAIPromptRuns_ParentID_ConfigurationID, @RunAt = @MJAIPromptRuns_ParentID_RunAt, @CompletedAt = @MJAIPromptRuns_ParentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ParentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ParentID_Messages, @Result = @MJAIPromptRuns_ParentID_Result, @TokensUsed = @MJAIPromptRuns_ParentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ParentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ParentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ParentID_TotalCost, @Success = @MJAIPromptRuns_ParentID_Success, @ErrorMessage = @MJAIPromptRuns_ParentID_ErrorMessage, @ParentID = @MJAIPromptRuns_ParentID_ParentID, @RunType = @MJAIPromptRuns_ParentID_RunType, @ExecutionOrder = @MJAIPromptRuns_ParentID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ParentID_AgentRunID, @Cost = @MJAIPromptRuns_ParentID_Cost, @CostCurrency = @MJAIPromptRuns_ParentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ParentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ParentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ParentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ParentID_Temperature, @TopP = @MJAIPromptRuns_ParentID_TopP, @TopK = @MJAIPromptRuns_ParentID_TopK, @MinP = @MJAIPromptRuns_ParentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ParentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ParentID_PresencePenalty, @Seed = @MJAIPromptRuns_ParentID_Seed, @StopSequences = @MJAIPromptRuns_ParentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ParentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ParentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ParentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ParentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ParentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ParentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ParentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ParentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ParentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ParentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ParentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ParentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ParentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ParentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ParentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ParentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ParentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ParentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ParentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ParentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ParentID_ModelSelection, @Status = @MJAIPromptRuns_ParentID_Status, @Cancelled = @MJAIPromptRuns_ParentID_Cancelled, @CancellationReason = @MJAIPromptRuns_ParentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ParentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ParentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ParentID_CacheHit, @CacheKey = @MJAIPromptRuns_ParentID_CacheKey, @JudgeID = @MJAIPromptRuns_ParentID_JudgeID, @JudgeScore = @MJAIPromptRuns_ParentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ParentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ParentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ParentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ParentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ParentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ParentID_QueueTime, @PromptTime = @MJAIPromptRuns_ParentID_PromptTime, @CompletionTime = @MJAIPromptRuns_ParentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ParentID_EffortLevel, @RunName = @MJAIPromptRuns_ParentID_RunName, @Comments = @MJAIPromptRuns_ParentID_Comments, @TestRunID = @MJAIPromptRuns_ParentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ParentID_AssistantPrefill

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill
    END

    CLOSE cascade_update_MJAIPromptRuns_ParentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ParentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_RerunFromPromptRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Success bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopK int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Seed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_QueueTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill nvarchar(MAX)
    DECLARE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [RerunFromPromptRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_RerunFromPromptRunIDID, @PromptID = @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @ModelID = @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @VendorID = @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @AgentID = @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @CompletedAt = @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_RerunFromPromptRunID_Messages, @Result = @MJAIPromptRuns_RerunFromPromptRunID_Result, @TokensUsed = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @Success = @MJAIPromptRuns_RerunFromPromptRunID_Success, @ErrorMessage = @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @RunType = @MJAIPromptRuns_RerunFromPromptRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @Cost = @MJAIPromptRuns_RerunFromPromptRunID_Cost, @CostCurrency = @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @TopP = @MJAIPromptRuns_RerunFromPromptRunID_TopP, @TopK = @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MinP = @MJAIPromptRuns_RerunFromPromptRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @Seed = @MJAIPromptRuns_RerunFromPromptRunID_Seed, @StopSequences = @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @Status = @MJAIPromptRuns_RerunFromPromptRunID_Status, @Cancelled = @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @CacheKey = @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @JudgeID = @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @PromptTime = @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @RunName = @MJAIPromptRuns_RerunFromPromptRunID_RunName, @Comments = @MJAIPromptRuns_RerunFromPromptRunID_Comments, @TestRunID = @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill
    END

    CLOSE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_PromptRunIDID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_Status nvarchar(50)
    DECLARE @MJAIResultCache_PromptRunID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_PromptRunID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_PromptRunID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [PromptRunID] = @ID

    OPEN cascade_update_MJAIResultCache_PromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_PromptRunID_PromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_PromptRunIDID, @AIPromptID = @MJAIResultCache_PromptRunID_AIPromptID, @AIModelID = @MJAIResultCache_PromptRunID_AIModelID, @RunAt = @MJAIResultCache_PromptRunID_RunAt, @PromptText = @MJAIResultCache_PromptRunID_PromptText, @ResultText = @MJAIResultCache_PromptRunID_ResultText, @Status = @MJAIResultCache_PromptRunID_Status, @ExpiredOn = @MJAIResultCache_PromptRunID_ExpiredOn, @VendorID = @MJAIResultCache_PromptRunID_VendorID, @AgentID = @MJAIResultCache_PromptRunID_AgentID, @ConfigurationID = @MJAIResultCache_PromptRunID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_PromptRunID_PromptEmbedding, @PromptRunID = @MJAIResultCache_PromptRunID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_PromptRunID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_PromptRunID_cursor
    
    -- Cascade delete from ContentProcessRunPromptRun using cursor to call spDeleteContentProcessRunPromptRun
    DECLARE @MJContentProcessRunPromptRuns_AIPromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
        WHERE [AIPromptRunID] = @ID
    
    OPEN cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun] @ID = @MJContentProcessRunPromptRuns_AIPromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    END
    
    CLOSE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    DEALLOCATE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51892374-da40-4f28-a560-39cede768ae2' OR (EntityID = 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC' AND Name = 'AIPromptRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '51892374-da40-4f28-a560-39cede768ae2',
            'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', -- Entity: MJ: Content Process Run Prompt Runs
            100013,
            'AIPromptRun',
            'AI Prompt Run',
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9549a6af-496b-47a6-8b4f-2d8a9817c9d5' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'ContentProcessRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9549a6af-496b-47a6-8b4f-2d8a9817c9d5',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100033,
            'ContentProcessRun',
            'Content Process Run',
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '13d57b2f-bbfb-45bc-9046-30879f2479d5' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'ContentSource')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '13d57b2f-bbfb-45bc-9046-30879f2479d5',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100034,
            'ContentSource',
            'Content Source',
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7c6dfa6-5b73-4766-b650-40dc34511eab' OR (EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0' AND Name = 'ContentSourceType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a7c6dfa6-5b73-4766-b650-40dc34511eab',
            '89BA838A-7953-4462-A2D2-9517828E0ED0', -- Entity: MJ: Content Process Run Details
            100035,
            'ContentSourceType',
            'Content Source Type',
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'db17837f-4c70-4322-b6c2-fabb2f210c20' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'StartedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'db17837f-4c70-4322-b6c2-fabb2f210c20',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100035,
            'StartedByUser',
            'Started By User',
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8B68CD9B-F4C8-4785-99EA-A4D885F08DF0'
               AND AutoUpdateDefaultInView = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '13D57B2F-BBFB-45BC-9046-30879F2479D5'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '52B62D85-0F1E-41CA-A4AD-C69FD716CD13'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A498819F-2ED8-4BEF-BF2B-890E50095FDB'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '016D6925-DF59-4975-93DC-CB0375E2E9BD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '07F644DD-298B-481B-9B67-A33880841A94'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B67E54F4-63B3-4710-B99E-977A1941314C'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '13D57B2F-BBFB-45BC-9046-30879F2479D5'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '52B62D85-0F1E-41CA-A4AD-C69FD716CD13'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '9549A6AF-496B-47A6-8B4F-2D8A9817C9D5'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '13D57B2F-BBFB-45BC-9046-30879F2479D5'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'A7C6DFA6-5B73-4766-B650-40DC34511EAB'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9EA50A58-6845-45C2-A366-A03C3E0E0498' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentProcessRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source & Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Process Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '01EC6E30-F839-4916-8480-2E557D2B5A7A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentProcessRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source & Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Process Run Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9549A6AF-496B-47A6-8B4F-2D8A9817C9D5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentSourceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source & Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D835FDB9-9175-4AA2-B6D1-B8C96C1A5757' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source & Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '13D57B2F-BBFB-45BC-9046-30879F2479D5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentSourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source & Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5200B57B-1055-4F1F-A28C-230C6743908F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentSourceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source & Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7C6DFA6-5B73-4766-B650-40DC34511EAB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source & Run Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '52B62D85-0F1E-41CA-A4AD-C69FD716CD13' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ItemsProcessed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A498819F-2ED8-4BEF-BF2B-890E50095FDB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ItemsTagged 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F4DAAD0-5D51-4205-A209-52B1065C001C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ItemsVectorized 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B4D3D1F6-4356-4493-B540-B5267A01FA3C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.TagsCreated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '21263DED-7E9B-4C00-A86B-1269E7F83D1A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ErrorCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '016D6925-DF59-4975-93DC-CB0375E2E9BD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.StartTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline & Usage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07F644DD-298B-481B-9B67-A33880841A94' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.EndTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline & Usage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0038218F-4A4C-44F6-9BD0-242BB62B3188' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.TotalTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline & Usage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '43641629-E537-43AA-9A8E-026927226BA6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.TotalCost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline & Usage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B67E54F4-63B3-4710-B99E-977A1941314C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E76C5F42-9167-49D9-B34C-D1D421814CC7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '062F37E8-AE92-4D72-B165-42AE22DAB28C' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-terminal */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-terminal', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '89BA838A-7953-4462-A2D2-9517828E0ED0'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('444e3e01-0bcc-460d-a97b-0222ccb689ef', '89BA838A-7953-4462-A2D2-9517828E0ED0', 'FieldCategoryInfo', '{"Source & Run Context":{"icon":"fa fa-project-diagram","description":"Information about the parent pipeline run and the specific content source being tracked."},"Processing Metrics":{"icon":"fa fa-chart-line","description":"Quantifiable results of the processing run, including success counts and error tracking."},"Timeline & Usage":{"icon":"fa fa-history","description":"Timing information and resource consumption metrics like token usage and financial costs."},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps for record management."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e0196599-7229-4634-96f0-c54abdbfdfd6', '89BA838A-7953-4462-A2D2-9517828E0ED0', 'FieldCategoryIcons', '{"Source & Run Context":"fa fa-project-diagram","Processing Metrics":"fa fa-chart-line","Timeline & Usage":"fa fa-history","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '89BA838A-7953-4462-A2D2-9517828E0ED0'
      

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '11951303-1CA3-4F4D-A08B-A0A52C7BBF20'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '51892374-DA40-4F28-A560-39CEDE768AE2'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '11951303-1CA3-4F4D-A08B-A0A52C7BBF20'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F5EFE618-C081-4FD8-82BA-778EC10160E9'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '51892374-DA40-4F28-A560-39CEDE768AE2'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '11951303-1CA3-4F4D-A08B-A0A52C7BBF20'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '51892374-DA40-4F28-A560-39CEDE768AE2'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '87C64C19-39F4-46BC-B95C-265113B019DE'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7C7540DC-91B0-4475-AD71-474A18CE833D'
               AND AutoUpdateDefaultInView = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '364F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DD5576C9-F65F-4500-9C90-00C91DAB30EA'
               AND AutoUpdateDefaultInView = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '7DB7433E-F36B-1410-867F-007B559E242F'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8FB7433E-F36B-1410-867F-007B559E242F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CA5452E5-A4F2-4CA6-846D-5A86D1CA387B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DB17837F-4C70-4322-B6C2-FABB2F210C20'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '89B7433E-F36B-1410-867F-007B559E242F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'DB17837F-4C70-4322-B6C2-FABB2F210C20'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.ContentProcessRunDetailID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Process Run Detail',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EA0E3C91-3614-44A4-ACD0-A3147C734B63' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.AIPromptRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Prompt Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E294C31-7FFB-4E3F-8DAD-B4C0A8CF87E7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.RunType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Association',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '11951303-1CA3-4F4D-A08B-A0A52C7BBF20' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.AIPromptRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Prompt Run Label',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51892374-DA40-4F28-A560-39CEDE768AE2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BE3938FA-821D-4677-B2B3-40B49F6749C4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5EFE618-C081-4FD8-82BA-778EC10160E9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '99DFED1E-3A40-4805-94DA-AD53F39DE35A' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-link */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-link', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e0c6f9f6-0a3a-422c-a6ce-cac356628059', 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', 'FieldCategoryInfo', '{"Run Association":{"icon":"fa fa-project-diagram","description":"Links and classification details connecting content processes to specific AI prompt executions."},"System Metadata":{"icon":"fa fa-cog","description":"Internal identifiers and audit timestamps managed by the system."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('2103a136-ed9b-44db-94d0-33552134f615', 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', 'FieldCategoryIcons', '{"Run Association":"fa fa-project-diagram","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC'
      

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '354417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.DuplicateRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '364417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Record ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.RecordMetadata 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D0181D15-798A-4AA1-82F5-D880ADAFFAC4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.DuplicateRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Duplicate Run Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '87C64C19-39F4-46BC-B95C-265113B019DE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MatchStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.SkippedReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '394417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MatchErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MergeStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MergeErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Outcomes',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C7540DC-91B0-4475-AD71-474A18CE833D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Outcomes',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9F20C70E-D8D3-4A31-9BD8-53D9DAF0BBCF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '835817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '845817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

/* Set categories for 18 fields */

-- UPDATE Entity Field Category Info MJ: Content Process Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '71B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.SourceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '77B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B012AEB-14BF-4AD2-99CF-DF6732F55D70' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.StartTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.EndTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '83B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '89B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.StartedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Started By User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7E27144-E536-4DB5-B6A3-330790655202' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.StartedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Started By User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB17837F-4C70-4322-B6C2-FABB2F210C20' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.ProcessedItems 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Errors',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8FB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.TotalItemCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Errors',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CA5452E5-A4F2-4CA6-846D-5A86D1CA387B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.LastProcessedOffset 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Errors',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '31B437B5-EFEE-4999-9968-58E90CFA30AB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.BatchSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Errors',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '16650D26-EDED-41D5-97FC-E53C62C6D016' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.ErrorCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Errors',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F3B58510-58F3-4593-A1BC-F87823B436E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Errors',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '81213B1C-FFC7-4F9F-B15D-8868064CA713' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.CancellationRequested 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Errors',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '09A96B7A-D618-470D-8D2B-FC47B9BBE0E9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Errors',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '2B3A4AEC-9A9F-4B72-B294-841C21D58C5B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '95B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9BB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Processing & Errors":{"icon":"fa fa-tasks","description":"Execution metrics, batch configuration, and detailed error logging for the process run."},"System Metadata":{"icon":"fa fa-cog","description":"Internal system-managed identifiers and audit timestamps."}}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Processing & Errors":"fa fa-tasks","System Metadata":"fa fa-cog"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Run ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '334F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '344F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.StartedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Started By User ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '354F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.StartedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '404417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.SourceListID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Source List ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3D4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.SourceList 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '424417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '364F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '374F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ApprovalStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '384F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ApprovalComments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '394F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ApprovedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Approved By User ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ApprovedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '414417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ProcessingStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ProcessingErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.TotalItemCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Items',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD5576C9-F65F-4500-9C90-00C91DAB30EA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ProcessedItemCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Processed Items',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9564A81E-09EB-4766-83A5-68A71D69CE9C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.LastProcessedOffset 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '625A7A89-D9DB-4B47-A953-C187334A1201' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.BatchSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8922DF59-2401-443F-BCC6-9FCE8C7E7773' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.CancellationRequested 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '078164ED-7AEE-436D-A4A6-587F51123DF6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '815817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '825817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

