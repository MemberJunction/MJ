-- Migration: Open App tracking tables
-- These tables live in the __mj core schema and are part of MemberJunction itself,
-- not part of any individual app. They track what Open Apps are installed in this instance.

-----------------------------------------------------------------------
-- 1. Open Apps
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.OpenApp (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(64) NOT NULL,
    DisplayName NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Version NVARCHAR(50) NOT NULL,
    Publisher NVARCHAR(200) NOT NULL,
    PublisherEmail NVARCHAR(255) NULL,
    PublisherURL NVARCHAR(500) NULL,
    RepositoryURL NVARCHAR(500) NOT NULL,
    SchemaName NVARCHAR(128) NULL,
    MJVersionRange NVARCHAR(100) NOT NULL,
    License NVARCHAR(50) NULL,
    Icon NVARCHAR(100) NULL,
    Color NVARCHAR(20) NULL,
    ManifestJSON NVARCHAR(MAX) NOT NULL,
    ConfigurationSchemaJSON NVARCHAR(MAX) NULL,
    InstalledByUserID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_OpenApp PRIMARY KEY (ID),
    CONSTRAINT UQ_OpenApp_Name UNIQUE (Name),
    CONSTRAINT UQ_OpenApp_Schema UNIQUE (SchemaName),
    CONSTRAINT FK_OpenApp_User FOREIGN KEY (InstalledByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_OpenApp_Status CHECK (Status IN (
        'Active', 'Disabled', 'Error', 'Installing', 'Upgrading', 'Removing', 'Removed'
    )),
    CONSTRAINT CK_OpenApp_Name CHECK (Name NOT LIKE '%[^a-z0-9-]%')
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks all MJ Open Apps installed in this instance',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp';
GO

-----------------------------------------------------------------------
-- 2. Open App Install History (audit trail)
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.OpenAppInstallHistory (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OpenAppID UNIQUEIDENTIFIER NOT NULL,
    Version NVARCHAR(50) NOT NULL,
    PreviousVersion NVARCHAR(50) NULL,
    Action NVARCHAR(20) NOT NULL,
    ManifestJSON NVARCHAR(MAX) NOT NULL,
    Summary NVARCHAR(MAX) NULL,
    ExecutedByUserID UNIQUEIDENTIFIER NOT NULL,
    DurationSeconds INT NULL,
    Success BIT NOT NULL DEFAULT 1,
    ErrorMessage NVARCHAR(MAX) NULL,
    ErrorPhase NVARCHAR(50) NULL,
    CONSTRAINT PK_OpenAppInstallHistory PRIMARY KEY (ID),
    CONSTRAINT FK_OpenAppInstallHistory_App FOREIGN KEY (OpenAppID)
        REFERENCES ${flyway:defaultSchema}.OpenApp(ID),
    CONSTRAINT FK_OpenAppInstallHistory_User FOREIGN KEY (ExecutedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_OpenAppInstallHistory_Action CHECK (Action IN (
        'Install', 'Upgrade', 'Remove'
    )),
    CONSTRAINT CK_OpenAppInstallHistory_Phase CHECK (ErrorPhase IS NULL OR ErrorPhase IN (
        'Schema', 'Migration', 'Packages', 'Config', 'Hooks', 'Record'
    ))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Audit trail of every install, upgrade, and removal for Open Apps',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory';
GO

-----------------------------------------------------------------------
-- 3. Open App Dependencies
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.OpenAppDependency (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OpenAppID UNIQUEIDENTIFIER NOT NULL,
    DependsOnAppName NVARCHAR(64) NOT NULL,
    DependsOnAppID UNIQUEIDENTIFIER NULL,
    VersionRange NVARCHAR(100) NOT NULL,
    InstalledVersion NVARCHAR(50) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Satisfied',
    CONSTRAINT PK_OpenAppDependency PRIMARY KEY (ID),
    CONSTRAINT FK_OpenAppDep_App FOREIGN KEY (OpenAppID)
        REFERENCES ${flyway:defaultSchema}.OpenApp(ID),
    CONSTRAINT FK_OpenAppDep_DepApp FOREIGN KEY (DependsOnAppID)
        REFERENCES ${flyway:defaultSchema}.OpenApp(ID),
    CONSTRAINT UQ_OpenAppDep UNIQUE (OpenAppID, DependsOnAppName),
    CONSTRAINT CK_OpenAppDep_Status CHECK (Status IN (
        'Satisfied', 'Missing', 'Incompatible'
    ))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Inter-app dependency relationships between installed Open Apps',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppDependency';
GO














/* SQL generated to create new entity MJ: Open App Dependencies */

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
         'c55eaa5a-4c9f-4d9a-b72b-0b76c2055188',
         'MJ: Open App Dependencies',
         'Open App Dependencies',
         NULL,
         NULL,
         'OpenAppDependency',
         'vwOpenAppDependencies',
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
   

/* SQL generated to add new entity MJ: Open App Dependencies to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c55eaa5a-4c9f-4d9a-b72b-0b76c2055188', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Open App Dependencies for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c55eaa5a-4c9f-4d9a-b72b-0b76c2055188', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Open App Dependencies for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c55eaa5a-4c9f-4d9a-b72b-0b76c2055188', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Open App Dependencies for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c55eaa5a-4c9f-4d9a-b72b-0b76c2055188', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Open Apps */

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
         'c19f14cd-e29e-49bb-b5de-1040263a5427',
         'MJ: Open Apps',
         'Open Apps',
         NULL,
         NULL,
         'OpenApp',
         'vwOpenApps',
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
   

/* SQL generated to add new entity MJ: Open Apps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c19f14cd-e29e-49bb-b5de-1040263a5427', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Open Apps for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c19f14cd-e29e-49bb-b5de-1040263a5427', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Open Apps for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c19f14cd-e29e-49bb-b5de-1040263a5427', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Open Apps for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c19f14cd-e29e-49bb-b5de-1040263a5427', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Open App Install Histories */

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
         '934a6248-7c1c-4866-ae5c-aeb589a92cc9',
         'MJ: Open App Install Histories',
         'Open App Install Histories',
         NULL,
         NULL,
         'OpenAppInstallHistory',
         'vwOpenAppInstallHistories',
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
   

/* SQL generated to add new entity MJ: Open App Install Histories to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '934a6248-7c1c-4866-ae5c-aeb589a92cc9', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Open App Install Histories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('934a6248-7c1c-4866-ae5c-aeb589a92cc9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Open App Install Histories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('934a6248-7c1c-4866-ae5c-aeb589a92cc9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Open App Install Histories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('934a6248-7c1c-4866-ae5c-aeb589a92cc9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OpenAppDependency */
ALTER TABLE [${flyway:defaultSchema}].[OpenAppDependency] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OpenAppDependency */
ALTER TABLE [${flyway:defaultSchema}].[OpenAppDependency] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OpenApp */
ALTER TABLE [${flyway:defaultSchema}].[OpenApp] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OpenApp */
ALTER TABLE [${flyway:defaultSchema}].[OpenApp] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OpenAppInstallHistory */
ALTER TABLE [${flyway:defaultSchema}].[OpenAppInstallHistory] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OpenAppInstallHistory */
ALTER TABLE [${flyway:defaultSchema}].[OpenAppInstallHistory] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a3900340-b4bb-4e89-9287-9b012b3b1fd0'  OR 
               (EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188' AND Name = 'ID')
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
            'a3900340-b4bb-4e89-9287-9b012b3b1fd0',
            'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', -- Entity: MJ: Open App Dependencies
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
         WHERE ID = '5eab988e-8cb1-4987-b68a-4e1d8ab5d8de'  OR 
               (EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188' AND Name = 'OpenAppID')
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
            '5eab988e-8cb1-4987-b68a-4e1d8ab5d8de',
            'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', -- Entity: MJ: Open App Dependencies
            100002,
            'OpenAppID',
            'Open App ID',
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
            'C19F14CD-E29E-49BB-B5DE-1040263A5427',
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
         WHERE ID = '193bad25-8554-4954-8f0b-f142b8599238'  OR 
               (EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188' AND Name = 'DependsOnAppName')
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
            '193bad25-8554-4954-8f0b-f142b8599238',
            'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', -- Entity: MJ: Open App Dependencies
            100003,
            'DependsOnAppName',
            'Depends On App Name',
            NULL,
            'nvarchar',
            128,
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
         WHERE ID = 'ef3f40ce-346c-4485-82c8-dd3cc778f3b0'  OR 
               (EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188' AND Name = 'DependsOnAppID')
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
            'ef3f40ce-346c-4485-82c8-dd3cc778f3b0',
            'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', -- Entity: MJ: Open App Dependencies
            100004,
            'DependsOnAppID',
            'Depends On App ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'C19F14CD-E29E-49BB-B5DE-1040263A5427',
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
         WHERE ID = '901fd9a1-d37f-42eb-a8bd-419e0be0aa6e'  OR 
               (EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188' AND Name = 'VersionRange')
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
            '901fd9a1-d37f-42eb-a8bd-419e0be0aa6e',
            'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', -- Entity: MJ: Open App Dependencies
            100005,
            'VersionRange',
            'Version Range',
            NULL,
            'nvarchar',
            200,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6a204dc5-b742-4d3a-84e3-b88230da8ab4'  OR 
               (EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188' AND Name = 'InstalledVersion')
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
            '6a204dc5-b742-4d3a-84e3-b88230da8ab4',
            'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', -- Entity: MJ: Open App Dependencies
            100006,
            'InstalledVersion',
            'Installed Version',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = '228f671b-2963-4017-bee6-3f70d6522fbe'  OR 
               (EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188' AND Name = 'Status')
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
            '228f671b-2963-4017-bee6-3f70d6522fbe',
            'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', -- Entity: MJ: Open App Dependencies
            100007,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            40,
            0,
            0,
            0,
            'Satisfied',
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
         WHERE ID = '8b4a8073-f4f2-4ed5-b48a-5389b2dbdecc'  OR 
               (EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188' AND Name = '__mj_CreatedAt')
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
            '8b4a8073-f4f2-4ed5-b48a-5389b2dbdecc',
            'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', -- Entity: MJ: Open App Dependencies
            100008,
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
         WHERE ID = '4a311b61-00b0-443f-a189-453fc37647b3'  OR 
               (EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188' AND Name = '__mj_UpdatedAt')
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
            '4a311b61-00b0-443f-a189-453fc37647b3',
            'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', -- Entity: MJ: Open App Dependencies
            100009,
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
         WHERE ID = '2e1aa1eb-24a5-4ddb-9479-26d7fb1711fc'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'ID')
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
            '2e1aa1eb-24a5-4ddb-9479-26d7fb1711fc',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
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
         WHERE ID = '77da64c6-4ea7-4188-a826-7f1f0863ab05'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'Name')
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
            '77da64c6-4ea7-4188-a826-7f1f0863ab05',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100002,
            'Name',
            'Name',
            NULL,
            'nvarchar',
            128,
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6868f228-4530-4e86-a643-5af256b2a91e'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'DisplayName')
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
            '6868f228-4530-4e86-a643-5af256b2a91e',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100003,
            'DisplayName',
            'Display Name',
            NULL,
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
         WHERE ID = '2d7be27b-c212-4d79-9c83-5d1ad1b8b663'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'Description')
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
            '2d7be27b-c212-4d79-9c83-5d1ad1b8b663',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100004,
            'Description',
            'Description',
            NULL,
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
         WHERE ID = '0a08d5d3-ae41-4384-b040-5436e87ae7cd'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'Version')
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
            '0a08d5d3-ae41-4384-b040-5436e87ae7cd',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100005,
            'Version',
            'Version',
            NULL,
            'nvarchar',
            100,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cff0f2e9-2b08-46ec-ad9e-e307b55de6b2'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'Publisher')
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
            'cff0f2e9-2b08-46ec-ad9e-e307b55de6b2',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100006,
            'Publisher',
            'Publisher',
            NULL,
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
         WHERE ID = '3816dba3-82c2-416b-be85-c13c0ac97dfb'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'PublisherEmail')
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
            '3816dba3-82c2-416b-be85-c13c0ac97dfb',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100007,
            'PublisherEmail',
            'Publisher Email',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = 'db50e49f-570d-4823-829f-41f05b95e9b3'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'PublisherURL')
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
            'db50e49f-570d-4823-829f-41f05b95e9b3',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100008,
            'PublisherURL',
            'Publisher URL',
            NULL,
            'nvarchar',
            1000,
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
         WHERE ID = '989c9e29-e928-4b17-980e-3ccbf12803de'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'RepositoryURL')
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
            '989c9e29-e928-4b17-980e-3ccbf12803de',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100009,
            'RepositoryURL',
            'Repository URL',
            NULL,
            'nvarchar',
            1000,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5b6efbd3-7176-409e-b251-b76d5f1cda20'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'SchemaName')
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
            '5b6efbd3-7176-409e-b251-b76d5f1cda20',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100010,
            'SchemaName',
            'Schema Name',
            NULL,
            'nvarchar',
            256,
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a12ee3e0-10c7-4208-ae6f-94082b1d8eaf'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'MJVersionRange')
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
            'a12ee3e0-10c7-4208-ae6f-94082b1d8eaf',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100011,
            'MJVersionRange',
            'MJ Version Range',
            NULL,
            'nvarchar',
            200,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '654d8454-416c-4c97-8812-fa4b23f59086'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'License')
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
            '654d8454-416c-4c97-8812-fa4b23f59086',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100012,
            'License',
            'License',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = 'd2b92ef0-3c70-4134-ab7b-8ee51b62583e'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'Icon')
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
            'd2b92ef0-3c70-4134-ab7b-8ee51b62583e',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100013,
            'Icon',
            'Icon',
            NULL,
            'nvarchar',
            200,
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
         WHERE ID = '4c6dbbf5-0c1e-4610-95d5-78c0a464aed0'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'Color')
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
            '4c6dbbf5-0c1e-4610-95d5-78c0a464aed0',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100014,
            'Color',
            'Color',
            NULL,
            'nvarchar',
            40,
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
         WHERE ID = 'bc351ba8-209e-4ca6-a7a0-d624a3b39fa9'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'ManifestJSON')
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
            'bc351ba8-209e-4ca6-a7a0-d624a3b39fa9',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100015,
            'ManifestJSON',
            'Manifest JSON',
            NULL,
            'nvarchar',
            -1,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4b742331-be93-4d37-8cba-f63811c3d1f7'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'ConfigurationSchemaJSON')
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
            '4b742331-be93-4d37-8cba-f63811c3d1f7',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100016,
            'ConfigurationSchemaJSON',
            'Configuration Schema JSON',
            NULL,
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
         WHERE ID = 'a0bab779-2746-40f2-970e-1e08ea746488'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'InstalledByUserID')
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
            'a0bab779-2746-40f2-970e-1e08ea746488',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100017,
            'InstalledByUserID',
            'Installed By User ID',
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
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '141d36e7-11b9-4c91-897a-985298d8d169'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'Status')
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
            '141d36e7-11b9-4c91-897a-985298d8d169',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100018,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            40,
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
         WHERE ID = '2b0a0d3f-4719-4b50-b466-a12d403a5796'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = '__mj_CreatedAt')
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
            '2b0a0d3f-4719-4b50-b466-a12d403a5796',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100019,
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
         WHERE ID = 'e8dbec43-4b9b-4c43-92c0-d0e690988b7c'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = '__mj_UpdatedAt')
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
            'e8dbec43-4b9b-4c43-92c0-d0e690988b7c',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100020,
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
         WHERE ID = 'cf9f1683-496c-47e5-8560-7480edc01dbe'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'ID')
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
            'cf9f1683-496c-47e5-8560-7480edc01dbe',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
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
         WHERE ID = 'd886dfd5-3578-4b3f-b5d5-66849a72fbef'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'OpenAppID')
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
            'd886dfd5-3578-4b3f-b5d5-66849a72fbef',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100002,
            'OpenAppID',
            'Open App ID',
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
            'C19F14CD-E29E-49BB-B5DE-1040263A5427',
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
         WHERE ID = '6c0b78c0-0fa4-4951-9fa1-881729892b25'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'Version')
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
            '6c0b78c0-0fa4-4951-9fa1-881729892b25',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100003,
            'Version',
            'Version',
            NULL,
            'nvarchar',
            100,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '504032a3-df25-4048-a171-1bc313953df4'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'PreviousVersion')
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
            '504032a3-df25-4048-a171-1bc313953df4',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100004,
            'PreviousVersion',
            'Previous Version',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = 'b3b91f4d-7f45-433c-a716-cba1db978123'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'Action')
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
            'b3b91f4d-7f45-433c-a716-cba1db978123',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100005,
            'Action',
            'Action',
            NULL,
            'nvarchar',
            40,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e7ed2f99-71e4-4f49-9e49-869c08aecc5d'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'ManifestJSON')
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
            'e7ed2f99-71e4-4f49-9e49-869c08aecc5d',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100006,
            'ManifestJSON',
            'Manifest JSON',
            NULL,
            'nvarchar',
            -1,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1dc36c39-16b6-4511-966f-fc567dd683b5'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'Summary')
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
            '1dc36c39-16b6-4511-966f-fc567dd683b5',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100007,
            'Summary',
            'Summary',
            NULL,
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
         WHERE ID = '235e5d6a-bdcd-417a-9dde-b809a1ba9b73'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'ExecutedByUserID')
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
            '235e5d6a-bdcd-417a-9dde-b809a1ba9b73',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100008,
            'ExecutedByUserID',
            'Executed By User ID',
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
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ac11421c-2800-4c8a-81d7-adefc8ccd6fa'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'DurationSeconds')
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
            'ac11421c-2800-4c8a-81d7-adefc8ccd6fa',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100009,
            'DurationSeconds',
            'Duration Seconds',
            NULL,
            'int',
            4,
            10,
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
         WHERE ID = '18607ab0-045f-41ef-803b-f087604961d9'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'Success')
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
            '18607ab0-045f-41ef-803b-f087604961d9',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100010,
            'Success',
            'Success',
            NULL,
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '808d0b5a-8520-4db7-81c4-0b2f2f090996'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'ErrorMessage')
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
            '808d0b5a-8520-4db7-81c4-0b2f2f090996',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100011,
            'ErrorMessage',
            'Error Message',
            NULL,
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
         WHERE ID = '11c20aa0-4bf2-42a1-8054-3f198377e8e2'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'ErrorPhase')
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
            '11c20aa0-4bf2-42a1-8054-3f198377e8e2',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100012,
            'ErrorPhase',
            'Error Phase',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = 'ba77fe6c-d005-44db-81d1-9a929e8e56cb'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = '__mj_CreatedAt')
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
            'ba77fe6c-d005-44db-81d1-9a929e8e56cb',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
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
         WHERE ID = '9941f9a0-929b-4510-8ed3-87293ce8f51d'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = '__mj_UpdatedAt')
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
            '9941f9a0-929b-4510-8ed3-87293ce8f51d',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
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

