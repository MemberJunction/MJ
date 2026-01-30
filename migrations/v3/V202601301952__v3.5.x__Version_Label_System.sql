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














































-- CODE GEN RUN
/* SQL generated to create new entity MJ: Version Labels */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'c9102ec4-cb6b-4375-a0ca-8fd738887aa2',
         'MJ: Version Labels',
         'Version Labels',
         NULL,
         NULL,
         'VersionLabel',
         'vwVersionLabels',
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
      )
   

/* SQL generated to add new entity MJ: Version Labels to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c9102ec4-cb6b-4375-a0ca-8fd738887aa2', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Version Labels for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c9102ec4-cb6b-4375-a0ca-8fd738887aa2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Version Labels for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c9102ec4-cb6b-4375-a0ca-8fd738887aa2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Version Labels for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c9102ec4-cb6b-4375-a0ca-8fd738887aa2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Version Label Items */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '94654088-bfb4-41ac-a0e0-b89a3f31a004',
         'MJ: Version Label Items',
         'Version Label Items',
         NULL,
         NULL,
         'VersionLabelItem',
         'vwVersionLabelItems',
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
      )
   

/* SQL generated to add new entity MJ: Version Label Items to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '94654088-bfb4-41ac-a0e0-b89a3f31a004', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Version Label Items for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('94654088-bfb4-41ac-a0e0-b89a3f31a004', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Version Label Items for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('94654088-bfb4-41ac-a0e0-b89a3f31a004', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Version Label Items for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('94654088-bfb4-41ac-a0e0-b89a3f31a004', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Version Label Restores */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '9f78daf8-16a6-4fd7-bc8f-54dc5e58d4fe',
         'MJ: Version Label Restores',
         'Version Label Restores',
         NULL,
         NULL,
         'VersionLabelRestore',
         'vwVersionLabelRestores',
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
      )
   

