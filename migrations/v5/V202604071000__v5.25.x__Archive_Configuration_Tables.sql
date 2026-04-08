-- Migration: Create Archive Configuration Tables
-- Description: Introduces ArchiveConfiguration and ArchiveConfigurationEntity tables
--              for the MemberJunction Archiving Engine. These tables define how and which
--              entities should be archived, including storage targets, retention policies,
--              and per-entity field configuration.

-- Table 1: ArchiveConfiguration
-- Top-level configuration for an archive pipeline — defines the storage target,
-- default retention, format, and operational mode.
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
        CHECK (DefaultMode IN ('StripFields', 'SoftDelete', 'HardDelete', 'ArchiveOnly')),
    CONSTRAINT CK_ArchiveConfiguration_Status
        CHECK (Status IN ('Idle', 'Running', 'Error', 'Disabled'))
);

-- Extended properties for ArchiveConfiguration
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
    @value=N'Default archive mode: StripFields (remove specified fields), SoftDelete (mark as deleted), HardDelete (remove from source), ArchiveOnly (copy without modifying source).',
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


-- Table 2: ArchiveConfigurationEntity
-- Per-entity overrides within an archive configuration. Controls which entities
-- are included, with optional mode/retention/filter overrides.
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
        CHECK (Mode IS NULL OR Mode IN ('StripFields', 'SoftDelete', 'HardDelete', 'ArchiveOnly'))
);

-- Extended properties for ArchiveConfigurationEntity
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