/* SQL text to insert entity field value with ID a9f45cf0-f84d-41a8-9533-3bb86a9ca76e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a9f45cf0-f84d-41a8-9533-3bb86a9ca76e', '11C20AA0-4BF2-42A1-8054-3F198377E8E2', 1, 'Config', 'Config')

/* SQL text to insert entity field value with ID ffd6df79-363f-433d-8807-3580763e0231 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ffd6df79-363f-433d-8807-3580763e0231', '11C20AA0-4BF2-42A1-8054-3F198377E8E2', 2, 'Hooks', 'Hooks')

/* SQL text to insert entity field value with ID fa03efb1-afca-4488-9a70-7b35973be35f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('fa03efb1-afca-4488-9a70-7b35973be35f', '11C20AA0-4BF2-42A1-8054-3F198377E8E2', 3, 'Migration', 'Migration')

/* SQL text to insert entity field value with ID 43a327d6-e01f-4d92-b807-bedc9f26cae9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('43a327d6-e01f-4d92-b807-bedc9f26cae9', '11C20AA0-4BF2-42A1-8054-3F198377E8E2', 4, 'Packages', 'Packages')

/* SQL text to insert entity field value with ID ea17753b-3c08-4150-b109-14798762cfa6 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ea17753b-3c08-4150-b109-14798762cfa6', '11C20AA0-4BF2-42A1-8054-3F198377E8E2', 5, 'Record', 'Record')

/* SQL text to insert entity field value with ID 6c0c21de-d590-486b-8172-68229d5e13e0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6c0c21de-d590-486b-8172-68229d5e13e0', '11C20AA0-4BF2-42A1-8054-3F198377E8E2', 6, 'Schema', 'Schema')

/* SQL text to update ValueListType for entity field ID 11C20AA0-4BF2-42A1-8054-3F198377E8E2 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='11C20AA0-4BF2-42A1-8054-3F198377E8E2'

/* SQL text to insert entity field value with ID fd161b49-0561-4457-a319-0867d36f0479 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('fd161b49-0561-4457-a319-0867d36f0479', '228F671B-2963-4017-BEE6-3F70D6522FBE', 1, 'Incompatible', 'Incompatible')

/* SQL text to insert entity field value with ID 06fad89a-85d6-49f8-80df-37dc16fdc5bd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('06fad89a-85d6-49f8-80df-37dc16fdc5bd', '228F671B-2963-4017-BEE6-3F70D6522FBE', 2, 'Missing', 'Missing')

/* SQL text to insert entity field value with ID b312e203-cf73-4460-bc28-1980722a513d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b312e203-cf73-4460-bc28-1980722a513d', '228F671B-2963-4017-BEE6-3F70D6522FBE', 3, 'Satisfied', 'Satisfied')

/* SQL text to update ValueListType for entity field ID 228F671B-2963-4017-BEE6-3F70D6522FBE */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='228F671B-2963-4017-BEE6-3F70D6522FBE'

