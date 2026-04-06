-- Migration: Create Archive Run Tables
-- Description: Introduces ArchiveRun and ArchiveRunDetail tables for tracking
--              the execution and per-record results of archive operations.

-- Table 1: ArchiveRun
-- Tracks each execution of an archive configuration, including aggregate
-- statistics and overall status.
CREATE TABLE ${flyway:defaultSchema}.ArchiveRun (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ArchiveConfigurationID UNIQUEIDENTIFIER NOT NULL,
    StartedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CompletedAt DATETIMEOFFSET NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Running',
    TotalRecords INT NOT NULL DEFAULT 0,
    ArchivedRecords INT NOT NULL DEFAULT 0,
    FailedRecords INT NOT NULL DEFAULT 0,
    SkippedRecords INT NOT NULL DEFAULT 0,
    TotalBytesArchived BIGINT NOT NULL DEFAULT 0,
    ErrorLog NVARCHAR(MAX) NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_ArchiveRun PRIMARY KEY (ID),
    CONSTRAINT FK_ArchiveRun_Config FOREIGN KEY (ArchiveConfigurationID)
        REFERENCES ${flyway:defaultSchema}.ArchiveConfiguration(ID),
    CONSTRAINT FK_ArchiveRun_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_ArchiveRun_Status
        CHECK (Status IN ('Running', 'Complete', 'Failed', 'Cancelled', 'PartialSuccess'))
);

-- Extended properties for ArchiveRun
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Tracks each execution of an archive configuration, including timing, aggregate statistics, and overall status.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the ArchiveConfiguration that was executed.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun',
    @level2type=N'COLUMN', @level2name=N'ArchiveConfigurationID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Timestamp when the archive run started.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun',
    @level2type=N'COLUMN', @level2name=N'StartedAt';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Timestamp when the archive run completed (NULL while still running).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun',
    @level2type=N'COLUMN', @level2name=N'CompletedAt';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Current status: Running, Complete, Failed, Cancelled, or PartialSuccess.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun',
    @level2type=N'COLUMN', @level2name=N'Status';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Total number of records identified for archiving in this run.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun',
    @level2type=N'COLUMN', @level2name=N'TotalRecords';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Number of records successfully archived.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun',
    @level2type=N'COLUMN', @level2name=N'ArchivedRecords';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Number of records that failed to archive.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun',
    @level2type=N'COLUMN', @level2name=N'FailedRecords';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Number of records skipped (e.g., already archived or filtered out).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun',
    @level2type=N'COLUMN', @level2name=N'SkippedRecords';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Total bytes written to archive storage during this run.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun',
    @level2type=N'COLUMN', @level2name=N'TotalBytesArchived';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Aggregated error log for the run. Contains error details when Status is Failed or PartialSuccess.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun',
    @level2type=N'COLUMN', @level2name=N'ErrorLog';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'The user who initiated this archive run.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRun',
    @level2type=N'COLUMN', @level2name=N'UserID';


-- Table 2: ArchiveRunDetail
-- Per-record detail for each archive run, tracking the outcome of each
-- individual record processed.
CREATE TABLE ${flyway:defaultSchema}.ArchiveRunDetail (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ArchiveRunID UNIQUEIDENTIFIER NOT NULL,
    EntityID UNIQUEIDENTIFIER NOT NULL,
    RecordID NVARCHAR(750) NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    StoragePath NVARCHAR(1000) NULL,
    BytesArchived BIGINT NOT NULL DEFAULT 0,
    ErrorMessage NVARCHAR(MAX) NULL,
    ArchivedAt DATETIMEOFFSET NULL,
    VersionStamp DATETIMEOFFSET NULL,
    IsRecordChangeArchive BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_ArchiveRunDetail PRIMARY KEY (ID),
    CONSTRAINT FK_ArchiveRunDetail_Run FOREIGN KEY (ArchiveRunID)
        REFERENCES ${flyway:defaultSchema}.ArchiveRun(ID),
    CONSTRAINT FK_ArchiveRunDetail_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT CK_ArchiveRunDetail_Status
        CHECK (Status IN ('Success', 'Failed', 'Skipped'))
);

-- Extended properties for ArchiveRunDetail
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Per-record detail for each archive run. Tracks the outcome, storage location, and error information for each individual record processed.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRunDetail';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the parent ArchiveRun.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRunDetail',
    @level2type=N'COLUMN', @level2name=N'ArchiveRunID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the Entity this record belongs to.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRunDetail',
    @level2type=N'COLUMN', @level2name=N'EntityID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'The primary key value of the archived record (string representation to support all key types).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRunDetail',
    @level2type=N'COLUMN', @level2name=N'RecordID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Outcome for this record: Success, Failed, or Skipped.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRunDetail',
    @level2type=N'COLUMN', @level2name=N'Status';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Full path to the archived file in storage (e.g., "archives/production/Users/2026/04/record-id.json").',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRunDetail',
    @level2type=N'COLUMN', @level2name=N'StoragePath';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Number of bytes written to storage for this record.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRunDetail',
    @level2type=N'COLUMN', @level2name=N'BytesArchived';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Error details when Status is Failed.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRunDetail',
    @level2type=N'COLUMN', @level2name=N'ErrorMessage';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Timestamp when this record was successfully archived.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRunDetail',
    @level2type=N'COLUMN', @level2name=N'ArchivedAt';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'The __mj_UpdatedAt timestamp of the record at the time of archiving, used for conflict detection during restore.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRunDetail',
    @level2type=N'COLUMN', @level2name=N'VersionStamp';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'When true, this detail row represents an archived Record Change entry rather than a primary entity record.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveRunDetail',
    @level2type=N'COLUMN', @level2name=N'IsRecordChangeArchive';



-- ============================================================================
-- CodeGen Output: Entity metadata, stored procedures, views, permissions,
-- field definitions, relationships, and indexes for Archive entities
-- ============================================================================


/* SQL generated to create new entity MJ: Archive Configuration Entities */

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
         'ec8518a0-5c7d-4a5b-bc44-f05da3d6f15c',
         'MJ: Archive Configuration Entities',
         'Archive Configuration Entities',
         'Per-entity configuration within an archive pipeline. Allows overriding the parent configuration''s defaults for mode, retention, batch size, and filtering on a per-entity basis.',
         NULL,
         'ArchiveConfigurationEntity',
         'vwArchiveConfigurationEntities',
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
   

/* SQL generated to add new entity MJ: Archive Configuration Entities to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ec8518a0-5c7d-4a5b-bc44-f05da3d6f15c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Configuration Entities for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ec8518a0-5c7d-4a5b-bc44-f05da3d6f15c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Configuration Entities for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ec8518a0-5c7d-4a5b-bc44-f05da3d6f15c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Configuration Entities for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ec8518a0-5c7d-4a5b-bc44-f05da3d6f15c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Archive Runs */

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
         '3f4636b0-4eea-4e0f-a4c8-b884a9596cce',
         'MJ: Archive Runs',
         'Archive Runs',
         'Tracks each execution of an archive configuration, including timing, aggregate statistics, and overall status.',
         NULL,
         'ArchiveRun',
         'vwArchiveRuns',
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
   

/* SQL generated to add new entity MJ: Archive Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3f4636b0-4eea-4e0f-a4c8-b884a9596cce', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3f4636b0-4eea-4e0f-a4c8-b884a9596cce', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3f4636b0-4eea-4e0f-a4c8-b884a9596cce', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3f4636b0-4eea-4e0f-a4c8-b884a9596cce', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Archive Run Details */

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
         '4def6fb6-2a44-46ef-90b9-b91e36084664',
         'MJ: Archive Run Details',
         'Archive Run Details',
         'Per-record detail for each archive run. Tracks the outcome, storage location, and error information for each individual record processed.',
         NULL,
         'ArchiveRunDetail',
         'vwArchiveRunDetails',
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
   

/* SQL generated to add new entity MJ: Archive Run Details to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4def6fb6-2a44-46ef-90b9-b91e36084664', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Run Details for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4def6fb6-2a44-46ef-90b9-b91e36084664', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Run Details for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4def6fb6-2a44-46ef-90b9-b91e36084664', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Run Details for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4def6fb6-2a44-46ef-90b9-b91e36084664', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Archive Configurations */

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
         '9e9e1e81-4b52-445f-9591-3479855783df',
         'MJ: Archive Configurations',
         'Archive Configurations',
         'Top-level configuration for an archive pipeline. Defines the storage target, default retention policy, archive format, and operational mode for archiving entity records.',
         NULL,
         'ArchiveConfiguration',
         'vwArchiveConfigurations',
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
   