/* SQL generated to add new entity MJ: Version Label Restores to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9f78daf8-16a6-4fd7-bc8f-54dc5e58d4fe', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Version Label Restores for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9f78daf8-16a6-4fd7-bc8f-54dc5e58d4fe', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Version Label Restores for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9f78daf8-16a6-4fd7-bc8f-54dc5e58d4fe', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Version Label Restores for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9f78daf8-16a6-4fd7-bc8f-54dc5e58d4fe', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.VersionLabelRestore */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabelRestore] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.VersionLabelRestore */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabelRestore] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.VersionLabel */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabel] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.VersionLabel */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabel] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.VersionLabelItem */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabelItem] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.VersionLabelItem */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabelItem] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8dc197f6-da93-49c1-810f-9e57005a154f'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8dc197f6-da93-49c1-810f-9e57005a154f',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd1115805-f6ae-4d31-a5c7-b264d4571d3c'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'VersionLabelID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd1115805-f6ae-4d31-a5c7-b264d4571d3c',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100002,
            'VersionLabelID',
            'Version Label ID',
            'The version label being restored to',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ac97cb1c-edc2-4f61-9a22-716e0c589ad8'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ac97cb1c-edc2-4f61-9a22-716e0c589ad8',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100003,
            'Status',
            'Status',
            'Current status of the restore operation',
            'nvarchar',
            100,
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fd4d9395-fd9f-4057-9b27-00cbd6364a23'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'StartedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fd4d9395-fd9f-4057-9b27-00cbd6364a23',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100004,
            'StartedAt',
            'Started At',
            'When the restore operation began',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'de4080d6-4d88-4f77-a5c0-f400fd909cab'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'EndedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'de4080d6-4d88-4f77-a5c0-f400fd909cab',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100005,
            'EndedAt',
            'Ended At',
            'When the restore operation completed or failed',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '74719119-d002-450b-b946-f2b7ba2f0883'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '74719119-d002-450b-b946-f2b7ba2f0883',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100006,
            'UserID',
            'User ID',
            'The user who initiated the restore',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4c6a2a91-822f-42fd-bc6e-149b484b7328'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'TotalItems')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4c6a2a91-822f-42fd-bc6e-149b484b7328',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100007,
            'TotalItems',
            'Total Items',
            'Total number of records to restore',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'aa1a968c-39ca-49b1-94dd-340e6ceffd33'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'CompletedItems')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'aa1a968c-39ca-49b1-94dd-340e6ceffd33',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100008,
            'CompletedItems',
            'Completed Items',
            'Number of records successfully restored so far',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4b96b74e-29b2-4163-9a02-3dd364df7682'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'FailedItems')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4b96b74e-29b2-4163-9a02-3dd364df7682',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100009,
            'FailedItems',
            'Failed Items',
            'Number of records that failed to restore',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '69a18a2c-5394-4c52-b86f-441b97e51780'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'ErrorLog')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '69a18a2c-5394-4c52-b86f-441b97e51780',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100010,
            'ErrorLog',
            'Error Log',
            'Detailed error information for failed restore items',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4972a84a-4356-4b06-aa76-c1231e323ef2'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'PreRestoreLabelID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4972a84a-4356-4b06-aa76-c1231e323ef2',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100011,
            'PreRestoreLabelID',
            'Pre Restore Label ID',
            'Reference to the automatically created safety-net label that captured state before the restore began',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1dd6e503-14d3-41a3-baa6-5642bfbd32d4'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1dd6e503-14d3-41a3-baa6-5642bfbd32d4',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '18cf0b2e-e0e4-4290-b989-418e4feb4a30'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '18cf0b2e-e0e4-4290-b989-418e4feb4a30',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'df3297c2-22ab-4551-8d57-64cb9922723f'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'df3297c2-22ab-4551-8d57-64cb9922723f',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7ccb8fb5-09a3-4cda-b3cb-11262c4aa846'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7ccb8fb5-09a3-4cda-b3cb-11262c4aa846',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100002,
            'Name',
            'Name',
            'Human-readable label name, e.g. Release 2.5, Pre-Refactor Snapshot',
            'nvarchar',
            400,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f6ea2c8e-b538-4018-83b0-364680b65799'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f6ea2c8e-b538-4018-83b0-364680b65799',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100003,
            'Description',
            'Description',
            'Optional longer description of what this label represents',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '859a85aa-aafc-458d-8fc9-57fff28e7fb5'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = 'Scope')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '859a85aa-aafc-458d-8fc9-57fff28e7fb5',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100004,
            'Scope',
            'Scope',
            'Breadth of the label: System (all entities), Entity (one entity type), or Record (one record and its dependency graph)',
            'nvarchar',
            100,
            0,
            0,
            0,
            'System',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6cd22454-2e23-443b-b89b-f8045d1ca0f1'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = 'EntityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6cd22454-2e23-443b-b89b-f8045d1ca0f1',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100005,
            'EntityID',
            'Entity ID',
            'When Scope is Entity or Record, identifies the target entity. NULL for System scope.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5132ea2f-eb6b-48f1-b02a-235009ca0c94'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = 'RecordID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5132ea2f-eb6b-48f1-b02a-235009ca0c94',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100006,
            'RecordID',
            'Record ID',
            'When Scope is Record, identifies the specific record. NULL for System and Entity scopes.',
            'nvarchar',
            1500,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4ddd8ab5-7e88-47b6-a099-69efdb48179f'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4ddd8ab5-7e88-47b6-a099-69efdb48179f',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100007,
            'Status',
            'Status',
            'Lifecycle state: Active (current), Archived (historical reference only), Restored (this label was used in a restore operation)',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '522a4786-d967-4951-a9a0-3271d6739ff4'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = 'CreatedByUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '522a4786-d967-4951-a9a0-3271d6739ff4',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100008,
            'CreatedByUserID',
            'Created By User ID',
            'The user who created this version label',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3be91c89-3325-48df-bfa7-e6736f92f11f'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = 'ExternalSystemID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3be91c89-3325-48df-bfa7-e6736f92f11f',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100009,
            'ExternalSystemID',
            'External System ID',
            'Optional reference to an external system identifier such as a git SHA, release tag, or deployment ID',
            'nvarchar',
            400,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f9eb84f3-68d8-485d-ae5b-37b5478e890c'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f9eb84f3-68d8-485d-ae5b-37b5478e890c',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100010,
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b8d739dd-f555-494c-860b-5eb6dfab43d3'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b8d739dd-f555-494c-860b-5eb6dfab43d3',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100011,
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '53a8083b-8de2-454b-b307-abbc544dbe3f'  OR 
               (EntityID = '94654088-BFB4-41AC-A0E0-B89A3F31A004' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '53a8083b-8de2-454b-b307-abbc544dbe3f',
            '94654088-BFB4-41AC-A0E0-B89A3F31A004', -- Entity: MJ: Version Label Items
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'daf7bd7e-e346-4c6d-b307-7beae6c02673'  OR 
               (EntityID = '94654088-BFB4-41AC-A0E0-B89A3F31A004' AND Name = 'VersionLabelID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'daf7bd7e-e346-4c6d-b307-7beae6c02673',
            '94654088-BFB4-41AC-A0E0-B89A3F31A004', -- Entity: MJ: Version Label Items
            100002,
            'VersionLabelID',
            'Version Label ID',
            'The version label this item belongs to',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6d119c38-cf13-4340-88d3-faec04840957'  OR 
               (EntityID = '94654088-BFB4-41AC-A0E0-B89A3F31A004' AND Name = 'RecordChangeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6d119c38-cf13-4340-88d3-faec04840957',
            '94654088-BFB4-41AC-A0E0-B89A3F31A004', -- Entity: MJ: Version Label Items
            100003,
            'RecordChangeID',
            'Record Change ID',
            'The specific RecordChange entry representing the record state at label creation time',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'F5238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a9583cb8-f0a0-4590-9374-0bae73a5432d'  OR 
               (EntityID = '94654088-BFB4-41AC-A0E0-B89A3F31A004' AND Name = 'EntityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a9583cb8-f0a0-4590-9374-0bae73a5432d',
            '94654088-BFB4-41AC-A0E0-B89A3F31A004', -- Entity: MJ: Version Label Items
            100004,
            'EntityID',
            'Entity ID',
            'Denormalized entity reference for query performance',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '64d39b92-5102-48c9-910f-0623c2c245a2'  OR 
               (EntityID = '94654088-BFB4-41AC-A0E0-B89A3F31A004' AND Name = 'RecordID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '64d39b92-5102-48c9-910f-0623c2c245a2',
            '94654088-BFB4-41AC-A0E0-B89A3F31A004', -- Entity: MJ: Version Label Items
            100005,
            'RecordID',
            'Record ID',
            'Denormalized record primary key for query performance',
            'nvarchar',
            1500,
            0,
            0,
            0,
            'null',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0d1be3fe-8cd9-4e21-9716-e58bb4722eae'  OR 
               (EntityID = '94654088-BFB4-41AC-A0E0-B89A3F31A004' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0d1be3fe-8cd9-4e21-9716-e58bb4722eae',
            '94654088-BFB4-41AC-A0E0-B89A3F31A004', -- Entity: MJ: Version Label Items
            100006,
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '45c989cc-ab28-4bbe-94a6-4b53a4d1a124'  OR 
               (EntityID = '94654088-BFB4-41AC-A0E0-B89A3F31A004' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '45c989cc-ab28-4bbe-94a6-4b53a4d1a124',
            '94654088-BFB4-41AC-A0E0-B89A3F31A004', -- Entity: MJ: Version Label Items
            100007,
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
            'Search'
         )
      END

/* SQL text to insert entity field value with ID 8c605d76-e391-41e4-96e7-2fd9f8b49227 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8c605d76-e391-41e4-96e7-2fd9f8b49227', 'B75717F0-6F36-EF11-86D4-6045BDEE16E6', 3, 'Snapshot', 'Snapshot')

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=4 WHERE ID='74CBC28F-D8C6-4314-B012-3D0751DDBE35'

/* SQL text to insert entity field value with ID d45d4fd9-a4f7-4f14-ad58-9445b060187e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d45d4fd9-a4f7-4f14-ad58-9445b060187e', '859A85AA-AAFC-458D-8FC9-57FFF28E7FB5', 1, 'Entity', 'Entity')

/* SQL text to insert entity field value with ID 278ebf28-cfc6-4022-86ec-adda6d91a135 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('278ebf28-cfc6-4022-86ec-adda6d91a135', '859A85AA-AAFC-458D-8FC9-57FFF28E7FB5', 2, 'Record', 'Record')

/* SQL text to insert entity field value with ID 188c58f6-a412-4ea8-a1f1-900c64abbb06 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('188c58f6-a412-4ea8-a1f1-900c64abbb06', '859A85AA-AAFC-458D-8FC9-57FFF28E7FB5', 3, 'System', 'System')

/* SQL text to update ValueListType for entity field ID 859A85AA-AAFC-458D-8FC9-57FFF28E7FB5 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='859A85AA-AAFC-458D-8FC9-57FFF28E7FB5'

/* SQL text to insert entity field value with ID 8d83cc55-280d-474f-bb97-133b425b0878 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8d83cc55-280d-474f-bb97-133b425b0878', '4DDD8AB5-7E88-47B6-A099-69EFDB48179F', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 49b9d14d-8c04-45fc-ab92-aa55f74cf5ad */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('49b9d14d-8c04-45fc-ab92-aa55f74cf5ad', '4DDD8AB5-7E88-47B6-A099-69EFDB48179F', 2, 'Archived', 'Archived')

/* SQL text to insert entity field value with ID 341271b0-619f-442e-a8c9-50b5bffde6c7 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('341271b0-619f-442e-a8c9-50b5bffde6c7', '4DDD8AB5-7E88-47B6-A099-69EFDB48179F', 3, 'Restored', 'Restored')

/* SQL text to update ValueListType for entity field ID 4DDD8AB5-7E88-47B6-A099-69EFDB48179F */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='4DDD8AB5-7E88-47B6-A099-69EFDB48179F'

/* SQL text to insert entity field value with ID 28a7ff98-0638-43fa-8db0-392ae2bb1740 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('28a7ff98-0638-43fa-8db0-392ae2bb1740', 'AC97CB1C-EDC2-4F61-9A22-716E0C589AD8', 1, 'Complete', 'Complete')

/* SQL text to insert entity field value with ID 121052f3-9000-4ae1-9d50-b9e7eb65218b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('121052f3-9000-4ae1-9d50-b9e7eb65218b', 'AC97CB1C-EDC2-4F61-9A22-716E0C589AD8', 2, 'Error', 'Error')

/* SQL text to insert entity field value with ID 6e6205f6-7d8d-41f2-9a9f-62048033acf0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6e6205f6-7d8d-41f2-9a9f-62048033acf0', 'AC97CB1C-EDC2-4F61-9A22-716E0C589AD8', 3, 'In Progress', 'In Progress')

/* SQL text to insert entity field value with ID 2d4d0e9e-ae9d-472b-9aaa-834ef8e30f67 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2d4d0e9e-ae9d-472b-9aaa-834ef8e30f67', 'AC97CB1C-EDC2-4F61-9A22-716E0C589AD8', 4, 'Partial', 'Partial')

/* SQL text to insert entity field value with ID c30b1e7f-b3f4-4a82-8060-7dd832f19c71 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c30b1e7f-b3f4-4a82-8060-7dd832f19c71', 'AC97CB1C-EDC2-4F61-9A22-716E0C589AD8', 5, 'Pending', 'Pending')

/* SQL text to update ValueListType for entity field ID AC97CB1C-EDC2-4F61-9A22-716E0C589AD8 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='AC97CB1C-EDC2-4F61-9A22-716E0C589AD8'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '806d116e-c0d0-4430-a32d-004ae4732b2b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('806d116e-c0d0-4430-a32d-004ae4732b2b', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '94654088-BFB4-41AC-A0E0-B89A3F31A004', 'EntityID', 'One To Many', 1, 1, 'MJ: Version Label Items', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f8666b78-bd3d-4cda-9297-629a767b2118'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f8666b78-bd3d-4cda-9297-629a767b2118', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', 'EntityID', 'One To Many', 1, 1, 'MJ: Version Labels', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c120bad4-9736-425f-8780-5d3cf057fb36'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c120bad4-9736-425f-8780-5d3cf057fb36', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', 'CreatedByUserID', 'One To Many', 1, 1, 'MJ: Version Labels', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ecf3a06f-f077-41d5-b264-8a4a75aceb07'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ecf3a06f-f077-41d5-b264-8a4a75aceb07', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', 'UserID', 'One To Many', 1, 1, 'MJ: Version Label Restores', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1cb3fcb0-545a-4352-ac37-531836229b9b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1cb3fcb0-545a-4352-ac37-531836229b9b', 'F5238F34-2837-EF11-86D4-6045BDEE16E6', '94654088-BFB4-41AC-A0E0-B89A3F31A004', 'RecordChangeID', 'One To Many', 1, 1, 'MJ: Version Label Items', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '0ef46ffc-7247-4801-b175-2831c727f191'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('0ef46ffc-7247-4801-b175-2831c727f191', 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', '94654088-BFB4-41AC-A0E0-B89A3F31A004', 'VersionLabelID', 'One To Many', 1, 1, 'MJ: Version Label Items', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '386c481d-5cb2-4c7c-973a-d05ee15fcb7d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('386c481d-5cb2-4c7c-973a-d05ee15fcb7d', 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', 'VersionLabelID', 'One To Many', 1, 1, 'MJ: Version Label Restores', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '2652c8f9-f9ca-499d-84f0-007b856d00c6'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('2652c8f9-f9ca-499d-84f0-007b856d00c6', 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', 'PreRestoreLabelID', 'One To Many', 1, 1, 'MJ: Version Label Restores', 3);
   END
                              

/* Index for Foreign Keys for VersionLabelItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key VersionLabelID in table VersionLabelItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VersionLabelItem_VersionLabelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VersionLabelItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VersionLabelItem_VersionLabelID ON [${flyway:defaultSchema}].[VersionLabelItem] ([VersionLabelID]);

-- Index for foreign key RecordChangeID in table VersionLabelItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VersionLabelItem_RecordChangeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VersionLabelItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VersionLabelItem_RecordChangeID ON [${flyway:defaultSchema}].[VersionLabelItem] ([RecordChangeID]);

-- Index for foreign key EntityID in table VersionLabelItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VersionLabelItem_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VersionLabelItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VersionLabelItem_EntityID ON [${flyway:defaultSchema}].[VersionLabelItem] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID DAF7BD7E-E346-4C6D-B307-7BEAE6C02673 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DAF7BD7E-E346-4C6D-B307-7BEAE6C02673',
         @RelatedEntityNameFieldMap='VersionLabel'

/* SQL text to update entity field related entity name field map for entity field ID 6D119C38-CF13-4340-88D3-FAEC04840957 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6D119C38-CF13-4340-88D3-FAEC04840957',
         @RelatedEntityNameFieldMap='RecordChange'

/* SQL text to update entity field related entity name field map for entity field ID A9583CB8-F0A0-4590-9374-0BAE73A5432D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A9583CB8-F0A0-4590-9374-0BAE73A5432D',
         @RelatedEntityNameFieldMap='Entity'

/* Base View SQL for MJ: Version Label Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Items
-- Item: vwVersionLabelItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Version Label Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  VersionLabelItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwVersionLabelItems]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwVersionLabelItems];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwVersionLabelItems]
AS
SELECT
    v.*,
    VersionLabel_VersionLabelID.[Name] AS [VersionLabel],
    RecordChange_RecordChangeID.[ChangesDescription] AS [RecordChange],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[VersionLabelItem] AS v
INNER JOIN
    [${flyway:defaultSchema}].[VersionLabel] AS VersionLabel_VersionLabelID
  ON
    [v].[VersionLabelID] = VersionLabel_VersionLabelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[RecordChange] AS RecordChange_RecordChangeID
  ON
    [v].[RecordChangeID] = RecordChange_RecordChangeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [v].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionLabelItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Version Label Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Items
-- Item: Permissions for vwVersionLabelItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionLabelItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Version Label Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Items
-- Item: spCreateVersionLabelItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VersionLabelItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateVersionLabelItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateVersionLabelItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateVersionLabelItem]
    @ID uniqueidentifier = NULL,
    @VersionLabelID uniqueidentifier,
    @RecordChangeID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[VersionLabelItem]
            (
                [ID],
                [VersionLabelID],
                [RecordChangeID],
                [EntityID],
                [RecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @VersionLabelID,
                @RecordChangeID,
                @EntityID,
                @RecordID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[VersionLabelItem]
            (
                [VersionLabelID],
                [RecordChangeID],
                [EntityID],
                [RecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @VersionLabelID,
                @RecordChangeID,
                @EntityID,
                @RecordID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwVersionLabelItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionLabelItem] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Version Label Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionLabelItem] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Version Label Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Items
-- Item: spUpdateVersionLabelItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VersionLabelItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateVersionLabelItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionLabelItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionLabelItem]
    @ID uniqueidentifier,
    @VersionLabelID uniqueidentifier,
    @RecordChangeID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionLabelItem]
    SET
        [VersionLabelID] = @VersionLabelID,
        [RecordChangeID] = @RecordChangeID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwVersionLabelItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwVersionLabelItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionLabelItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the VersionLabelItem table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateVersionLabelItem]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateVersionLabelItem];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateVersionLabelItem
ON [${flyway:defaultSchema}].[VersionLabelItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionLabelItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[VersionLabelItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Version Label Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionLabelItem] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Version Label Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Items
-- Item: spDeleteVersionLabelItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VersionLabelItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteVersionLabelItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionLabelItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionLabelItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[VersionLabelItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionLabelItem] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Version Label Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionLabelItem] TO [cdp_Integration]



/* Index for Foreign Keys for VersionLabelRestore */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Restores
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key VersionLabelID in table VersionLabelRestore
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VersionLabelRestore_VersionLabelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VersionLabelRestore]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VersionLabelRestore_VersionLabelID ON [${flyway:defaultSchema}].[VersionLabelRestore] ([VersionLabelID]);

-- Index for foreign key UserID in table VersionLabelRestore
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VersionLabelRestore_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VersionLabelRestore]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VersionLabelRestore_UserID ON [${flyway:defaultSchema}].[VersionLabelRestore] ([UserID]);

-- Index for foreign key PreRestoreLabelID in table VersionLabelRestore
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VersionLabelRestore_PreRestoreLabelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VersionLabelRestore]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VersionLabelRestore_PreRestoreLabelID ON [${flyway:defaultSchema}].[VersionLabelRestore] ([PreRestoreLabelID]);

/* SQL text to update entity field related entity name field map for entity field ID D1115805-F6AE-4D31-A5C7-B264D4571D3C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D1115805-F6AE-4D31-A5C7-B264D4571D3C',
         @RelatedEntityNameFieldMap='VersionLabel'

/* Index for Foreign Keys for VersionLabel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table VersionLabel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VersionLabel_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VersionLabel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VersionLabel_EntityID ON [${flyway:defaultSchema}].[VersionLabel] ([EntityID]);

-- Index for foreign key CreatedByUserID in table VersionLabel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VersionLabel_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VersionLabel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VersionLabel_CreatedByUserID ON [${flyway:defaultSchema}].[VersionLabel] ([CreatedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 6CD22454-2E23-443B-B89B-F8045D1CA0F1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6CD22454-2E23-443B-B89B-F8045D1CA0F1',
         @RelatedEntityNameFieldMap='Entity'

/* SQL text to update entity field related entity name field map for entity field ID 74719119-D002-450B-B946-F2B7BA2F0883 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='74719119-D002-450B-B946-F2B7BA2F0883',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 522A4786-D967-4951-A9A0-3271D6739FF4 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='522A4786-D967-4951-A9A0-3271D6739FF4',
         @RelatedEntityNameFieldMap='CreatedByUser'

/* SQL text to update entity field related entity name field map for entity field ID 4972A84A-4356-4B06-AA76-C1231E323EF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4972A84A-4356-4B06-AA76-C1231E323EF2',
         @RelatedEntityNameFieldMap='PreRestoreLabel'

/* Base View SQL for MJ: Version Labels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: vwVersionLabels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Version Labels
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  VersionLabel
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwVersionLabels]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwVersionLabels];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwVersionLabels]
AS
SELECT
    v.*,
    Entity_EntityID.[Name] AS [Entity],
    User_CreatedByUserID.[Name] AS [CreatedByUser]
FROM
    [${flyway:defaultSchema}].[VersionLabel] AS v
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [v].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_CreatedByUserID
  ON
    [v].[CreatedByUserID] = User_CreatedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionLabels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Version Labels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: Permissions for vwVersionLabels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionLabels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Version Labels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: spCreateVersionLabel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VersionLabel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateVersionLabel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateVersionLabel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateVersionLabel]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @Scope nvarchar(50) = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @Status nvarchar(50) = NULL,
    @CreatedByUserID uniqueidentifier,
    @ExternalSystemID nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[VersionLabel]
            (
                [ID],
                [Name],
                [Description],
                [Scope],
                [EntityID],
                [RecordID],
                [Status],
                [CreatedByUserID],
                [ExternalSystemID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@Scope, 'System'),
                @EntityID,
                @RecordID,
                ISNULL(@Status, 'Active'),
                @CreatedByUserID,
                @ExternalSystemID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[VersionLabel]
            (
                [Name],
                [Description],
                [Scope],
                [EntityID],
                [RecordID],
                [Status],
                [CreatedByUserID],
                [ExternalSystemID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@Scope, 'System'),
                @EntityID,
                @RecordID,
                ISNULL(@Status, 'Active'),
                @CreatedByUserID,
                @ExternalSystemID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwVersionLabels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionLabel] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Version Labels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionLabel] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Version Labels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: spUpdateVersionLabel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VersionLabel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateVersionLabel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionLabel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionLabel]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @Scope nvarchar(50),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @Status nvarchar(50),
    @CreatedByUserID uniqueidentifier,
    @ExternalSystemID nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionLabel]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Scope] = @Scope,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [Status] = @Status,
        [CreatedByUserID] = @CreatedByUserID,
        [ExternalSystemID] = @ExternalSystemID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwVersionLabels] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwVersionLabels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionLabel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the VersionLabel table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateVersionLabel]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateVersionLabel];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateVersionLabel
ON [${flyway:defaultSchema}].[VersionLabel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionLabel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[VersionLabel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Version Labels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionLabel] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Version Labels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: spDeleteVersionLabel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VersionLabel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteVersionLabel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionLabel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionLabel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[VersionLabel]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionLabel] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Version Labels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionLabel] TO [cdp_Integration]



/* Base View SQL for MJ: Version Label Restores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Restores
-- Item: vwVersionLabelRestores
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Version Label Restores
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  VersionLabelRestore
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwVersionLabelRestores]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwVersionLabelRestores];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwVersionLabelRestores]
AS
SELECT
    v.*,
    VersionLabel_VersionLabelID.[Name] AS [VersionLabel],
    User_UserID.[Name] AS [User],
    VersionLabel_PreRestoreLabelID.[Name] AS [PreRestoreLabel]
FROM
    [${flyway:defaultSchema}].[VersionLabelRestore] AS v
INNER JOIN
    [${flyway:defaultSchema}].[VersionLabel] AS VersionLabel_VersionLabelID
  ON
    [v].[VersionLabelID] = VersionLabel_VersionLabelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [v].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VersionLabel] AS VersionLabel_PreRestoreLabelID
  ON
    [v].[PreRestoreLabelID] = VersionLabel_PreRestoreLabelID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionLabelRestores] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Version Label Restores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Restores
-- Item: Permissions for vwVersionLabelRestores
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionLabelRestores] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Version Label Restores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Restores
-- Item: spCreateVersionLabelRestore
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VersionLabelRestore
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateVersionLabelRestore]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateVersionLabelRestore];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateVersionLabelRestore]
    @ID uniqueidentifier = NULL,
    @VersionLabelID uniqueidentifier,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt datetimeoffset,
    @UserID uniqueidentifier,
    @TotalItems int = NULL,
    @CompletedItems int = NULL,
    @FailedItems int = NULL,
    @ErrorLog nvarchar(MAX),
    @PreRestoreLabelID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[VersionLabelRestore]
            (
                [ID],
                [VersionLabelID],
                [Status],
                [StartedAt],
                [EndedAt],
                [UserID],
                [TotalItems],
                [CompletedItems],
                [FailedItems],
                [ErrorLog],
                [PreRestoreLabelID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @VersionLabelID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@StartedAt, getutcdate()),
                @EndedAt,
                @UserID,
                ISNULL(@TotalItems, 0),
                ISNULL(@CompletedItems, 0),
                ISNULL(@FailedItems, 0),
                @ErrorLog,
                @PreRestoreLabelID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[VersionLabelRestore]
            (
                [VersionLabelID],
                [Status],
                [StartedAt],
                [EndedAt],
                [UserID],
                [TotalItems],
                [CompletedItems],
                [FailedItems],
                [ErrorLog],
                [PreRestoreLabelID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @VersionLabelID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@StartedAt, getutcdate()),
                @EndedAt,
                @UserID,
                ISNULL(@TotalItems, 0),
                ISNULL(@CompletedItems, 0),
                ISNULL(@FailedItems, 0),
                @ErrorLog,
                @PreRestoreLabelID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwVersionLabelRestores] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionLabelRestore] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Version Label Restores */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionLabelRestore] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Version Label Restores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Restores
-- Item: spUpdateVersionLabelRestore
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VersionLabelRestore
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateVersionLabelRestore]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionLabelRestore];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionLabelRestore]
    @ID uniqueidentifier,
    @VersionLabelID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @UserID uniqueidentifier,
    @TotalItems int,
    @CompletedItems int,
    @FailedItems int,
    @ErrorLog nvarchar(MAX),
    @PreRestoreLabelID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionLabelRestore]
    SET
        [VersionLabelID] = @VersionLabelID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [UserID] = @UserID,
        [TotalItems] = @TotalItems,
        [CompletedItems] = @CompletedItems,
        [FailedItems] = @FailedItems,
        [ErrorLog] = @ErrorLog,
        [PreRestoreLabelID] = @PreRestoreLabelID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwVersionLabelRestores] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwVersionLabelRestores]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionLabelRestore] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the VersionLabelRestore table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateVersionLabelRestore]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateVersionLabelRestore];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateVersionLabelRestore
