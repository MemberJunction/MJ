CREATE TABLE [${flyway:defaultSchema}].[ReportVersion](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
    [ReportID] [uniqueidentifier] NOT NULL,
    [VersionNumber] [int] NOT NULL,
    [Name] [nvarchar](255) NOT NULL,
    [Description] [nvarchar](max) NULL,
    [Configuration] [nvarchar](max) NULL,
    [DataContextUpdated] [bit] NOT NULL DEFAULT (0),
    CONSTRAINT [PK_ReportVersion_ID] PRIMARY KEY CLUSTERED 
    (
        [ID] ASC
    ),
    CONSTRAINT [FK_ReportVersion_Report] FOREIGN KEY([ReportID]) REFERENCES [${flyway:defaultSchema}].[Report] ([ID]),
    CONSTRAINT [UQ_ReportVersion_ReportID_VersionNumber] UNIQUE ([ReportID], [VersionNumber]),
    CONSTRAINT [CK_ReportVersion_VersionNumber] CHECK ([VersionNumber] > 0)
) 
GO


-- Table level extended property
EXEC sp_addextendedproperty @name = N'MS_Description', 
    @value = N'Stores iterations of report logic, structure, and layout changes', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', @level1name = N'ReportVersion'
GO

-- Column level extended properties
EXEC sp_addextendedproperty @name = N'MS_Description', 
    @value = N'Report version number, sequential per report starting at 1', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', @level1name = N'ReportVersion',
    @level2type = N'COLUMN', @level2name = N'VersionNumber'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', 
    @value = N'Name of this report version', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', @level1name = N'ReportVersion',
    @level2type = N'COLUMN', @level2name = N'Name'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', 
    @value = N'Description of this report version', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', @level1name = N'ReportVersion',
    @level2type = N'COLUMN', @level2name = N'Description'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', 
    @value = N'JSON configuration of report structure, layout and logic', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', @level1name = N'ReportVersion',
    @level2type = N'COLUMN', @level2name = N'Configuration'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', 
    @value = N'Indicates if the data context was updated in this version', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', @level1name = N'ReportVersion',
    @level2type = N'COLUMN', @level2name = N'DataContextUpdated'
GO


CREATE TABLE [${flyway:defaultSchema}].[ReportUserState](
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
    [ReportID] [uniqueidentifier] NOT NULL,
    [UserID] [uniqueidentifier] NOT NULL,
    [ReportState] [nvarchar](max) NULL,
    CONSTRAINT [PK_ReportUserState_ID] PRIMARY KEY CLUSTERED 
    (
        [ID] ASC
    ),
    CONSTRAINT [FK_ReportUserState_Report] FOREIGN KEY([ReportID]) REFERENCES [${flyway:defaultSchema}].[Report] ([ID]),
    CONSTRAINT [FK_ReportUserState_User] FOREIGN KEY([UserID]) REFERENCES [${flyway:defaultSchema}].[User] ([ID]),
    CONSTRAINT [UQ_ReportUserState_ReportID_UserID] UNIQUE ([ReportID], [UserID])
)  
GO

-- Table level extended property
EXEC sp_addextendedproperty @name = N'MS_Description', 
    @value = N'Tracks individual user state within interactive reports', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', @level1name = N'ReportUserState'
GO

-- Column level extended property
EXEC sp_addextendedproperty @name = N'MS_Description', 
    @value = N'JSON serialized state of user interaction with the report', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE', @level1name = N'ReportUserState',
    @level2type = N'COLUMN', @level2name = N'ReportState'
GO


----- CODE GENERATION -----
/* SQL generated to create new entity MJ: Report Versions */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '9516058d-9729-48ec-b0b8-e91a8221fc8f',
         'MJ: Report Versions',
         NULL,
         NULL,
         'ReportVersion',
         'vwReportVersions',
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
   

/* SQL generated to add new permission for entity MJ: Report Versions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9516058d-9729-48ec-b0b8-e91a8221fc8f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Report Versions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9516058d-9729-48ec-b0b8-e91a8221fc8f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Report Versions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9516058d-9729-48ec-b0b8-e91a8221fc8f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Report User States */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '4a4c2ee1-bfdd-434e-9a03-6f6c2384d01f',
         'MJ: Report User States',
         NULL,
         NULL,
         'ReportUserState',
         'vwReportUserStates',
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
   

