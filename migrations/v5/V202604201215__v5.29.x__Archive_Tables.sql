-- Migration: Create Archive Tables
-- Description: Introduces the four archive tables for the MemberJunction Archiving Engine:
--   1. ArchiveConfiguration — top-level pipeline config (storage, retention, mode)
--   2. ArchiveConfigurationEntity — per-entity overrides within a configuration
--   3. ArchiveRun — tracks each archive execution
--   4. ArchiveRunDetail — per-record outcome for each run

-- ============================================================================
-- Table 1: ArchiveConfiguration
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.ArchiveConfiguration (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    StorageAccountID UNIQUEIDENTIFIER NULL,
    RootPath NVARCHAR(500) NOT NULL,
    ArchiveFormat NVARCHAR(20) NOT NULL DEFAULT 'JSON',
    IsActive BIT NOT NULL DEFAULT 0,
    DefaultRetentionDays INT NOT NULL DEFAULT 365,
    DefaultMode NVARCHAR(20) NOT NULL DEFAULT 'StripFields',
    DefaultBatchSize INT NOT NULL DEFAULT 100,
    ArchiveRelatedRecordChanges BIT NOT NULL DEFAULT 1,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Idle',
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_ArchiveConfiguration PRIMARY KEY (ID),
    CONSTRAINT FK_ArchiveConfiguration_StorageAccount FOREIGN KEY (StorageAccountID)
        REFERENCES ${flyway:defaultSchema}.FileStorageAccount(ID),
    CONSTRAINT FK_ArchiveConfiguration_CreatedByUser FOREIGN KEY (CreatedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_ArchiveConfiguration_ArchiveFormat
        CHECK (ArchiveFormat IN ('JSON', 'Parquet', 'CSV')),
    CONSTRAINT CK_ArchiveConfiguration_DefaultMode
        CHECK (DefaultMode IN ('StripFields', 'HardDelete', 'ArchiveOnly')),
    CONSTRAINT CK_ArchiveConfiguration_Status
        CHECK (Status IN ('Idle', 'Running', 'Error', 'Disabled'))
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Top-level configuration for an archive pipeline. Defines the storage target, default retention policy, archive format, and operational mode for archiving entity records.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Human-readable name for this archive configuration.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration',
    @level2type=N'COLUMN', @level2name=N'Name';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to FileStorageAccount — the blob/file storage target for archived data.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration',
    @level2type=N'COLUMN', @level2name=N'StorageAccountID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Root path within the storage account where archive files are written (e.g., "archives/production/").',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration',
    @level2type=N'COLUMN', @level2name=N'RootPath';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Output format for archived records: JSON, Parquet, or CSV.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration',
    @level2type=N'COLUMN', @level2name=N'ArchiveFormat';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether this configuration is active and eligible for scheduled archive runs.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration',
    @level2type=N'COLUMN', @level2name=N'IsActive';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Default number of days after which records become eligible for archiving. Can be overridden per entity.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration',
    @level2type=N'COLUMN', @level2name=N'DefaultRetentionDays';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Default archive mode: StripFields (null out specified fields), HardDelete (delete from source after archiving), ArchiveOnly (copy to storage without modifying source).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration',
    @level2type=N'COLUMN', @level2name=N'DefaultMode';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Default number of records to process per batch during archive runs.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration',
    @level2type=N'COLUMN', @level2name=N'DefaultBatchSize';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'When enabled, related Record Changes entries are also archived alongside the source records.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration',
    @level2type=N'COLUMN', @level2name=N'ArchiveRelatedRecordChanges';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Current operational status of this configuration: Idle, Running, Error, or Disabled.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration',
    @level2type=N'COLUMN', @level2name=N'Status';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'The user who created this archive configuration.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfiguration',
    @level2type=N'COLUMN', @level2name=N'CreatedByUserID';


-- ============================================================================
-- Table 2: ArchiveConfigurationEntity
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.ArchiveConfigurationEntity (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ArchiveConfigurationID UNIQUEIDENTIFIER NOT NULL,
    EntityID UNIQUEIDENTIFIER NOT NULL,
    Mode NVARCHAR(20) NULL,
    RetentionDays INT NULL,
    DateField NVARCHAR(100) NOT NULL DEFAULT '__mj_CreatedAt',
    FilterExpression NVARCHAR(MAX) NULL,
    BatchSize INT NULL,
    Priority INT NOT NULL DEFAULT 100,
    FieldConfiguration NVARCHAR(MAX) NOT NULL,
    DriverClass NVARCHAR(500) NULL,
    ArchiveRelatedRecordChanges BIT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_ArchiveConfigurationEntity PRIMARY KEY (ID),
    CONSTRAINT FK_ArchiveConfigEntity_Config FOREIGN KEY (ArchiveConfigurationID)
        REFERENCES ${flyway:defaultSchema}.ArchiveConfiguration(ID),
    CONSTRAINT FK_ArchiveConfigEntity_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT UQ_ArchiveConfigEntity_ConfigEntity UNIQUE (ArchiveConfigurationID, EntityID),
    CONSTRAINT CK_ArchiveConfigEntity_Mode
        CHECK (Mode IS NULL OR Mode IN ('StripFields', 'HardDelete', 'ArchiveOnly'))
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Per-entity configuration within an archive pipeline. Allows overriding the parent configuration''s defaults for mode, retention, batch size, and filtering on a per-entity basis.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the parent ArchiveConfiguration.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'ArchiveConfigurationID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the Entity being archived.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'EntityID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Archive mode override for this entity. NULL inherits from the parent configuration''s DefaultMode.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'Mode';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Retention period override in days. NULL inherits from the parent configuration''s DefaultRetentionDays.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'RetentionDays';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'The date field on the entity used to determine record age for retention policy evaluation. Defaults to __mj_CreatedAt.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'DateField';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Optional SQL WHERE clause fragment to further filter which records are eligible for archiving (e.g., "Status = ''Closed''").',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'FilterExpression';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Batch size override for this entity. NULL inherits from the parent configuration''s DefaultBatchSize.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'BatchSize';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Processing priority — lower numbers are archived first. Default is 100.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'Priority';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'JSON configuration specifying which fields to include/exclude in the archive output. Required for all modes.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'FieldConfiguration';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Optional fully-qualified class name of a custom archive driver to use for this entity, overriding the default archiver.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'DriverClass';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Override for archiving related Record Changes. NULL inherits from the parent configuration.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'ArchiveRelatedRecordChanges';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether this entity is active within the archive configuration.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ArchiveConfigurationEntity',
    @level2type=N'COLUMN', @level2name=N'IsActive';


-- ============================================================================
-- Table 3: ArchiveRun
-- ============================================================================
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


-- ============================================================================
-- Table 4: ArchiveRunDetail
-- ============================================================================
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












/* Codegen script */
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
         '83dbf4cb-56fe-496f-a5df-1fc7bf616653',
         'MJ: Archive Configuration Entities',
         'Archive Configuration Entities',
         'Per-entity configuration within an archive pipeline. Allows overriding the parent configuration''s defaults for mode, retention, batch size, and filtering on a per-entity basis.',
         NULL,
         'ArchiveConfigurationEntity',
         'vwArchiveConfigurationEntities',
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
      )
   


/* SQL generated to add new permission for entity MJ: Archive Configuration Entities for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('83dbf4cb-56fe-496f-a5df-1fc7bf616653', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Configuration Entities for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('83dbf4cb-56fe-496f-a5df-1fc7bf616653', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Configuration Entities for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('83dbf4cb-56fe-496f-a5df-1fc7bf616653', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

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
         '3f740d68-8510-46a6-a1d3-3fa5d79eb7c4',
         'MJ: Archive Runs',
         'Archive Runs',
         'Tracks each execution of an archive configuration, including timing, aggregate statistics, and overall status.',
         NULL,
         'ArchiveRun',
         'vwArchiveRuns',
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
      )
   


/* SQL generated to add new permission for entity MJ: Archive Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3f740d68-8510-46a6-a1d3-3fa5d79eb7c4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3f740d68-8510-46a6-a1d3-3fa5d79eb7c4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3f740d68-8510-46a6-a1d3-3fa5d79eb7c4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

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
         'c30f80ec-e7ce-468e-b6c6-b8888f0f45c6',
         'MJ: Archive Run Details',
         'Archive Run Details',
         'Per-record detail for each archive run. Tracks the outcome, storage location, and error information for each individual record processed.',
         NULL,
         'ArchiveRunDetail',
         'vwArchiveRunDetails',
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
      )
   


/* SQL generated to add new permission for entity MJ: Archive Run Details for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c30f80ec-e7ce-468e-b6c6-b8888f0f45c6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Run Details for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c30f80ec-e7ce-468e-b6c6-b8888f0f45c6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Run Details for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c30f80ec-e7ce-468e-b6c6-b8888f0f45c6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

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
         '4873b8b1-11e9-49e7-ac26-497c17c9cd04',
         'MJ: Archive Configurations',
         'Archive Configurations',
         'Top-level configuration for an archive pipeline. Defines the storage target, default retention policy, archive format, and operational mode for archiving entity records.',
         NULL,
         'ArchiveConfiguration',
         'vwArchiveConfigurations',
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
      )
   


/* SQL generated to add new permission for entity MJ: Archive Configurations for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4873b8b1-11e9-49e7-ac26-497c17c9cd04', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Configurations for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4873b8b1-11e9-49e7-ac26-497c17c9cd04', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Archive Configurations for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4873b8b1-11e9-49e7-ac26-497c17c9cd04', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
UPDATE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ADD CONSTRAINT [DF___mj_ArchiveConfigurationEntity___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
UPDATE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ADD CONSTRAINT [DF___mj_ArchiveConfigurationEntity___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
UPDATE [${flyway:defaultSchema}].[ArchiveRun] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ADD CONSTRAINT [DF___mj_ArchiveRun___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
UPDATE [${flyway:defaultSchema}].[ArchiveRun] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRun */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRun] ADD CONSTRAINT [DF___mj_ArchiveRun___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
UPDATE [${flyway:defaultSchema}].[ArchiveConfiguration] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ADD CONSTRAINT [DF___mj_ArchiveConfiguration___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
UPDATE [${flyway:defaultSchema}].[ArchiveConfiguration] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveConfiguration] ADD CONSTRAINT [DF___mj_ArchiveConfiguration___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
UPDATE [${flyway:defaultSchema}].[ArchiveRunDetail] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ADD CONSTRAINT [DF___mj_ArchiveRunDetail___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
UPDATE [${flyway:defaultSchema}].[ArchiveRunDetail] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArchiveRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ArchiveRunDetail] ADD CONSTRAINT [DF___mj_ArchiveRunDetail___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a7127c1-e2a8-43cf-88e1-66188c8ee78c' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '0a7127c1-e2a8-43cf-88e1-66188c8ee78c',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6a85835-b56d-46b0-a0f2-9e8dec267321' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'ArchiveConfigurationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'f6a85835-b56d-46b0-a0f2-9e8dec267321',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32659e98-d836-41c5-b667-50bcf2a83267' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '32659e98-d836-41c5-b667-50bcf2a83267',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd3bfb0dd-1706-4f61-9d17-c4117dc6fa19' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'Mode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd3bfb0dd-1706-4f61-9d17-c4117dc6fa19',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '47b76d58-94f3-4faf-8b4e-e30b9a5ec6e7' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'RetentionDays')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '47b76d58-94f3-4faf-8b4e-e30b9a5ec6e7',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5fcf20b0-6e5b-4b2e-b46a-57d614232084' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'DateField')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5fcf20b0-6e5b-4b2e-b46a-57d614232084',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41930e98-fa34-4afe-97d8-8a232738cdc3' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'FilterExpression')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '41930e98-fa34-4afe-97d8-8a232738cdc3',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '219ac061-e392-463e-8cd1-572d7989caa4' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'BatchSize')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '219ac061-e392-463e-8cd1-572d7989caa4',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b305f765-7163-4a24-87ce-0409f602a0dd' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'Priority')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b305f765-7163-4a24-87ce-0409f602a0dd',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5b5487c-eb51-434f-8581-105f43063060' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'FieldConfiguration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e5b5487c-eb51-434f-8581-105f43063060',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fc9f585-16e5-4d7b-83b7-eb90060bad11' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'DriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '2fc9f585-16e5-4d7b-83b7-eb90060bad11',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '71a0c823-bf0d-4648-b365-5810cbaff0d9' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'ArchiveRelatedRecordChanges')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '71a0c823-bf0d-4648-b365-5810cbaff0d9',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e71da572-d710-4d7e-b4c9-0e1ddedcd439' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e71da572-d710-4d7e-b4c9-0e1ddedcd439',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30a8420a-2f7e-40f0-ada9-37c30ddde715' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '30a8420a-2f7e-40f0-ada9-37c30ddde715',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a793d822-0d77-4856-96c2-d146f2d82324' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a793d822-0d77-4856-96c2-d146f2d82324',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e064419c-fcc4-4e6e-8177-53fe970abcdb' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e064419c-fcc4-4e6e-8177-53fe970abcdb',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4c4c162a-a869-4fa1-8dc6-55d21ee78dd0' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'ArchiveConfigurationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '4c4c162a-a869-4fa1-8dc6-55d21ee78dd0',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94285cb6-6afb-453a-b128-a4f205a9b95b' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'StartedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '94285cb6-6afb-453a-b128-a4f205a9b95b',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0577b1df-283a-41a7-b1ed-e4d2a636d619' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'CompletedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '0577b1df-283a-41a7-b1ed-e4d2a636d619',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff9b2129-b236-4579-8808-2ca0d3601b82' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'ff9b2129-b236-4579-8808-2ca0d3601b82',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08d99409-eddd-419d-8ce9-aaa3eae83c37' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'TotalRecords')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '08d99409-eddd-419d-8ce9-aaa3eae83c37',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '64b65860-76e7-45e2-95a5-99fe6c13b494' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'ArchivedRecords')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '64b65860-76e7-45e2-95a5-99fe6c13b494',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3197725e-031c-419e-a050-0393ee956f8e' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'FailedRecords')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3197725e-031c-419e-a050-0393ee956f8e',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70aaf154-feb2-446b-ad07-7d135fc02d8c' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'SkippedRecords')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '70aaf154-feb2-446b-ad07-7d135fc02d8c',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6cb16169-7134-4506-853c-87d55e653827' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'TotalBytesArchived')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6cb16169-7134-4506-853c-87d55e653827',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf29c5fd-0392-4f97-8003-63f6852645c5' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'ErrorLog')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'cf29c5fd-0392-4f97-8003-63f6852645c5',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3e3471ed-ea06-4939-bb55-f872c214744a' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3e3471ed-ea06-4939-bb55-f872c214744a',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '802f2dc2-32ae-4792-8031-5a95a45da99d' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '802f2dc2-32ae-4792-8031-5a95a45da99d',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '351d3434-f7e4-407f-a043-16c1d2d3cf44' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '351d3434-f7e4-407f-a043-16c1d2d3cf44',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8ceab8e-7f9d-4b3e-be61-c65768fcbdb1' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b8ceab8e-7f9d-4b3e-be61-c65768fcbdb1',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b7d525a4-79dc-4914-9226-3589cb238ab6' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b7d525a4-79dc-4914-9226-3589cb238ab6',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f388801a-588f-49fc-8be4-a0ab120fad8b' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'f388801a-588f-49fc-8be4-a0ab120fad8b',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea56758a-5a15-4782-8181-ed1aefb5f20b' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'StorageAccountID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'ea56758a-5a15-4782-8181-ed1aefb5f20b',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
            100004,
            'StorageAccountID',
            'Storage Account ID',
            'Foreign key to FileStorageAccount — the blob/file storage target for archived data.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '59a81384-543d-4147-8fc0-58664cea01b7' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'RootPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '59a81384-543d-4147-8fc0-58664cea01b7',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fbc6b9c6-466a-4848-ab6e-df9ac86bbeca' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'ArchiveFormat')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'fbc6b9c6-466a-4848-ab6e-df9ac86bbeca',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bede1ba3-98f5-44da-be96-49f0cca97251' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'bede1ba3-98f5-44da-be96-49f0cca97251',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e90d03b4-27ad-4bd1-a0a9-f26a759f2870' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'DefaultRetentionDays')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e90d03b4-27ad-4bd1-a0a9-f26a759f2870',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '475ffa36-2e60-45f0-9c11-380616149b5a' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'DefaultMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '475ffa36-2e60-45f0-9c11-380616149b5a',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
            100009,
            'DefaultMode',
            'Default Mode',
            'Default archive mode: StripFields (null out specified fields), HardDelete (delete from source after archiving), ArchiveOnly (copy to storage without modifying source).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c8405377-cecb-4aa6-82f8-0631eb4cfd1d' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'DefaultBatchSize')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c8405377-cecb-4aa6-82f8-0631eb4cfd1d',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '932e0cd2-73fc-4fb2-b451-bc4988a80ee3' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'ArchiveRelatedRecordChanges')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '932e0cd2-73fc-4fb2-b451-bc4988a80ee3',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80f2b15e-7e56-4f6e-b86d-8fe75e810fcc' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '80f2b15e-7e56-4f6e-b86d-8fe75e810fcc',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a28a545c-c728-4da1-aae5-c2f434ad6184' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'CreatedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a28a545c-c728-4da1-aae5-c2f434ad6184',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c91a60f0-ed25-40fa-ab1e-db0b368fac7c' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c91a60f0-ed25-40fa-ab1e-db0b368fac7c',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a37d9dd2-5f24-4c33-95c7-335907714961' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a37d9dd2-5f24-4c33-95c7-335907714961',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '79525349-f1a7-45cd-bddb-15d45e1ea4d5' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '79525349-f1a7-45cd-bddb-15d45e1ea4d5',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c1ae9bd-d895-4ecf-b65b-43ea80d9949c' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'ArchiveRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '0c1ae9bd-d895-4ecf-b65b-43ea80d9949c',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6170c43c-462b-42b1-972b-1d8b7789682b' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6170c43c-462b-42b1-972b-1d8b7789682b',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2cd99cc3-14ac-466e-b9d1-ce5e050b58aa' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'RecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '2cd99cc3-14ac-466e-b9d1-ce5e050b58aa',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b67b2260-8850-40f9-8902-5d91d0159fe7' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b67b2260-8850-40f9-8902-5d91d0159fe7',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2a48a363-dc62-4dd2-833b-eb7cfbabb283' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'StoragePath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '2a48a363-dc62-4dd2-833b-eb7cfbabb283',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b53cd8f-01e4-41c3-a6e3-313a83103ecf' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'BytesArchived')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5b53cd8f-01e4-41c3-a6e3-313a83103ecf',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0823fbf5-191b-4799-a64e-778c6af033a1' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'ErrorMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '0823fbf5-191b-4799-a64e-778c6af033a1',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bfccf263-af8a-405c-b57d-473aac8a9e90' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'ArchivedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'bfccf263-af8a-405c-b57d-473aac8a9e90',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '07f192b4-3a6d-4feb-869b-6ed067bb82f0' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'VersionStamp')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '07f192b4-3a6d-4feb-869b-6ed067bb82f0',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4959b7f3-ad32-40dd-8e3f-8df97e4c6844' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'IsRecordChangeArchive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '4959b7f3-ad32-40dd-8e3f-8df97e4c6844',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b90e24fd-d3a9-4d00-a94b-17e2b1fb2fe3' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b90e24fd-d3a9-4d00-a94b-17e2b1fb2fe3',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb7feb68-c246-4b48-9518-b8bcf5793611' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'eb7feb68-c246-4b48-9518-b8bcf5793611',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

