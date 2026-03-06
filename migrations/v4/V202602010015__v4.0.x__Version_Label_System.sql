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
    Scope NVARCHAR(50) NOT NULL DEFAULT 'Record',
    EntityID UNIQUEIDENTIFIER NULL,
    RecordID NVARCHAR(750) NULL,
    ParentID UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    ExternalSystemID NVARCHAR(200) NULL,
    ItemCount INT NOT NULL DEFAULT 0,
    CreationDurationMS INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_VersionLabel PRIMARY KEY (ID),
    CONSTRAINT FK_VersionLabel_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_VersionLabel_CreatedByUser FOREIGN KEY (CreatedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_VersionLabel_Parent FOREIGN KEY (ParentID)
        REFERENCES ${flyway:defaultSchema}.VersionLabel(ID),
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
    @value = N'Breadth of the label: Record (one record and its dependency graph, the primary use case), Entity (one entity type), or System (all entities). Parent grouping labels may use any scope as a logical container.',
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

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Self-referencing parent for grouping related labels. When a user labels multiple records of the same entity, a parent label is created as the container and each individual record label references it via ParentID.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel',
    @level2type = N'COLUMN', @level2name = 'ParentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total number of VersionLabelItem rows created for this label. Populated after label creation completes.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel',
    @level2type = N'COLUMN', @level2name = 'ItemCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Time in milliseconds taken to create this label and all its items. Used for estimation of future label creation operations.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'VersionLabel',
    @level2type = N'COLUMN', @level2name = 'CreationDurationMS';

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
         '37f31ded-1186-46e6-b3a5-052cb31a8651',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '37f31ded-1186-46e6-b3a5-052cb31a8651', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Version Label Items for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('37f31ded-1186-46e6-b3a5-052cb31a8651', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Version Label Items for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('37f31ded-1186-46e6-b3a5-052cb31a8651', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Version Label Items for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('37f31ded-1186-46e6-b3a5-052cb31a8651', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         'ba866d80-7e29-47dc-8bd5-a3cc3b3b4912',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ba866d80-7e29-47dc-8bd5-a3cc3b3b4912', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Version Label Restores for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba866d80-7e29-47dc-8bd5-a3cc3b3b4912', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Version Label Restores for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba866d80-7e29-47dc-8bd5-a3cc3b3b4912', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Version Label Restores for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba866d80-7e29-47dc-8bd5-a3cc3b3b4912', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         'ed554027-0126-40ec-9a92-a002d309c4c6',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ed554027-0126-40ec-9a92-a002d309c4c6', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Version Labels for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed554027-0126-40ec-9a92-a002d309c4c6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Version Labels for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed554027-0126-40ec-9a92-a002d309c4c6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Version Labels for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed554027-0126-40ec-9a92-a002d309c4c6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.VersionLabelItem */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabelItem] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.VersionLabelItem */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabelItem] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.VersionLabel */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabel] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.VersionLabel */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabel] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.VersionLabelRestore */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabelRestore] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.VersionLabelRestore */
ALTER TABLE [${flyway:defaultSchema}].[VersionLabelRestore] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c1637db5-a88b-4665-882b-10ae7dc8cc2a'  OR 
               (EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'APIKey')
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
            'c1637db5-a88b-4665-882b-10ae7dc8cc2a',
            'C49BBAB8-6944-44AF-871B-01F599272E6E', -- Entity: MJ: API Key Usage Logs
            100035,
            'APIKey',
            'API Key',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cff93f49-9988-4255-a02f-3c88a827edde'  OR 
               (EntityID = '37F31DED-1186-46E6-B3A5-052CB31A8651' AND Name = 'ID')
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
            'cff93f49-9988-4255-a02f-3c88a827edde',
            '37F31DED-1186-46E6-B3A5-052CB31A8651', -- Entity: MJ: Version Label Items
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
         WHERE ID = '5370c6b6-9923-4236-9806-e27a303e386c'  OR 
               (EntityID = '37F31DED-1186-46E6-B3A5-052CB31A8651' AND Name = 'VersionLabelID')
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
            '5370c6b6-9923-4236-9806-e27a303e386c',
            '37F31DED-1186-46E6-B3A5-052CB31A8651', -- Entity: MJ: Version Label Items
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
            'ED554027-0126-40EC-9A92-A002D309C4C6',
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
         WHERE ID = 'eecde0d8-f321-42fa-9f71-ab5c7b0ee394'  OR 
               (EntityID = '37F31DED-1186-46E6-B3A5-052CB31A8651' AND Name = 'RecordChangeID')
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
            'eecde0d8-f321-42fa-9f71-ab5c7b0ee394',
            '37F31DED-1186-46E6-B3A5-052CB31A8651', -- Entity: MJ: Version Label Items
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
         WHERE ID = '6c5e2e8d-d3f3-4039-89e1-2439ddc19c60'  OR 
               (EntityID = '37F31DED-1186-46E6-B3A5-052CB31A8651' AND Name = 'EntityID')
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
            '6c5e2e8d-d3f3-4039-89e1-2439ddc19c60',
            '37F31DED-1186-46E6-B3A5-052CB31A8651', -- Entity: MJ: Version Label Items
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
         WHERE ID = '48626253-5497-4805-a944-8726264f9b9a'  OR 
               (EntityID = '37F31DED-1186-46E6-B3A5-052CB31A8651' AND Name = 'RecordID')
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
            '48626253-5497-4805-a944-8726264f9b9a',
            '37F31DED-1186-46E6-B3A5-052CB31A8651', -- Entity: MJ: Version Label Items
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
         WHERE ID = 'b6273d3c-06fc-4763-ab79-7c08c08839e7'  OR 
               (EntityID = '37F31DED-1186-46E6-B3A5-052CB31A8651' AND Name = '__mj_CreatedAt')
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
            'b6273d3c-06fc-4763-ab79-7c08c08839e7',
            '37F31DED-1186-46E6-B3A5-052CB31A8651', -- Entity: MJ: Version Label Items
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
         WHERE ID = 'e3107876-745c-4ad5-894b-c523d59dff14'  OR 
               (EntityID = '37F31DED-1186-46E6-B3A5-052CB31A8651' AND Name = '__mj_UpdatedAt')
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
            'e3107876-745c-4ad5-894b-c523d59dff14',
            '37F31DED-1186-46E6-B3A5-052CB31A8651', -- Entity: MJ: Version Label Items
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'eb43367b-67f3-4f72-93f0-2efd9fe60eee'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsSoftPrimaryKey')
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
            'eb43367b-67f3-4f72-93f0-2efd9fe60eee',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100123,
            'IsSoftPrimaryKey',
            'Is Soft Primary Key',
            'When 1, indicates IsPrimaryKey was set via metadata (not a database constraint). Protects IsPrimaryKey from being cleared by schema sync.',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2d4f974c-a8dd-46f9-83c2-fa739a073973'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsSoftForeignKey')
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
            '2d4f974c-a8dd-46f9-83c2-fa739a073973',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100124,
            'IsSoftForeignKey',
            'Is Soft Foreign Key',
            'When 1, indicates RelatedEntityID/RelatedEntityFieldName were set via metadata (not a database constraint). Protects these fields from being cleared by schema sync.',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b4963726-d193-4ada-afaa-2d3c9fc7752f'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RelatedEntityJoinFields')
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
            'b4963726-d193-4ada-afaa-2d3c9fc7752f',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100125,
            'RelatedEntityJoinFields',
            'Related Entity Join Fields',
            'JSON configuration for additional fields to join from the related entity into this entity''s base view. Supports modes: extend (add to NameField), override (replace NameField), disable (no joins). Schema: { mode?: string, fields?: [{ field: string, alias?: string }] }',
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
         WHERE ID = '8384f93d-dae4-469a-9984-5866a7059529'  OR 
               (EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'APIKey')
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
            '8384f93d-dae4-469a-9984-5866a7059529',
            'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- Entity: MJ: API Key Scopes
            100021,
            'APIKey',
            'API Key',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a744c321-fd16-43fe-87ff-60f15d9591c1'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'ID')
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
            'a744c321-fd16-43fe-87ff-60f15d9591c1',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
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
         WHERE ID = '00fa31cd-7f5d-433a-ad75-aba7603ac819'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'Name')
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
            '00fa31cd-7f5d-433a-ad75-aba7603ac819',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
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
         WHERE ID = '2df3c861-b09a-4b98-ad05-a4ad40adcfe2'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'Description')
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
            '2df3c861-b09a-4b98-ad05-a4ad40adcfe2',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
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
         WHERE ID = '8711cd54-93dd-470a-ad1b-af08ae0a1a12'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'Scope')
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
            '8711cd54-93dd-470a-ad1b-af08ae0a1a12',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100004,
            'Scope',
            'Scope',
            'Breadth of the label: Record (one record and its dependency graph, the primary use case), Entity (one entity type), or System (all entities). Parent grouping labels may use any scope as a logical container.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Record',
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
         WHERE ID = 'f023d7cf-f190-4855-828a-e5dc868160cf'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'EntityID')
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
            'f023d7cf-f190-4855-828a-e5dc868160cf',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
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
         WHERE ID = '47de14a0-525f-4553-b1c3-1da964ce75c0'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'RecordID')
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
            '47de14a0-525f-4553-b1c3-1da964ce75c0',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
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
         WHERE ID = 'c6567b2d-2654-44a3-882b-9f60b7488e25'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'ParentID')
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
            'c6567b2d-2654-44a3-882b-9f60b7488e25',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100007,
            'ParentID',
            'Parent ID',
            'Self-referencing parent for grouping related labels. When a user labels multiple records of the same entity, a parent label is created as the container and each individual record label references it via ParentID.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'ED554027-0126-40EC-9A92-A002D309C4C6',
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
         WHERE ID = 'cfddb9a9-1c9a-471f-9947-c8f81748c890'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'Status')
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
            'cfddb9a9-1c9a-471f-9947-c8f81748c890',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100008,
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
         WHERE ID = '6bba6236-4885-46b0-8ace-c66a905b2f6b'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'CreatedByUserID')
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
            '6bba6236-4885-46b0-8ace-c66a905b2f6b',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100009,
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
         WHERE ID = 'c7e14d0b-d7df-4f83-bff3-788d61806c03'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'ExternalSystemID')
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
            'c7e14d0b-d7df-4f83-bff3-788d61806c03',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100010,
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
         WHERE ID = '9074ce58-5344-4a25-90f4-bccce1670907'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'ItemCount')
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
            '9074ce58-5344-4a25-90f4-bccce1670907',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100011,
            'ItemCount',
            'Item Count',
            'Total number of VersionLabelItem rows created for this label. Populated after label creation completes.',
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
         WHERE ID = '80b58c7e-d99e-4d9a-82fb-910acae2bcf8'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'CreationDurationMS')
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
            '80b58c7e-d99e-4d9a-82fb-910acae2bcf8',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100012,
            'CreationDurationMS',
            'Creation Duration MS',
            'Time in milliseconds taken to create this label and all its items. Used for estimation of future label creation operations.',
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
         WHERE ID = '3442ac41-4268-4282-8e92-0b21d729a501'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = '__mj_CreatedAt')
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
            '3442ac41-4268-4282-8e92-0b21d729a501',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fc014b7c-8524-4f0e-b02b-3c6c78261821'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = '__mj_UpdatedAt')
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
            'fc014b7c-8524-4f0e-b02b-3c6c78261821',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f756710f-c207-4189-99b2-cb8e60e5374a'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'ID')
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
            'f756710f-c207-4189-99b2-cb8e60e5374a',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = '5e4c115e-9a60-481e-88ab-7bfe8bfa4391'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'VersionLabelID')
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
            '5e4c115e-9a60-481e-88ab-7bfe8bfa4391',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
            'ED554027-0126-40EC-9A92-A002D309C4C6',
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
         WHERE ID = 'ba89d615-a1d7-41b2-92c3-85acbdc60b92'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'Status')
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
            'ba89d615-a1d7-41b2-92c3-85acbdc60b92',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = '012f2639-8991-4a6a-a345-295190bfda62'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'StartedAt')
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
            '012f2639-8991-4a6a-a345-295190bfda62',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = '52ddb77d-63dc-4814-9f1e-30a0aec596fd'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'EndedAt')
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
            '52ddb77d-63dc-4814-9f1e-30a0aec596fd',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = '91a020ef-5ad0-44d7-a1b5-0da6c3fcedf5'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'UserID')
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
            '91a020ef-5ad0-44d7-a1b5-0da6c3fcedf5',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = 'e162a50f-3440-42d7-8534-e6f4777207fa'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'TotalItems')
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
            'e162a50f-3440-42d7-8534-e6f4777207fa',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = 'd0573bd6-cede-4b21-ad36-5f771fe9fcf2'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'CompletedItems')
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
            'd0573bd6-cede-4b21-ad36-5f771fe9fcf2',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = 'd9c5e2a9-20d8-4528-991a-5a5668bdcec0'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'FailedItems')
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
            'd9c5e2a9-20d8-4528-991a-5a5668bdcec0',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = 'c0c65094-a041-4ecd-89fe-62aeb903f41a'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'ErrorLog')
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
            'c0c65094-a041-4ecd-89fe-62aeb903f41a',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = '9bfe3673-cd19-4b5b-a554-8f2a8348adaf'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'PreRestoreLabelID')
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
            '9bfe3673-cd19-4b5b-a554-8f2a8348adaf',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
            'ED554027-0126-40EC-9A92-A002D309C4C6',
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
         WHERE ID = '56d74d2f-33ef-4269-a8c3-5a3ec52d7b43'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = '__mj_CreatedAt')
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
            '56d74d2f-33ef-4269-a8c3-5a3ec52d7b43',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = '6e6484aa-2bbb-4a8e-ace6-fe3d7423c020'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = '__mj_UpdatedAt')
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
            '6e6484aa-2bbb-4a8e-ace6-fe3d7423c020',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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