/* SQL generated to add new permission for entity MJ: Report User States for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4a4c2ee1-bfdd-434e-9a03-6f6c2384d01f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Report User States for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4a4c2ee1-bfdd-434e-9a03-6f6c2384d01f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Report User States for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4a4c2ee1-bfdd-434e-9a03-6f6c2384d01f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity ${flyway:defaultSchema}.ReportUserState */
ALTER TABLE [${flyway:defaultSchema}].[ReportUserState] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity ${flyway:defaultSchema}.ReportUserState */
ALTER TABLE [${flyway:defaultSchema}].[ReportUserState] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity ${flyway:defaultSchema}.ReportVersion */
ALTER TABLE [${flyway:defaultSchema}].[ReportVersion] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity ${flyway:defaultSchema}.ReportVersion */
ALTER TABLE [${flyway:defaultSchema}].[ReportVersion] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '91bcfb05-1d1b-467b-8a17-a06e0606c7fb'  OR 
               (EntityID = '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F' AND Name = 'ID')
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
            '91bcfb05-1d1b-467b-8a17-a06e0606c7fb',
            '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F', -- Entity: MJ: Report User States
            1,
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
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f7bddafd-e2b7-4bb8-a888-dee07d33d580'  OR 
               (EntityID = '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F' AND Name = 'ReportID')
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
            'f7bddafd-e2b7-4bb8-a888-dee07d33d580',
            '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F', -- Entity: MJ: Report User States
            2,
            'ReportID',
            'Report ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '09248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1382c49f-a90a-4dcd-9d3c-9b0c58a1752e'  OR 
               (EntityID = '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F' AND Name = 'UserID')
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
            '1382c49f-a90a-4dcd-9d3c-9b0c58a1752e',
            '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F', -- Entity: MJ: Report User States
            3,
            'UserID',
            'User ID',
            NULL,
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
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6591a693-50a6-43fe-b4df-61c91b5bca83'  OR 
               (EntityID = '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F' AND Name = 'ReportState')
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
            '6591a693-50a6-43fe-b4df-61c91b5bca83',
            '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F', -- Entity: MJ: Report User States
            4,
            'ReportState',
            'Report State',
            'JSON serialized state of user interaction with the report',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cf4aa583-1f56-4228-b59f-998b6506d7fe'  OR 
               (EntityID = '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F' AND Name = '${flyway:defaultSchema}_CreatedAt')
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
            'cf4aa583-1f56-4228-b59f-998b6506d7fe',
            '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F', -- Entity: MJ: Report User States
            5,
            '${flyway:defaultSchema}_CreatedAt',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fbc96d80-d0bd-451c-98a5-eb29efba6f03'  OR 
               (EntityID = '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F' AND Name = '${flyway:defaultSchema}_UpdatedAt')
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
            'fbc96d80-d0bd-451c-98a5-eb29efba6f03',
            '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F', -- Entity: MJ: Report User States
            6,
            '${flyway:defaultSchema}_UpdatedAt',
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
         WHERE ID = 'db4981fb-88d1-4fe3-aa65-20c4720a8503'  OR 
               (EntityID = '9516058D-9729-48EC-B0B8-E91A8221FC8F' AND Name = 'ID')
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
            'db4981fb-88d1-4fe3-aa65-20c4720a8503',
            '9516058D-9729-48EC-B0B8-E91A8221FC8F', -- Entity: MJ: Report Versions
            1,
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
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9e8ed87c-b436-4b67-b2b2-09b126ed0a82'  OR 
               (EntityID = '9516058D-9729-48EC-B0B8-E91A8221FC8F' AND Name = 'ReportID')
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
            '9e8ed87c-b436-4b67-b2b2-09b126ed0a82',
            '9516058D-9729-48EC-B0B8-E91A8221FC8F', -- Entity: MJ: Report Versions
            2,
            'ReportID',
            'Report ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '09248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '79bf06a4-d891-478d-8621-c0ff430b541a'  OR 
               (EntityID = '9516058D-9729-48EC-B0B8-E91A8221FC8F' AND Name = 'VersionNumber')
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
            '79bf06a4-d891-478d-8621-c0ff430b541a',
            '9516058D-9729-48EC-B0B8-E91A8221FC8F', -- Entity: MJ: Report Versions
            3,
            'VersionNumber',
            'Version Number',
            'Report version number, sequential per report starting at 1',
            'int',
            4,
            10,
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
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4f3368e4-9732-47ef-a615-eec00087897f'  OR 
               (EntityID = '9516058D-9729-48EC-B0B8-E91A8221FC8F' AND Name = 'Name')
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
            '4f3368e4-9732-47ef-a615-eec00087897f',
            '9516058D-9729-48EC-B0B8-E91A8221FC8F', -- Entity: MJ: Report Versions
            4,
            'Name',
            'Name',
            'Name of this report version',
            'nvarchar',
            510,
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
         WHERE ID = '8a4b53c6-0558-489a-8922-dd5ea9b7df29'  OR 
               (EntityID = '9516058D-9729-48EC-B0B8-E91A8221FC8F' AND Name = 'Description')
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
            '8a4b53c6-0558-489a-8922-dd5ea9b7df29',
            '9516058D-9729-48EC-B0B8-E91A8221FC8F', -- Entity: MJ: Report Versions
            5,
            'Description',
            'Description',
            'Description of this report version',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c479d62c-4f0d-4001-8db4-f2c73034098f'  OR 
               (EntityID = '9516058D-9729-48EC-B0B8-E91A8221FC8F' AND Name = 'Configuration')
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
            'c479d62c-4f0d-4001-8db4-f2c73034098f',
            '9516058D-9729-48EC-B0B8-E91A8221FC8F', -- Entity: MJ: Report Versions
            6,
            'Configuration',
            'Configuration',
            'JSON configuration of report structure, layout and logic',
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
         WHERE ID = '07e0d463-716a-4bac-aa3b-f5e61e7c70ae'  OR 
               (EntityID = '9516058D-9729-48EC-B0B8-E91A8221FC8F' AND Name = 'DataContextUpdated')
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
            '07e0d463-716a-4bac-aa3b-f5e61e7c70ae',
            '9516058D-9729-48EC-B0B8-E91A8221FC8F', -- Entity: MJ: Report Versions
            7,
            'DataContextUpdated',
            'Data Context Updated',
            'Indicates if the data context was updated in this version',
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
         WHERE ID = '8bda1551-ecde-43a2-97fd-c526133325b5'  OR 
               (EntityID = '9516058D-9729-48EC-B0B8-E91A8221FC8F' AND Name = '${flyway:defaultSchema}_CreatedAt')
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
            '8bda1551-ecde-43a2-97fd-c526133325b5',
            '9516058D-9729-48EC-B0B8-E91A8221FC8F', -- Entity: MJ: Report Versions
            8,
            '${flyway:defaultSchema}_CreatedAt',
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
         WHERE ID = '769327f1-77c2-4682-bc63-f043a39045ff'  OR 
               (EntityID = '9516058D-9729-48EC-B0B8-E91A8221FC8F' AND Name = '${flyway:defaultSchema}_UpdatedAt')
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
            '769327f1-77c2-4682-bc63-f043a39045ff',
            '9516058D-9729-48EC-B0B8-E91A8221FC8F', -- Entity: MJ: Report Versions
            9,
            '${flyway:defaultSchema}_UpdatedAt',
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c989997d-85b4-4755-b08a-c60b77353ae1'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c989997d-85b4-4755-b08a-c60b77353ae1', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F', 'UserID', 'One To Many', 1, 1, 'MJ: Report User States', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '0f6be221-508c-4949-b73e-d76088f007e4'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('0f6be221-508c-4949-b73e-d76088f007e4', '09248F34-2837-EF11-86D4-6045BDEE16E6', '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F', 'ReportID', 'One To Many', 1, 1, 'MJ: Report User States', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f0e18355-6ab2-49d3-a65d-574e9408ad35'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f0e18355-6ab2-49d3-a65d-574e9408ad35', '09248F34-2837-EF11-86D4-6045BDEE16E6', '9516058D-9729-48EC-B0B8-E91A8221FC8F', 'ReportID', 'One To Many', 1, 1, 'MJ: Report Versions', 1);
   END
                              