/* SQL text to insert entity field value with ID 4425baaf-e811-497c-9ea6-855c37ce5815 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4425baaf-e811-497c-9ea6-855c37ce5815', '141D36E7-11B9-4C91-897A-985298D8D169', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 8f9dc009-3867-48b9-9a15-d56ab359f85c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8f9dc009-3867-48b9-9a15-d56ab359f85c', '141D36E7-11B9-4C91-897A-985298D8D169', 2, 'Disabled', 'Disabled')

/* SQL text to insert entity field value with ID c96e2ee8-70a1-4bb1-b544-174cab3fc3c3 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c96e2ee8-70a1-4bb1-b544-174cab3fc3c3', '141D36E7-11B9-4C91-897A-985298D8D169', 3, 'Error', 'Error')

/* SQL text to insert entity field value with ID 20bcb522-ac99-4ff0-9924-69a97f8885fd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('20bcb522-ac99-4ff0-9924-69a97f8885fd', '141D36E7-11B9-4C91-897A-985298D8D169', 4, 'Installing', 'Installing')

/* SQL text to insert entity field value with ID a37ba8b7-8bfb-4dee-a03f-ad7f17768655 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a37ba8b7-8bfb-4dee-a03f-ad7f17768655', '141D36E7-11B9-4C91-897A-985298D8D169', 5, 'Removed', 'Removed')

/* SQL text to insert entity field value with ID c3b71124-a56d-4691-a596-1f770e832e4b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c3b71124-a56d-4691-a596-1f770e832e4b', '141D36E7-11B9-4C91-897A-985298D8D169', 6, 'Removing', 'Removing')

/* SQL text to insert entity field value with ID 73c1ba82-86f5-496f-b312-ef79e2876344 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('73c1ba82-86f5-496f-b312-ef79e2876344', '141D36E7-11B9-4C91-897A-985298D8D169', 7, 'Upgrading', 'Upgrading')

/* SQL text to update ValueListType for entity field ID 141D36E7-11B9-4C91-897A-985298D8D169 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='141D36E7-11B9-4C91-897A-985298D8D169'

/* SQL text to insert entity field value with ID 703b2128-76d3-489f-ae28-d224bcff1547 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('703b2128-76d3-489f-ae28-d224bcff1547', 'B3B91F4D-7F45-433C-A716-CBA1DB978123', 1, 'Install', 'Install')

/* SQL text to insert entity field value with ID c9d3a175-13bd-43c3-9b89-ad041b4f595f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c9d3a175-13bd-43c3-9b89-ad041b4f595f', 'B3B91F4D-7F45-433C-A716-CBA1DB978123', 2, 'Remove', 'Remove')

/* SQL text to insert entity field value with ID a65cb32d-d0a6-4480-b706-3e22acefd33f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a65cb32d-d0a6-4480-b706-3e22acefd33f', 'B3B91F4D-7F45-433C-A716-CBA1DB978123', 3, 'Upgrade', 'Upgrade')

/* SQL text to update ValueListType for entity field ID B3B91F4D-7F45-433C-A716-CBA1DB978123 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B3B91F4D-7F45-433C-A716-CBA1DB978123'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5133310e-2399-491b-ae6a-b8a7db795632'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5133310e-2399-491b-ae6a-b8a7db795632', 'C19F14CD-E29E-49BB-B5DE-1040263A5427', 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', 'OpenAppID', 'One To Many', 1, 1, 'MJ: Open App Dependencies', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '0af00d52-0c37-43f5-8a8a-2f8635573eea'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('0af00d52-0c37-43f5-8a8a-2f8635573eea', 'C19F14CD-E29E-49BB-B5DE-1040263A5427', 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', 'DependsOnAppID', 'One To Many', 1, 1, 'MJ: Open App Dependencies', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '2dba0888-bde8-405f-8822-793025e95679'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('2dba0888-bde8-405f-8822-793025e95679', 'C19F14CD-E29E-49BB-B5DE-1040263A5427', '934A6248-7C1C-4866-AE5C-AEB589A92CC9', 'OpenAppID', 'One To Many', 1, 1, 'MJ: Open App Install Histories', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '39314b25-5c3a-47d1-a368-f16ed12e3492'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('39314b25-5c3a-47d1-a368-f16ed12e3492', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '934A6248-7C1C-4866-AE5C-AEB589A92CC9', 'ExecutedByUserID', 'One To Many', 1, 1, 'MJ: Open App Install Histories', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1affca7a-9087-43de-a82d-4d7bdaece5dc'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1affca7a-9087-43de-a82d-4d7bdaece5dc', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'C19F14CD-E29E-49BB-B5DE-1040263A5427', 'InstalledByUserID', 'One To Many', 1, 1, 'MJ: Open Apps', 1);
   END
                              

/* Index for Foreign Keys for OpenAppDependency */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OpenAppID in table OpenAppDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppDependency_OpenAppID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenAppDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenAppDependency_OpenAppID ON [${flyway:defaultSchema}].[OpenAppDependency] ([OpenAppID]);