/* SQL text to insert entity field value with ID ddf59aaa-286c-41e5-ad55-85672b11d346 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ddf59aaa-286c-41e5-ad55-85672b11d346', 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19', 1, 'ArchiveOnly', 'ArchiveOnly', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 1a17cdee-2ef5-4cf4-b38d-bf21deb3c573 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1a17cdee-2ef5-4cf4-b38d-bf21deb3c573', 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19', 2, 'HardDelete', 'HardDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 5cbc4a8a-8746-4c8e-a294-33c0c70f31fd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5cbc4a8a-8746-4c8e-a294-33c0c70f31fd', 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19', 3, 'StripFields', 'StripFields', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID D3BFB0DD-1706-4F61-9D17-C4117DC6FA19 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D3BFB0DD-1706-4F61-9D17-C4117DC6FA19'

/* SQL text to insert entity field value with ID fe4752d5-6e7a-42ca-a5b9-0b0ba41410d8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fe4752d5-6e7a-42ca-a5b9-0b0ba41410d8', 'FF9B2129-B236-4579-8808-2CA0D3601B82', 1, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 8ef50148-d923-4dfe-a111-2414dca66eb3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8ef50148-d923-4dfe-a111-2414dca66eb3', 'FF9B2129-B236-4579-8808-2CA0D3601B82', 2, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID cc2b6e84-d503-45c1-8df8-7de64a618bd2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cc2b6e84-d503-45c1-8df8-7de64a618bd2', 'FF9B2129-B236-4579-8808-2CA0D3601B82', 3, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 09c4d43e-84df-440f-8e3d-280c9c140cae */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('09c4d43e-84df-440f-8e3d-280c9c140cae', 'FF9B2129-B236-4579-8808-2CA0D3601B82', 4, 'PartialSuccess', 'PartialSuccess', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 76d16afa-6153-475c-8672-e89eab16deb9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('76d16afa-6153-475c-8672-e89eab16deb9', 'FF9B2129-B236-4579-8808-2CA0D3601B82', 5, 'Running', 'Running', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID FF9B2129-B236-4579-8808-2CA0D3601B82 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FF9B2129-B236-4579-8808-2CA0D3601B82'

/* SQL text to insert entity field value with ID 1433c133-c843-4613-8de9-09ddd0c9473e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1433c133-c843-4613-8de9-09ddd0c9473e', '475FFA36-2E60-45F0-9C11-380616149B5A', 1, 'ArchiveOnly', 'ArchiveOnly', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID fe70b80e-1ee4-4ead-87ef-26c633cdd6a4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fe70b80e-1ee4-4ead-87ef-26c633cdd6a4', '475FFA36-2E60-45F0-9C11-380616149B5A', 2, 'HardDelete', 'HardDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 120edf33-c92d-4517-afc7-476645bd5681 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('120edf33-c92d-4517-afc7-476645bd5681', '475FFA36-2E60-45F0-9C11-380616149B5A', 3, 'StripFields', 'StripFields', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 475FFA36-2E60-45F0-9C11-380616149B5A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='475FFA36-2E60-45F0-9C11-380616149B5A'

/* SQL text to insert entity field value with ID 565bdeb8-933a-494a-a9b1-942cf1fc105a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('565bdeb8-933a-494a-a9b1-942cf1fc105a', '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC', 1, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID fe487b49-7cd8-40ed-a268-fee233b3475e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fe487b49-7cd8-40ed-a268-fee233b3475e', '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC', 2, 'Error', 'Error', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 6b8ec2fd-69c7-4885-9aae-ff12da67a2f1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6b8ec2fd-69c7-4885-9aae-ff12da67a2f1', '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC', 3, 'Idle', 'Idle', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 93c38fdc-ac46-421c-9c83-c822de8cbac6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('93c38fdc-ac46-421c-9c83-c822de8cbac6', '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC', 4, 'Running', 'Running', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 80F2B15E-7E56-4F6E-B86D-8FE75E810FCC */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='80F2B15E-7E56-4F6E-B86D-8FE75E810FCC'

/* SQL text to insert entity field value with ID 806768b3-988f-4879-952e-b4717109c417 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('806768b3-988f-4879-952e-b4717109c417', 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA', 1, 'CSV', 'CSV', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 7ee2d7d9-5187-4f5a-ae34-c722e2191232 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7ee2d7d9-5187-4f5a-ae34-c722e2191232', 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA', 2, 'JSON', 'JSON', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 779ea52c-322b-4d12-bc29-5cb2adda6061 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('779ea52c-322b-4d12-bc29-5cb2adda6061', 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA', 3, 'Parquet', 'Parquet', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA'

/* SQL text to insert entity field value with ID 844f5017-eb73-4f50-b018-a9fcf0899211 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('844f5017-eb73-4f50-b018-a9fcf0899211', 'B67B2260-8850-40F9-8902-5D91D0159FE7', 1, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ed02490f-be4c-4161-8f52-5aa9fb78896e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ed02490f-be4c-4161-8f52-5aa9fb78896e', 'B67B2260-8850-40F9-8902-5D91D0159FE7', 2, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID c1a5a1dc-03d4-4367-9db8-8e7c8844b2b2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c1a5a1dc-03d4-4367-9db8-8e7c8844b2b2', 'B67B2260-8850-40F9-8902-5D91D0159FE7', 3, 'Success', 'Success', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID B67B2260-8850-40F9-8902-5D91D0159FE7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B67B2260-8850-40F9-8902-5D91D0159FE7'


/* Create Entity Relationship: MJ: Archive Runs -> MJ: Archive Run Details (One To Many via ArchiveRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '57e057aa-0126-4457-b12a-f7d7d95c9cd2'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('57e057aa-0126-4457-b12a-f7d7d95c9cd2', '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', 'ArchiveRunID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Archive Configurations -> MJ: Archive Runs (One To Many via ArchiveConfigurationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '500fbcf8-6146-4005-a8ca-080f18e60d4d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('500fbcf8-6146-4005-a8ca-080f18e60d4d', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', 'ArchiveConfigurationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Archive Configurations -> MJ: Archive Configuration Entities (One To Many via ArchiveConfigurationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '026ab5bb-b411-402e-a4a7-10a091f23a72'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('026ab5bb-b411-402e-a4a7-10a091f23a72', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', 'ArchiveConfigurationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entities -> MJ: Archive Configuration Entities (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ad7534ed-3386-4309-b40b-15769d511dd6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ad7534ed-3386-4309-b40b-15769d511dd6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', 'EntityID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Archive Run Details (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e32b314e-5ce7-424d-9b0b-8899a8db4d55'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e32b314e-5ce7-424d-9b0b-8899a8db4d55', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', 'EntityID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Archive Configurations (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2a0999a0-aa55-44ee-a37d-5b131bbe1327'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2a0999a0-aa55-44ee-a37d-5b131bbe1327', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', 'CreatedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Users -> MJ: Archive Runs (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f899e09d-d0c3-4e43-8358-f88813a5f1e7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f899e09d-d0c3-4e43-8358-f88813a5f1e7', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', 'UserID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: File Storage Accounts -> MJ: Archive Configurations (One To Many via StorageAccountID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2afc4246-7efa-48fb-b048-9ebd0d073c2b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2afc4246-7efa-48fb-b048-9ebd0d073c2b', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', 'StorageAccountID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID F6A85835-B56D-46B0-A0F2-9E8DEC267321 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F6A85835-B56D-46B0-A0F2-9E8DEC267321', @RelatedEntityNameFieldMap='ArchiveConfiguration'

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

/* SQL text to update entity field related entity name field map for entity field ID EA56758A-5A15-4782-8181-ED1AEFB5F20B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EA56758A-5A15-4782-8181-ED1AEFB5F20B', @RelatedEntityNameFieldMap='StorageAccount'

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

/* SQL text to update entity field related entity name field map for entity field ID 6170C43C-462B-42B1-972B-1D8B7789682B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6170C43C-462B-42B1-972B-1D8B7789682B', @RelatedEntityNameFieldMap='Entity'

/* SQL text to update entity field related entity name field map for entity field ID 32659E98-D836-41C5-B667-50BCF2A83267 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='32659E98-D836-41C5-B667-50BCF2A83267', @RelatedEntityNameFieldMap='Entity'

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



/* SQL text to update entity field related entity name field map for entity field ID A28A545C-C728-4DA1-AAE5-C2F434AD6184 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A28A545C-C728-4DA1-AAE5-C2F434AD6184', @RelatedEntityNameFieldMap='CreatedByUser'

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

/* SQL text to update entity field related entity name field map for entity field ID 4C4C162A-A869-4FA1-8DC6-55D21EE78DD0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4C4C162A-A869-4FA1-8DC6-55D21EE78DD0', @RelatedEntityNameFieldMap='ArchiveConfiguration'

/* SQL text to update entity field related entity name field map for entity field ID 3E3471ED-EA06-4939-BB55-F872C214744A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3E3471ED-EA06-4939-BB55-F872C214744A', @RelatedEntityNameFieldMap='User'

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1d8ccfa-20df-4d0b-815f-0f17fa3ca4ac' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'ArchiveConfiguration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b1d8ccfa-20df-4d0b-815f-0f17fa3ca4ac',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '652dd589-2e4d-41a1-84f3-d112e25f81b0' OR (EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '652dd589-2e4d-41a1-84f3-d112e25f81b0',
            '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', -- Entity: MJ: Archive Configuration Entities
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5aaf4984-3f9e-4773-ae4e-a6faff14e073' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'ArchiveConfiguration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5aaf4984-3f9e-4773-ae4e-a6faff14e073',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b94be74-4f68-4391-85a9-3ac1ccf4b8e3' OR (EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '9b94be74-4f68-4391-85a9-3ac1ccf4b8e3',
            '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd9ed786a-4a2a-444b-801b-257712d54707' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'StorageAccount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd9ed786a-4a2a-444b-801b-257712d54707',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
            100031,
            'StorageAccount',
            'Storage Account',
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
            NULL,
            NULL,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b2ec06a-4f5f-425c-b08f-21aeeb42fb70' OR (EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND Name = 'CreatedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '9b2ec06a-4f5f-425c-b08f-21aeeb42fb70',
            '4873B8B1-11E9-49E7-AC26-497C17C9CD04', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a500c87-f127-4776-8eef-7eca8e7a414c' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '0a500c87-f127-4776-8eef-7eca8e7a414c',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BEDE1BA3-98F5-44DA-BE96-49F0CCA97251'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E90D03B4-27AD-4BD1-A0A9-F26A759F2870'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'B7D525A4-79DC-4914-9226-3589CB238AB6'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC'
               AND AutoUpdateUserSearchPredicate = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '5AAF4984-3F9E-4773-AE4E-A6FAFF14E073'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '94285CB6-6AFB-453A-B128-A4F205A9B95B'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '94285CB6-6AFB-453A-B128-A4F205A9B95B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FF9B2129-B236-4579-8808-2CA0D3601B82'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '08D99409-EDDD-419D-8CE9-AAA3EAE83C37'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '64B65860-76E7-45E2-95A5-99FE6C13B494'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5AAF4984-3F9E-4773-AE4E-A6FAFF14E073'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FF9B2129-B236-4579-8808-2CA0D3601B82'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5AAF4984-3F9E-4773-AE4E-A6FAFF14E073'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9B94BE74-4F68-4391-85A9-3AC1CCF4B8E3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'FF9B2129-B236-4579-8808-2CA0D3601B82'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '9B94BE74-4F68-4391-85A9-3AC1CCF4B8E3'
               AND AutoUpdateUserSearchPredicate = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B67B2260-8850-40F9-8902-5D91D0159FE7'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5B53CD8F-01E4-41C3-A6E3-313A83103ECF'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BFCCF263-AF8A-405C-B57D-473AAC8A9E90'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0A500C87-F127-4776-8EEF-7ECA8E7A414C'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B67B2260-8850-40F9-8902-5D91D0159FE7'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0A500C87-F127-4776-8EEF-7ECA8E7A414C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0A500C87-F127-4776-8EEF-7ECA8E7A414C'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'B67B2260-8850-40F9-8902-5D91D0159FE7'
               AND AutoUpdateUserSearchPredicate = 1
            

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '79525349-F1A7-45CD-BDDB-15D45E1EA4D5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ArchiveRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C1AE9BD-D895-4ECF-B65B-43EA80D9949C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Record',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6170C43C-462B-42B1-972B-1D8B7789682B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A500C87-F127-4776-8EEF-7ECA8E7A414C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B67B2260-8850-40F9-8902-5D91D0159FE7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.StoragePath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '2A48A363-DC62-4DD2-833B-EB7CFBABB283' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.BytesArchived 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B53CD8F-01E4-41C3-A6E3-313A83103ECF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0823FBF5-191B-4799-A64E-778C6AF033A1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ArchivedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Versioning',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BFCCF263-AF8A-405C-B57D-473AAC8A9E90' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.VersionStamp 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Versioning',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07F192B4-3A6D-4FEB-869B-6ED067BB82F0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.IsRecordChangeArchive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Versioning',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4959B7F3-AD32-40DD-8E3F-8DF97E4C6844' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B90E24FD-D3A9-4D00-A94B-17E2B1FB2FE3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB7FEB68-C246-4B48-9518-B8BCF5793611' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-archive */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-archive', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('fcbece2e-0ff0-4bf9-923d-897107971763', 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', 'FieldCategoryInfo', '{"Archive Context":{"icon":"fa fa-link","description":"Links and identifiers relating this record to the archive operation and source entity."},"Processing Results":{"icon":"fa fa-check-circle","description":"Outcome, storage location, and error details of the archive process."},"Timeline and Versioning":{"icon":"fa fa-history","description":"Timestamps and versioning data used for audit and restore operations."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4db5dffa-a2b6-4696-aba9-aadcca74c50f', 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', 'FieldCategoryIcons', '{"Archive Context":"fa fa-link","Processing Results":"fa fa-check-circle","Timeline and Versioning":"fa fa-history","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6'
      

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Archive Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E064419C-FCC4-4E6E-8177-53FE970ABCDB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.ArchiveConfigurationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Configuration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C4C162A-A869-4FA1-8DC6-55D21EE78DD0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.ArchiveConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Configuration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5AAF4984-3F9E-4773-AE4E-A6FAFF14E073' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Initiated By',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E3471ED-EA06-4939-BB55-F872C214744A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B94BE74-4F68-4391-85A9-3AC1CCF4B8E3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Status and Timing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF9B2129-B236-4579-8808-2CA0D3601B82' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Status and Timing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '94285CB6-6AFB-453A-B128-A4F205A9B95B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Status and Timing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0577B1DF-283A-41A7-B1ED-E4D2A636D619' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.TotalRecords 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Statistics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08D99409-EDDD-419D-8CE9-AAA3EAE83C37' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.ArchivedRecords 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Statistics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64B65860-76E7-45E2-95A5-99FE6C13B494' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.FailedRecords 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Statistics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3197725E-031C-419E-A050-0393EE956F8E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.SkippedRecords 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Statistics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '70AAF154-FEB2-446B-AD07-7D135FC02D8C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.TotalBytesArchived 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Statistics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6CB16169-7134-4506-853C-87D55E653827' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.ErrorLog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Error Diagnostics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'CF29C5FD-0392-4F97-8003-63F6852645C5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '802F2DC2-32AE-4792-8031-5A95A45DA99D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '351D3434-F7E4-407F-A043-16C1D2D3CF44' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-archive */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-archive', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7adbe01f-89f0-41d9-a542-632cf695762e', '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', 'FieldCategoryInfo', '{"Execution Context":{"icon":"fa fa-info-circle","description":"Information regarding the configuration and user associated with the archive run"},"Run Status and Timing":{"icon":"fa fa-clock","description":"Operational status and timestamp tracking for the archive execution"},"Archive Statistics":{"icon":"fa fa-chart-line","description":"Quantitative metrics regarding records processed and data volume"},"Error Diagnostics":{"icon":"fa fa-exclamation-triangle","description":"Technical logs and error details for failed or partial runs"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('fcc3e434-840b-43d7-aa73-5ae9fcafba5a', '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4', 'FieldCategoryIcons', '{"Execution Context":"fa fa-info-circle","Run Status and Timing":"fa fa-clock","Archive Statistics":"fa fa-chart-line","Error Diagnostics":"fa fa-exclamation-triangle","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4'
      

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Archive Configurations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B8CEAB8E-7F9D-4B3E-BE61-C65768FCBDB1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B7D525A4-79DC-4914-9226-3589CB238AB6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F388801A-588F-49FC-8BE4-A0AB120FAD8B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BEDE1BA3-98F5-44DA-BE96-49F0CCA97251' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80F2B15E-7E56-4F6E-B86D-8FE75E810FCC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.StorageAccountID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Account',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EA56758A-5A15-4782-8181-ED1AEFB5F20B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.StorageAccount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Account Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D9ED786A-4A2A-444B-801B-257712D54707' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.RootPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '59A81384-543D-4147-8FC0-58664CEA01B7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.ArchiveFormat 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FBC6B9C6-466A-4848-AB6E-DF9AC86BBECA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.DefaultRetentionDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E90D03B4-27AD-4BD1-A0A9-F26A759F2870' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.DefaultMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '475FFA36-2E60-45F0-9C11-380616149B5A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.DefaultBatchSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C8405377-CECB-4AA6-82F8-0631EB4CFD1D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.ArchiveRelatedRecordChanges 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '932E0CD2-73FC-4FB2-B451-BC4988A80EE3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.CreatedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A28A545C-C728-4DA1-AAE5-C2F434AD6184' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.CreatedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B2EC06A-4F5F-425C-B08F-21AEEB42FB70' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C91A60F0-ED25-40FA-AB1E-DB0B368FAC7C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configurations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A37D9DD2-5F24-4C33-95C7-335907714961' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-archive */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-archive', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a235ec6b-f039-4fd9-9abd-3fbb9ebdd0cf', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', 'FieldCategoryInfo', '{"General Information":{"icon":"fa fa-info-circle","description":"Basic identification and operational status of the archive configuration"},"Storage Configuration":{"icon":"fa fa-database","description":"Settings defining where and how archive files are stored"},"Archive Settings":{"icon":"fa fa-sliders-h","description":"Rules for formatting, retention, and processing of archived data"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0fb3c94d-16ef-4d30-b50a-d7408ae06503', '4873B8B1-11E9-49E7-AC26-497C17C9CD04', 'FieldCategoryIcons', '{"General Information":"fa fa-info-circle","Storage Configuration":"fa fa-database","Archive Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '4873B8B1-11E9-49E7-AC26-497C17C9CD04'
      

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '652DD589-2E4D-41A1-84F3-D112E25F81B0'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B305F765-7163-4A24-87CE-0409F602A0DD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E71DA572-D710-4D7E-B4C9-0E1DDEDCD439'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B1D8CCFA-20DF-4D0B-815F-0F17FA3CA4AC'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '652DD589-2E4D-41A1-84F3-D112E25F81B0'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B1D8CCFA-20DF-4D0B-815F-0F17FA3CA4AC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '652DD589-2E4D-41A1-84F3-D112E25F81B0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '652DD589-2E4D-41A1-84F3-D112E25F81B0'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'B1D8CCFA-20DF-4D0B-815F-0F17FA3CA4AC'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19'
               AND AutoUpdateUserSearchPredicate = 1
            

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A7127C1-E2A8-43CF-88E1-66188C8EE78C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.ArchiveConfigurationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Configuration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F6A85835-B56D-46B0-A0F2-9E8DEC267321' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '32659E98-D836-41C5-B667-50BCF2A83267' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.Mode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Policies',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Mode',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D3BFB0DD-1706-4F61-9D17-C4117DC6FA19' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.RetentionDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Policies',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '47B76D58-94F3-4FAF-8B4E-E30B9A5EC6E7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.DateField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Policies',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5FCF20B0-6E5B-4B2E-B46A-57D614232084' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.FilterExpression 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Policies',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '41930E98-FA34-4AFE-97D8-8A232738CDC3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.BatchSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '219AC061-E392-463E-8CD1-572D7989CAA4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B305F765-7163-4A24-87CE-0409F602A0DD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.FieldConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'E5B5487C-EB51-434F-8581-105F43063060' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2FC9F585-16E5-4D7B-83B7-EB90060BAD11' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.ArchiveRelatedRecordChanges 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Archive Policies',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '71A0C823-BF0D-4648-B365-5810CBAFF0D9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E71DA572-D710-4D7E-B4C9-0E1DDEDCD439' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '30A8420A-2F7E-40F0-ADA9-37C30DDDE715' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A793D822-0D77-4856-96C2-D146F2D82324' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.ArchiveConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Configuration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B1D8CCFA-20DF-4D0B-815F-0F17FA3CA4AC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Configuration Entities.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '652DD589-2E4D-41A1-84F3-D112E25F81B0' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-archive */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-archive', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a273de8b-0957-4660-b07c-aa1dcb0b2d7e', '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', 'FieldCategoryInfo', '{"Relationships":{"icon":"fa fa-link","description":"Links to parent archive configurations and target entities"},"Archive Policies":{"icon":"fa fa-shield-alt","description":"Rules governing data retention and filtering logic"},"Processing Settings":{"icon":"fa fa-sliders-h","description":"Operational parameters for the archive execution pipeline"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ae282aba-18d7-484e-8851-6033f5bc7edb', '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', 'FieldCategoryIcons', '{"Relationships":"fa fa-link","Archive Policies":"fa fa-shield-alt","Processing Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '83DBF4CB-56FE-496F-A5DF-1FC7BF616653'
      


-- Migration: Create Archiving Application and reassign Archive Entities
-- Description: Creates the "Archiving" application with its default nav items
--              (Configuration and Run History dashboards), then assigns the
--              four Archive entities to the
--              new Archiving application.
--

DECLARE @ArchivingAppID       UNIQUEIDENTIFIER = '87B3923D-6505-4E5C-A486-CA554CB6A0F0';
DECLARE @MJAdminAppID         UNIQUEIDENTIFIER = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E';

DECLARE @ArchiveConfigID      UNIQUEIDENTIFIER = '4873b8b1-11e9-49e7-ac26-497c17c9cd04';
DECLARE @ArchiveConfigEntID   UNIQUEIDENTIFIER = '83dbf4cb-56fe-496f-a5df-1fc7bf616653';
DECLARE @ArchiveRunID         UNIQUEIDENTIFIER = '3f740d68-8510-46a6-a1d3-3fa5d79eb7c4';
DECLARE @ArchiveRunDetailID   UNIQUEIDENTIFIER = 'c30f80ec-e7ce-468e-b6c6-b8888f0f45c6';

------------------------------------------------------
-- 1) Create the Archiving application
------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Application] WHERE [ID] = @ArchivingAppID)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[Application]
        ([ID], [Name], [Description], [Icon], [DefaultForNewUser], [DefaultSequence],
         [Status], [NavigationStyle], [HideNavBarIconWhenActive], [Path], [AutoUpdatePath],
         [DefaultNavItems])
    VALUES
        (@ArchivingAppID,
         N'Archiving',
         N'Manage database archiving configurations, view run history, and restore archived records.',
         N'fa-solid fa-box-archive',
         0,       -- DefaultForNewUser
         1050,    -- DefaultSequence
         N'Active',
         N'Both',
         1,       -- HideNavBarIconWhenActive
         N'archiving',
         1,       -- AutoUpdatePath
         N'[{"Label":"Configuration","Icon":"fa-solid fa-sliders","ResourceType":"Custom","DriverClass":"ArchiveConfigResource","isDefault":true},{"Label":"Run History","Icon":"fa-solid fa-clock-rotate-left","ResourceType":"Custom","DriverClass":"ArchiveRunsResource"}]');
END

------------------------------------------------------
-- 2) Associate the 4 archive entities with the Archiving application.
--    Sequence ordering: Config (parent) first, then Config Entity, then Run, then Run Detail.
------------------------------------------------------
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
    ([ApplicationID], [EntityID], [Sequence], [DefaultForNewUser])
VALUES
    (@ArchivingAppID, @ArchiveConfigID,    1, 1),
    (@ArchivingAppID, @ArchiveConfigEntID, 2, 0),
    (@ArchivingAppID, @ArchiveRunID,       3, 1),
    (@ArchivingAppID, @ArchiveRunDetailID, 4, 0);