/* SQL text to insert entity field value with ID 15d9dd2b-c265-4358-8798-b1e1dde52838 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('15d9dd2b-c265-4358-8798-b1e1dde52838', '8711CD54-93DD-470A-AD1B-AF08AE0A1A12', 1, 'Entity', 'Entity')

/* SQL text to insert entity field value with ID f6a8eb88-c5a1-456b-bd0b-e1b450d17eab */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f6a8eb88-c5a1-456b-bd0b-e1b450d17eab', '8711CD54-93DD-470A-AD1B-AF08AE0A1A12', 2, 'Record', 'Record')

/* SQL text to insert entity field value with ID 21a02608-e982-4501-a351-bf673460d2a4 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('21a02608-e982-4501-a351-bf673460d2a4', '8711CD54-93DD-470A-AD1B-AF08AE0A1A12', 3, 'System', 'System')

/* SQL text to update ValueListType for entity field ID 8711CD54-93DD-470A-AD1B-AF08AE0A1A12 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='8711CD54-93DD-470A-AD1B-AF08AE0A1A12'

/* SQL text to insert entity field value with ID f6a758a7-312a-4083-b6e6-54f899fdccc8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f6a758a7-312a-4083-b6e6-54f899fdccc8', 'CFDDB9A9-1C9A-471F-9947-C8F81748C890', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 11016fba-ada4-45d0-8557-346ab3539074 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('11016fba-ada4-45d0-8557-346ab3539074', 'CFDDB9A9-1C9A-471F-9947-C8F81748C890', 2, 'Archived', 'Archived')

/* SQL text to insert entity field value with ID 859d0ee0-d569-45a8-bbef-8b2a8a16cdf3 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('859d0ee0-d569-45a8-bbef-8b2a8a16cdf3', 'CFDDB9A9-1C9A-471F-9947-C8F81748C890', 3, 'Restored', 'Restored')

/* SQL text to update ValueListType for entity field ID CFDDB9A9-1C9A-471F-9947-C8F81748C890 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='CFDDB9A9-1C9A-471F-9947-C8F81748C890'

/* SQL text to insert entity field value with ID 1fc85688-b483-47ec-abbd-4488acd3e115 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1fc85688-b483-47ec-abbd-4488acd3e115', 'BA89D615-A1D7-41B2-92C3-85ACBDC60B92', 1, 'Complete', 'Complete')

/* SQL text to insert entity field value with ID 733a0c30-4149-4ce0-b3ee-3dd61b5d2d14 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('733a0c30-4149-4ce0-b3ee-3dd61b5d2d14', 'BA89D615-A1D7-41B2-92C3-85ACBDC60B92', 2, 'Error', 'Error')

/* SQL text to insert entity field value with ID b5c16afd-cdc2-46b6-8a69-f1baeb486c56 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b5c16afd-cdc2-46b6-8a69-f1baeb486c56', 'BA89D615-A1D7-41B2-92C3-85ACBDC60B92', 3, 'In Progress', 'In Progress')

/* SQL text to insert entity field value with ID 603750d9-caaa-47ea-a55a-2712192a971d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('603750d9-caaa-47ea-a55a-2712192a971d', 'BA89D615-A1D7-41B2-92C3-85ACBDC60B92', 4, 'Partial', 'Partial')

/* SQL text to insert entity field value with ID 900f5059-7132-4daa-8fcf-aedf72498c4c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('900f5059-7132-4daa-8fcf-aedf72498c4c', 'BA89D615-A1D7-41B2-92C3-85ACBDC60B92', 5, 'Pending', 'Pending')

/* SQL text to update ValueListType for entity field ID BA89D615-A1D7-41B2-92C3-85ACBDC60B92 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='BA89D615-A1D7-41B2-92C3-85ACBDC60B92'

/* SQL text to insert entity field value with ID b39f541b-7acc-4130-bf3f-425298465f0a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b39f541b-7acc-4130-bf3f-425298465f0a', 'B75717F0-6F36-EF11-86D4-6045BDEE16E6', 3, 'Snapshot', 'Snapshot')

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=4 WHERE ID='74CBC28F-D8C6-4314-B012-3D0751DDBE35'

/* SQL text to delete entity field value ID A9A1433E-F36B-1410-8DD9-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='A9A1433E-F36B-1410-8DD9-00021F8B792E'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'eb82a86f-f9ef-48fb-abb4-a0aad6ce7812'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('eb82a86f-f9ef-48fb-abb4-a0aad6ce7812', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '37F31DED-1186-46E6-B3A5-052CB31A8651', 'EntityID', 'One To Many', 1, 1, 'MJ: Version Label Items', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '72368b72-cce4-4752-8b08-93ddcf4447da'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('72368b72-cce4-4752-8b08-93ddcf4447da', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ED554027-0126-40EC-9A92-A002D309C4C6', 'EntityID', 'One To Many', 1, 1, 'MJ: Version Labels', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'beec0625-06ad-4d03-9dd2-ffbb885fd0ad'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('beec0625-06ad-4d03-9dd2-ffbb885fd0ad', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ED554027-0126-40EC-9A92-A002D309C4C6', 'CreatedByUserID', 'One To Many', 1, 1, 'MJ: Version Labels', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'cf0da57b-e9bc-4aa7-8ace-033ca6029c43'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('cf0da57b-e9bc-4aa7-8ace-033ca6029c43', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', 'UserID', 'One To Many', 1, 1, 'MJ: Version Label Restores', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1cc28825-a4e4-4132-86ed-92d4557d8001'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1cc28825-a4e4-4132-86ed-92d4557d8001', 'F5238F34-2837-EF11-86D4-6045BDEE16E6', '37F31DED-1186-46E6-B3A5-052CB31A8651', 'RecordChangeID', 'One To Many', 1, 1, 'MJ: Version Label Items', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '78f373f1-c4e1-485b-920e-f575bada3473'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('78f373f1-c4e1-485b-920e-f575bada3473', 'ED554027-0126-40EC-9A92-A002D309C4C6', 'ED554027-0126-40EC-9A92-A002D309C4C6', 'ParentID', 'One To Many', 1, 1, 'MJ: Version Labels', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b1250534-179a-45f6-af26-4c25e5f5aa05'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b1250534-179a-45f6-af26-4c25e5f5aa05', 'ED554027-0126-40EC-9A92-A002D309C4C6', 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', 'PreRestoreLabelID', 'One To Many', 1, 1, 'MJ: Version Label Restores', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ccd2c638-5d37-4a7e-9e3f-5d0690f022af'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ccd2c638-5d37-4a7e-9e3f-5d0690f022af', 'ED554027-0126-40EC-9A92-A002D309C4C6', 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', 'VersionLabelID', 'One To Many', 1, 1, 'MJ: Version Label Restores', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '41863db0-1b0f-4a09-9eb1-1487809a27bd'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('41863db0-1b0f-4a09-9eb1-1487809a27bd', 'ED554027-0126-40EC-9A92-A002D309C4C6', '37F31DED-1186-46E6-B3A5-052CB31A8651', 'VersionLabelID', 'One To Many', 1, 1, 'MJ: Version Label Items', 3);
   END
                              

/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EntityID ON [${flyway:defaultSchema}].[EntityField] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID ON [${flyway:defaultSchema}].[EntityField] ([RelatedEntityID]);

-- Index for foreign key EncryptionKeyID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID ON [${flyway:defaultSchema}].[EntityField] ([EncryptionKeyID]);

/* Base View Permissions SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField]
    @ID uniqueidentifier = NULL,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUnique bit = NULL,
    @Category nvarchar(255),
    @ValueListType nvarchar(20) = NULL,
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit = NULL,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit = NULL,
    @AllowUpdateInView bit = NULL,
    @IncludeInUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit = NULL,
    @GeneratedFormSection nvarchar(10) = NULL,
    @IsNameField bit = NULL,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit = NULL,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20) = NULL,
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit = NULL,
    @ValuesToPackWithSchema nvarchar(10) = NULL,
    @Status nvarchar(25) = NULL,
    @AutoUpdateIsNameField bit = NULL,
    @AutoUpdateDefaultInView bit = NULL,
    @AutoUpdateCategory bit = NULL,
    @AutoUpdateDisplayName bit = NULL,
    @AutoUpdateIncludeInUserSearchAPI bit = NULL,
    @Encrypt bit = NULL,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit = NULL,
    @SendEncryptedValue bit = NULL,
    @IsSoftPrimaryKey bit = NULL,
    @IsSoftForeignKey bit = NULL,
    @RelatedEntityJoinFields nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [ID],
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                @RelatedEntityJoinFields
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                @RelatedEntityJoinFields
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10),
    @Status nvarchar(25),
    @AutoUpdateIsNameField bit,
    @AutoUpdateDefaultInView bit,
    @AutoUpdateCategory bit,
    @AutoUpdateDisplayName bit,
    @AutoUpdateIncludeInUserSearchAPI bit,
    @Encrypt bit,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit,
    @SendEncryptedValue bit,
    @IsSoftPrimaryKey bit,
    @IsSoftForeignKey bit,
    @RelatedEntityJoinFields nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType,
        [EntityIDFieldName] = @EntityIDFieldName,
        [ScopeDefault] = @ScopeDefault,
        [AutoUpdateRelatedEntityInfo] = @AutoUpdateRelatedEntityInfo,
        [ValuesToPackWithSchema] = @ValuesToPackWithSchema,
        [Status] = @Status,
        [AutoUpdateIsNameField] = @AutoUpdateIsNameField,
        [AutoUpdateDefaultInView] = @AutoUpdateDefaultInView,
        [AutoUpdateCategory] = @AutoUpdateCategory,
        [AutoUpdateDisplayName] = @AutoUpdateDisplayName,
        [AutoUpdateIncludeInUserSearchAPI] = @AutoUpdateIncludeInUserSearchAPI,
        [Encrypt] = @Encrypt,
        [EncryptionKeyID] = @EncryptionKeyID,
        [AllowDecryptInAPI] = @AllowDecryptInAPI,
        [SendEncryptedValue] = @SendEncryptedValue,
        [IsSoftPrimaryKey] = @IsSoftPrimaryKey,
        [IsSoftForeignKey] = @IsSoftForeignKey,
        [RelatedEntityJoinFields] = @RelatedEntityJoinFields
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityField
ON [${flyway:defaultSchema}].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for APIKeyScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key APIKeyID in table APIKeyScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyScope_APIKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyScope_APIKeyID ON [${flyway:defaultSchema}].[APIKeyScope] ([APIKeyID]);

-- Index for foreign key ScopeID in table APIKeyScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyScope_ScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyScope_ScopeID ON [${flyway:defaultSchema}].[APIKeyScope] ([ScopeID]);

/* Base View SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: vwAPIKeyScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Key Scopes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIKeyScope
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIKeyScopes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIKeyScopes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIKeyScopes]
AS
SELECT
    a.*,
    APIKey_APIKeyID.[Label] AS [APIKey],
    APIScope_ScopeID.[Name] AS [Scope]
FROM
    [${flyway:defaultSchema}].[APIKeyScope] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIKey] AS APIKey_APIKeyID
  ON
    [a].[APIKeyID] = APIKey_APIKeyID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[APIScope] AS APIScope_ScopeID
  ON
    [a].[ScopeID] = APIScope_ScopeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Permissions for vwAPIKeyScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spCreateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyScope]
    @ID uniqueidentifier = NULL,
    @APIKeyID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern nvarchar(750),
    @PatternType nvarchar(20) = NULL,
    @IsDeny bit = NULL,
    @Priority int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIKeyScope]
            (
                [ID],
                [APIKeyID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @APIKeyID,
                @ScopeID,
                @ResourcePattern,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIKeyScope]
            (
                [APIKeyID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @APIKeyID,
                @ScopeID,
                @ResourcePattern,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIKeyScopes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spUpdateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyScope]
    @ID uniqueidentifier,
    @APIKeyID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern nvarchar(750),
    @PatternType nvarchar(20),
    @IsDeny bit,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyScope]
    SET
        [APIKeyID] = @APIKeyID,
        [ScopeID] = @ScopeID,
        [ResourcePattern] = @ResourcePattern,
        [PatternType] = @PatternType,
        [IsDeny] = @IsDeny,
        [Priority] = @Priority
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIKeyScopes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIKeyScopes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyScope table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIKeyScope]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIKeyScope];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIKeyScope
ON [${flyway:defaultSchema}].[APIKeyScope]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyScope]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIKeyScope] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spDeleteAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyScope]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIKeyScope]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyScope] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyScope] TO [cdp_Integration]



/* Index for Foreign Keys for APIKeyUsageLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key APIKeyID in table APIKeyUsageLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyUsageLog_APIKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyUsageLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyUsageLog_APIKeyID ON [${flyway:defaultSchema}].[APIKeyUsageLog] ([APIKeyID]);

-- Index for foreign key ApplicationID in table APIKeyUsageLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyUsageLog_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyUsageLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyUsageLog_ApplicationID ON [${flyway:defaultSchema}].[APIKeyUsageLog] ([ApplicationID]);

/* Base View SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: vwAPIKeyUsageLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Key Usage Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIKeyUsageLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIKeyUsageLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIKeyUsageLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIKeyUsageLogs]
AS
SELECT
    a.*,
    APIKey_APIKeyID.[Label] AS [APIKey],
    APIApplication_ApplicationID.[Name] AS [Application]
FROM
    [${flyway:defaultSchema}].[APIKeyUsageLog] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIKey] AS APIKey_APIKeyID
  ON
    [a].[APIKeyID] = APIKey_APIKeyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[APIApplication] AS APIApplication_ApplicationID
  ON
    [a].[ApplicationID] = APIApplication_ApplicationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: Permissions for vwAPIKeyUsageLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spCreateAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog]
    @ID uniqueidentifier = NULL,
    @APIKeyID uniqueidentifier,
    @Endpoint nvarchar(500),
    @Operation nvarchar(255),
    @Method nvarchar(10),
    @StatusCode int,
    @ResponseTimeMs int,
    @IPAddress nvarchar(45),
    @UserAgent nvarchar(500),
    @ApplicationID uniqueidentifier,
    @RequestedResource nvarchar(500),
    @ScopesEvaluated nvarchar(MAX),
    @AuthorizationResult nvarchar(20) = NULL,
    @DeniedReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIKeyUsageLog]
            (
                [ID],
                [APIKeyID],
                [Endpoint],
                [Operation],
                [Method],
                [StatusCode],
                [ResponseTimeMs],
                [IPAddress],
                [UserAgent],
                [ApplicationID],
                [RequestedResource],
                [ScopesEvaluated],
                [AuthorizationResult],
                [DeniedReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @APIKeyID,
                @Endpoint,
                @Operation,
                @Method,
                @StatusCode,
                @ResponseTimeMs,
                @IPAddress,
                @UserAgent,
                @ApplicationID,
                @RequestedResource,
                @ScopesEvaluated,
                ISNULL(@AuthorizationResult, 'Allowed'),
                @DeniedReason
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIKeyUsageLog]
            (
                [APIKeyID],
                [Endpoint],
                [Operation],
                [Method],
                [StatusCode],
                [ResponseTimeMs],
                [IPAddress],
                [UserAgent],
                [ApplicationID],
                [RequestedResource],
                [ScopesEvaluated],
                [AuthorizationResult],
                [DeniedReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @APIKeyID,
                @Endpoint,
                @Operation,
                @Method,
                @StatusCode,
                @ResponseTimeMs,
                @IPAddress,
                @UserAgent,
                @ApplicationID,
                @RequestedResource,
                @ScopesEvaluated,
                ISNULL(@AuthorizationResult, 'Allowed'),
                @DeniedReason
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spUpdateAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog]
    @ID uniqueidentifier,
    @APIKeyID uniqueidentifier,
    @Endpoint nvarchar(500),
    @Operation nvarchar(255),
    @Method nvarchar(10),
    @StatusCode int,
    @ResponseTimeMs int,
    @IPAddress nvarchar(45),
    @UserAgent nvarchar(500),
    @ApplicationID uniqueidentifier,
    @RequestedResource nvarchar(500),
    @ScopesEvaluated nvarchar(MAX),
    @AuthorizationResult nvarchar(20),
    @DeniedReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    SET
        [APIKeyID] = @APIKeyID,
        [Endpoint] = @Endpoint,
        [Operation] = @Operation,
        [Method] = @Method,
        [StatusCode] = @StatusCode,
        [ResponseTimeMs] = @ResponseTimeMs,
        [IPAddress] = @IPAddress,
        [UserAgent] = @UserAgent,
        [ApplicationID] = @ApplicationID,
        [RequestedResource] = @RequestedResource,
        [ScopesEvaluated] = @ScopesEvaluated,
        [AuthorizationResult] = @AuthorizationResult,
        [DeniedReason] = @DeniedReason
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIKeyUsageLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyUsageLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIKeyUsageLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIKeyUsageLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIKeyUsageLog
ON [${flyway:defaultSchema}].[APIKeyUsageLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIKeyUsageLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spDeleteAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog] TO [cdp_Integration]



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

/* SQL text to update entity field related entity name field map for entity field ID 5370C6B6-9923-4236-9806-E27A303E386C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5370C6B6-9923-4236-9806-E27A303E386C',
         @RelatedEntityNameFieldMap='VersionLabel'

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

/* SQL text to update entity field related entity name field map for entity field ID 5E4C115E-9A60-481E-88AB-7BFE8BFA4391 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5E4C115E-9A60-481E-88AB-7BFE8BFA4391',
         @RelatedEntityNameFieldMap='VersionLabel'

/* SQL text to update entity field related entity name field map for entity field ID 91A020EF-5AD0-44D7-A1B5-0DA6C3FCEDF5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='91A020EF-5AD0-44D7-A1B5-0DA6C3FCEDF5',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID EECDE0D8-F321-42FA-9F71-AB5C7B0EE394 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EECDE0D8-F321-42FA-9F71-AB5C7B0EE394',
         @RelatedEntityNameFieldMap='RecordChange'

/* SQL text to update entity field related entity name field map for entity field ID 9BFE3673-CD19-4B5B-A554-8F2A8348ADAF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9BFE3673-CD19-4B5B-A554-8F2A8348ADAF',
         @RelatedEntityNameFieldMap='PreRestoreLabel'

/* SQL text to update entity field related entity name field map for entity field ID 6C5E2E8D-D3F3-4039-89E1-2439DDC19C60 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6C5E2E8D-D3F3-4039-89E1-2439DDC19C60',
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

-- Index for foreign key ParentID in table VersionLabel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VersionLabel_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VersionLabel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VersionLabel_ParentID ON [${flyway:defaultSchema}].[VersionLabel] ([ParentID]);

-- Index for foreign key CreatedByUserID in table VersionLabel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VersionLabel_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VersionLabel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VersionLabel_CreatedByUserID ON [${flyway:defaultSchema}].[VersionLabel] ([CreatedByUserID]);

/* Root ID Function SQL for MJ: Version Labels.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: fnVersionLabelParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [VersionLabel].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnVersionLabelParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnVersionLabelParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnVersionLabelParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[VersionLabel]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[VersionLabel] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID F023D7CF-F190-4855-828A-E5DC868160CF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F023D7CF-F190-4855-828A-E5DC868160CF',
         @RelatedEntityNameFieldMap='Entity'

/* SQL text to update entity field related entity name field map for entity field ID C6567B2D-2654-44A3-882B-9F60B7488E25 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C6567B2D-2654-44A3-882B-9F60B7488E25',
         @RelatedEntityNameFieldMap='Parent'

/* SQL text to update entity field related entity name field map for entity field ID 6BBA6236-4885-46B0-8ACE-C66A905B2F6B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6BBA6236-4885-46B0-8ACE-C66A905B2F6B',
         @RelatedEntityNameFieldMap='CreatedByUser'

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
    VersionLabel_ParentID.[Name] AS [Parent],
    User_CreatedByUserID.[Name] AS [CreatedByUser],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[VersionLabel] AS v
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [v].[EntityID] = Entity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VersionLabel] AS VersionLabel_ParentID
  ON
    [v].[ParentID] = VersionLabel_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_CreatedByUserID
  ON
    [v].[CreatedByUserID] = User_CreatedByUserID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnVersionLabelParentID_GetRootID]([v].[ID], [v].[ParentID]) AS root_ParentID
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
    @ParentID uniqueidentifier,
    @Status nvarchar(50) = NULL,
    @CreatedByUserID uniqueidentifier,
    @ExternalSystemID nvarchar(200),
    @ItemCount int = NULL,
    @CreationDurationMS int = NULL
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
                [ParentID],
                [Status],
                [CreatedByUserID],
                [ExternalSystemID],
                [ItemCount],
                [CreationDurationMS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@Scope, 'Record'),
                @EntityID,
                @RecordID,
                @ParentID,
                ISNULL(@Status, 'Active'),
                @CreatedByUserID,
                @ExternalSystemID,
                ISNULL(@ItemCount, 0),
                ISNULL(@CreationDurationMS, 0)
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
                [ParentID],
                [Status],
                [CreatedByUserID],
                [ExternalSystemID],
                [ItemCount],
                [CreationDurationMS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@Scope, 'Record'),
                @EntityID,
                @RecordID,
                @ParentID,
                ISNULL(@Status, 'Active'),
                @CreatedByUserID,
                @ExternalSystemID,
                ISNULL(@ItemCount, 0),
                ISNULL(@CreationDurationMS, 0)
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
    @ParentID uniqueidentifier,
    @Status nvarchar(50),
    @CreatedByUserID uniqueidentifier,
    @ExternalSystemID nvarchar(200),
    @ItemCount int,
    @CreationDurationMS int
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
        [ParentID] = @ParentID,
        [Status] = @Status,
        [CreatedByUserID] = @CreatedByUserID,
        [ExternalSystemID] = @ExternalSystemID,
        [ItemCount] = @ItemCount,
        [CreationDurationMS] = @CreationDurationMS
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



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '880c53e3-358b-4134-9584-c38c65c8c689'  OR 
               (EntityID = '37F31DED-1186-46E6-B3A5-052CB31A8651' AND Name = 'VersionLabel')
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
            '880c53e3-358b-4134-9584-c38c65c8c689',
            '37F31DED-1186-46E6-B3A5-052CB31A8651', -- Entity: MJ: Version Label Items
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
         WHERE ID = '911c717d-fb3b-438c-baff-f9abd822d22c'  OR 
               (EntityID = '37F31DED-1186-46E6-B3A5-052CB31A8651' AND Name = 'RecordChange')
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
            '911c717d-fb3b-438c-baff-f9abd822d22c',
            '37F31DED-1186-46E6-B3A5-052CB31A8651', -- Entity: MJ: Version Label Items
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
         WHERE ID = 'ce4660a4-75e6-4cc9-914f-3f3573bc2903'  OR 
               (EntityID = '37F31DED-1186-46E6-B3A5-052CB31A8651' AND Name = 'Entity')
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
            'ce4660a4-75e6-4cc9-914f-3f3573bc2903',
            '37F31DED-1186-46E6-B3A5-052CB31A8651', -- Entity: MJ: Version Label Items
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '34c0bd4c-7b68-4a9c-99b7-dce0d5caecb0'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'Entity')
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
            '34c0bd4c-7b68-4a9c-99b7-dce0d5caecb0',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100029,
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
         WHERE ID = 'b4faaaaa-6fd6-49a6-9224-73a201e355f5'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'Parent')
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
            'b4faaaaa-6fd6-49a6-9224-73a201e355f5',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100030,
            'Parent',
            'Parent',
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
         WHERE ID = '26767d80-0b98-4e53-9d71-9bd1b97088e3'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'CreatedByUser')
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
            '26767d80-0b98-4e53-9d71-9bd1b97088e3',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100031,
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
         WHERE ID = '125630b0-e508-4ca7-964f-f9d421b1b9ea'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'RootParentID')
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
            '125630b0-e508-4ca7-964f-f9d421b1b9ea',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100032,
            'RootParentID',
            'Root Parent ID',
            NULL,
            'uniqueidentifier',
            16,
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
         WHERE ID = '3b4d0cc4-977e-4102-96e5-dc801bc76d7d'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'VersionLabel')
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
            '3b4d0cc4-977e-4102-96e5-dc801bc76d7d',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = 'bdcca4af-a27f-4fa0-9243-97e03ed0c2a3'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'User')
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
            'bdcca4af-a27f-4fa0-9243-97e03ed0c2a3',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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
         WHERE ID = '1c4fdd9b-8598-4a40-a057-674924bdc8fc'  OR 
               (EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912' AND Name = 'PreRestoreLabel')
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
            '1c4fdd9b-8598-4a40-a057-674924bdc8fc',
            'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', -- Entity: MJ: Version Label Restores
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '880C53E3-358B-4134-9584-C38C65C8C689'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '48626253-5497-4805-A944-8726264F9B9A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '880C53E3-358B-4134-9584-C38C65C8C689'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '911C717D-FB3B-438C-BAFF-F9ABD822D22C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CE4660A4-75E6-4CC9-914F-3F3573BC2903'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '48626253-5497-4805-A944-8726264F9B9A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '880C53E3-358B-4134-9584-C38C65C8C689'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '911C717D-FB3B-438C-BAFF-F9ABD822D22C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CE4660A4-75E6-4CC9-914F-3F3573BC2903'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3B4D0CC4-977E-4102-96E5-DC801BC76D7D'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BA89D615-A1D7-41B2-92C3-85ACBDC60B92'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '012F2639-8991-4A6A-A345-295190BFDA62'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '52DDB77D-63DC-4814-9F1E-30A0AEC596FD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E162A50F-3440-42D7-8534-E6F4777207FA'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D0573BD6-CEDE-4B21-AD36-5F771FE9FCF2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D9C5E2A9-20D8-4528-991A-5A5668BDCEC0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3B4D0CC4-977E-4102-96E5-DC801BC76D7D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BDCCA4AF-A27F-4FA0-9243-97E03ED0C2A3'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BA89D615-A1D7-41B2-92C3-85ACBDC60B92'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3B4D0CC4-977E-4102-96E5-DC801BC76D7D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BDCCA4AF-A27F-4FA0-9243-97E03ED0C2A3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1C4FDD9B-8598-4A40-A057-674924BDC8FC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '66CF7D0C-5045-4173-9605-4F5019045F40'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '66CF7D0C-5045-4173-9605-4F5019045F40'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D0B5354C-4FD6-4867-9B00-2DCA6F503311'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '887A096A-6BFA-42BF-949A-69E936E809F2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6FF07094-84F7-4095-B677-5D5ACDF6C74C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8384F93D-DAE4-469A-9984-5866A7059529'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '66CF7D0C-5045-4173-9605-4F5019045F40'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8384F93D-DAE4-469A-9984-5866A7059529'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '754317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5E4E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '065817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '055817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B04C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '784C2EC3-393A-43CD-B235-4104C171F126'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B06F57AD-7786-4E2D-BB40-F6F9F6513524'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CCD93F16-175E-4253-88DF-9FA33BA9F4E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E3CA9BA9-8E26-43DD-9EF1-0005E2478C8B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '610DD273-C8EA-4D1C-8FE6-24853366BFA2'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '784C2EC3-393A-43CD-B235-4104C171F126'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EDD465A7-A126-42DF-A214-BBC237FAF942'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '72EFCD20-BD28-408A-88C7-1A91703DA172'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '333B3099-1F1C-4034-86F0-40D2C5D86188'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E456759C-27B8-4197-893C-F44A6015A8E8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C1637DB5-A88B-4665-882B-10AE7DC8CC2A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '610DD273-C8EA-4D1C-8FE6-24853366BFA2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9EF38A8-150A-40E1-8181-2CCB30379BC0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '432E223B-5DEB-4563-9B63-E51DDEEE7741'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '311BA3D2-F958-4A38-91F7-A5786C96C75F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8384F93D-DAE4-469A-9984-5866A7059529'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B4D1B26B-A8A1-4A41-A353-DFC8F1AAC03D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '23C53CEB-2D8F-42F5-B42E-C239644D10CA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Pattern',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '66CF7D0C-5045-4173-9605-4F5019045F40'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Pattern Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D0B5354C-4FD6-4867-9B00-2DCA6F503311'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Deny',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '887A096A-6BFA-42BF-949A-69E936E809F2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6FF07094-84F7-4095-B677-5D5ACDF6C74C'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Access Rules":{"icon":"fa fa-shield-alt","description":"Defines pattern-based allow/deny rules that govern how a scope authorizes API requests"},"Key Scope Mapping":{"icon":"fa fa-link","description":"Defines which permission scopes are assigned to each API key"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields tracking creation and modification dates"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Access Rules":"fa fa-shield-alt","Key Scope Mapping":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48219BCC-5A2B-42B8-A832-5459118ECD6D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B521399-DDA4-47BD-B13A-0597F1F9F08D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1ADE12E-28EE-4360-B5E5-DE58A8DA2F8D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '222DB89A-825A-41E4-BA64-FA489F5BCAB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Endpoint',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Operation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '784C2EC3-393A-43CD-B235-4104C171F126'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Method',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B06F57AD-7786-4E2D-BB40-F6F9F6513524'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status Code',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CCD93F16-175E-4253-88DF-9FA33BA9F4E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Response Time (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E3CA9BA9-8E26-43DD-9EF1-0005E2478C8B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'IP Address',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EDD465A7-A126-42DF-A214-BBC237FAF942'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Application',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7A229B80-2D65-44DD-861A-E1CF6FE9D98A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Requested Resource',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '72EFCD20-BD28-408A-88C7-1A91703DA172'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scopes Evaluated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E6AFEEC9-80D9-4193-9E4F-0B1B7FDA310A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Authorization Result',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '333B3099-1F1C-4034-86F0-40D2C5D86188'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Denied Reason',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E456759C-27B8-4197-893C-F44A6015A8E8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C1637DB5-A88B-4665-882B-10AE7DC8CC2A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Application',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '610DD273-C8EA-4D1C-8FE6-24853366BFA2'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Authorization Details":{"icon":"fa fa-lock","description":"Information about the API key, application context, requested resource, and authorization outcome for each request"},"Request Information":{"icon":"fa fa-code","description":"Core details of the API call such as key, endpoint, operation and HTTP method"},"Response & Client Info":{"icon":"fa fa-network-wired","description":"Outcome of the request plus client context like status, timing, IP and user-agent"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Authorization Details":"fa fa-lock","Request Information":"fa fa-code","Response & Client Info":"fa fa-network-wired","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CFF93F49-9988-4255-A02F-3C88A827EDDE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B6273D3C-06FC-4763-AB79-7C08C08839E7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E3107876-745C-4AD5-894B-C523D59DFF14'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Version Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Version Label',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5370C6B6-9923-4236-9806-E27A303E386C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Version Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record Change',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EECDE0D8-F321-42FA-9F71-AB5C7B0EE394'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Version Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C5E2E8D-D3F3-4039-89E1-2439DDC19C60'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Version Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48626253-5497-4805-A944-8726264F9B9A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display Names',
       GeneratedFormSection = 'Category',
       DisplayName = 'Version Label',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '880C53E3-358B-4134-9584-C38C65C8C689'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display Names',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record Change',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '911C717D-FB3B-438C-BAFF-F9ABD822D22C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display Names',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CE4660A4-75E6-4CC9-914F-3F3573BC2903'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-history */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-history',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '37F31DED-1186-46E6-B3A5-052CB31A8651'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('18f6347f-c7c7-46ea-a08a-63d182ae77c0', '37F31DED-1186-46E6-B3A5-052CB31A8651', 'FieldCategoryInfo', '{"Version Mapping":{"icon":"fa fa-link","description":"Technical identifiers linking version labels, record changes, and entities for query performance"},"Display Names":{"icon":"fa fa-tag","description":"Human‑readable label, change, and entity names used for display purposes"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields and primary key used for internal tracking"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('606b4c02-ae92-4aa0-b80a-ccd1fc03356d', '37F31DED-1186-46E6-B3A5-052CB31A8651', 'FieldCategoryIcons', '{"Version Mapping":"fa fa-link","Display Names":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: system, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '37F31DED-1186-46E6-B3A5-052CB31A8651'
         

/* Set categories for 16 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F756710F-C207-4189-99B2-CB8E60E5374A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Version Label ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E4C115E-9A60-481E-88AB-7BFE8BFA4391'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BA89D615-A1D7-41B2-92C3-85ACBDC60B92'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '012F2639-8991-4A6A-A345-295190BFDA62'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '52DDB77D-63DC-4814-9F1E-30A0AEC596FD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '91A020EF-5AD0-44D7-A1B5-0DA6C3FCEDF5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Progress Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Items',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E162A50F-3440-42D7-8534-E6F4777207FA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Progress Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed Items',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D0573BD6-CEDE-4B21-AD36-5F771FE9FCF2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Progress Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Failed Items',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D9C5E2A9-20D8-4528-991A-5A5668BDCEC0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Progress Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C0C65094-A041-4ECD-89FE-62AEB903F41A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Pre‑Restore Label ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9BFE3673-CD19-4B5B-A554-8F2A8348ADAF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '56D74D2F-33EF-4269-A8C3-5A3EC52D7B43'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E6484AA-2BBB-4A8E-ACE6-FE3D7423C020'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Version Label',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B4D0CC4-977E-4102-96E5-DC801BC76D7D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BDCCA4AF-A27F-4FA0-9243-97E03ED0C2A3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restore Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Pre‑Restore Label',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C4FDD9B-8598-4A40-A057-674924BDC8FC'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-undo */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-undo',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c675fa8f-d8c0-4073-8f1f-19684d3f50e5', 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', 'FieldCategoryInfo', '{"Restore Overview":{"icon":"fa fa-history","description":"Key details of the restore operation such as version label, status, timestamps, related safety‑net label and initiating user"},"Progress Metrics":{"icon":"fa fa-chart-line","description":"Counts of items to restore, completed, failed and any associated error information"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields automatically managed by the system"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f6d45bdf-d19d-498b-8117-5603e1a251bd', 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912', 'FieldCategoryIcons', '{"Restore Overview":"fa fa-history","Progress Metrics":"fa fa-chart-line","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: system, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'BA866D80-7E29-47DC-8BD5-A3CC3B3B4912'
         

/* Set categories for 68 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '414D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FB5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Display Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '044417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Primary Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '754317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Unique',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Length',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '005817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Precision',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '015817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scale',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '025817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allows Null',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '035817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D74217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Increment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '045817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Value List Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C64D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Extended Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '055817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B04C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default In View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '065817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'View Cell Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F34217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Column Width',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow Update API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '404F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow Update In View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F44217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Include In User Search API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '424F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Full Text Search Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Search Param Format API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '434F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Include In Generated Form',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F54217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Generated Form Section',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F64217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Virtual',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '075817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Name Field',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B64217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '954D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Field Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B74217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Include Related Entity Name Field In Base View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '974D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Name Field Map',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F74217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity ID Field Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '35A18EA5-5641-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope Default',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0C2449FB-1BDA-4BE9-A059-7224C05A14B9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Related Entity Info',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FFC3C691-2E33-46D0-B11C-AB348997E08C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Values To Pack With Schema',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '20818E34-47E7-4371-A51E-3D29BCC4B4B8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '407A96C8-580A-4427-BEED-ABB46F015586'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Is Name Field',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5EFD956B-0DB1-491B-9153-0891A7B1835D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Default In View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9707755-1A43-4DE3-815D-37E41CA7C7D0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D64DD327-8057-4DF5-A24C-F951932C1A26'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Display Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8486168A-5082-48DC-BE13-EF53F49922CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Include In User Search API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E1D732F-E33E-40FE-AFAD-477623AC9DEA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Encrypt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '04C52058-4E01-4316-ABAE-9958AFB71B5C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Encryption Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B24D31A6-A3BE-449C-9FE7-98C87E40DA55'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow Decrypt In API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C097F3D-79AC-4144-A3B6-A8BFF64EDF3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Send Encrypted Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '901EE131-BC99-4B80-B5E5-D974057EEA8A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Soft Primary Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB43367B-67F3-4F72-93F0-2EFD9FE60EEE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Soft Foreign Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2D4F974C-A8DD-46F9-83C2-FA739A073973'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Join Fields',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B4963726-D193-4ADA-AFAA-2D3C9FC7752F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Field Code Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '07AD23D5-DEBD-4657-8E3C-7F1F1342BCE3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '584D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Schema Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BA4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Base Table',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '594D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Base View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Code Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A04D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Class Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B94217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B84217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Schema Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Base Table',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Base View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Code Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Class Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Security & Encryption":{"icon":"fa fa-lock","description":"Settings that control encryption, key management, and decryption behavior for sensitive fields"},"Identification & Keys":{"icon":"fa fa-key","description":""},"User Interface & Display Settings":{"icon":"fa fa-palette","description":""},"Data Constraints & Validation":{"icon":"fa fa-gavel","description":""},"Relationships & Linking":{"icon":"fa fa-link","description":""},"System & Audit Metadata":{"icon":"fa fa-cog","description":""}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Security & Encryption":"fa fa-lock","Identification & Keys":"fa fa-key","User Interface & Display Settings":"fa fa-palette","Data Constraints & Validation":"fa fa-gavel","Relationships & Linking":"fa fa-link","System & Audit Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '00FA31CD-7F5D-433A-AD75-ABA7603AC819'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '00FA31CD-7F5D-433A-AD75-ABA7603AC819'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8711CD54-93DD-470A-AD1B-AF08AE0A1A12'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CFDDB9A9-1C9A-471F-9947-C8F81748C890'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9074CE58-5344-4A25-90F4-BCCCE1670907'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '26767D80-0B98-4E53-9D71-9BD1B97088E3'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '00FA31CD-7F5D-433A-AD75-ABA7603AC819'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8711CD54-93DD-470A-AD1B-AF08AE0A1A12'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C7E14D0B-D7DF-4F83-BFF3-788D61806C03'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B4FAAAAA-6FD6-49A6-9224-73A201E355F5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '26767D80-0B98-4E53-9D71-9BD1B97088E3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Label Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '00FA31CD-7F5D-433A-AD75-ABA7603AC819'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Label Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2DF3C861-B09A-4B98-AD05-A4AD40ADCFE2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Label Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8711CD54-93DD-470A-AD1B-AF08AE0A1A12'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Label Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CFDDB9A9-1C9A-471F-9947-C8F81748C890'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Targets',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F023D7CF-F190-4855-828A-E5DC868160CF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Targets',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '47DE14A0-525F-4553-B1C3-1DA964CE75C0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Targets',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '34C0BD4C-7B68-4A9C-99B7-DCE0D5CAECB0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Targets',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C6567B2D-2654-44A3-882B-9F60B7488E25'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Targets',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B4FAAAAA-6FD6-49A6-9224-73A201E355F5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Targets',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '125630B0-E508-4CA7-964F-F9D421B1B9EA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Creation Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Item Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9074CE58-5344-4A25-90F4-BCCCE1670907'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Creation Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Creation Duration (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '80B58C7E-D99E-4D9A-82FB-910ACAE2BCF8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Creation Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'External System ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C7E14D0B-D7DF-4F83-BFF3-788D61806C03'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Creation Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6BBA6236-4885-46B0-8ACE-C66A905B2F6B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Creation Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '26767D80-0B98-4E53-9D71-9BD1B97088E3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A744C321-FD16-43FE-87FF-60F15D9591C1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3442AC41-4268-4282-8E92-0B21D729A501'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC014B7C-8524-4F0E-B02B-3C6C78261821'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tag */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tag',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'ED554027-0126-40EC-9A92-A002D309C4C6'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3dc017b0-7e5b-4beb-b6dd-5f75612899b8', 'ED554027-0126-40EC-9A92-A002D309C4C6', 'FieldCategoryInfo', '{"Label Definition":{"icon":"fa fa-tag","description":"Core identifying information for the version label such as name, description, scope and lifecycle status"},"Scope Targets":{"icon":"fa fa-sitemap","description":"References that define what the label applies to – entity, record, and hierarchical parent relationships"},"Creation Metrics":{"icon":"fa fa-chart-line","description":"Quantitative and audit data about label generation, including item count, duration, creator and external system link"},"System Metadata":{"icon":"fa fa-cog","description":"Technical fields used by the platform for identity and audit tracking"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('576f95db-a687-4775-b09f-00960d5761fa', 'ED554027-0126-40EC-9A92-A002D309C4C6', 'FieldCategoryIcons', '{"Label Definition":"fa fa-tag","Scope Targets":"fa fa-sitemap","Creation Metrics":"fa fa-chart-line","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6'
         




















































-- SECOND CODE GEN RUN - virtual fields fix
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c29822d0-ec93-42de-bb4c-d280b7c69b7c'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'MCPServerTool')
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
            'c29822d0-ec93-42de-bb4c-d280b7c69b7c',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100019,
            'MCPServerTool',
            'MCP Server Tool',
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
         WHERE ID = '37e74387-aefe-478e-b259-fe441f439681'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'PromptRun')
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
            '37e74387-aefe-478e-b259-fe441f439681',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            100041,
            'PromptRun',
            'Prompt Run',
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
         WHERE ID = '79fb15f8-84d5-4885-b70b-c7ee0e0ee1c5'  OR 
               (EntityID = 'D7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            '79fb15f8-84d5-4885-b70b-c7ee0e0ee1c5',
            'D7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Company Integrations
            100016,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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
         WHERE ID = 'b9384cc2-3d11-4686-bb9f-08930d2242a0'  OR 
               (EntityID = 'D8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            'b9384cc2-3d11-4686-bb9f-08930d2242a0',
            'D8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Roles
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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
         WHERE ID = 'c32d371c-ed85-49ee-9dae-11dd3030d1af'  OR 
               (EntityID = 'D9238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            'c32d371c-ed85-49ee-9dae-11dd3030d1af',
            'D9238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Skills
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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
         WHERE ID = '1d904f40-06e3-47ec-94df-b8cde89706e7'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRun')
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
            '1d904f40-06e3-47ec-94df-b8cde89706e7',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Error Logs
            100023,
            'CompanyIntegrationRun',
            'Company Integration Run',
            NULL,
            'nvarchar',
            200,
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
         WHERE ID = 'f94ff331-68d5-4fcd-bdea-3585dea4ba93'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRunDetail')
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
            'f94ff331-68d5-4fcd-bdea-3585dea4ba93',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Error Logs
            100024,
            'CompanyIntegrationRunDetail',
            'Company Integration Run Detail',
            NULL,
            'nvarchar',
            900,
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
         WHERE ID = 'e84c5aab-43c0-43e3-9173-16aacd5d064e'  OR 
               (EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ReplayRun')
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
            'e84c5aab-43c0-43e3-9173-16aacd5d064e',
            'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Record Changes
            100040,
            'ReplayRun',
            'Replay Run',
            NULL,
            'nvarchar',
            200,
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
         WHERE ID = '4abed376-da3f-40bf-a9cd-a67f95a8d061'  OR 
               (EntityID = '09248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ConversationDetail')
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
            '4abed376-da3f-40bf-a9cd-a67f95a8d061',
            '09248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Reports
            100053,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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
         WHERE ID = 'e879a60e-d123-42cf-89c1-b44e259c3fc3'  OR 
               (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TestRun')
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
            'e879a60e-d123-42cf-89c1-b44e259c3fc3',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversations
            100045,
            'TestRun',
            'Test Run',
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
         WHERE ID = '4680ad31-bcfa-49c3-b9d8-b44862bcb83c'  OR 
               (EntityID = '18248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecordMergeLog')
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
            '4680ad31-bcfa-49c3-b9d8-b44862bcb83c',
            '18248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Record Merge Deletion Logs
            100015,
            'RecordMergeLog',
            'Record Merge Log',
            NULL,
            'nvarchar',
            900,
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
         WHERE ID = 'ff165221-28a2-4413-ab17-30620f7bebdd'  OR 
               (EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DuplicateRun')
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
            'ff165221-28a2-4413-ab17-30620f7bebdd',
            '31248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Duplicate Run Details
            100021,
            'DuplicateRun',
            'Duplicate Run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd3330bd6-4f91-4bc8-9c19-bd49afb603eb'  OR 
               (EntityID = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            'd3330bd6-4f91-4bc8-9c19-bd49afb603eb',
            '35248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Invocations
            100014,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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
         WHERE ID = '6148d86a-305f-4096-b107-ebab0ac5c6d8'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            '6148d86a-305f-4096-b107-ebab0ac5c6d8',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Filters
            100015,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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
         WHERE ID = '749e8890-860e-47da-a1ec-38e5703af9e2'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ActionFilter')
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
            '749e8890-860e-47da-a1ec-38e5703af9e2',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Filters
            100016,
            'ActionFilter',
            'Action Filter',
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
         WHERE ID = 'b3330707-621b-4524-a8cf-6fef4a34a9ff'  OR 
               (EntityID = '4B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TemplateContent')
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
            'b3330707-621b-4524-a8cf-6fef4a34a9ff',
            '4B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Template Params
            100037,
            'TemplateContent',
            'Template Content',
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
         WHERE ID = '8f4043fa-41ee-4f1b-9306-5e74f9e81079'  OR 
               (EntityID = '4D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecommendationRun')
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
            '8f4043fa-41ee-4f1b-9306-5e74f9e81079',
            '4D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Recommendations
            100014,
            'RecommendationRun',
            'Recommendation Run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3e82838f-433b-4add-834c-56ef026a36b6'  OR 
               (EntityID = '50248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Recommendation')
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
            '3e82838f-433b-4add-834c-56ef026a36b6',
            '50248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Recommendation Items
            100016,
            'Recommendation',
            'Recommendation',
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
         WHERE ID = 'a19449d1-ed9b-4893-8bf8-55f97168e1ef'  OR 
               (EntityID = '52248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityCommunicationMessageType')
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
            'a19449d1-ed9b-4893-8bf8-55f97168e1ef',
            '52248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Communication Fields
            100013,
            'EntityCommunicationMessageType',
            'Entity Communication Message Type',
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
         WHERE ID = '74a97100-a45d-41ab-bd92-2b0e2520b46d'  OR 
               (EntityID = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            '74a97100-a45d-41ab-bd92-2b0e2520b46d',
            '56248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Params
            100018,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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
         WHERE ID = '0e81ed89-87a8-4b41-aa1c-160723b9f79b'  OR 
               (EntityID = 'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E' AND Name = 'ConversationDetail')
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
            '0e81ed89-87a8-4b41-aa1c-160723b9f79b',
            'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E', -- Entity: MJ: Conversation Detail Ratings
            100016,
            'ConversationDetail',
            'Conversation Detail',
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
         WHERE ID = '1822a95a-da7e-44e1-be96-3428f1e0fec9'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'AgentRun')
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
            '1822a95a-da7e-44e1-be96-3428f1e0fec9',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100046,
            'AgentRun',
            'Agent Run',
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
         WHERE ID = 'dd3c27f3-4a18-431a-9c26-334aa0b73978'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'Parent')
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
            'dd3c27f3-4a18-431a-9c26-334aa0b73978',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100047,
            'Parent',
            'Parent',
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
         WHERE ID = '60838d9e-9bb4-4b39-abf8-29a900cb335c'  OR 
               (EntityID = '16AB21D1-8047-41B9-8AEA-CD253DED9743' AND Name = 'ConversationDetail')
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
            '60838d9e-9bb4-4b39-abf8-29a900cb335c',
            '16AB21D1-8047-41B9-8AEA-CD253DED9743', -- Entity: MJ: Conversation Detail Artifacts
            100014,
            'ConversationDetail',
            'Conversation Detail',
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
         WHERE ID = 'b826f473-c2a9-4924-9358-21ebef42885c'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'ConversationDetail')
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
            'b826f473-c2a9-4924-9358-21ebef42885c',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100046,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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
         WHERE ID = '680c2935-061c-478b-8084-35b8460e159b'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'MCPServerTool')
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
            '680c2935-061c-478b-8084-35b8460e159b',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100034,
            'MCPServerTool',
            'MCP Server Tool',
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '79FB15F8-84D5-4885-B70B-C7EE0E0EE1C5'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C94D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '79FB15F8-84D5-4885-B70B-C7EE0E0EE1C5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '50A4214B-56C2-4B72-8544-1D86CBBB329F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '79FB15F8-84D5-4885-B70B-C7EE0E0EE1C5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '50A4214B-56C2-4B72-8544-1D86CBBB329F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B9384CC2-3D11-4686-BB9F-08930D2242A0'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B9384CC2-3D11-4686-BB9F-08930D2242A0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5E4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B9384CC2-3D11-4686-BB9F-08930D2242A0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5E4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '804E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '575753A4-C12E-4E48-A835-6FE3FACE5527'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7CAD1EDB-FDFC-4C19-8E8C-CCBCE0C60558'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6E4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '114E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7F4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '804E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '824E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6E4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FD73433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0074433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9B74433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '750A856A-8E2A-4161-AE35-0A311266D2EA'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE73433E-F36B-1410-883E-00D02208DC50'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9B74433E-F36B-1410-883E-00D02208DC50'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '750A856A-8E2A-4161-AE35-0A311266D2EA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0B216DCA-0EB9-42E3-942F-8C74960C2CD5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '48C4211A-CF59-45BE-B2F1-EF59FD5D2050'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FF165221-28A2-4413-AB17-30620F7BEBDD'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '394417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FF165221-28A2-4413-AB17-30620F7BEBDD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '394E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '014D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '024D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Role Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B9384CC2-3D11-4686-BB9F-08930D2242A0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Role Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '394D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '50A4214B-56C2-4B72-8544-1D86CBBB329F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'External Identifier',
       GeneratedFormSection = 'Category',
       DisplayName = 'External System Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'External Identifier',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C94D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A05817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A15817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Employee Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '79FB15F8-84D5-4885-B70B-C7EE0E0EE1C5'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4048445d-d12a-47d4-8f5f-a9508bca617b', 'D7238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Employee Info":{"icon":"fa fa-user","description":"Human‑readable employee details associated with the integration mapping"},"Integration Mapping":{"icon":"fa fa-link","description":""},"External Identifier":{"icon":"fa fa-id-badge","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f2d5a8ec-a512-4fc4-af2b-5fda8d29b6f2', 'D8238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Entity Keys":{"icon":"fa fa-key","description":""},"Role Assignment":{"icon":"fa fa-id-badge","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Employee Info":"fa fa-user","Integration Mapping":"fa fa-link","External Identifier":"fa fa-id-badge","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'D7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Entity Keys":"fa fa-key","Role Assignment":"fa fa-id-badge","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'D8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 21 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0774433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D74433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FB73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D991B48-52BD-4609-B8C1-71529BF8E9E8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Embedding',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C20C752B-8050-44A3-BC08-C1E85E1A9231'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48C4211A-CF59-45BE-B2F1-EF59FD5D2050'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1BF0DAAD-4F43-4486-AF6A-787A9DD73684'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B74433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '37E74387-AEFE-478E-B259-FE441F439681'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Result Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FF73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0074433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expired On',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0174433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F332D3A9-5402-4E82-90E4-DDB3F4315F19'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '257026B1-1FD2-4B71-B94D-F97E7FEE6023'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '750A856A-8E2A-4161-AE35-0A311266D2EA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0B216DCA-0EB9-42E3-942F-8C74960C2CD5'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('9c81453c-0621-49be-858f-b07fcf65760c', '78AD0238-8B56-EF11-991A-6045BDEBA539', 'FieldCategoryInfo', '{"System Metadata":{"icon":"fa fa-cog","description":""},"Prompt Configuration":{"icon":"fa fa-sliders-h","description":""},"Result Information":{"icon":"fa fa-file-alt","description":""},"Execution Details":{"icon":"fa fa-clock","description":""},"Stakeholder Links":{"icon":"fa fa-user","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"System Metadata":"fa fa-cog","Prompt Configuration":"fa fa-sliders-h","Result Information":"fa fa-file-alt","Execution Details":"fa fa-clock","Stakeholder Links":"fa fa-user"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 23 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0F4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '104E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'External ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '114E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7F4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '804E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Archived',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '144417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '814E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '824E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '575753A4-C12E-4E48-A835-6FE3FACE5527'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A8EE672F-D2DF-4C0F-81FC-1392FCAD9813'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB07B3D0-FF8B-43AD-A612-01340C796652'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Pinned',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7CAD1EDB-FDFC-4C19-8E8C-CCBCE0C60558'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Run Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E687A08-D39E-4488-9AF9-C71394F7217A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '834E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1AE26D76-2246-4FD4-8BCB-04C1953E2612'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '49A2D31E-331D-42C6-BA30-C96EB5A1310F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE95FC8E-8A64-48D1-AA72-2F141C9199A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Run Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E879A60E-D123-42CF-89C1-B44E259C3FC3'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0d31caaa-0b97-4560-b4a6-9f1918fd54ca', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Test Run Details":{"icon":"fa fa-flask","description":"Information linking a conversation to a specific test execution for debugging or quality‑control purposes"},"Conversation Core":{"icon":"fa fa-comment","description":""},"Participants & References":{"icon":"fa fa-users","description":""},"Contextual Scope":{"icon":"fa fa-sitemap","description":""},"System Audit":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Test Run Details":"fa fa-flask","Conversation Core":"fa fa-comment","Participants & References":"fa fa-users","Contextual Scope":"fa fa-sitemap","System Audit":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '354417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duplicate Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '364417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Skipped Reason',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '394417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Merge Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Merge Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '835817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '845817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duplicate Run Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FF165221-28A2-4413-AB17-30620F7BEBDD'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('df0c99f8-45a0-46ae-9d25-3f677ac1dc23', '31248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Run Identification":{"icon":"fa fa-key","description":""},"Processing Outcomes":{"icon":"fa fa-flag","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Run Identification":"fa fa-key","Processing Outcomes":"fa fa-flag","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'D3330BD6-4F91-4BC8-9C19-BD49AFB603EB'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D3330BD6-4F91-4BC8-9C19-BD49AFB603EB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D3330BD6-4F91-4BC8-9C19-BD49AFB603EB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C32D371C-ED85-49EE-9DAE-11DD3030D1AF'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C32D371C-ED85-49EE-9DAE-11DD3030D1AF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B05717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A19449D1-ED9B-4893-8BF8-55F97168E1EF'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A19449D1-ED9B-4893-8BF8-55F97168E1EF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '749E8890-860E-47DA-A1EC-38E5703AF9E2'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5D5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5E5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6148D86A-305F-4096-B107-EBAB0AC5C6D8'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '749E8890-860E-47DA-A1EC-38E5703AF9E2'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5E5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6148D86A-305F-4096-B107-EBAB0AC5C6D8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '749E8890-860E-47DA-A1EC-38E5703AF9E2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '995817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9A5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '74A97100-A45D-41AB-BD92-2B0E2520B46D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '74A97100-A45D-41AB-BD92-2B0E2520B46D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Communication Message Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Field Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B05717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E15717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E25717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A19449D1-ED9B-4893-8BF8-55F97168E1EF'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7d33f94a-366c-4b6a-a7ce-834bf5055001', '52248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Identification":{"icon":"fa fa-key","description":""},"Mapping Configuration":{"icon":"fa fa-cogs","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Identification":"fa fa-key","Mapping Configuration":"fa fa-cogs","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '52248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Skill',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '404D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Skill Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C32D371C-ED85-49EE-9DAE-11DD3030D1AF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '034D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '044D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a7e0e0d9-2eab-4ce5-920e-f0608e1f54c0', 'D9238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Skill Assignment":{"icon":"fa fa-tools","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Skill Assignment":"fa fa-tools","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'D9238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action Filter ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5D5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Action Definitions',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6148D86A-305F-4096-B107-EBAB0AC5C6D8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Action Definitions',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action Filter',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '749E8890-860E-47DA-A1EC-38E5703AF9E2'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e7b6b388-b066-45e6-b9e8-a95d730468d6', '39248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Action Definitions":{"icon":"fa fa-cogs","description":"Textual definitions of the entity action and its associated filter"},"Identifier Keys":{"icon":"fa fa-key","description":""},"Execution Settings":{"icon":"fa fa-sliders-h","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Action Definitions":"fa fa-cogs","Identifier Keys":"fa fa-key","Execution Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D3330BD6-4F91-4BC8-9C19-BD49AFB603EB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Invocation Type ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7D4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Invocation Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('323da5f3-ce71-4659-8378-97db05e99760', '35248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"System Metadata":{"icon":"fa fa-database","description":""},"Invocation Configuration":{"icon":"fa fa-cogs","description":""},"Invocation Status":{"icon":"fa fa-flag","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"System Metadata":"fa fa-database","Invocation Configuration":"fa fa-cogs","Invocation Status":"fa fa-flag"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F95717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action Parameter',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '985817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '74A97100-A45D-41AB-BD92-2B0E2520B46D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Value Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '995817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Value',
       ExtendedType = 'Code',
       CodeType = 'JavaScript'
   WHERE ID = '9A5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parameter Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7c848234-ff3e-48e4-b7bc-972d90c68434', '56248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Identifier & Relationships":{"icon":"fa fa-link","description":""},"Parameter Definition":{"icon":"fa fa-key","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Identifier & Relationships":"fa fa-link","Parameter Definition":"fa fa-key","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '60838D9E-9BB4-4B39-ABF8-29A900CB335C'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2C6E811B-94B8-45F6-93C3-004CAFB054F8'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '60838D9E-9BB4-4B39-ABF8-29A900CB335C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CB7692F5-554C-48A6-B88B-207DD35A3072'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2C6E811B-94B8-45F6-93C3-004CAFB054F8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '60838D9E-9BB4-4B39-ABF8-29A900CB335C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CB7692F5-554C-48A6-B88B-207DD35A3072'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'C29822D0-EC93-42DE-BB4C-D280B7C69B7C'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D2431785-0203-430C-A267-6A0EEB22A4C5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D5D4F701-DD24-41F4-B62C-C5EFD4676B92'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C29822D0-EC93-42DE-BB4C-D280B7C69B7C'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C29822D0-EC93-42DE-BB4C-D280B7C69B7C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '465817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1D904F40-06E3-47EC-94DF-B8CDE89706E7'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '465817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1D904F40-06E3-47EC-94DF-B8CDE89706E7'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F94FF331-68D5-4FCD-BDEA-3585DEA4BA93'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6D420001-1FB8-430E-9E2C-027A6BF7D757'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B04A327B-55BF-4914-9DCF-3552A5DD0293'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4B0A5884-5F7C-4668-8DE8-3CBD8790DA28'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DD862060-4FD4-4D09-AB19-8E03AAEFC4E1'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B04A327B-55BF-4914-9DCF-3552A5DD0293'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4B0A5884-5F7C-4668-8DE8-3CBD8790DA28'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '84D28564-733D-4CC6-BBA3-0DB947BD2040'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6B3AB4D4-9150-499E-B9FF-5AF9454849CB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B0E0446-427C-4BF0-8562-5152265CFE1A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3DC2DCEC-6F1E-421A-BE51-578F7D2F091E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '95E2B969-4F03-4EFE-B519-D6DAC1272C3D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B5EE3D38-8573-4170-BEE5-A3EF5D51DD4C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '019FFEE0-0763-48E0-9862-D429A4CDAB3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C29822D0-EC93-42DE-BB4C-D280B7C69B7C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2431785-0203-430C-A267-6A0EEB22A4C5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Input Values',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B114689E-036B-428F-B179-0B68371CF237'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Calls Per Minute',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D5D4F701-DD24-41F4-B62C-C5EFD4676B92'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Connection Mapping":{"icon":"fa fa-link","description":"Links server connections to specific tools and includes connection identifiers"},"Execution Settings":{"icon":"fa fa-sliders-h","description":"Controls enablement, rate limits, and default input values for each tool"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Connection Mapping":"fa fa-link","Execution Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 25 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73A164F4-CD17-4818-944F-C32FF6AECC6F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6EC40C86-3805-46B5-B13C-8BF4C440B8C9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Step Number',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D420001-1FB8-430E-9E2C-027A6BF7D757'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Step Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B04A327B-55BF-4914-9DCF-3552A5DD0293'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Step Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A60234B6-768E-4A9A-B320-19945BE32C96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B0A5884-5F7C-4668-8DE8-3CBD8790DA28'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD862060-4FD4-4D09-AB19-8E03AAEFC4E1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '79CABC92-666A-4403-8802-F6B57F9E00DE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8E36A2B5-3F14-4BDA-942E-C0F771D323D5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84D28564-733D-4CC6-BBA3-0DB947BD2040'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C3DCA069-31F0-41CE-9E73-471BD9F6DA4C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4BE3997A-2974-482B-B5BA-5017439E6CDA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '576FE9EC-53A5-47F3-B194-6F32981B92D8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '57DAC94A-8AD5-46A3-979B-E8A3E0A8AD38'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '221FA3C6-184F-49ED-B679-13ABE9A55FEF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload At Start',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '93A2C3A5-2773-4DEA-847C-0D1AAD1929AA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload At End',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD7A82BD-C269-434B-9BB4-BBAC6064AF98'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation Result',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '885CA658-9A97-4A8D-8726-286F954BF65A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation Messages',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ADA3E427-9792-4587-96F6-7ECE2CF854FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EFDF061E-458A-4510-B5B3-A1508BE9C156'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notes & System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B3AB4D4-9150-499E-B9FF-5AF9454849CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1822A95A-DA7E-44E1-BE96-3428F1E0FEC9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD3C27F3-4A18-431A-9C26-334AA0B73978'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5CB223A8-487A-4C9F-895D-490CDA610571'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('9390b902-9ffa-451c-9949-808e93032b94', '99273DAD-560E-4ABC-8332-C97AB58B7463', 'FieldCategoryInfo', '{"Step Identification & Hierarchy":{"icon":"fa fa-layer-group","description":""},"Execution Status & Validation":{"icon":"fa fa-flag-checkered","description":""},"Data & Payload":{"icon":"fa fa-database","description":""},"Notes & System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Step Identification & Hierarchy":"fa fa-layer-group","Execution Status & Validation":"fa fa-flag-checkered","Data & Payload":"fa fa-database","Notes & System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '0E81ED89-87A8-4B41-AA1C-160723B9F79B'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8D564214-0633-4D21-93D9-18FF2CE1CDFE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0E81ED89-87A8-4B41-AA1C-160723B9F79B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '95427194-037B-40BB-8A70-23D84323BC4B'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0E81ED89-87A8-4B41-AA1C-160723B9F79B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '95427194-037B-40BB-8A70-23D84323BC4B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Reference IDs',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C6C87F9-2BD3-4FAC-BDF6-083AF4B27DC1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Reference IDs',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '28CB2BA0-F1BB-4F94-92C0-C70864CC2572'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Reference IDs',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '560E53BF-3F6E-42A2-B3C6-FF2DBAD2EF1C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Rating',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8D564214-0633-4D21-93D9-18FF2CE1CDFE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84845FA8-AF88-48F0-B343-2F27EA892DDC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '95427194-037B-40BB-8A70-23D84323BC4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0E81ED89-87A8-4B41-AA1C-160723B9F79B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '49C7ADAE-9D03-4347-B477-6DE824021056'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '140CF09F-62A3-4A17-A6B5-A6D75D6EEF8D'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('94e79d16-28ff-4efc-bb8a-24a667ae4c9b', 'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E', 'FieldCategoryInfo', '{"Rating Information":{"icon":"fa fa-star","description":""},"Reference IDs":{"icon":"fa fa-link","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Rating Information":"fa fa-star","Reference IDs":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6286C405-7ABB-481E-BD23-F517DE7E8BD3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B46BAD20-46B2-445E-B703-CA74BD6F9C5D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C45DA881-7CD4-424E-8855-C259F531E018'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Direction',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C6E811B-94B8-45F6-93C3-004CAFB054F8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CB7692F5-554C-48A6-B88B-207DD35A3072'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DDB7A2FA-6D08-4DC3-B69A-6851901A4F79'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '34B67D3A-FED8-49E7-ABCA-3F34FDC88DC3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Detail',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '60838D9E-9BB4-4B39-ABF8-29A900CB335C'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('1c64afaa-0d30-4c7d-b951-786cfed16f5f', '16AB21D1-8047-41B9-8AEA-CD253DED9743', 'FieldCategoryInfo', '{"Conversation Detail":{"icon":"fa fa-comment","description":"Textual content of the conversation message"},"Core Identifiers":{"icon":"fa fa-key","description":""},"Artifact Details":{"icon":"fa fa-exchange-alt","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Conversation Detail":"fa fa-comment","Core Identifiers":"fa fa-key","Artifact Details":"fa fa-exchange-alt","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '16AB21D1-8047-41B9-8AEA-CD253DED9743' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '435817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '445817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '455817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Code',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '465817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Details',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1D904F40-06E3-47EC-94DF-B8CDE89706E7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration Run Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F94FF331-68D5-4FCD-BDEA-3585DEA4BA93'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c12b3423-b891-4a28-a2ba-7b8b10a5b548', 'E7238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Technical Information":{"icon":"fa fa-cog","description":""},"Error Classification":{"icon":"fa fa-tag","description":""},"Error Content":{"icon":"fa fa-file-alt","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Technical Information":"fa fa-cog","Error Classification":"fa fa-tag","Error Content":"fa fa-file-alt"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E7F6FE9B-D064-4C71-AA91-66D1E81FCD52'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '32ED9C3D-9F06-49EA-8165-4C78C41128F0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A765705A-2032-49A5-8FE5-4E5B7254240B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CEF515F8-77D6-4981-9F31-378ED7BAF0A2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '680C2935-061C-478B-8084-35B8460E159B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9320E9C7-764E-401B-BF2D-A07358E4DD00'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8071305E-E1C1-48BF-AE70-E345D6B892EE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '97A0A3EA-5563-4C55-9935-397C26BFD00A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E1E5F477-3ABE-4793-BC11-A719CB078463'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '65ABF2B8-3355-4427-828B-E3082806C557'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9320E9C7-764E-401B-BF2D-A07358E4DD00'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E1E5F477-3ABE-4793-BC11-A719CB078463'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9A8AEAF5-9065-4B87-8A63-B04F84E83886'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '65ABF2B8-3355-4427-828B-E3082806C557'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1EFAD61D-3A38-4CEA-86FE-67463E887920'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E7951B0E-3F0A-45DA-BFC3-A4ABB3AC5E0C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '8F4043FA-41EE-4F1B-9306-5E74F9E81079'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8F4043FA-41EE-4F1B-9306-5E74F9E81079'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E34C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8F4043FA-41EE-4F1B-9306-5E74F9E81079'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E34C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B85717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DA4217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B24D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B85717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B24D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EF5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3E82838F-433B-4ADD-834C-56EF026A36B6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AB5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AC5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3E82838F-433B-4ADD-834C-56EF026A36B6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '135917F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AB5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3E82838F-433B-4ADD-834C-56EF026A36B6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '135917F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DC4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Entity Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8F4043FA-41EE-4F1B-9306-5E74F9E81079'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E34C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('37f7b2dc-4556-4c5b-bfcf-439821d7f615', '4D248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Recommendation Core":{"icon":"fa fa-clipboard","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Recommendation Core":"fa fa-clipboard","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '4D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 25 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD227316-95F3-468B-8DB8-AEA5E3A4C431'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B6A3F29-48A9-41B8-8374-214F12A5659C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0B5358D5-C6C2-4579-879E-D2BA19D95541'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C866D300-E97C-44E7-8848-F3DA97CE3F77'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F8719181-09B2-4C98-86F1-9A7828F46D2B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B80F5CC-B3AD-4C4E-9F64-4C061AC14EC2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E94662C2-69B9-4603-9BFC-279CFD42A222'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CCE153EB-99AC-42DD-9BF7-628C0E121C62'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F585440-DA55-4A2A-A48B-2937A3B24483'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A1E1C7BA-66FA-4BDC-A21A-A27AB8C577C4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2344E41B-6F21-419A-B80F-43636478A814'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B826F473-C2A9-4924-9358-21EBEF42885C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1EFAD61D-3A38-4CEA-86FE-67463E887920'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7951B0E-3F0A-45DA-BFC3-A4ABB3AC5E0C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '18585DF4-33D0-4CFC-95E4-6674186DCD9C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '24940E6C-FC69-40F1-9EA6-D860F38FC93F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9320E9C7-764E-401B-BF2D-A07358E4DD00'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Percent Complete',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8071305E-E1C1-48BF-AE70-E345D6B892EE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E1E5F477-3ABE-4793-BC11-A719CB078463'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A8AEAF5-9065-4B87-8A63-B04F84E83886'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '65ABF2B8-3355-4427-828B-E3082806C557'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timeline & Milestones',
       GeneratedFormSection = 'Category',
       DisplayName = 'Due At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '97A0A3EA-5563-4C55-9935-397C26BFD00A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timeline & Milestones',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B267C59C-3370-4EDF-A9D4-106D46A6BBF4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timeline & Milestones',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F09901B1-A4C3-4845-A639-B9730146021A'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('df106064-0246-4820-b2c6-febda8da8c45', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'FieldCategoryInfo', '{"Task Details":{"icon":"fa fa-tasks","description":""},"Relationships & Ownership":{"icon":"fa fa-users","description":""},"Timeline & Milestones":{"icon":"fa fa-calendar-alt","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Task Details":"fa fa-tasks","Relationships & Ownership":"fa fa-users","Timeline & Milestones":"fa fa-calendar-alt","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A85717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A95717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Destination Entity ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Destination Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AB5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Probability',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AC5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '035917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '045917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E82838F-433B-4ADD-834C-56EF026A36B6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Destination Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '135917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 21 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F14C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F24C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DC4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0A4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Replay Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F34C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B64D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Replay Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E84C5AAB-43C0-43E3-9173-16AACD5D064E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Change Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B85717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Changed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B24D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F04C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Changes JSON',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B34D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Changes Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Full Record JSON',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B54D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('bd3ba2ba-8d77-4af1-afa0-2e4f0551f6ce', '50248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Technical Identifiers":{"icon":"fa fa-cog","description":""},"Recommendation Data":{"icon":"fa fa-lightbulb","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Technical Identifiers":"fa fa-cog","Recommendation Data":"fa fa-lightbulb"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '50248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('de24ea3f-c100-4c51-b576-efbdea06f6f5', 'F5238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"System Metadata":{"icon":"fa fa-cog","description":""},"Change Summary":{"icon":"fa fa-clipboard","description":""},"Change Content":{"icon":"fa fa-file-code","description":""},"Record Context":{"icon":"fa fa-link","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B26460B-B434-41E8-98D6-6E8973A1998F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '78A09C32-7FE6-408A-862A-71BD7E0042F7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73C2B5A4-9F4F-4195-9794-BCE839DB8B70'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Connection ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F402BB2F-2BDB-458A-BA98-58C95C41FE03'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Connection Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9BEF8A97-4002-4707-A73C-2A679ACE8F96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool Name (Cached)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '680C2935-061C-478B-8084-35B8460E159B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Start Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7F6FE9B-D064-4C71-AA91-66D1E81FCD52'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'End Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B8A92DB-CFF9-400D-B88F-41131C0480C6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '32ED9C3D-9F06-49EA-8165-4C78C41128F0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A765705A-2032-49A5-8FE5-4E5B7254240B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CEF515F8-77D6-4981-9F31-378ED7BAF0A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F92F2ED5-628E-4222-B66C-F5B4139F3309'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Truncated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B0BE70A8-D2E8-46A6-B746-57528E095F81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '68CB9A34-65C2-4546-ABAE-1A616D5F93A6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Parameters',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C584FB9F-D0A0-48D8-9E0E-DAB449769F44'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"System Metadata":"fa fa-cog","Change Summary":"fa fa-clipboard","Change Content":"fa fa-file-code","Record Context":"fa fa-link"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"User Interaction":{"icon":"fa fa-id-card","description":"Information about the user who triggered the execution and the parameters they provided"},"Execution Details":{"icon":"fa fa-tachometer-alt","description":"Core information about the execution timing, outcome, and tool used."},"Connection Context":{"icon":"fa fa-plug","description":"Details of the server connection and tool identifiers involved in the execution."},"User Context":{"icon":"fa fa-user","description":"Information about the user who initiated the tool execution."},"Payload & Errors":{"icon":"fa fa-file-alt","description":"Logged input parameters, output data, and any error messages from the execution."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields such as IDs and timestamps."}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"User Interaction":"fa fa-id-card","Execution Details":"fa fa-tachometer-alt","Connection Context":"fa fa-plug","User Context":"fa fa-user","Payload & Errors":"fa fa-file-alt","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5C4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4680AD31-BCFA-49C3-B9D8-B44862BCB83C'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5C4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4680AD31-BCFA-49C3-B9D8-B44862BCB83C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F64D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F74D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E9A8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EAA8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '54D5F848-BE9C-4B4A-8DF0-B53E2EA196E5'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F64D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F74D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E9A8FEEC-7840-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EAA8FEEC-7840-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '54D5F848-BE9C-4B4A-8DF0-B53E2EA196E5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9C5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9D5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DA4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D74C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9B5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9C5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0E5917F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D84C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '594317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record Merge Log ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Deleted Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processing Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5D4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record Merge Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4680AD31-BCFA-49C3-B9D8-B44862BCB83C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '755817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '765817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0d3d3ebf-f6a2-4e59-9a43-d54f7f74553c', '18248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Deletion Audit":{"icon":"fa fa-trash-alt","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Deletion Audit":"fa fa-trash-alt","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '18248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 19 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '985717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '995717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '58826477-0141-4692-A271-24918F5B9224'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D74C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D84C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B3330707-621B-4524-A8CF-6FEF4A34A9FF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Required',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Parameter',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0E5917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Parameter Field',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0F5917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Extra Filter',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '105917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order By',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7321B323-7F8B-4DCD-AE44-01FCE8AAB7EF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '945817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '955817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6bbdd582-50ce-4a29-b71a-d8d4f222dcca', '4B248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Template Association":{"icon":"fa fa-link","description":""},"Parameter Specification":{"icon":"fa fa-sliders-h","description":""},"Dynamic Linking & Filters":{"icon":"fa fa-filter","description":""},"System Metadata":{"icon":"fa fa-database","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Template Association":"fa fa-link","Parameter Specification":"fa fa-sliders-h","Dynamic Linking & Filters":"fa fa-filter","System Metadata":"fa fa-database"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '4B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 30 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '284317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2A4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F84E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F44D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sharing Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F34D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '524F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F94E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Trigger Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F04D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Format Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F14D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Delivery Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F24D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Frequency',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F64D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Target Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = 'F74D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Workflow',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F84D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B55817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B65817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Thumbnail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '291EF341-1318-4B86-A9A7-1180CE820609'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '257FFE0E-EC6F-441B-8039-3A17B44FF4FB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EAA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EBA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4ABED376-DA3F-40BF-A9CD-A67F95A8D061'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ECA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Trigger Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EDA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Format Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EEA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Delivery Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EFA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Workflow',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F0A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '54D5F848-BE9C-4B4A-8DF0-B53E2EA196E5'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a2a710e1-7136-41ee-a713-bc20a83f2f3c', '09248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Report Details":{"icon":"fa fa-file-alt","description":""},"Data Context & Relationships":{"icon":"fa fa-sitemap","description":""},"Output & Scheduling":{"icon":"fa fa-calendar","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Report Details":"fa fa-file-alt","Data Context & Relationships":"fa fa-sitemap","Output & Scheduling":"fa fa-calendar","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '09248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