-- Index for foreign key DependsOnAppID in table OpenAppDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppDependency_DependsOnAppID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenAppDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenAppDependency_DependsOnAppID ON [${flyway:defaultSchema}].[OpenAppDependency] ([DependsOnAppID]);

/* SQL text to update entity field related entity name field map for entity field ID 5EAB988E-8CB1-4987-B68A-4E1D8AB5D8DE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5EAB988E-8CB1-4987-B68A-4E1D8AB5D8DE',
         @RelatedEntityNameFieldMap='OpenApp'

/* SQL text to update entity field related entity name field map for entity field ID EF3F40CE-346C-4485-82C8-DD3CC778F3B0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EF3F40CE-346C-4485-82C8-DD3CC778F3B0',
         @RelatedEntityNameFieldMap='DependsOnApp'

/* Base View SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: vwOpenAppDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Open App Dependencies
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OpenAppDependency
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOpenAppDependencies]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOpenAppDependencies];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOpenAppDependencies]
AS
SELECT
    o.*,
    OpenApp_OpenAppID.[Name] AS [OpenApp],
    OpenApp_DependsOnAppID.[Name] AS [DependsOnApp]
FROM
    [${flyway:defaultSchema}].[OpenAppDependency] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OpenApp] AS OpenApp_OpenAppID
  ON
    [o].[OpenAppID] = OpenApp_OpenAppID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OpenApp] AS OpenApp_DependsOnAppID
  ON
    [o].[DependsOnAppID] = OpenApp_DependsOnAppID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenAppDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: Permissions for vwOpenAppDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenAppDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: spCreateOpenAppDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenAppDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOpenAppDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOpenAppDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOpenAppDependency]
    @ID uniqueidentifier = NULL,
    @OpenAppID uniqueidentifier,
    @DependsOnAppName nvarchar(64),
    @DependsOnAppID uniqueidentifier,
    @VersionRange nvarchar(100),
    @InstalledVersion nvarchar(50),
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OpenAppDependency]
            (
                [ID],
                [OpenAppID],
                [DependsOnAppName],
                [DependsOnAppID],
                [VersionRange],
                [InstalledVersion],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OpenAppID,
                @DependsOnAppName,
                @DependsOnAppID,
                @VersionRange,
                @InstalledVersion,
                ISNULL(@Status, 'Satisfied')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OpenAppDependency]
            (
                [OpenAppID],
                [DependsOnAppName],
                [DependsOnAppID],
                [VersionRange],
                [InstalledVersion],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OpenAppID,
                @DependsOnAppName,
                @DependsOnAppID,
                @VersionRange,
                @InstalledVersion,
                ISNULL(@Status, 'Satisfied')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOpenAppDependencies] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenAppDependency] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Open App Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenAppDependency] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: spUpdateOpenAppDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenAppDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOpenAppDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenAppDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenAppDependency]
    @ID uniqueidentifier,
    @OpenAppID uniqueidentifier,
    @DependsOnAppName nvarchar(64),
    @DependsOnAppID uniqueidentifier,
    @VersionRange nvarchar(100),
    @InstalledVersion nvarchar(50),
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenAppDependency]
    SET
        [OpenAppID] = @OpenAppID,
        [DependsOnAppName] = @DependsOnAppName,
        [DependsOnAppID] = @DependsOnAppID,
        [VersionRange] = @VersionRange,
        [InstalledVersion] = @InstalledVersion,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOpenAppDependencies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOpenAppDependencies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenAppDependency] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OpenAppDependency table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOpenAppDependency]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOpenAppDependency];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOpenAppDependency
ON [${flyway:defaultSchema}].[OpenAppDependency]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenAppDependency]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OpenAppDependency] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Open App Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenAppDependency] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: spDeleteOpenAppDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenAppDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOpenAppDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenAppDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenAppDependency]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OpenAppDependency]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenAppDependency] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Open App Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenAppDependency] TO [cdp_Integration]



/* Index for Foreign Keys for OpenAppInstallHistory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OpenAppID in table OpenAppInstallHistory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_OpenAppID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenAppInstallHistory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_OpenAppID ON [${flyway:defaultSchema}].[OpenAppInstallHistory] ([OpenAppID]);

-- Index for foreign key ExecutedByUserID in table OpenAppInstallHistory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_ExecutedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenAppInstallHistory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_ExecutedByUserID ON [${flyway:defaultSchema}].[OpenAppInstallHistory] ([ExecutedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID D886DFD5-3578-4B3F-B5D5-66849A72FBEF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D886DFD5-3578-4B3F-B5D5-66849A72FBEF',
         @RelatedEntityNameFieldMap='OpenApp'

/* Index for Foreign Keys for OpenApp */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InstalledByUserID in table OpenApp
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenApp]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID ON [${flyway:defaultSchema}].[OpenApp] ([InstalledByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID A0BAB779-2746-40F2-970E-1E08EA746488 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A0BAB779-2746-40F2-970E-1E08EA746488',
         @RelatedEntityNameFieldMap='InstalledByUser'

/* SQL text to update entity field related entity name field map for entity field ID 235E5D6A-BDCD-417A-9DDE-B809A1BA9B73 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='235E5D6A-BDCD-417A-9DDE-B809A1BA9B73',
         @RelatedEntityNameFieldMap='ExecutedByUser'

/* Base View SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: vwOpenApps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Open Apps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OpenApp
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOpenApps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOpenApps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOpenApps]
AS
SELECT
    o.*,
    User_InstalledByUserID.[Name] AS [InstalledByUser]
FROM
    [${flyway:defaultSchema}].[OpenApp] AS o
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_InstalledByUserID
  ON
    [o].[InstalledByUserID] = User_InstalledByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenApps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: Permissions for vwOpenApps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenApps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spCreateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOpenApp]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(64),
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @Version nvarchar(50),
    @Publisher nvarchar(200),
    @PublisherEmail nvarchar(255),
    @PublisherURL nvarchar(500),
    @RepositoryURL nvarchar(500),
    @SchemaName nvarchar(128),
    @MJVersionRange nvarchar(100),
    @License nvarchar(50),
    @Icon nvarchar(100),
    @Color nvarchar(20),
    @ManifestJSON nvarchar(MAX),
    @ConfigurationSchemaJSON nvarchar(MAX),
    @InstalledByUserID uniqueidentifier,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OpenApp]
            (
                [ID],
                [Name],
                [DisplayName],
                [Description],
                [Version],
                [Publisher],
                [PublisherEmail],
                [PublisherURL],
                [RepositoryURL],
                [SchemaName],
                [MJVersionRange],
                [License],
                [Icon],
                [Color],
                [ManifestJSON],
                [ConfigurationSchemaJSON],
                [InstalledByUserID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @DisplayName,
                @Description,
                @Version,
                @Publisher,
                @PublisherEmail,
                @PublisherURL,
                @RepositoryURL,
                @SchemaName,
                @MJVersionRange,
                @License,
                @Icon,
                @Color,
                @ManifestJSON,
                @ConfigurationSchemaJSON,
                @InstalledByUserID,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OpenApp]
            (
                [Name],
                [DisplayName],
                [Description],
                [Version],
                [Publisher],
                [PublisherEmail],
                [PublisherURL],
                [RepositoryURL],
                [SchemaName],
                [MJVersionRange],
                [License],
                [Icon],
                [Color],
                [ManifestJSON],
                [ConfigurationSchemaJSON],
                [InstalledByUserID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @DisplayName,
                @Description,
                @Version,
                @Publisher,
                @PublisherEmail,
                @PublisherURL,
                @RepositoryURL,
                @SchemaName,
                @MJVersionRange,
                @License,
                @Icon,
                @Color,
                @ManifestJSON,
                @ConfigurationSchemaJSON,
                @InstalledByUserID,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenApp] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenApp] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spUpdateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp]
    @ID uniqueidentifier,
    @Name nvarchar(64),
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @Version nvarchar(50),
    @Publisher nvarchar(200),
    @PublisherEmail nvarchar(255),
    @PublisherURL nvarchar(500),
    @RepositoryURL nvarchar(500),
    @SchemaName nvarchar(128),
    @MJVersionRange nvarchar(100),
    @License nvarchar(50),
    @Icon nvarchar(100),
    @Color nvarchar(20),
    @ManifestJSON nvarchar(MAX),
    @ConfigurationSchemaJSON nvarchar(MAX),
    @InstalledByUserID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenApp]
    SET
        [Name] = @Name,
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [Version] = @Version,
        [Publisher] = @Publisher,
        [PublisherEmail] = @PublisherEmail,
        [PublisherURL] = @PublisherURL,
        [RepositoryURL] = @RepositoryURL,
        [SchemaName] = @SchemaName,
        [MJVersionRange] = @MJVersionRange,
        [License] = @License,
        [Icon] = @Icon,
        [Color] = @Color,
        [ManifestJSON] = @ManifestJSON,
        [ConfigurationSchemaJSON] = @ConfigurationSchemaJSON,
        [InstalledByUserID] = @InstalledByUserID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOpenApps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenApp] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OpenApp table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOpenApp]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOpenApp];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOpenApp
ON [${flyway:defaultSchema}].[OpenApp]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenApp]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OpenApp] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenApp] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spDeleteOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenApp]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OpenApp]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenApp] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenApp] TO [cdp_Integration]



/* Base View SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: vwOpenAppInstallHistories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Open App Install Histories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OpenAppInstallHistory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOpenAppInstallHistories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOpenAppInstallHistories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOpenAppInstallHistories]
AS
SELECT
    o.*,
    OpenApp_OpenAppID.[Name] AS [OpenApp],
    User_ExecutedByUserID.[Name] AS [ExecutedByUser]
FROM
    [${flyway:defaultSchema}].[OpenAppInstallHistory] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OpenApp] AS OpenApp_OpenAppID
  ON
    [o].[OpenAppID] = OpenApp_OpenAppID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_ExecutedByUserID
  ON
    [o].[ExecutedByUserID] = User_ExecutedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenAppInstallHistories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: Permissions for vwOpenAppInstallHistories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenAppInstallHistories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: spCreateOpenAppInstallHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenAppInstallHistory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOpenAppInstallHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOpenAppInstallHistory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOpenAppInstallHistory]
    @ID uniqueidentifier = NULL,
    @OpenAppID uniqueidentifier,
    @Version nvarchar(50),
    @PreviousVersion nvarchar(50),
    @Action nvarchar(20),
    @ManifestJSON nvarchar(MAX),
    @Summary nvarchar(MAX),
    @ExecutedByUserID uniqueidentifier,
    @DurationSeconds int,
    @Success bit = NULL,
    @ErrorMessage nvarchar(MAX),
    @ErrorPhase nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OpenAppInstallHistory]
            (
                [ID],
                [OpenAppID],
                [Version],
                [PreviousVersion],
                [Action],
                [ManifestJSON],
                [Summary],
                [ExecutedByUserID],
                [DurationSeconds],
                [Success],
                [ErrorMessage],
                [ErrorPhase]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OpenAppID,
                @Version,
                @PreviousVersion,
                @Action,
                @ManifestJSON,
                @Summary,
                @ExecutedByUserID,
                @DurationSeconds,
                ISNULL(@Success, 1),
                @ErrorMessage,
                @ErrorPhase
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OpenAppInstallHistory]
            (
                [OpenAppID],
                [Version],
                [PreviousVersion],
                [Action],
                [ManifestJSON],
                [Summary],
                [ExecutedByUserID],
                [DurationSeconds],
                [Success],
                [ErrorMessage],
                [ErrorPhase]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OpenAppID,
                @Version,
                @PreviousVersion,
                @Action,
                @ManifestJSON,
                @Summary,
                @ExecutedByUserID,
                @DurationSeconds,
                ISNULL(@Success, 1),
                @ErrorMessage,
                @ErrorPhase
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOpenAppInstallHistories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenAppInstallHistory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Open App Install Histories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenAppInstallHistory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: spUpdateOpenAppInstallHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenAppInstallHistory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOpenAppInstallHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenAppInstallHistory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenAppInstallHistory]
    @ID uniqueidentifier,
    @OpenAppID uniqueidentifier,
    @Version nvarchar(50),
    @PreviousVersion nvarchar(50),
    @Action nvarchar(20),
    @ManifestJSON nvarchar(MAX),
    @Summary nvarchar(MAX),
    @ExecutedByUserID uniqueidentifier,
    @DurationSeconds int,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ErrorPhase nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenAppInstallHistory]
    SET
        [OpenAppID] = @OpenAppID,
        [Version] = @Version,
        [PreviousVersion] = @PreviousVersion,
        [Action] = @Action,
        [ManifestJSON] = @ManifestJSON,
        [Summary] = @Summary,
        [ExecutedByUserID] = @ExecutedByUserID,
        [DurationSeconds] = @DurationSeconds,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [ErrorPhase] = @ErrorPhase
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOpenAppInstallHistories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOpenAppInstallHistories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenAppInstallHistory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OpenAppInstallHistory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOpenAppInstallHistory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOpenAppInstallHistory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOpenAppInstallHistory
ON [${flyway:defaultSchema}].[OpenAppInstallHistory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenAppInstallHistory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OpenAppInstallHistory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Open App Install Histories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenAppInstallHistory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: spDeleteOpenAppInstallHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenAppInstallHistory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOpenAppInstallHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenAppInstallHistory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenAppInstallHistory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OpenAppInstallHistory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenAppInstallHistory] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Open App Install Histories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenAppInstallHistory] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e0d8f65e-12fe-4620-aeeb-16eb577531fa'  OR 
               (EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188' AND Name = 'OpenApp')
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
            'e0d8f65e-12fe-4620-aeeb-16eb577531fa',
            'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', -- Entity: MJ: Open App Dependencies
            100019,
            'OpenApp',
            'Open App',
            NULL,
            'nvarchar',
            128,
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
         WHERE ID = '4a6302d5-5bfa-40a4-a695-d3defe935b61'  OR 
               (EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188' AND Name = 'DependsOnApp')
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
            '4a6302d5-5bfa-40a4-a695-d3defe935b61',
            'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', -- Entity: MJ: Open App Dependencies
            100020,
            'DependsOnApp',
            'Depends On App',
            NULL,
            'nvarchar',
            128,
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
         WHERE ID = '7cb510d0-65a7-4b83-9973-d19a90ba56eb'  OR 
               (EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427' AND Name = 'InstalledByUser')
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
            '7cb510d0-65a7-4b83-9973-d19a90ba56eb',
            'C19F14CD-E29E-49BB-B5DE-1040263A5427', -- Entity: MJ: Open Apps
            100041,
            'InstalledByUser',
            'Installed By User',
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
         WHERE ID = 'cf93e0df-0327-4b60-933e-837a9ef6ec35'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'OpenApp')
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
            'cf93e0df-0327-4b60-933e-837a9ef6ec35',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100029,
            'OpenApp',
            'Open App',
            NULL,
            'nvarchar',
            128,
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
         WHERE ID = '03820b3f-34e5-4bf5-96a2-abe6c7cbd523'  OR 
               (EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9' AND Name = 'ExecutedByUser')
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
            '03820b3f-34e5-4bf5-96a2-abe6c7cbd523',
            '934A6248-7C1C-4866-AE5C-AEB589A92CC9', -- Entity: MJ: Open App Install Histories
            100030,
            'ExecutedByUser',
            'Executed By User',
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'CF93E0DF-0327-4B60-933E-837A9EF6EC35'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6C0B78C0-0FA4-4951-9FA1-881729892B25'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B3B91F4D-7F45-433C-A716-CBA1DB978123'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '18607AB0-045F-41EF-803B-F087604961D9'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BA77FE6C-D005-44DB-81D1-9A929E8E56CB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CF93E0DF-0327-4B60-933E-837A9EF6EC35'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '03820B3F-34E5-4BF5-96A2-ABE6C7CBD523'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6C0B78C0-0FA4-4951-9FA1-881729892B25'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B3B91F4D-7F45-433C-A716-CBA1DB978123'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '808D0B5A-8520-4DB7-81C4-0B2F2F090996'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '11C20AA0-4BF2-42A1-8054-3F198377E8E2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CF93E0DF-0327-4B60-933E-837A9EF6EC35'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '03820B3F-34E5-4BF5-96A2-ABE6C7CBD523'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '6868F228-4530-4E86-A643-5AF256B2A91E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6868F228-4530-4E86-A643-5AF256B2A91E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0A08D5D3-AE41-4384-B040-5436E87AE7CD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CFF0F2E9-2B08-46EC-AD9E-E307B55DE6B2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '141D36E7-11B9-4C91-897A-985298D8D169'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7CB510D0-65A7-4B83-9973-D19A90BA56EB'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '77DA64C6-4EA7-4188-A826-7F1F0863AB05'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6868F228-4530-4E86-A643-5AF256B2A91E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CFF0F2E9-2B08-46EC-AD9E-E307B55DE6B2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3816DBA3-82C2-416B-BE85-C13C0AC97DFB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DB50E49F-570D-4823-829F-41F05B95E9B3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '989C9E29-E928-4B17-980E-3CCBF12803DE'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5B6EFBD3-7176-409E-B251-B76D5F1CDA20'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7CB510D0-65A7-4B83-9973-D19A90BA56EB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '193BAD25-8554-4954-8F0B-F142B8599238'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '193BAD25-8554-4954-8F0B-F142B8599238'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '901FD9A1-D37F-42EB-A8BD-419E0BE0AA6E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6A204DC5-B742-4D3A-84E3-B88230DA8AB4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '228F671B-2963-4017-BEE6-3F70D6522FBE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E0D8F65E-12FE-4620-AEEB-16EB577531FA'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '193BAD25-8554-4954-8F0B-F142B8599238'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '228F671B-2963-4017-BEE6-3F70D6522FBE'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E0D8F65E-12FE-4620-AEEB-16EB577531FA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4A6302D5-5BFA-40A4-A695-D3DEFE935B61'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 16 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CF9F1683-496C-47E5-8560-7480EDC01DBE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BA77FE6C-D005-44DB-81D1-9A929E8E56CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9941F9A0-929B-4510-8ED3-87293CE8F51D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Open App ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D886DFD5-3578-4B3F-B5D5-66849A72FBEF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Open App Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CF93E0DF-0327-4B60-933E-837A9EF6EC35'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C0B78C0-0FA4-4951-9FA1-881729892B25'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Previous Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '504032A3-DF25-4048-A171-1BC313953DF4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Manifest JSON',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7ED2F99-71E4-4F49-9E49-869C08AECC5D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Summary',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1DC36C39-16B6-4511-966F-FC567DD683B5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Event',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B3B91F4D-7F45-433C-A716-CBA1DB978123'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Event',
       GeneratedFormSection = 'Category',
       DisplayName = 'Executed By User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '235E5D6A-BDCD-417A-9DDE-B809A1BA9B73'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Event',
       GeneratedFormSection = 'Category',
       DisplayName = 'Executed By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '03820B3F-34E5-4BF5-96A2-ABE6C7CBD523'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Event',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (seconds)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AC11421C-2800-4C8A-81D7-ADEFC8CCD6FA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Outcome & Diagnostics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '18607AB0-045F-41EF-803B-F087604961D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Outcome & Diagnostics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '808D0B5A-8520-4DB7-81C4-0B2F2F090996'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Outcome & Diagnostics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Phase',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '11C20AA0-4BF2-42A1-8054-3F198377E8E2'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-history */

               UPDATE [${flyway:defaultSchema}].Entity
               SET Icon = 'fa fa-history', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9'
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Record',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A3900340-B4BB-4E89-9287-9B012B3B1FD0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Record',
       GeneratedFormSection = 'Category',
       DisplayName = 'Open App',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5EAB988E-8CB1-4987-B68A-4E1D8AB5D8DE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Record',
       GeneratedFormSection = 'Category',
       DisplayName = 'Open App Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E0D8F65E-12FE-4620-AEEB-16EB577531FA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dependency Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Depends On App',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF3F40CE-346C-4485-82C8-DD3CC778F3B0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dependency Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Depends On App Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4A6302D5-5BFA-40A4-A695-D3DEFE935B61'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dependency Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Depends On App Raw Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '193BAD25-8554-4954-8F0B-F142B8599238'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dependency Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Version Range',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '901FD9A1-D37F-42EB-A8BD-419E0BE0AA6E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dependency Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Installed Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6A204DC5-B742-4D3A-84E3-B88230DA8AB4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dependency Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '228F671B-2963-4017-BEE6-3F70D6522FBE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B4A8073-F4F2-4ED5-B48A-5389B2DBDECC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4A311B61-00B0-443F-A189-453FC37647B3'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('b55695a0-5ff1-47c6-ad2a-0b61743c17ee', '934A6248-7C1C-4866-AE5C-AEB589A92CC9', 'FieldCategoryInfo', '{"App Details":{"icon":"fa fa-box","description":"Core information about the Open App, its versions, manifest and descriptive summary"},"Installation Event":{"icon":"fa fa-rocket","description":"Details of the install/upgrade/remove action, the executing user, and execution duration"},"Outcome & Diagnostics":{"icon":"fa fa-bug","description":"Result of the action together with success flag and any error details"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
         

/* Set categories for 21 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2E1AA1EB-24A5-4DDB-9479-26D7FB1711FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '77DA64C6-4EA7-4188-A826-7F1F0863AB05'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Display Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6868F228-4530-4E86-A643-5AF256B2A91E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2D7BE27B-C212-4D79-9C83-5D1AD1B8B663'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0A08D5D3-AE41-4384-B040-5436E87AE7CD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'License',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '654D8454-416C-4C97-8812-FA4B23F59086'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2B92EF0-3C70-4134-AB7B-8EE51B62583E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'App Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Color',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4C6DBBF5-0C1E-4610-95D5-78C0A464AED0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Publisher Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Publisher',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CFF0F2E9-2B08-46EC-AD9E-E307B55DE6B2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Publisher Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Publisher Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '3816DBA3-82C2-416B-BE85-C13C0AC97DFB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Publisher Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Publisher URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = 'DB50E49F-570D-4823-829F-41F05B95E9B3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Repository URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '989C9E29-E928-4B17-980E-3CCBF12803DE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Schema Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B6EFBD3-7176-409E-B251-B76D5F1CDA20'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'MJ Version Range',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A12EE3E0-10C7-4208-AE6F-94082B1D8EAF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Manifest JSON',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BC351BA8-209E-4CA6-A7A0-D624A3B39FA9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration Schema JSON',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B742331-BE93-4D37-8CBA-F63811C3D1F7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Installed By User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A0BAB779-2746-40F2-970E-1E08EA746488'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Installed By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7CB510D0-65A7-4B83-9973-D19A90BA56EB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Installation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '141D36E7-11B9-4C91-897A-985298D8D169'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2B0A0D3F-4719-4B50-B466-A12D403A5796'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E8DBEC43-4B9B-4C43-92C0-D0E690988B7C'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryIcons setting (legacy) */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('54f145f2-ebc3-44a1-b2ee-21d589d0918c', '934A6248-7C1C-4866-AE5C-AEB589A92CC9', 'FieldCategoryIcons', '{"App Details":"fa fa-box","Installation Event":"fa fa-rocket","Outcome & Diagnostics":"fa fa-bug","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
         

/* Set DefaultForNewUser=1 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].ApplicationEntity
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '934A6248-7C1C-4866-AE5C-AEB589A92CC9'
      

/* Set entity icon to fa fa-puzzle-piece */

               UPDATE [${flyway:defaultSchema}].Entity
               SET Icon = 'fa fa-puzzle-piece', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188'
            

/* Insert FieldCategoryInfo setting for entity */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('6c0485ed-df43-473d-a2b9-4b370fd32a3d', 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', 'FieldCategoryInfo', '{"Application Record":{"icon":"fa fa-cubes","description":"Core identifiers for the Open App installation"},"Dependency Details":{"icon":"fa fa-link","description":"Information about required app dependencies, version constraints, and status"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields tracking creation and modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
         

/* Insert FieldCategoryIcons setting (legacy) */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('bb7a8067-cd3a-4660-93c7-ea80c8b28458', 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188', 'FieldCategoryIcons', '{"Application Record":"fa fa-cubes","Dependency Details":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
         

/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].ApplicationEntity
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'C55EAA5A-4C9F-4D9A-B72B-0B76C2055188'
      

/* Set entity icon to fa fa-puzzle-piece */

               UPDATE [${flyway:defaultSchema}].Entity
               SET Icon = 'fa fa-puzzle-piece', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427'
            

/* Insert FieldCategoryInfo setting for entity */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('6e1902a9-9ec3-459c-bbd4-e6eef41fee3b', 'C19F14CD-E29E-49BB-B5DE-1040263A5427', 'FieldCategoryInfo', '{"App Identity":{"icon":"fa fa-puzzle-piece","description":"Core identification details of the app, including name, display name, description, version, license, icon and theme color."},"Publisher Information":{"icon":"fa fa-building","description":"Details about the app''s publisher, such as name, contact email and website."},"Technical Details":{"icon":"fa fa-file-code","description":"Technical metadata like repository URL, schema name, MJ version compatibility, and JSON manifest/configuration."},"Installation Details":{"icon":"fa fa-download","description":"Information about who installed the app and its current status."},"System Metadata":{"icon":"fa fa-database","description":"System‑generated audit fields and primary key."}}', GETUTCDATE(), GETUTCDATE())
         

/* Insert FieldCategoryIcons setting (legacy) */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('3e700257-451a-4d2f-8a20-44b1b657bae1', 'C19F14CD-E29E-49BB-B5DE-1040263A5427', 'FieldCategoryIcons', '{"App Identity":"fa fa-puzzle-piece","Publisher Information":"fa fa-building","Technical Details":"fa fa-file-code","Installation Details":"fa fa-download","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE())
         

/* Set DefaultForNewUser=1 for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].ApplicationEntity
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'C19F14CD-E29E-49BB-B5DE-1040263A5427'
      

/* Generated Validation Functions for MJ: Open Apps */
-- CHECK constraint for MJ: Open Apps: Field: Name was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '(NOT [Name] like ''%[^a-z0-9-]%'')', 'public ValidateNameAllowedCharacters(result: ValidationResult) {
	// Name is required, so we only need to verify its characters
	if (this.Name != null && !/^[a-z0-9-]+$/.test(this.Name)) {
		result.Errors.push(new ValidationErrorInfo(
			"Name",
			"Name can only contain lowercase letters, numbers, and hyphens.",
			this.Name,
			ValidationErrorType.Failure
		));
	}
}', 'The Name field may only contain lowercase letters (a‑z), digits (0‑9), or hyphens (-). Any other character is not allowed, ensuring the identifier is clean and URL‑friendly.', 'ValidateNameAllowedCharacters', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '77DA64C6-4EA7-4188-A826-7F1F0863AB05');
  
            