ON [${flyway:defaultSchema}].[VersionLabelRestore]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionLabelRestore]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[VersionLabelRestore] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Version Label Restores */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionLabelRestore] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Version Label Restores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Restores
-- Item: spDeleteVersionLabelRestore
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VersionLabelRestore
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteVersionLabelRestore]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionLabelRestore];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionLabelRestore]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[VersionLabelRestore]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionLabelRestore] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Version Label Restores */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionLabelRestore] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3f8ebf2f-1068-43c0-b247-6d2f056d3a55'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'VersionLabel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3f8ebf2f-1068-43c0-b247-6d2f056d3a55',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100027,
            'VersionLabel',
            'Version Label',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f10874dd-718e-4c41-824f-3e314d5ad273'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'User')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f10874dd-718e-4c41-824f-3e314d5ad273',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100028,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2aaad83e-829d-463d-acaa-dc318430e58f'  OR 
               (EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE' AND Name = 'PreRestoreLabel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2aaad83e-829d-463d-acaa-dc318430e58f',
            '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', -- Entity: MJ: Version Label Restores
            100029,
            'PreRestoreLabel',
            'Pre Restore Label',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '13042bd8-3f94-4fe5-aea8-ebccb107c549'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = 'Entity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '13042bd8-3f94-4fe5-aea8-ebccb107c549',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100023,
            'Entity',
            'Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ba0a2e5d-3e9f-498c-ade5-282e97cb9947'  OR 
               (EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2' AND Name = 'CreatedByUser')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ba0a2e5d-3e9f-498c-ade5-282e97cb9947',
            'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', -- Entity: MJ: Version Labels
            100024,
            'CreatedByUser',
            'Created By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b3944d03-3bfe-41e1-ac63-0ff6692e95e3'  OR 
               (EntityID = '94654088-BFB4-41AC-A0E0-B89A3F31A004' AND Name = 'VersionLabel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b3944d03-3bfe-41e1-ac63-0ff6692e95e3',
            '94654088-BFB4-41AC-A0E0-B89A3F31A004', -- Entity: MJ: Version Label Items
            100015,
            'VersionLabel',
            'Version Label',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e569d37b-6876-422c-b167-431e5cc5919c'  OR 
               (EntityID = '94654088-BFB4-41AC-A0E0-B89A3F31A004' AND Name = 'RecordChange')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e569d37b-6876-422c-b167-431e5cc5919c',
            '94654088-BFB4-41AC-A0E0-B89A3F31A004', -- Entity: MJ: Version Label Items
            100016,
            'RecordChange',
            'Record Change',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fee4ed43-7f71-4206-8c79-e9f3f25b67ad'  OR 
               (EntityID = '94654088-BFB4-41AC-A0E0-B89A3F31A004' AND Name = 'Entity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fee4ed43-7f71-4206-8c79-e9f3f25b67ad',
            '94654088-BFB4-41AC-A0E0-B89A3F31A004', -- Entity: MJ: Version Label Items
            100017,
            'Entity',
            'Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3F8EBF2F-1068-43C0-B247-6D2F056D3A55'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AC97CB1C-EDC2-4F61-9A22-716E0C589AD8'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FD4D9395-FD9F-4057-9B27-00CBD6364A23'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DE4080D6-4D88-4F77-A5C0-F400FD909CAB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4C6A2A91-822F-42FD-BC6E-149B484B7328'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AA1A968C-39CA-49B1-94DD-340E6CEFFD33'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4B96B74E-29B2-4163-9A02-3DD364DF7682'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3F8EBF2F-1068-43C0-B247-6D2F056D3A55'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F10874DD-718E-4C41-824F-3E314D5AD273'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2AAAD83E-829D-463D-ACAA-DC318430E58F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AC97CB1C-EDC2-4F61-9A22-716E0C589AD8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3F8EBF2F-1068-43C0-B247-6D2F056D3A55'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F10874DD-718E-4C41-824F-3E314D5AD273'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2AAAD83E-829D-463D-ACAA-DC318430E58F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B3944D03-3BFE-41E1-AC63-0FF6692E95E3'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '64D39B92-5102-48C9-910F-0623C2C245A2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B3944D03-3BFE-41E1-AC63-0FF6692E95E3'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FEE4ED43-7F71-4206-8C79-E9F3F25B67AD'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '64D39B92-5102-48C9-910F-0623C2C245A2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B3944D03-3BFE-41E1-AC63-0FF6692E95E3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E569D37B-6876-422C-B167-431E5CC5919C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FEE4ED43-7F71-4206-8C79-E9F3F25B67AD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '7CCB8FB5-09A3-4CDA-B3CB-11262C4AA846'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7CCB8FB5-09A3-4CDA-B3CB-11262C4AA846'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '859A85AA-AAFC-458D-8FC9-57FFF28E7FB5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4DDD8AB5-7E88-47B6-A099-69EFDB48179F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3BE91C89-3325-48DF-BFA7-E6736F92F11F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BA0A2E5D-3E9F-498C-ADE5-282E97CB9947'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7CCB8FB5-09A3-4CDA-B3CB-11262C4AA846'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3BE91C89-3325-48DF-BFA7-E6736F92F11F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BA0A2E5D-3E9F-498C-ADE5-282E97CB9947'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 16 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8DC197F6-DA93-49C1-810F-9E57005A154F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Version Label',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D1115805-F6AE-4D31-A5C7-B264D4571D3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Version Label Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3F8EBF2F-1068-43C0-B247-6D2F056D3A55'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Pre‑Restore Label',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4972A84A-4356-4B06-AA76-C1231E323EF2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Pre‑Restore Label Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2AAAD83E-829D-463D-ACAA-DC318430E58F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '74719119-D002-450B-B946-F2B7BA2F0883'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F10874DD-718E-4C41-824F-3E314D5AD273'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AC97CB1C-EDC2-4F61-9A22-716E0C589AD8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD4D9395-FD9F-4057-9B27-00CBD6364A23'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DE4080D6-4D88-4F77-A5C0-F400FD909CAB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '69A18A2C-5394-4C52-B86F-441B97E51780'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Progress Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Items',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4C6A2A91-822F-42FD-BC6E-149B484B7328'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Progress Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed Items',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA1A968C-39CA-49B1-94DD-340E6CEFFD33'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Progress Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Failed Items',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B96B74E-29B2-4163-9A02-3DD364DF7682'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1DD6E503-14D3-41A3-BAA6-5642BFBD32D4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '18CF0B2E-E0E4-4290-B989-418E4FEB4A30'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-history */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-history',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8d500d14-3889-44e5-a8d1-1c9564b1c742', '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', 'FieldCategoryInfo', '{"Restore Context":{"icon":"fa fa-history","description":"Identifiers and names for the version being restored, its pre‑restore safety‑net label, and the initiating user."},"Execution Details":{"icon":"fa fa-cogs","description":"Current status, start/end timestamps, and any error information describing how the restore ran."},"Progress Metrics":{"icon":"fa fa-chart-line","description":"Counts of total, completed and failed items indicating the progress of the restore operation."},"System Metadata":{"icon":"fa fa-cog","description":"System‑generated audit fields such as record ID and creation/modification timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7692977f-0233-4a12-93ac-e67db0065cbb', '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE', 'FieldCategoryIcons', '{"Restore Context":"fa fa-history","Execution Details":"fa fa-cogs","Progress Metrics":"fa fa-chart-line","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: supporting, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '9F78DAF8-16A6-4FD7-BC8F-54DC5E58D4FE'
         

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Label Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF3297C2-22AB-4551-8D57-64CB9922723F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Label Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7CCB8FB5-09A3-4CDA-B3CB-11262C4AA846'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Label Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F6EA2C8E-B538-4018-83B0-364680B65799'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Label Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '859A85AA-AAFC-458D-8FC9-57FFF28E7FB5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Label Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4DDD8AB5-7E88-47B6-A099-69EFDB48179F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Target Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6CD22454-2E23-443B-B89B-F8045D1CA0F1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Target Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5132EA2F-EB6B-48F1-B02A-235009CA0C94'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Target Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '13042BD8-3F94-4FE5-AEA8-EBCCB107C549'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Integration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '522A4786-D967-4951-A9A0-3271D6739FF4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Integration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BA0A2E5D-3E9F-498C-ADE5-282E97CB9947'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership & Integration',
       GeneratedFormSection = 'Category',
       DisplayName = 'External System ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3BE91C89-3325-48DF-BFA7-E6736F92F11F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F9EB84F3-68D8-485D-AE5B-37B5478E890C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B8D739DD-F555-494C-860B-5EB6DFAB43D3'
   AND AutoUpdateCategory = 1

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Version Label Item',
       GeneratedFormSection = 'Category',
       DisplayName = 'Item ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '53A8083B-8DE2-454B-B307-ABBC544DBE3F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Version Label Item',
       GeneratedFormSection = 'Category',
       DisplayName = 'Version Label',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DAF7BD7E-E346-4C6D-B307-7BEAE6C02673'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Version Label Item',
       GeneratedFormSection = 'Category',
       DisplayName = 'Version Label Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B3944D03-3BFE-41E1-AC63-0FF6692E95E3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Snapshot',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record Change',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D119C38-CF13-4340-88D3-FAEC04840957'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Snapshot',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record Change Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E569D37B-6876-422C-B167-431E5CC5919C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Snapshot',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '64D39B92-5102-48C9-910F-0623C2C245A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Snapshot',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A9583CB8-F0A0-4590-9374-0BAE73A5432D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Snapshot',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FEE4ED43-7F71-4206-8C79-E9F3F25B67AD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D1BE3FE-8CD9-4E21-9716-E58BB4722EAE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '45C989CC-AB28-4BBE-94A6-4B53A4D1A124'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tag */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tag',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('602f41a3-6ad0-4734-9a8e-a336cf0e6fcc', 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', 'FieldCategoryInfo', '{"Label Details":{"icon":"fa fa-tag","description":"Core attributes of the version label including name, description, scope, and lifecycle status"},"Target Scope":{"icon":"fa fa-bullseye","description":"Defines which entity or specific record the label applies to"},"Ownership & Integration":{"icon":"fa fa-user","description":"Information about the creator of the label and any external system linkage"},"System Metadata":{"icon":"fa fa-cog","description":"Audit timestamps automatically managed by the system"}}', GETUTCDATE(), GETUTCDATE())
            

/* Set entity icon to fa fa-code-branch */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-code-branch',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '94654088-BFB4-41AC-A0E0-B89A3F31A004'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4fe14fa1-272a-4e2e-9f97-731ccd68c51d', '94654088-BFB4-41AC-A0E0-B89A3F31A004', 'FieldCategoryInfo', '{"Version Label Item":{"icon":"fa fa-tag","description":"Core information linking a version label to its identifier and display name"},"Record Snapshot":{"icon":"fa fa-history","description":"Details of the captured record change, including record and entity identifiers"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields tracking creation and modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('43379feb-26a9-40a0-b806-7fe88c1a49a9', 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2', 'FieldCategoryIcons', '{"Label Details":"fa fa-tag","Target Scope":"fa fa-bullseye","Ownership & Integration":"fa fa-user","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'C9102EC4-CB6B-4375-A0CA-8FD738887AA2'
         

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ad2fe713-7e46-4045-96db-6c011514a9d1', '94654088-BFB4-41AC-A0E0-B89A3F31A004', 'FieldCategoryIcons', '{"Version Label Item":"fa fa-tag","Record Snapshot":"fa fa-history","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: supporting, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '94654088-BFB4-41AC-A0E0-B89A3F31A004'
         