/* SQL generated to add new entity MJ: Archive Configurations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9e9e1e81-4b52-445f-9591-3479855783df', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Configurations for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9e9e1e81-4b52-445f-9591-3479855783df', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Configurations for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9e9e1e81-4b52-445f-9591-3479855783df', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Configurations for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9e9e1e81-4b52-445f-9591-3479855783df', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
UPDATE [${flyway:defaultSchema}].[ArchiveConfiguration] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ADD CONSTRAINT [DF___mj_ArchiveConfiguration___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
UPDATE [${flyway:defaultSchema}].[ArchiveConfiguration] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ADD CONSTRAINT [DF___mj_ArchiveConfiguration___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
UPDATE [${flyway:defaultSchema}].[ArchiveRun] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ADD CONSTRAINT [DF___mj_ArchiveRun___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
UPDATE [${flyway:defaultSchema}].[ArchiveRun] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ADD CONSTRAINT [DF___mj_ArchiveRun___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
UPDATE [${flyway:defaultSchema}].[ArchiveRunDetail] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ADD CONSTRAINT [DF___mj_ArchiveRunDetail___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
UPDATE [${flyway:defaultSchema}].[ArchiveRunDetail] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ADD CONSTRAINT [DF___mj_ArchiveRunDetail___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
UPDATE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ADD CONSTRAINT [DF___mj_ArchiveConfigurationEntity___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
UPDATE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ADD CONSTRAINT [DF___mj_ArchiveConfigurationEntity___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a75f0d9a-17ea-4188-a8a1-9fdfdf874dbd' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a75f0d9a-17ea-4188-a8a1-9fdfdf874dbd',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8bd68d78-72a4-4561-bf80-81c11c4451d4' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '8bd68d78-72a4-4561-bf80-81c11c4451d4',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100002,
            'Name',
            'Name',
            'Human-readable name for this archive configuration.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '87277d15-e523-4bd3-8b1d-4dcbc20e0f0c' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '87277d15-e523-4bd3-8b1d-4dcbc20e0f0c',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100003,
            'Description',
            'Description',
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
            NULL,
            NULL,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf0f3e17-e5dc-4d99-bf8b-3e1100101a38' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'StorageAccountID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'bf0f3e17-e5dc-4d99-bf8b-3e1100101a38',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100004,
            'StorageAccountID',
            'Storage Account ID',
            'Foreign key to FileStorageAccount — the blob/file storage target for archived data.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c18c6f2a-e4b3-4721-a9a9-1345c649e258' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'RootPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c18c6f2a-e4b3-4721-a9a9-1345c649e258',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100005,
            'RootPath',
            'Root Path',
            'Root path within the storage account where archive files are written (e.g., "archives/production/").',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cdc6fac2-7fdb-4dbe-abb9-7720c8b283a7' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'ArchiveFormat')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'cdc6fac2-7fdb-4dbe-abb9-7720c8b283a7',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100006,
            'ArchiveFormat',
            'Archive Format',
            'Output format for archived records: JSON, Parquet, or CSV.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'JSON',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ae97952-77c7-4ab9-8ff1-0fb92f12c8bd' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '9ae97952-77c7-4ab9-8ff1-0fb92f12c8bd',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100007,
            'IsActive',
            'Is Active',
            'Whether this configuration is active and eligible for scheduled archive runs.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ab54ab4d-d92b-4489-b271-e483b321d932' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'DefaultRetentionDays')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'ab54ab4d-d92b-4489-b271-e483b321d932',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100008,
            'DefaultRetentionDays',
            'Default Retention Days',
            'Default number of days after which records become eligible for archiving. Can be overridden per entity.',
            'int',
            4,
            10,
            0,
            0,
            '(365)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f9e330d-d751-4b1a-83ae-3085090a2e1e' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'DefaultMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6f9e330d-d751-4b1a-83ae-3085090a2e1e',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100009,
            'DefaultMode',
            'Default Mode',
            'Default archive mode: StripFields (remove specified fields), SoftDelete (mark as deleted), HardDelete (remove from source), ArchiveOnly (copy without modifying source).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'StripFields',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a7aa95c-5be4-487e-9ba8-2a575ffa4595' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'DefaultBatchSize')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '4a7aa95c-5be4-487e-9ba8-2a575ffa4595',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100010,
            'DefaultBatchSize',
            'Default Batch Size',
            'Default number of records to process per batch during archive runs.',
            'int',
            4,
            10,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe733a09-aad4-4888-a0dd-fce4b30fecad' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'ArchiveRelatedRecordChanges')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'fe733a09-aad4-4888-a0dd-fce4b30fecad',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100011,
            'ArchiveRelatedRecordChanges',
            'Archive Related Record Changes',
            'When enabled, related Record Changes entries are also archived alongside the source records.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f51053fa-7217-43e6-843e-96359f563416' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'f51053fa-7217-43e6-843e-96359f563416',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100012,
            'Status',
            'Status',
            'Current operational status of this configuration: Idle, Running, Error, or Disabled.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Idle',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '446c9003-5860-4e71-abd5-b9bec5f65000' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'CreatedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '446c9003-5860-4e71-abd5-b9bec5f65000',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100013,
            'CreatedByUserID',
            'Created By User ID',
            'The user who created this archive configuration.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '83f0ee5d-0a8f-4c9a-ab68-c057549e0dd0' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '83f0ee5d-0a8f-4c9a-ab68-c057549e0dd0',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '454489c1-2b61-462e-878a-617e08bd354d' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '454489c1-2b61-462e-878a-617e08bd354d',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bd7c59a7-a560-47ac-af25-7fcebfc5ee24' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'bd7c59a7-a560-47ac-af25-7fcebfc5ee24',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ea7babc-6b90-4c5c-838f-b1bfb983a422' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'ArchiveConfigurationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '7ea7babc-6b90-4c5c-838f-b1bfb983a422',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100002,
            'ArchiveConfigurationID',
            'Archive Configuration ID',
            'Foreign key to the ArchiveConfiguration that was executed.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '9E9E1E81-4B52-445F-9591-3479855783DF',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '07240bd8-2d9e-4d38-b3e8-f940aea886bf' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'StartedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '07240bd8-2d9e-4d38-b3e8-f940aea886bf',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100003,
            'StartedAt',
            'Started At',
            'Timestamp when the archive run started.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70444110-7cc3-4001-8154-856842e2dea5' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'CompletedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '70444110-7cc3-4001-8154-856842e2dea5',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100004,
            'CompletedAt',
            'Completed At',
            'Timestamp when the archive run completed (NULL while still running).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd062a5c6-35f2-452e-b83d-c4e8ff777a33' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd062a5c6-35f2-452e-b83d-c4e8ff777a33',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100005,
            'Status',
            'Status',
            'Current status: Running, Complete, Failed, Cancelled, or PartialSuccess.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Running',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ead2440-832e-408f-91e4-a61dbcddb6ac' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'TotalRecords')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3ead2440-832e-408f-91e4-a61dbcddb6ac',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100006,
            'TotalRecords',
            'Total Records',
            'Total number of records identified for archiving in this run.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2f6b7430-355b-4154-bdd3-1289942e49e8' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'ArchivedRecords')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '2f6b7430-355b-4154-bdd3-1289942e49e8',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100007,
            'ArchivedRecords',
            'Archived Records',
            'Number of records successfully archived.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c57ad1db-e640-42e2-8346-e9205aa8293a' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'FailedRecords')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c57ad1db-e640-42e2-8346-e9205aa8293a',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100008,
            'FailedRecords',
            'Failed Records',
            'Number of records that failed to archive.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '653fb4e4-1ea8-4a4e-8073-c6cebf833d88' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'SkippedRecords')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '653fb4e4-1ea8-4a4e-8073-c6cebf833d88',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100009,
            'SkippedRecords',
            'Skipped Records',
            'Number of records skipped (e.g., already archived or filtered out).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '177f25ea-a811-4a0d-ab97-f81b00b7ff30' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'TotalBytesArchived')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '177f25ea-a811-4a0d-ab97-f81b00b7ff30',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100010,
            'TotalBytesArchived',
            'Total Bytes Archived',
            'Total bytes written to archive storage during this run.',
            'bigint',
            8,
            19,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6fa96f8a-a6a7-4581-93ae-38935b63b2d8' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'ErrorLog')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6fa96f8a-a6a7-4581-93ae-38935b63b2d8',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100011,
            'ErrorLog',
            'Error Log',
            'Aggregated error log for the run. Contains error details when Status is Failed or PartialSuccess.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'efde0e75-4ea3-4fb6-a402-d87ca08257b2' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'efde0e75-4ea3-4fb6-a402-d87ca08257b2',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100012,
            'UserID',
            'User ID',
            'The user who initiated this archive run.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c1eb91a-9ba5-4788-bcc9-328a3d81924a' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '7c1eb91a-9ba5-4788-bcc9-328a3d81924a',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b7e5865-9e44-405c-9ef2-882090ed8759' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '2b7e5865-9e44-405c-9ef2-882090ed8759',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc9a2dcf-b298-4ee9-b616-047f9e62771f' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'cc9a2dcf-b298-4ee9-b616-047f9e62771f',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a864e10-5052-4bac-aa5f-d3f25aa277d1' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'ArchiveRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3a864e10-5052-4bac-aa5f-d3f25aa277d1',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100002,
            'ArchiveRunID',
            'Archive Run ID',
            'Foreign key to the parent ArchiveRun.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cb2e616-6085-490f-ae22-c7c56589d34f' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '0cb2e616-6085-490f-ae22-c7c56589d34f',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100003,
            'EntityID',
            'Entity ID',
            'Foreign key to the Entity this record belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa055a56-cb10-4a80-be31-1f42e675aecb' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'RecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'aa055a56-cb10-4a80-be31-1f42e675aecb',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100004,
            'RecordID',
            'Record ID',
            'The primary key value of the archived record (string representation to support all key types).',
            'nvarchar',
            1500,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fc22e925-360a-4095-b289-9a8004ce31da' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'fc22e925-360a-4095-b289-9a8004ce31da',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100005,
            'Status',
            'Status',
            'Outcome for this record: Success, Failed, or Skipped.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c13608ca-c298-4d47-80c4-eace68dadb9a' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'StoragePath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c13608ca-c298-4d47-80c4-eace68dadb9a',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100006,
            'StoragePath',
            'Storage Path',
            'Full path to the archived file in storage (e.g., "archives/production/Users/2026/04/record-id.json").',
            'nvarchar',
            2000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c8742fa-bb77-4093-99d9-5a5814f1e169' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'BytesArchived')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '1c8742fa-bb77-4093-99d9-5a5814f1e169',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100007,
            'BytesArchived',
            'Bytes Archived',
            'Number of bytes written to storage for this record.',
            'bigint',
            8,
            19,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d8ddd06-5af5-43f2-b4e3-6406e8ad040c' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'ErrorMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5d8ddd06-5af5-43f2-b4e3-6406e8ad040c',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100008,
            'ErrorMessage',
            'Error Message',
            'Error details when Status is Failed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b2931a97-5ae7-4542-806e-3c1607cf4e72' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'ArchivedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b2931a97-5ae7-4542-806e-3c1607cf4e72',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100009,
            'ArchivedAt',
            'Archived At',
            'Timestamp when this record was successfully archived.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e187943c-2f11-4e8d-9c7b-0d608bfd3b17' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'VersionStamp')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e187943c-2f11-4e8d-9c7b-0d608bfd3b17',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100010,
            'VersionStamp',
            'Version Stamp',
            'The __mj_UpdatedAt timestamp of the record at the time of archiving, used for conflict detection during restore.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8bf622b-1243-48cf-b30c-e686a10e6d85' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'IsRecordChangeArchive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd8bf622b-1243-48cf-b30c-e686a10e6d85',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100011,
            'IsRecordChangeArchive',
            'Is Record Change Archive',
            'When true, this detail row represents an archived Record Change entry rather than a primary entity record.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e984c3f9-9366-4014-b7e0-ad561473475b' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e984c3f9-9366-4014-b7e0-ad561473475b',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100012,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9633f313-2408-4004-8d19-8bb15c975813' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '9633f313-2408-4004-8d19-8bb15c975813',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ff96817-0bba-4634-a94c-93776939fcd8' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3ff96817-0bba-4634-a94c-93776939fcd8',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5674b1d-6882-4273-af0b-07a584005af4' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'ArchiveConfigurationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'f5674b1d-6882-4273-af0b-07a584005af4',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100002,
            'ArchiveConfigurationID',
            'Archive Configuration ID',
            'Foreign key to the parent ArchiveConfiguration.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '9E9E1E81-4B52-445F-9591-3479855783DF',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5515a623-1adb-4890-a32d-e24d03219525' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5515a623-1adb-4890-a32d-e24d03219525',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100003,
            'EntityID',
            'Entity ID',
            'Foreign key to the Entity being archived.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '749dad24-9833-4e3d-9b81-85028889b745' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'Mode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '749dad24-9833-4e3d-9b81-85028889b745',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100004,
            'Mode',
            'Mode',
            'Archive mode override for this entity. NULL inherits from the parent configuration''s DefaultMode.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8effe3f6-d215-4b59-8472-83eed81a2502' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'RetentionDays')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '8effe3f6-d215-4b59-8472-83eed81a2502',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100005,
            'RetentionDays',
            'Retention Days',
            'Retention period override in days. NULL inherits from the parent configuration''s DefaultRetentionDays.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82ad26d7-a063-4b22-b509-50ceb5a223a8' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'DateField')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '82ad26d7-a063-4b22-b509-50ceb5a223a8',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100006,
            'DateField',
            'Date Field',
            'The date field on the entity used to determine record age for retention policy evaluation. Defaults to __mj_CreatedAt.',
            'nvarchar',
            200,
            0,
            0,
            0,
            '__mj_CreatedAt',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66d1fb7c-9677-4f11-a459-e3c6352cfd00' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'FilterExpression')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '66d1fb7c-9677-4f11-a459-e3c6352cfd00',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100007,
            'FilterExpression',
            'Filter Expression',
            'Optional SQL WHERE clause fragment to further filter which records are eligible for archiving (e.g., "Status = ''Closed''").',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8582e389-f45b-42ef-ba2d-4d16e524882e' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'BatchSize')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '8582e389-f45b-42ef-ba2d-4d16e524882e',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100008,
            'BatchSize',
            'Batch Size',
            'Batch size override for this entity. NULL inherits from the parent configuration''s DefaultBatchSize.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20db8628-2e83-44df-af79-55d808d96cd9' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'Priority')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '20db8628-2e83-44df-af79-55d808d96cd9',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100009,
            'Priority',
            'Priority',
            'Processing priority — lower numbers are archived first. Default is 100.',
            'int',
            4,
            10,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bdcd5a93-6608-4b8d-b689-646a37ce67ec' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'FieldConfiguration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'bdcd5a93-6608-4b8d-b689-646a37ce67ec',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100010,
            'FieldConfiguration',
            'Field Configuration',
            'JSON configuration specifying which fields to include/exclude in the archive output. Required for all modes.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6afb38a6-2320-496b-b4b5-0cb48109b1a7' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'DriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6afb38a6-2320-496b-b4b5-0cb48109b1a7',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100011,
            'DriverClass',
            'Driver Class',
            'Optional fully-qualified class name of a custom archive driver to use for this entity, overriding the default archiver.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa6e22ee-9fef-4c6c-a886-23c94c376b70' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'ArchiveRelatedRecordChanges')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'fa6e22ee-9fef-4c6c-a886-23c94c376b70',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100012,
            'ArchiveRelatedRecordChanges',
            'Archive Related Record Changes',
            'Override for archiving related Record Changes. NULL inherits from the parent configuration.',
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3088c57-0da8-4ffc-8928-dc96d9bfa087' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b3088c57-0da8-4ffc-8928-dc96d9bfa087',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100013,
            'IsActive',
            'Is Active',
            'Whether this entity is active within the archive configuration.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7bc9b9f8-1535-4cf8-98c8-7e84aeb926cd' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '7bc9b9f8-1535-4cf8-98c8-7e84aeb926cd',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a8f9f64-0122-4edb-b079-2fbcf1dc90e0' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3a8f9f64-0122-4edb-b079-2fbcf1dc90e0',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100015,
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

/* SQL text to insert entity field value with ID f3cdd818-d0fe-433a-97b7-9b8fac4c3267 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f3cdd818-d0fe-433a-97b7-9b8fac4c3267', 'CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7', 1, 'CSV', 'CSV', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 230ad7cd-c43a-4c1c-8acf-eebc6882f9e6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('230ad7cd-c43a-4c1c-8acf-eebc6882f9e6', 'CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7', 2, 'JSON', 'JSON', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 7119b696-b8df-47e3-b8d6-594c6b5377bc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7119b696-b8df-47e3-b8d6-594c6b5377bc', 'CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7', 3, 'Parquet', 'Parquet', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7'

/* SQL text to insert entity field value with ID 3995d603-1452-4405-a2cd-513be38ca8d8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3995d603-1452-4405-a2cd-513be38ca8d8', '6F9E330D-D751-4B1A-83AE-3085090A2E1E', 1, 'ArchiveOnly', 'ArchiveOnly', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID c10b5534-91b6-4543-a284-3eeebf353fdb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c10b5534-91b6-4543-a284-3eeebf353fdb', '6F9E330D-D751-4B1A-83AE-3085090A2E1E', 2, 'HardDelete', 'HardDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 6efc1aaf-709c-4b2d-bed5-d452d0d2a7ee */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6efc1aaf-709c-4b2d-bed5-d452d0d2a7ee', '6F9E330D-D751-4B1A-83AE-3085090A2E1E', 3, 'SoftDelete', 'SoftDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 520095fd-33cf-4d30-b347-f37103b0dfea */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('520095fd-33cf-4d30-b347-f37103b0dfea', '6F9E330D-D751-4B1A-83AE-3085090A2E1E', 4, 'StripFields', 'StripFields', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 6F9E330D-D751-4B1A-83AE-3085090A2E1E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6F9E330D-D751-4B1A-83AE-3085090A2E1E'

/* SQL text to insert entity field value with ID 81d8a7e5-2bfd-4180-8045-a09bcee45472 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('81d8a7e5-2bfd-4180-8045-a09bcee45472', 'F51053FA-7217-43E6-843E-96359F563416', 1, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID c867f7d4-227a-4c50-8a34-a03a5041cf20 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c867f7d4-227a-4c50-8a34-a03a5041cf20', 'F51053FA-7217-43E6-843E-96359F563416', 2, 'Error', 'Error', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID a2b81177-d3a1-4393-ab2e-c91daf54e390 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a2b81177-d3a1-4393-ab2e-c91daf54e390', 'F51053FA-7217-43E6-843E-96359F563416', 3, 'Idle', 'Idle', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID e6ecbc98-a22e-43f2-bae6-3baaebe0bc1a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e6ecbc98-a22e-43f2-bae6-3baaebe0bc1a', 'F51053FA-7217-43E6-843E-96359F563416', 4, 'Running', 'Running', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID F51053FA-7217-43E6-843E-96359F563416 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F51053FA-7217-43E6-843E-96359F563416'

/* SQL text to insert entity field value with ID 87b08f5e-a7b3-4510-8c18-4631c1f02481 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('87b08f5e-a7b3-4510-8c18-4631c1f02481', 'D062A5C6-35F2-452E-B83D-C4E8FF777A33', 1, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID c33ebb67-ca34-4a37-8a02-07b09ec2f320 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c33ebb67-ca34-4a37-8a02-07b09ec2f320', 'D062A5C6-35F2-452E-B83D-C4E8FF777A33', 2, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID cbfd689f-8746-4afb-ab17-2df861a766cb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cbfd689f-8746-4afb-ab17-2df861a766cb', 'D062A5C6-35F2-452E-B83D-C4E8FF777A33', 3, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 71b28ccc-4fb8-4c7f-bc28-e942a97c5ded */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('71b28ccc-4fb8-4c7f-bc28-e942a97c5ded', 'D062A5C6-35F2-452E-B83D-C4E8FF777A33', 4, 'PartialSuccess', 'PartialSuccess', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID b9a40dac-6949-4e3b-bda4-623e0ac6cd5c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b9a40dac-6949-4e3b-bda4-623e0ac6cd5c', 'D062A5C6-35F2-452E-B83D-C4E8FF777A33', 5, 'Running', 'Running', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID D062A5C6-35F2-452E-B83D-C4E8FF777A33 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D062A5C6-35F2-452E-B83D-C4E8FF777A33'

/* SQL text to insert entity field value with ID c6c2e7f7-1897-4bbe-b2c3-ebe88a288736 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c6c2e7f7-1897-4bbe-b2c3-ebe88a288736', 'FC22E925-360A-4095-B289-9A8004CE31DA', 1, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 4f22b64b-ae77-4d93-a081-1e281e764334 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4f22b64b-ae77-4d93-a081-1e281e764334', 'FC22E925-360A-4095-B289-9A8004CE31DA', 2, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 3c682a56-0975-45ae-bd3d-d65f51702831 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3c682a56-0975-45ae-bd3d-d65f51702831', 'FC22E925-360A-4095-B289-9A8004CE31DA', 3, 'Success', 'Success', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID FC22E925-360A-4095-B289-9A8004CE31DA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FC22E925-360A-4095-B289-9A8004CE31DA'

/* SQL text to insert entity field value with ID 40d3c94f-05bd-41cc-b384-5c8c11674914 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('40d3c94f-05bd-41cc-b384-5c8c11674914', '749DAD24-9833-4E3D-9B81-85028889B745', 1, 'ArchiveOnly', 'ArchiveOnly', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 363c6e63-63bb-422d-bd01-7b475e203c06 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('363c6e63-63bb-422d-bd01-7b475e203c06', '749DAD24-9833-4E3D-9B81-85028889B745', 2, 'HardDelete', 'HardDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ee28e116-e09a-44d9-a193-3b35704be58c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ee28e116-e09a-44d9-a193-3b35704be58c', '749DAD24-9833-4E3D-9B81-85028889B745', 3, 'SoftDelete', 'SoftDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 5c0ad664-8b35-45d9-b2df-d370ae60ad0d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5c0ad664-8b35-45d9-b2df-d370ae60ad0d', '749DAD24-9833-4E3D-9B81-85028889B745', 4, 'StripFields', 'StripFields', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 749DAD24-9833-4E3D-9B81-85028889B745 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='749DAD24-9833-4E3D-9B81-85028889B745'


/* Create Entity Relationship: MJ: Archive Configurations -> MJ: Archive Configuration Entities (One To Many via ArchiveConfigurationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c9f20ffa-2ae0-4bcb-824d-694c12539611'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c9f20ffa-2ae0-4bcb-824d-694c12539611', '9E9E1E81-4B52-445F-9591-3479855783DF', 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', 'ArchiveConfigurationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Archive Configurations -> MJ: Archive Runs (One To Many via ArchiveConfigurationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bb6bfca8-0c77-4676-81eb-aeb90e3d16a8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bb6bfca8-0c77-4676-81eb-aeb90e3d16a8', '9E9E1E81-4B52-445F-9591-3479855783DF', '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', 'ArchiveConfigurationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entities -> MJ: Archive Configuration Entities (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2bf67f91-0414-4957-b350-ed157b93a280'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2bf67f91-0414-4957-b350-ed157b93a280', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', 'EntityID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Archive Run Details (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b2077234-8c04-4d86-a97a-87ab36a91eb5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b2077234-8c04-4d86-a97a-87ab36a91eb5', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '4DEF6FB6-2A44-46EF-90B9-B91E36084664', 'EntityID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Archive Runs (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3fe5f092-236e-4a60-a699-c58fc3a896a7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3fe5f092-236e-4a60-a699-c58fc3a896a7', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', 'UserID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Archive Configurations (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4f3f16a5-5f37-47cc-b5c8-6f70421ba0b1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4f3f16a5-5f37-47cc-b5c8-6f70421ba0b1', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9E9E1E81-4B52-445F-9591-3479855783DF', 'CreatedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Archive Runs -> MJ: Archive Run Details (One To Many via ArchiveRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'df60e6db-fd01-42df-adea-4d56fbbf2588'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('df60e6db-fd01-42df-adea-4d56fbbf2588', '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', '4DEF6FB6-2A44-46EF-90B9-B91E36084664', 'ArchiveRunID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: File Storage Accounts -> MJ: Archive Configurations (One To Many via StorageAccountID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '555a716f-a9e5-4364-9c42-75052269c486'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('555a716f-a9e5-4364-9c42-75052269c486', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', '9E9E1E81-4B52-445F-9591-3479855783DF', 'StorageAccountID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for ArchiveConfigurationEntity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArchiveConfigurationID in table ArchiveConfigurationEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveConfigurationEntity_ArchiveConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveConfigurationEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveConfigurationEntity_ArchiveConfigurationID ON [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ([ArchiveConfigurationID]);

-- Index for foreign key EntityID in table ArchiveConfigurationEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveConfigurationEntity_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveConfigurationEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveConfigurationEntity_EntityID ON [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID F5674B1D-6882-4273-AF0B-07A584005AF4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F5674B1D-6882-4273-AF0B-07A584005AF4', @RelatedEntityNameFieldMap='ArchiveConfiguration'

/* Index for Foreign Keys for ArchiveConfiguration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key StorageAccountID in table ArchiveConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveConfiguration_StorageAccountID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveConfiguration_StorageAccountID ON [${flyway:defaultSchema}].[ArchiveConfiguration] ([StorageAccountID]);

-- Index for foreign key CreatedByUserID in table ArchiveConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveConfiguration_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveConfiguration_CreatedByUserID ON [${flyway:defaultSchema}].[ArchiveConfiguration] ([CreatedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID BF0F3E17-E5DC-4D99-BF8B-3E1100101A38 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BF0F3E17-E5DC-4D99-BF8B-3E1100101A38', @RelatedEntityNameFieldMap='StorageAccount'

/* Index for Foreign Keys for ArchiveRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArchiveRunID in table ArchiveRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveRunDetail_ArchiveRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveRunDetail_ArchiveRunID ON [${flyway:defaultSchema}].[ArchiveRunDetail] ([ArchiveRunID]);

-- Index for foreign key EntityID in table ArchiveRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveRunDetail_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveRunDetail_EntityID ON [${flyway:defaultSchema}].[ArchiveRunDetail] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 0CB2E616-6085-490F-AE22-C7C56589D34F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0CB2E616-6085-490F-AE22-C7C56589D34F', @RelatedEntityNameFieldMap='Entity'

/* Index for Foreign Keys for ArchiveRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArchiveConfigurationID in table ArchiveRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveRun_ArchiveConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveRun_ArchiveConfigurationID ON [${flyway:defaultSchema}].[ArchiveRun] ([ArchiveConfigurationID]);

-- Index for foreign key UserID in table ArchiveRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveRun_UserID ON [${flyway:defaultSchema}].[ArchiveRun] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID 7EA7BABC-6B90-4C5C-838F-B1BFB983A422 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7EA7BABC-6B90-4C5C-838F-B1BFB983A422', @RelatedEntityNameFieldMap='ArchiveConfiguration'

/* SQL text to update entity field related entity name field map for entity field ID 5515A623-1ADB-4890-A32D-E24D03219525 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5515A623-1ADB-4890-A32D-E24D03219525', @RelatedEntityNameFieldMap='Entity'

/* SQL text to update entity field related entity name field map for entity field ID EFDE0E75-4EA3-4FB6-A402-D87CA08257B2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EFDE0E75-4EA3-4FB6-A402-D87CA08257B2', @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 446C9003-5860-4E71-ABD5-B9BEC5F65000 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='446C9003-5860-4E71-ABD5-B9BEC5F65000', @RelatedEntityNameFieldMap='CreatedByUser'

/* Base View SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: vwArchiveRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Archive Run Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArchiveRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArchiveRunDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArchiveRunDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArchiveRunDetails]
AS
SELECT
    a.*,
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[ArchiveRunDetail] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [a].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: Permissions for vwArchiveRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spCreateArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArchiveRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveRunDetail]
    @ID uniqueidentifier = NULL,
    @ArchiveRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @Status nvarchar(50),
    @StoragePath nvarchar(1000),
    @BytesArchived bigint = NULL,
    @ErrorMessage nvarchar(MAX),
    @ArchivedAt datetimeoffset,
    @VersionStamp datetimeoffset,
    @IsRecordChangeArchive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArchiveRunDetail]
            (
                [ID],
                [ArchiveRunID],
                [EntityID],
                [RecordID],
                [Status],
                [StoragePath],
                [BytesArchived],
                [ErrorMessage],
                [ArchivedAt],
                [VersionStamp],
                [IsRecordChangeArchive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArchiveRunID,
                @EntityID,
                @RecordID,
                @Status,
                @StoragePath,
                ISNULL(@BytesArchived, 0),
                @ErrorMessage,
                @ArchivedAt,
                @VersionStamp,
                ISNULL(@IsRecordChangeArchive, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArchiveRunDetail]
            (
                [ArchiveRunID],
                [EntityID],
                [RecordID],
                [Status],
                [StoragePath],
                [BytesArchived],
                [ErrorMessage],
                [ArchivedAt],
                [VersionStamp],
                [IsRecordChangeArchive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArchiveRunID,
                @EntityID,
                @RecordID,
                @Status,
                @StoragePath,
                ISNULL(@BytesArchived, 0),
                @ErrorMessage,
                @ArchivedAt,
                @VersionStamp,
                ISNULL(@IsRecordChangeArchive, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArchiveRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Archive Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spUpdateArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArchiveRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveRunDetail]
    @ID uniqueidentifier,
    @ArchiveRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @Status nvarchar(50),
    @StoragePath nvarchar(1000),
    @BytesArchived bigint,
    @ErrorMessage nvarchar(MAX),
    @ArchivedAt datetimeoffset,
    @VersionStamp datetimeoffset,
    @IsRecordChangeArchive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveRunDetail]
    SET
        [ArchiveRunID] = @ArchiveRunID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [Status] = @Status,
        [StoragePath] = @StoragePath,
        [BytesArchived] = @BytesArchived,
        [ErrorMessage] = @ErrorMessage,
        [ArchivedAt] = @ArchivedAt,
        [VersionStamp] = @VersionStamp,
        [IsRecordChangeArchive] = @IsRecordChangeArchive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArchiveRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArchiveRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArchiveRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArchiveRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArchiveRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArchiveRunDetail
ON [${flyway:defaultSchema}].[ArchiveRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArchiveRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Archive Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spDeleteArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArchiveRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArchiveRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveRunDetail] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Archive Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveRunDetail] TO [cdp_Integration]



/* Base View SQL for MJ: Archive Configuration Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: vwArchiveConfigurationEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Archive Configuration Entities
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArchiveConfigurationEntity
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArchiveConfigurationEntities]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArchiveConfigurationEntities];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArchiveConfigurationEntities]
AS
SELECT
    a.*,
    MJArchiveConfiguration_ArchiveConfigurationID.[Name] AS [ArchiveConfiguration],
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[ArchiveConfigurationEntity] AS a
INNER JOIN
    [${flyway:defaultSchema}].[ArchiveConfiguration] AS MJArchiveConfiguration_ArchiveConfigurationID
  ON
    [a].[ArchiveConfigurationID] = MJArchiveConfiguration_ArchiveConfigurationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [a].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveConfigurationEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Archive Configuration Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: Permissions for vwArchiveConfigurationEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveConfigurationEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Archive Configuration Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: spCreateArchiveConfigurationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveConfigurationEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArchiveConfigurationEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveConfigurationEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveConfigurationEntity]
    @ID uniqueidentifier = NULL,
    @ArchiveConfigurationID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Mode nvarchar(20),
    @RetentionDays int,
    @DateField nvarchar(100) = NULL,
    @FilterExpression nvarchar(MAX),
    @BatchSize int,
    @Priority int = NULL,
    @FieldConfiguration nvarchar(MAX),
    @DriverClass nvarchar(500),
    @ArchiveRelatedRecordChanges bit,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
            (
                [ID],
                [ArchiveConfigurationID],
                [EntityID],
                [Mode],
                [RetentionDays],
                [DateField],
                [FilterExpression],
                [BatchSize],
                [Priority],
                [FieldConfiguration],
                [DriverClass],
                [ArchiveRelatedRecordChanges],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArchiveConfigurationID,
                @EntityID,
                @Mode,
                @RetentionDays,
                ISNULL(@DateField, '__mj_CreatedAt'),
                @FilterExpression,
                @BatchSize,
                ISNULL(@Priority, 100),
                @FieldConfiguration,
                @DriverClass,
                @ArchiveRelatedRecordChanges,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
            (
                [ArchiveConfigurationID],
                [EntityID],
                [Mode],
                [RetentionDays],
                [DateField],
                [FilterExpression],
                [BatchSize],
                [Priority],
                [FieldConfiguration],
                [DriverClass],
                [ArchiveRelatedRecordChanges],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArchiveConfigurationID,
                @EntityID,
                @Mode,
                @RetentionDays,
                ISNULL(@DateField, '__mj_CreatedAt'),
                @FilterExpression,
                @BatchSize,
                ISNULL(@Priority, 100),
                @FieldConfiguration,
                @DriverClass,
                @ArchiveRelatedRecordChanges,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArchiveConfigurationEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveConfigurationEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Archive Configuration Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveConfigurationEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Archive Configuration Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: spUpdateArchiveConfigurationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveConfigurationEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArchiveConfigurationEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveConfigurationEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveConfigurationEntity]
    @ID uniqueidentifier,
    @ArchiveConfigurationID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Mode nvarchar(20),
    @RetentionDays int,
    @DateField nvarchar(100),
    @FilterExpression nvarchar(MAX),
    @BatchSize int,
    @Priority int,
    @FieldConfiguration nvarchar(MAX),
    @DriverClass nvarchar(500),
    @ArchiveRelatedRecordChanges bit,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
    SET
        [ArchiveConfigurationID] = @ArchiveConfigurationID,
        [EntityID] = @EntityID,
        [Mode] = @Mode,
        [RetentionDays] = @RetentionDays,
        [DateField] = @DateField,
        [FilterExpression] = @FilterExpression,
        [BatchSize] = @BatchSize,
        [Priority] = @Priority,
        [FieldConfiguration] = @FieldConfiguration,
        [DriverClass] = @DriverClass,
        [ArchiveRelatedRecordChanges] = @ArchiveRelatedRecordChanges,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArchiveConfigurationEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArchiveConfigurationEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveConfigurationEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArchiveConfigurationEntity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArchiveConfigurationEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArchiveConfigurationEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArchiveConfigurationEntity
ON [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArchiveConfigurationEntity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Archive Configuration Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveConfigurationEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Archive Configuration Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: spDeleteArchiveConfigurationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveConfigurationEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArchiveConfigurationEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveConfigurationEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveConfigurationEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArchiveConfigurationEntity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveConfigurationEntity] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Archive Configuration Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveConfigurationEntity] TO [cdp_Integration]



/* Base View SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: vwArchiveConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Archive Configurations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArchiveConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArchiveConfigurations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArchiveConfigurations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArchiveConfigurations]
AS
SELECT
    a.*,
    MJFileStorageAccount_StorageAccountID.[Name] AS [StorageAccount],
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser]
FROM
    [${flyway:defaultSchema}].[ArchiveConfiguration] AS a
INNER JOIN
    [${flyway:defaultSchema}].[FileStorageAccount] AS MJFileStorageAccount_StorageAccountID
  ON
    [a].[StorageAccountID] = MJFileStorageAccount_StorageAccountID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [a].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: Permissions for vwArchiveConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: spCreateArchiveConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArchiveConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveConfiguration]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @StorageAccountID uniqueidentifier,
    @RootPath nvarchar(500),
    @ArchiveFormat nvarchar(20) = NULL,
    @IsActive bit = NULL,
    @DefaultRetentionDays int = NULL,
    @DefaultMode nvarchar(20) = NULL,
    @DefaultBatchSize int = NULL,
    @ArchiveRelatedRecordChanges bit = NULL,
    @Status nvarchar(20) = NULL,
    @CreatedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
            (
                [ID],
                [Name],
                [Description],
                [StorageAccountID],
                [RootPath],
                [ArchiveFormat],
                [IsActive],
                [DefaultRetentionDays],
                [DefaultMode],
                [DefaultBatchSize],
                [ArchiveRelatedRecordChanges],
                [Status],
                [CreatedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @StorageAccountID,
                @RootPath,
                ISNULL(@ArchiveFormat, 'JSON'),
                ISNULL(@IsActive, 0),
                ISNULL(@DefaultRetentionDays, 365),
                ISNULL(@DefaultMode, 'StripFields'),
                ISNULL(@DefaultBatchSize, 100),
                ISNULL(@ArchiveRelatedRecordChanges, 1),
                ISNULL(@Status, 'Idle'),
                @CreatedByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
            (
                [Name],
                [Description],
                [StorageAccountID],
                [RootPath],
                [ArchiveFormat],
                [IsActive],
                [DefaultRetentionDays],
                [DefaultMode],
                [DefaultBatchSize],
                [ArchiveRelatedRecordChanges],
                [Status],
                [CreatedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @StorageAccountID,
                @RootPath,
                ISNULL(@ArchiveFormat, 'JSON'),
                ISNULL(@IsActive, 0),
                ISNULL(@DefaultRetentionDays, 365),
                ISNULL(@DefaultMode, 'StripFields'),
                ISNULL(@DefaultBatchSize, 100),
                ISNULL(@ArchiveRelatedRecordChanges, 1),
                ISNULL(@Status, 'Idle'),
                @CreatedByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArchiveConfigurations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveConfiguration] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Archive Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: spUpdateArchiveConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArchiveConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveConfiguration]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @StorageAccountID uniqueidentifier,
    @RootPath nvarchar(500),
    @ArchiveFormat nvarchar(20),
    @IsActive bit,
    @DefaultRetentionDays int,
    @DefaultMode nvarchar(20),
    @DefaultBatchSize int,
    @ArchiveRelatedRecordChanges bit,
    @Status nvarchar(20),
    @CreatedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveConfiguration]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [StorageAccountID] = @StorageAccountID,
        [RootPath] = @RootPath,
        [ArchiveFormat] = @ArchiveFormat,
        [IsActive] = @IsActive,
        [DefaultRetentionDays] = @DefaultRetentionDays,
        [DefaultMode] = @DefaultMode,
        [DefaultBatchSize] = @DefaultBatchSize,
        [ArchiveRelatedRecordChanges] = @ArchiveRelatedRecordChanges,
        [Status] = @Status,
        [CreatedByUserID] = @CreatedByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArchiveConfigurations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArchiveConfigurations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveConfiguration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArchiveConfiguration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArchiveConfiguration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArchiveConfiguration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArchiveConfiguration
ON [${flyway:defaultSchema}].[ArchiveConfiguration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveConfiguration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArchiveConfiguration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Archive Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: spDeleteArchiveConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArchiveConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveConfiguration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArchiveConfiguration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveConfiguration] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Archive Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveConfiguration] TO [cdp_Integration]



/* Base View SQL for MJ: Archive Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: vwArchiveRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Archive Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArchiveRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArchiveRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArchiveRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArchiveRuns]
AS
SELECT
    a.*,
    MJArchiveConfiguration_ArchiveConfigurationID.[Name] AS [ArchiveConfiguration],
    MJUser_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[ArchiveRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[ArchiveConfiguration] AS MJArchiveConfiguration_ArchiveConfigurationID
  ON
    [a].[ArchiveConfigurationID] = MJArchiveConfiguration_ArchiveConfigurationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Archive Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: Permissions for vwArchiveRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Archive Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: spCreateArchiveRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArchiveRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveRun]
    @ID uniqueidentifier = NULL,
    @ArchiveConfigurationID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt datetimeoffset,
    @Status nvarchar(50) = NULL,
    @TotalRecords int = NULL,
    @ArchivedRecords int = NULL,
    @FailedRecords int = NULL,
    @SkippedRecords int = NULL,
    @TotalBytesArchived bigint = NULL,
    @ErrorLog nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArchiveRun]
            (
                [ID],
                [ArchiveConfigurationID],
                [StartedAt],
                [CompletedAt],
                [Status],
                [TotalRecords],
                [ArchivedRecords],
                [FailedRecords],
                [SkippedRecords],
                [TotalBytesArchived],
                [ErrorLog],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArchiveConfigurationID,
                ISNULL(@StartedAt, getutcdate()),
                @CompletedAt,
                ISNULL(@Status, 'Running'),
                ISNULL(@TotalRecords, 0),
                ISNULL(@ArchivedRecords, 0),
                ISNULL(@FailedRecords, 0),
                ISNULL(@SkippedRecords, 0),
                ISNULL(@TotalBytesArchived, 0),
                @ErrorLog,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArchiveRun]
            (
                [ArchiveConfigurationID],
                [StartedAt],
                [CompletedAt],
                [Status],
                [TotalRecords],
                [ArchivedRecords],
                [FailedRecords],
                [SkippedRecords],
                [TotalBytesArchived],
                [ErrorLog],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArchiveConfigurationID,
                ISNULL(@StartedAt, getutcdate()),
                @CompletedAt,
                ISNULL(@Status, 'Running'),
                ISNULL(@TotalRecords, 0),
                ISNULL(@ArchivedRecords, 0),
                ISNULL(@FailedRecords, 0),
                ISNULL(@SkippedRecords, 0),
                ISNULL(@TotalBytesArchived, 0),
                @ErrorLog,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArchiveRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Archive Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Archive Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: spUpdateArchiveRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArchiveRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveRun]
    @ID uniqueidentifier,
    @ArchiveConfigurationID uniqueidentifier,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Status nvarchar(50),
    @TotalRecords int,
    @ArchivedRecords int,
    @FailedRecords int,
    @SkippedRecords int,
    @TotalBytesArchived bigint,
    @ErrorLog nvarchar(MAX),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveRun]
    SET
        [ArchiveConfigurationID] = @ArchiveConfigurationID,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [Status] = @Status,
        [TotalRecords] = @TotalRecords,
        [ArchivedRecords] = @ArchivedRecords,
        [FailedRecords] = @FailedRecords,
        [SkippedRecords] = @SkippedRecords,
        [TotalBytesArchived] = @TotalBytesArchived,
        [ErrorLog] = @ErrorLog,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArchiveRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArchiveRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArchiveRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArchiveRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArchiveRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArchiveRun
ON [${flyway:defaultSchema}].[ArchiveRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArchiveRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Archive Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Archive Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: spDeleteArchiveRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArchiveRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArchiveRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Archive Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveRun] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '426a151d-1276-491a-adcf-1b2be2d3cb94' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'StorageAccount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '426a151d-1276-491a-adcf-1b2be2d3cb94',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100031,
            'StorageAccount',
            'Storage Account',
            NULL,
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e3c9228-26f7-4422-8ebe-8e57c40f00f1' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'CreatedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '4e3c9228-26f7-4422-8ebe-8e57c40f00f1',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100032,
            'CreatedByUser',
            'Created By User',
            NULL,
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f7ca545-f688-4822-905f-86462cf4b288' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'ArchiveConfiguration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5f7ca545-f688-4822-905f-86462cf4b288',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100029,
            'ArchiveConfiguration',
            'Archive Configuration',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd2fe9ff9-c0af-4f54-9b80-fccc0cf16533' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd2fe9ff9-c0af-4f54-9b80-fccc0cf16533',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100030,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82892893-2e4f-4742-aedb-dc09eb9d1240' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '82892893-2e4f-4742-aedb-dc09eb9d1240',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100027,
            'Entity',
            'Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b7c41f22-c503-49cc-a8f0-c813ebd91a8c' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'ArchiveConfiguration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b7c41f22-c503-49cc-a8f0-c813ebd91a8c',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100031,
            'ArchiveConfiguration',
            'Archive Configuration',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '33c63030-df9b-4781-809f-7384d42e9b49' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '33c63030-df9b-4781-809f-7384d42e9b49',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100032,
            'Entity',
            'Entity',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9AE97952-77C7-4AB9-8FF1-0FB92F12C8BD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6F9E330D-D751-4B1A-83AE-3085090A2E1E'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F51053FA-7217-43E6-843E-96359F563416'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '426A151D-1276-491A-ADCF-1B2BE2D3CB94'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '87277D15-E523-4BD3-8B1D-4DCBC20E0F0C'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'C18C6F2A-E4B3-4721-A9A9-1345C649E258'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'F51053FA-7217-43E6-843E-96359F563416'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '426A151D-1276-491A-ADCF-1B2BE2D3CB94'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = '33C63030-DF9B-4781-809F-7384D42E9B49'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '749DAD24-9833-4E3D-9B81-85028889B745'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8EFFE3F6-D215-4B59-8472-83EED81A2502'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '20DB8628-2E83-44DF-AF79-55D808D96CD9'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B3088C57-0DA8-4FFC-8928-DC96D9BFA087'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B7C41F22-C503-49CC-A8F0-C813EBD91A8C'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '33C63030-DF9B-4781-809F-7384D42E9B49'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '749DAD24-9833-4E3D-9B81-85028889B745'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '82AD26D7-A063-4B22-B509-50CEB5A223A8'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '6AFB38A6-2320-496B-B4B5-0CB48109B1A7'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B7C41F22-C503-49CC-A8F0-C813EBD91A8C'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '33C63030-DF9B-4781-809F-7384D42E9B49'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = '5F7CA545-F688-4822-905F-86462CF4B288'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '07240BD8-2D9E-4D38-B3E8-F940AEA886BF'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D062A5C6-35F2-452E-B83D-C4E8FF777A33'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2F6B7430-355B-4154-BDD3-1289942E49E8'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5F7CA545-F688-4822-905F-86462CF4B288'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D2FE9FF9-C0AF-4F54-9B80-FCCC0CF16533'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'D062A5C6-35F2-452E-B83D-C4E8FF777A33'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '5F7CA545-F688-4822-905F-86462CF4B288'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'D2FE9FF9-C0AF-4F54-9B80-FCCC0CF16533'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = 'AA055A56-CB10-4A80-BE31-1F42E675AECB'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AA055A56-CB10-4A80-BE31-1F42E675AECB'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FC22E925-360A-4095-B289-9A8004CE31DA'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1C8742FA-BB77-4093-99D9-5A5814F1E169'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B2931A97-5AE7-4542-806E-3C1607CF4E72'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '82892893-2E4F-4742-AEDB-DC09EB9D1240'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'AA055A56-CB10-4A80-BE31-1F42E675AECB'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'FC22E925-360A-4095-B289-9A8004CE31DA'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'C13608CA-C298-4D47-80C4-EACE68DADB9A'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '5D8DDD06-5AF5-43F2-B4E3-6406E8AD040C'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '82892893-2E4F-4742-AEDB-DC09EB9D1240'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC9A2DCF-B298-4EE9-B616-047F9E62771F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ArchiveRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A864E10-5052-4BAC-AA5F-D3F25AA277D1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CB2E616-6085-490F-AE22-C7C56589D34F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82892893-2E4F-4742-AEDB-DC09EB9D1240' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA055A56-CB10-4A80-BE31-1F42E675AECB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.IsRecordChangeArchive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8BF622B-1243-48CF-B30C-E686A10E6D85' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archival Outcome',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FC22E925-360A-4095-B289-9A8004CE31DA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ArchivedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archival Outcome',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B2931A97-5AE7-4542-806E-3C1607CF4E72' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archival Outcome',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D8DDD06-5AF5-43F2-B4E3-6406E8AD040C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.StoragePath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C13608CA-C298-4D47-80C4-EACE68DADB9A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.BytesArchived 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C8742FA-BB77-4093-99D9-5A5814F1E169' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.VersionStamp 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E187943C-2F11-4E8D-9C7B-0D608BFD3B17' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E984C3F9-9366-4014-B7E0-AD561473475B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9633F313-2408-4004-8D19-8BB15C975813' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-file-archive */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-file-archive', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('22d6f466-7cb2-48a8-a26b-53f80058a0a5', '4DEF6FB6-2A44-46EF-90B9-B91E36084664', 'FieldCategoryInfo', '{"Record Context":{"icon":"fa fa-info-circle","description":"Details identifying the specific record, entity type, and parent archive run."},"Archival Outcome":{"icon":"fa fa-check-circle","description":"The result of the archival process including success status, timestamps, and error logs."},"Storage Details":{"icon":"fa fa-hdd","description":"Information regarding the physical storage location, data size, and versioning."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('86795be4-0d43-41f3-8899-aeaf342b008f', '4DEF6FB6-2A44-46EF-90B9-B91E36084664', 'FieldCategoryIcons', '{"Record Context":"fa fa-info-circle","Archival Outcome":"fa fa-check-circle","Storage Details":"fa fa-hdd","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664'
      

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Archive Configurations.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8BD68D78-72A4-4561-BF80-81C11C4451D4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '87277D15-E523-4BD3-8B1D-4DCBC20E0F0C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9AE97952-77C7-4AB9-8FF1-0FB92F12C8BD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F51053FA-7217-43E6-843E-96359F563416' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.StorageAccountID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Account',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BF0F3E17-E5DC-4D99-BF8B-3E1100101A38' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.StorageAccount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Account Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '426A151D-1276-491A-ADCF-1B2BE2D3CB94' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.RootPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C18C6F2A-E4B3-4721-A9A9-1345C649E258' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.ArchiveFormat 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.DefaultRetentionDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archiving Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Retention (Days)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AB54AB4D-D92B-4489-B271-E483B321D932' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.DefaultMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archiving Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Archive Mode',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6F9E330D-D751-4B1A-83AE-3085090A2E1E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.DefaultBatchSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archiving Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A7AA95C-5BE4-487E-9BA8-2A575FFA4595' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.ArchiveRelatedRecordChanges 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archiving Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Related Changes',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE733A09-AAD4-4888-A0DD-FCE4B30FECAD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A75F0D9A-17EA-4188-A8A1-9FDFDF874DBD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.CreatedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Created By User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '446C9003-5860-4E71-ABD5-B9BEC5F65000' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.CreatedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Created By Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4E3C9228-26F7-4422-8EBE-8E57C40F00F1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '83F0EE5D-0A8F-4C9A-AB68-C057549E0DD0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '454489C1-2B61-462E-878A-617E08BD354D' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-archive */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-archive', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '9E9E1E81-4B52-445F-9591-3479855783DF'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b4ca0b0c-de7a-4314-b453-6906f069eef6', '9E9E1E81-4B52-445F-9591-3479855783DF', 'FieldCategoryInfo', '{"Configuration Details":{"icon":"fa fa-info-circle","description":"Basic identity and operational state of the archive configuration"},"Storage Settings":{"icon":"fa fa-hdd","description":"Destination details for where archived data is stored and in what format"},"Archiving Rules":{"icon":"fa fa-clipboard-check","description":"Operational parameters and logic for how records are processed during archiving"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3d70d042-8d5f-40e0-8aa2-40e87493399d', '9E9E1E81-4B52-445F-9591-3479855783DF', 'FieldCategoryIcons', '{"Configuration Details":"fa fa-info-circle","Storage Settings":"fa fa-hdd","Archiving Rules":"fa fa-clipboard-check","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF'
      

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.ArchiveConfigurationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Configuration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5674B1D-6882-4273-AF0B-07A584005AF4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5515A623-1ADB-4890-A32D-E24D03219525' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.ArchiveConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Configuration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B7C41F22-C503-49CC-A8F0-C813EBD91A8C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '33C63030-DF9B-4781-809F-7384D42E9B49' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3088C57-0DA8-4FFC-8928-DC96D9BFA087' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.Mode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archiving Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Mode',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '749DAD24-9833-4E3D-9B81-85028889B745' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.RetentionDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archiving Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8EFFE3F6-D215-4B59-8472-83EED81A2502' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.DateField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archiving Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'Retention Date Field',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82AD26D7-A063-4B22-B509-50CEB5A223A8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.FilterExpression 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archiving Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '66D1FB7C-9677-4F11-A459-E3C6352CFD00' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.ArchiveRelatedRecordChanges 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archiving Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FA6E22EE-9FEF-4C6C-A886-23C94C376B70' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.BatchSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing and Output',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8582E389-F45B-42EF-BA2D-4D16E524882E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing and Output',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '20DB8628-2E83-44DF-AF79-55D808D96CD9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.FieldConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing and Output',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'BDCD5A93-6608-4B8D-B689-646A37CE67EC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing and Output',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6AFB38A6-2320-496B-B4B5-0CB48109B1A7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FF96817-0BBA-4634-A94C-93776939FCD8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7BC9B9F8-1535-4CF8-98C8-7E84AEB926CD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A8F9F64-0122-4EDB-B079-2FBCF1DC90E0' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-archive */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-archive', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('598000e1-443b-4394-b0f9-4f5289539975', 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', 'FieldCategoryInfo', '{"Archive Identity":{"icon":"fa fa-link","description":"Core identification and status settings linking this configuration to a specific entity."},"Archiving Rules":{"icon":"fa fa-filter","description":"Parameters defining which records are eligible for archiving and how long they should be retained."},"Processing and Output":{"icon":"fa fa-cogs","description":"Technical execution settings including batch sizes, custom drivers, and field-level output configuration."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('9c52560b-7cf4-4016-9687-6bf4bbdf2781', 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', 'FieldCategoryIcons', '{"Archive Identity":"fa fa-link","Archiving Rules":"fa fa-filter","Processing and Output":"fa fa-cogs","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C'
      

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Archive Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Run ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BD7C59A7-A560-47AC-AF25-7FCEBFC5EE24' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.ArchiveConfigurationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Configuration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7EA7BABC-6B90-4C5C-838F-B1BFB983A422' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.ArchiveConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Configuration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F7CA545-F688-4822-905F-86462CF4B288' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EFDE0E75-4EA3-4FB6-A402-D87CA08257B2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D2FE9FF9-C0AF-4F54-9B80-FCCC0CF16533' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D062A5C6-35F2-452E-B83D-C4E8FF777A33' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07240BD8-2D9E-4D38-B3E8-F940AEA886BF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '70444110-7CC3-4001-8154-856842E2DEA5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.TotalRecords 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Statistics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3EAD2440-832E-408F-91E4-A61DBCDDB6AC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.ArchivedRecords 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Statistics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F6B7430-355B-4154-BDD3-1289942E49E8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.FailedRecords 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Statistics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C57AD1DB-E640-42E2-8346-E9205AA8293A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.SkippedRecords 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Statistics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '653FB4E4-1EA8-4A4E-8073-C6CEBF833D88' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.TotalBytesArchived 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Statistics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '177F25EA-A811-4A0D-AB97-F81B00B7FF30' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.ErrorLog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Error Diagnostics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6FA96F8A-A6A7-4581-93AE-38935B63B2D8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C1EB91A-9BA5-4788-BCC9-328A3D81924A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B7E5865-9E44-405C-9EF2-882090ED8759' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-history */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-history', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0d64a66a-3bea-4f2f-ae32-82cbf94e5b39', '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', 'FieldCategoryInfo', '{"Execution Details":{"icon":"fa fa-play-circle","description":"Core information regarding the archive run''s configuration, initiator, and timing."},"Archive Statistics":{"icon":"fa fa-poll","description":"Quantitative metrics detailing the number of records processed and data volume archived."},"Error Diagnostics":{"icon":"fa fa-exclamation-circle","description":"Detailed error logs and troubleshooting information for failed or partial archive runs."},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps for the archive run record."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ca7bd360-2ea1-44fb-9e9c-039e9e13fb3e', '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', 'FieldCategoryIcons', '{"Execution Details":"fa fa-play-circle","Archive Statistics":"fa fa-poll","Error Diagnostics":"fa fa-exclamation-circle","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE'
      




-- ============================================================================
-- CodeGen Output (2026-04-06): Updated view with LEFT OUTER JOIN for nullable
-- StorageAccountID, updated spCreate with nullable StorageAccountID parameter
-- ============================================================================


/* SQL text to update entity field related entity name field map for entity field ID 3A864E10-5052-4BAC-AA5F-D3F25AA277D1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3A864E10-5052-4BAC-AA5F-D3F25AA277D1', @RelatedEntityNameFieldMap='ArchiveRun'

/* Base View SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: vwArchiveConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Archive Configurations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArchiveConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArchiveConfigurations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArchiveConfigurations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArchiveConfigurations]
AS
SELECT
    a.*,
    MJFileStorageAccount_StorageAccountID.[Name] AS [StorageAccount],
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser]
FROM
    [${flyway:defaultSchema}].[ArchiveConfiguration] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageAccount] AS MJFileStorageAccount_StorageAccountID
  ON
    [a].[StorageAccountID] = MJFileStorageAccount_StorageAccountID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [a].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: Permissions for vwArchiveConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: spCreateArchiveConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArchiveConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveConfiguration]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @StorageAccountID uniqueidentifier,
    @RootPath nvarchar(500),
    @ArchiveFormat nvarchar(20) = NULL,
    @IsActive bit = NULL,
    @DefaultRetentionDays int = NULL,
    @DefaultMode nvarchar(20) = NULL,
    @DefaultBatchSize int = NULL,
    @ArchiveRelatedRecordChanges bit = NULL,
    @Status nvarchar(20) = NULL,
    @CreatedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
            (
                [ID],
                [Name],
                [Description],
                [StorageAccountID],
                [RootPath],
                [ArchiveFormat],
                [IsActive],
                [DefaultRetentionDays],
                [DefaultMode],
                [DefaultBatchSize],
                [ArchiveRelatedRecordChanges],
                [Status],
                [CreatedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @StorageAccountID,
                @RootPath,
                ISNULL(@ArchiveFormat, 'JSON'),
                ISNULL(@IsActive, 0),
                ISNULL(@DefaultRetentionDays, 365),
                ISNULL(@DefaultMode, 'StripFields'),
                ISNULL(@DefaultBatchSize, 100),
                ISNULL(@ArchiveRelatedRecordChanges, 1),
                ISNULL(@Status, 'Idle'),
                @CreatedByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
            (
                [Name],
                [Description],
                [StorageAccountID],
                [RootPath],
                [ArchiveFormat],
                [IsActive],
                [DefaultRetentionDays],
                [DefaultMode],
                [DefaultBatchSize],
                [ArchiveRelatedRecordChanges],
                [Status],
                [CreatedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @StorageAccountID,
                @RootPath,
                ISNULL(@ArchiveFormat, 'JSON'),
                ISNULL(@IsActive, 0),
                ISNULL(@DefaultRetentionDays, 365),
                ISNULL(@DefaultMode, 'StripFields'),
                ISNULL(@DefaultBatchSize, 100),
                ISNULL(@ArchiveRelatedRecordChanges, 1),
                ISNULL(@Status, 'Idle'),
                @CreatedByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArchiveConfigurations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveConfiguration] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Archive Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: spUpdateArchiveConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArchiveConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveConfiguration]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @StorageAccountID uniqueidentifier,
    @RootPath nvarchar(500),
    @ArchiveFormat nvarchar(20),
    @IsActive bit,
    @DefaultRetentionDays int,
    @DefaultMode nvarchar(20),
    @DefaultBatchSize int,
    @ArchiveRelatedRecordChanges bit,
    @Status nvarchar(20),
    @CreatedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveConfiguration]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [StorageAccountID] = @StorageAccountID,
        [RootPath] = @RootPath,
        [ArchiveFormat] = @ArchiveFormat,
        [IsActive] = @IsActive,
        [DefaultRetentionDays] = @DefaultRetentionDays,
        [DefaultMode] = @DefaultMode,
        [DefaultBatchSize] = @DefaultBatchSize,
        [ArchiveRelatedRecordChanges] = @ArchiveRelatedRecordChanges,
        [Status] = @Status,
        [CreatedByUserID] = @CreatedByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArchiveConfigurations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArchiveConfigurations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveConfiguration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArchiveConfiguration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArchiveConfiguration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArchiveConfiguration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArchiveConfiguration
ON [${flyway:defaultSchema}].[ArchiveConfiguration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveConfiguration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArchiveConfiguration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Archive Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: spDeleteArchiveConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArchiveConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveConfiguration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArchiveConfiguration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveConfiguration] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Archive Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveConfiguration] TO [cdp_Integration]



/* Base View SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: vwArchiveRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Archive Run Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArchiveRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArchiveRunDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArchiveRunDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArchiveRunDetails]
AS
SELECT
    a.*,
    MJArchiveRun_ArchiveRunID.[ArchiveConfiguration] AS [ArchiveRun],
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[ArchiveRunDetail] AS a
INNER JOIN
    [${flyway:defaultSchema}].[vwArchiveRuns] AS MJArchiveRun_ArchiveRunID
  ON
    [a].[ArchiveRunID] = MJArchiveRun_ArchiveRunID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [a].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: Permissions for vwArchiveRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spCreateArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArchiveRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveRunDetail]
    @ID uniqueidentifier = NULL,
    @ArchiveRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @Status nvarchar(50),
    @StoragePath nvarchar(1000),
    @BytesArchived bigint = NULL,
    @ErrorMessage nvarchar(MAX),
    @ArchivedAt datetimeoffset,
    @VersionStamp datetimeoffset,
    @IsRecordChangeArchive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArchiveRunDetail]
            (
                [ID],
                [ArchiveRunID],
                [EntityID],
                [RecordID],
                [Status],
                [StoragePath],
                [BytesArchived],
                [ErrorMessage],
                [ArchivedAt],
                [VersionStamp],
                [IsRecordChangeArchive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArchiveRunID,
                @EntityID,
                @RecordID,
                @Status,
                @StoragePath,
                ISNULL(@BytesArchived, 0),
                @ErrorMessage,
                @ArchivedAt,
                @VersionStamp,
                ISNULL(@IsRecordChangeArchive, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArchiveRunDetail]
            (
                [ArchiveRunID],
                [EntityID],
                [RecordID],
                [Status],
                [StoragePath],
                [BytesArchived],
                [ErrorMessage],
                [ArchivedAt],
                [VersionStamp],
                [IsRecordChangeArchive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArchiveRunID,
                @EntityID,
                @RecordID,
                @Status,
                @StoragePath,
                ISNULL(@BytesArchived, 0),
                @ErrorMessage,
                @ArchivedAt,
                @VersionStamp,
                ISNULL(@IsRecordChangeArchive, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArchiveRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Archive Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spUpdateArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArchiveRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveRunDetail]
    @ID uniqueidentifier,
    @ArchiveRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @Status nvarchar(50),
    @StoragePath nvarchar(1000),
    @BytesArchived bigint,
    @ErrorMessage nvarchar(MAX),
    @ArchivedAt datetimeoffset,
    @VersionStamp datetimeoffset,
    @IsRecordChangeArchive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveRunDetail]
    SET
        [ArchiveRunID] = @ArchiveRunID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [Status] = @Status,
        [StoragePath] = @StoragePath,
        [BytesArchived] = @BytesArchived,
        [ErrorMessage] = @ErrorMessage,
        [ArchivedAt] = @ArchivedAt,
        [VersionStamp] = @VersionStamp,
        [IsRecordChangeArchive] = @IsRecordChangeArchive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArchiveRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArchiveRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArchiveRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArchiveRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArchiveRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArchiveRunDetail
ON [${flyway:defaultSchema}].[ArchiveRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArchiveRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Archive Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spDeleteArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArchiveRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArchiveRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveRunDetail] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Archive Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveRunDetail] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f30a83e5-42d7-4b62-bd59-e51969646707' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'ArchiveRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'f30a83e5-42d7-4b62-bd59-e51969646707',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100028,
            'ArchiveRun',
            'Archive Run',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F30A83E5-42D7-4B62-BD59-E51969646707'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'F30A83E5-42D7-4B62-BD59-E51969646707'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC9A2DCF-B298-4EE9-B616-047F9E62771F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E984C3F9-9366-4014-B7E0-AD561473475B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9633F313-2408-4004-8D19-8BB15C975813' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ArchiveRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A864E10-5052-4BAC-AA5F-D3F25AA277D1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ArchiveRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F30A83E5-42D7-4B62-BD59-E51969646707' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CB2E616-6085-490F-AE22-C7C56589D34F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82892893-2E4F-4742-AEDB-DC09EB9D1240' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA055A56-CB10-4A80-BE31-1F42E675AECB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.IsRecordChangeArchive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8BF622B-1243-48CF-B30C-E686A10E6D85' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FC22E925-360A-4095-B289-9A8004CE31DA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ArchivedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B2931A97-5AE7-4542-806E-3C1607CF4E72' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D8DDD06-5AF5-43F2-B4E3-6406E8AD040C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.StoragePath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C13608CA-C298-4D47-80C4-EACE68DADB9A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.BytesArchived 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C8742FA-BB77-4093-99D9-5A5814F1E169' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.VersionStamp 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E187943C-2F11-4E8D-9C7B-0D608BFD3B17' AND AutoUpdateCategory = 1