/* Index for Foreign Keys for ReportUserState */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ReportID in table ReportUserState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ReportUserState_ReportID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ReportUserState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ReportUserState_ReportID ON [${flyway:defaultSchema}].[ReportUserState] ([ReportID]);

-- Index for foreign key UserID in table ReportUserState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ReportUserState_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ReportUserState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ReportUserState_UserID ON [${flyway:defaultSchema}].[ReportUserState] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID F7BDDAFD-E2B7-4BB8-A888-DEE07D33D580 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F7BDDAFD-E2B7-4BB8-A888-DEE07D33D580',
         @RelatedEntityNameFieldMap='Report'

/* SQL text to update entity field related entity name field map for entity field ID 1382C49F-A90A-4DCD-9D3C-9B0C58A1752E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1382C49F-A90A-4DCD-9D3C-9B0C58A1752E',
         @RelatedEntityNameFieldMap='User'

/* Base View SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: vwReportUserStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Report User States
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ReportUserState
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReportUserStates]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReportUserStates]
AS
SELECT
    r.*,
    Report_ReportID.[Name] AS [Report],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[ReportUserState] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Report] AS Report_ReportID
  ON
    [r].[ReportID] = Report_ReportID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReportUserStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: Permissions for vwReportUserStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReportUserStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: spCreateReportUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ReportUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReportUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReportUserState]
    @ReportID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @UserID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @ReportState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ReportUserState]
        (
            [ReportID],
            [UserID],
            [ReportState]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            CASE @ReportID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @ReportID END,
            CASE @UserID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @UserID END,
            @ReportState
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReportUserStates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportUserState] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Report User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportUserState] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: spUpdateReportUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ReportUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReportUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReportUserState]
    @ID uniqueidentifier,
    @ReportID uniqueidentifier,
    @UserID uniqueidentifier,
    @ReportState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportUserState]
    SET
        [ReportID] = @ReportID,
        [UserID] = @UserID,
        [ReportState] = @ReportState
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReportUserStates]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportUserState] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ReportUserState table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateReportUserState
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReportUserState
ON [${flyway:defaultSchema}].[ReportUserState]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportUserState]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ReportUserState] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Report User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportUserState] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: spDeleteReportUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReportUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReportUserState]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ReportUserState]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportUserState] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Report User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportUserState] TO [cdp_Integration]



/* Index for Foreign Keys for ReportVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ReportID in table ReportVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ReportVersion_ReportID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ReportVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ReportVersion_ReportID ON [${flyway:defaultSchema}].[ReportVersion] ([ReportID]);

/* SQL text to update entity field related entity name field map for entity field ID 9E8ED87C-B436-4B67-B2B2-09B126ED0A82 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9E8ED87C-B436-4B67-B2B2-09B126ED0A82',
         @RelatedEntityNameFieldMap='Report'

/* Base View SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: vwReportVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Report Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ReportVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReportVersions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReportVersions]
AS
SELECT
    r.*,
    Report_ReportID.[Name] AS [Report]
FROM
    [${flyway:defaultSchema}].[ReportVersion] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Report] AS Report_ReportID
  ON
    [r].[ReportID] = Report_ReportID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReportVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: Permissions for vwReportVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReportVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: spCreateReportVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ReportVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReportVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReportVersion]
    @ReportID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @VersionNumber int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @DataContextUpdated bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ReportVersion]
        (
            [ReportID],
            [VersionNumber],
            [Name],
            [Description],
            [Configuration],
            [DataContextUpdated]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            CASE @ReportID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @ReportID END,
            @VersionNumber,
            @Name,
            @Description,
            @Configuration,
            @DataContextUpdated
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReportVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportVersion] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Report Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportVersion] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: spUpdateReportVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ReportVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReportVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReportVersion]
    @ID uniqueidentifier,
    @ReportID uniqueidentifier,
    @VersionNumber int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @DataContextUpdated bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportVersion]
    SET
        [ReportID] = @ReportID,
        [VersionNumber] = @VersionNumber,
        [Name] = @Name,
        [Description] = @Description,
        [Configuration] = @Configuration,
        [DataContextUpdated] = @DataContextUpdated
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReportVersions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ReportVersion table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateReportVersion
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReportVersion
ON [${flyway:defaultSchema}].[ReportVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportVersion]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ReportVersion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Report Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportVersion] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: spDeleteReportVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReportVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReportVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ReportVersion]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportVersion] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Report Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportVersion] TO [cdp_Integration]



-- CHECK constraint for MJ: Report Versions: Field: VersionNumber was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', GETUTCDATE(), 'TypeScript','Approved', '([VersionNumber]>(0))', 'public ValidateVersionNumberGreaterThanZero(result: ValidationResult) {
	if (this.VersionNumber <= 0) {
		result.Errors.push(new ValidationErrorInfo("VersionNumber", "The version number must be greater than zero.", this.VersionNumber, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the version number must be greater than zero, meaning there should be at least one version created.', 'ValidateVersionNumberGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '79BF06A4-D891-478D-8621-C0FF430B541A');
  
            

---- MORE CODE GEN ----- 


/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '037b2e85-2834-4052-aa6f-f6870dde0b53'  OR 
               (EntityID = '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F' AND Name = 'Report')
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
            '037b2e85-2834-4052-aa6f-f6870dde0b53',
            '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F', -- Entity: MJ: Report User States
            7,
            'Report',
            'Report',
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
         WHERE ID = '1c327adb-fe15-4662-87db-74aced132059'  OR 
               (EntityID = '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F' AND Name = 'User')
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
            '1c327adb-fe15-4662-87db-74aced132059',
            '4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F', -- Entity: MJ: Report User States
            8,
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
         WHERE ID = '168eb427-6eec-4b92-98d4-aa669f6275a4'  OR 
               (EntityID = '9516058D-9729-48EC-B0B8-E91A8221FC8F' AND Name = 'Report')
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
            '168eb427-6eec-4b92-98d4-aa669f6275a4',
            '9516058D-9729-48EC-B0B8-E91A8221FC8F', -- Entity: MJ: Report Versions
            10,
            'Report',
            'Report',
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

/* Index for Foreign Keys for ReportUserState */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ReportID in table ReportUserState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ReportUserState_ReportID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ReportUserState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ReportUserState_ReportID ON [${flyway:defaultSchema}].[ReportUserState] ([ReportID]);

