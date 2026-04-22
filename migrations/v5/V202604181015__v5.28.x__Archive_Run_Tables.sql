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

