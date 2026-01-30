-- Version Label System
-- Adds tables for version labeling, snapshot indexing, and restore tracking.
-- Labels act as named bookmarks into the RecordChange history, enabling
-- point-in-time queries, cross-entity diffs, and full dependency-graph restores.

-----------------------------------------------------------------------
-- 1. Extend RecordChange.Type to allow 'Snapshot' entries
-----------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.RecordChange DROP CONSTRAINT CHK_RecordChange_Type;

ALTER TABLE ${flyway:defaultSchema}.RecordChange ADD CONSTRAINT CHK_RecordChange_Type
    CHECK (Type IN ('Create', 'Update', 'Delete', 'Snapshot'));

-----------------------------------------------------------------------
-- 2. Version Labels – named points in time
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.VersionLabel (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Scope NVARCHAR(50) NOT NULL DEFAULT 'System',
    EntityID UNIQUEIDENTIFIER NULL,
    RecordID NVARCHAR(750) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    ExternalSystemID NVARCHAR(200) NULL,
    CONSTRAINT PK_VersionLabel PRIMARY KEY (ID),
    CONSTRAINT FK_VersionLabel_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_VersionLabel_CreatedByUser FOREIGN KEY (CreatedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_VersionLabel_Scope
        CHECK (Scope IN ('System', 'Entity', 'Record')),
    CONSTRAINT CK_VersionLabel_Status
        CHECK (Status IN ('Active', 'Archived', 'Restored'))
);

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A named point-in-time bookmark into the RecordChange history, used for versioning, diffing, and restoration.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable label name, e.g. Release 2.5, Pre-Refactor Snapshot',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional longer description of what this label represents',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Breadth of the label: System (all entities), Entity (one entity type), or Record (one record and its dependency graph)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel',
    @level2type = N'COLUMN', @level2name = 'Scope';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When Scope is Entity or Record, identifies the target entity. NULL for System scope.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel',
    @level2type = N'COLUMN', @level2name = 'EntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When Scope is Record, identifies the specific record. NULL for System and Entity scopes.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel',
    @level2type = N'COLUMN', @level2name = 'RecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle state: Active (current), Archived (historical reference only), Restored (this label was used in a restore operation)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who created this version label',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel',
    @level2type = N'COLUMN', @level2name = 'CreatedByUserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to an external system identifier such as a git SHA, release tag, or deployment ID',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel',
    @level2type = N'COLUMN', @level2name = 'ExternalSystemID';

-----------------------------------------------------------------------
-- 3. Version Label Items – links labels to specific RecordChange entries
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.VersionLabelItem (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    VersionLabelID UNIQUEIDENTIFIER NOT NULL,
    RecordChangeID UNIQUEIDENTIFIER NOT NULL,
    EntityID UNIQUEIDENTIFIER NOT NULL,
    RecordID NVARCHAR(750) NOT NULL,
    CONSTRAINT PK_VersionLabelItem PRIMARY KEY (ID),
    CONSTRAINT FK_VersionLabelItem_VersionLabel FOREIGN KEY (VersionLabelID)
        REFERENCES ${flyway:defaultSchema}.VersionLabel(ID),
    CONSTRAINT FK_VersionLabelItem_RecordChange FOREIGN KEY (RecordChangeID)
        REFERENCES ${flyway:defaultSchema}.RecordChange(ID),
    CONSTRAINT FK_VersionLabelItem_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT UQ_VersionLabelItem_LabelEntityRecord UNIQUE (VersionLabelID, EntityID, RecordID)
);

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Links a Version Label to the specific RecordChange snapshot for each record captured by that label. Denormalizes EntityID and RecordID for efficient querying.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelItem';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The version label this item belongs to',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelItem',
    @level2type = N'COLUMN', @level2name = 'VersionLabelID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific RecordChange entry representing the record state at label creation time',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelItem',
    @level2type = N'COLUMN', @level2name = 'RecordChangeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Denormalized entity reference for query performance',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelItem',
    @level2type = N'COLUMN', @level2name = 'EntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Denormalized record primary key for query performance',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelItem',
    @level2type = N'COLUMN', @level2name = 'RecordID';

-----------------------------------------------------------------------
-- 4. Version Label Restores – audit trail for restore operations
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.VersionLabelRestore (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    VersionLabelID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Pending',
    StartedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    EndedAt DATETIMEOFFSET NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    TotalItems INT NOT NULL DEFAULT 0,
    CompletedItems INT NOT NULL DEFAULT 0,
    FailedItems INT NOT NULL DEFAULT 0,
    ErrorLog NVARCHAR(MAX) NULL,
    PreRestoreLabelID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_VersionLabelRestore PRIMARY KEY (ID),
    CONSTRAINT FK_VersionLabelRestore_VersionLabel FOREIGN KEY (VersionLabelID)
        REFERENCES ${flyway:defaultSchema}.VersionLabel(ID),
    CONSTRAINT FK_VersionLabelRestore_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_VersionLabelRestore_PreRestoreLabel FOREIGN KEY (PreRestoreLabelID)
        REFERENCES ${flyway:defaultSchema}.VersionLabel(ID),
    CONSTRAINT CK_VersionLabelRestore_Status
        CHECK (Status IN ('Pending', 'In Progress', 'Complete', 'Error', 'Partial'))
);

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Audit trail for restore operations performed against version labels. Tracks progress, success/failure counts, and links to the safety-net pre-restore label.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelRestore';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The version label being restored to',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelRestore',
    @level2type = N'COLUMN', @level2name = 'VersionLabelID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the restore operation',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelRestore',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the restore operation began',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelRestore',
    @level2type = N'COLUMN', @level2name = 'StartedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the restore operation completed or failed',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelRestore',
    @level2type = N'COLUMN', @level2name = 'EndedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who initiated the restore',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelRestore',
    @level2type = N'COLUMN', @level2name = 'UserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total number of records to restore',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelRestore',
    @level2type = N'COLUMN', @level2name = 'TotalItems';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of records successfully restored so far',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelRestore',
    @level2type = N'COLUMN', @level2name = 'CompletedItems';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of records that failed to restore',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelRestore',
    @level2type = N'COLUMN', @level2name = 'FailedItems';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed error information for failed restore items',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelRestore',
    @level2type = N'COLUMN', @level2name = 'ErrorLog';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the automatically created safety-net label that captured state before the restore began',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabelRestore',
    @level2type = N'COLUMN', @level2name = 'PreRestoreLabelID';