-- Index for foreign key UserID in table ReportUserState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ReportUserState_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ReportUserState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ReportUserState_UserID ON [${flyway:defaultSchema}].[ReportUserState] ([UserID]);

/* Base View SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: vwReportUserStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Report User States
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ReportUserState
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReportUserStates]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReportUserStates]
AS
SELECT
    r.*,
    Report_ReportID.[Name] AS [Report],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[ReportUserState] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Report] AS Report_ReportID
  ON
    [r].[ReportID] = Report_ReportID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReportUserStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: Permissions for vwReportUserStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReportUserStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: spCreateReportUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ReportUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReportUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReportUserState]
    @ReportID uniqueidentifier,
    @UserID uniqueidentifier,
    @ReportState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ReportUserState]
        (
            [ReportID],
            [UserID],
            [ReportState]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ReportID,
            @UserID,
            @ReportState
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReportUserStates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportUserState] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Report User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportUserState] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: spUpdateReportUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ReportUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReportUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReportUserState]
    @ID uniqueidentifier,
    @ReportID uniqueidentifier,
    @UserID uniqueidentifier,
    @ReportState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportUserState]
    SET
        [ReportID] = @ReportID,
        [UserID] = @UserID,
        [ReportState] = @ReportState
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReportUserStates]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportUserState] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ReportUserState table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateReportUserState
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReportUserState
ON [${flyway:defaultSchema}].[ReportUserState]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportUserState]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ReportUserState] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Report User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportUserState] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: spDeleteReportUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReportUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReportUserState]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ReportUserState]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportUserState] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Report User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportUserState] TO [cdp_Integration]



/* Index for Foreign Keys for ReportVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ReportID in table ReportVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ReportVersion_ReportID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ReportVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ReportVersion_ReportID ON [${flyway:defaultSchema}].[ReportVersion] ([ReportID]);

/* Base View SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: vwReportVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Report Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ReportVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReportVersions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReportVersions]
AS
SELECT
    r.*,
    Report_ReportID.[Name] AS [Report]
FROM
    [${flyway:defaultSchema}].[ReportVersion] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Report] AS Report_ReportID
  ON
    [r].[ReportID] = Report_ReportID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReportVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: Permissions for vwReportVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReportVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: spCreateReportVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ReportVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReportVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReportVersion]
    @ReportID uniqueidentifier,
    @VersionNumber int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @DataContextUpdated bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ReportVersion]
        (
            [ReportID],
            [VersionNumber],
            [Name],
            [Description],
            [Configuration],
            [DataContextUpdated]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ReportID,
            @VersionNumber,
            @Name,
            @Description,
            @Configuration,
            @DataContextUpdated
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReportVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportVersion] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Report Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportVersion] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: spUpdateReportVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ReportVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReportVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReportVersion]
    @ID uniqueidentifier,
    @ReportID uniqueidentifier,
    @VersionNumber int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @DataContextUpdated bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportVersion]
    SET
        [ReportID] = @ReportID,
        [VersionNumber] = @VersionNumber,
        [Name] = @Name,
        [Description] = @Description,
        [Configuration] = @Configuration,
        [DataContextUpdated] = @DataContextUpdated
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReportVersions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ReportVersion table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateReportVersion
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReportVersion
ON [${flyway:defaultSchema}].[ReportVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportVersion]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ReportVersion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Report Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportVersion] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: spDeleteReportVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReportVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReportVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ReportVersion]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportVersion] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Report Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportVersion] TO [cdp_Integration]



