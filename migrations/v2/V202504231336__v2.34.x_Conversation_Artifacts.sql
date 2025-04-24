---- CLEAN UP fields that shouldn't exist in the __mj.EntityField table anymore
-- Check and drop GeneratedValidationFunctionName column if it exists
IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('__mj.EntityField')
    AND name = 'GeneratedValidationFunctionName'
)
BEGIN
    ALTER TABLE __mj.EntityField
    DROP COLUMN GeneratedValidationFunctionName;
END

-- Check and drop GeneratedValidationFunctionDescription column if it exists
IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('__mj.EntityField')
    AND name = 'GeneratedValidationFunctionDescription'
)
BEGIN
    ALTER TABLE __mj.EntityField
    DROP COLUMN GeneratedValidationFunctionDescription;
END

-- Check and drop GeneratedValidationFunctionCode column if it exists
IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('__mj.EntityField')
    AND name = 'GeneratedValidationFunctionCode'
)
BEGIN
    ALTER TABLE __mj.EntityField
    DROP COLUMN GeneratedValidationFunctionCode;
END

-- Check and drop GeneratedValidationFunctionCheckConstraint column if it exists
IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('__mj.EntityField')
    AND name = 'GeneratedValidationFunctionCheckConstraint'
)
BEGIN
    ALTER TABLE __mj.EntityField
    DROP COLUMN GeneratedValidationFunctionCheckConstraint;
END

-- Due to columns above being removed, we need to do this or other things won't work properly
GO
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwEntityFields]'
GO


-- MemberJunction Conversation Artifacts Schema
-- This script creates the necessary tables for the Conversation Artifacts feature

-- Create ArtifactType table to define the types of artifacts supported
CREATE TABLE [__mj].[ArtifactType](
    [ID] [uniqueidentifier] PRIMARY KEY,
    [Name] [nvarchar](100) NOT NULL,
    [Description] [nvarchar](max) NULL,
    [ContentType] [nvarchar](100) NOT NULL,
    [IsEnabled] [bit] NOT NULL DEFAULT (1)
);

-- Add table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines the types of artifacts that can be created within conversations',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ArtifactType';

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the artifact type',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ArtifactType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of the artifact type',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ArtifactType',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'MIME type or content identifier for this artifact type',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ArtifactType',
    @level2type = N'COLUMN', @level2name = N'ContentType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if this artifact type is currently available for use',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ArtifactType',
    @level2type = N'COLUMN', @level2name = N'IsEnabled';

-- Add unique constraint on Name
ALTER TABLE [__mj].[ArtifactType] ADD CONSTRAINT [UQ_ArtifactType_Name] UNIQUE ([Name]);

-- Add default artifact types with fixed UUIDs
INSERT INTO [__mj].[ArtifactType] ([ID], [Name], [Description], [ContentType], [IsEnabled])
VALUES
    ('5e5883c2-0185-4e1e-8a1c-f514dbf52db7', N'Markdown Document', N'Markdown formatted text documents', N'text/markdown', 1),
    ('4d0987f6-6269-4142-aecd-594b6de34e0f', N'HTML', N'HTML content that can be rendered', N'text/html', 1),
    ('99e915ca-32f8-4fa1-afed-d6f75f5dae09', N'JavaScript', N'JavaScript code', N'application/javascript', 1),
    ('34b65caa-1cbd-4555-addd-39605dc88154', N'CSS', N'CSS stylesheets', N'text/css', 1),
    ('1b9c0e57-a939-4b02-866f-034e2ffe9d82', N'Python', N'Python programming language code', N'text/x-python', 1),
    ('5e28dfe1-c846-4953-b911-80d1dfad7c71', N'Java', N'Java programming language code', N'text/x-java', 1),
    ('f91a3c3a-7bb1-4c52-bb54-7345db130e89', N'C#', N'C# programming language code', N'text/x-csharp', 1),
    ('7cf1e417-0d0d-447f-91f2-c7861f8ba5a2', N'TypeScript', N'TypeScript programming language code', N'application/typescript', 1),
    ('41b12648-a9ba-4595-a522-b1427ecaacc4', N'SQL', N'SQL database queries and scripts', N'application/sql', 1),
    ('ae674c7e-ea0d-49ea-89e4-0649f5eb20d4', N'JSON', N'JSON data format', N'application/json', 1),
    ('9110871a-1997-48f7-b7eb-39ae6d37e19d', N'XML', N'XML data format', N'application/xml', 1),
    ('21f6fcaa-1179-40f7-8f09-5044e645e9b4', N'SVG Image', N'SVG vector graphics', N'image/svg+xml', 1),
    ('62d0243b-57a9-4702-bc2c-06f1e5a751b5', N'Report', N'Interactive Report', N'application/vnd.mj.report', 1),
    ('e8ba10a3-019f-4c51-a8aa-397ab124f212', N'Component', N'Interactive UI components', N'application/vnd.mj.component', 1);

-- Create ConversationArtifact table
CREATE TABLE [__mj].[ConversationArtifact](
    [ID] [uniqueidentifier] PRIMARY KEY DEFAULT (newsequentialid()),
    [Name] [nvarchar](255) NOT NULL,
    [Description] [nvarchar](max) NULL,
    [ConversationID] [uniqueidentifier] NOT NULL,
    [ArtifactTypeID] [uniqueidentifier] NOT NULL,
    [SharingScope] [nvarchar](50) NOT NULL,
    [Comments] [nvarchar](max) NULL
);

-- Add table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores metadata for artifacts created within conversations',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifact';

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the artifact',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifact',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Extended description of the artifact',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifact',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the conversation this artifact belongs to',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifact',
    @level2type = N'COLUMN', @level2name = N'ConversationID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the type of artifact',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifact',
    @level2type = N'COLUMN', @level2name = N'ArtifactTypeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls who can view this artifact (None, SpecificUsers, Everyone, Public)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifact',
    @level2type = N'COLUMN', @level2name = N'SharingScope';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User comments about the artifact',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifact',
    @level2type = N'COLUMN', @level2name = N'Comments';

-- Add foreign key reference to Conversation
ALTER TABLE [__mj].[ConversationArtifact]
ADD CONSTRAINT [FK_ConversationArtifact_Conversation]
FOREIGN KEY ([ConversationID]) REFERENCES [__mj].[Conversation] ([ID]);

-- Add foreign key reference to ArtifactType
ALTER TABLE [__mj].[ConversationArtifact]
ADD CONSTRAINT [FK_ConversationArtifact_ArtifactType]
FOREIGN KEY ([ArtifactTypeID]) REFERENCES [__mj].[ArtifactType] ([ID]);

-- Add CHECK constraint for SharingScope
ALTER TABLE [__mj].[ConversationArtifact]
ADD CONSTRAINT [CK_ConversationArtifact_SharingScope]
CHECK ([SharingScope] IN (N'None', N'SpecificUsers', N'Everyone', N'Public'));

-- Create ConversationArtifactVersion table
CREATE TABLE [__mj].[ConversationArtifactVersion](
    [ID] [uniqueidentifier] PRIMARY KEY DEFAULT (newsequentialid()),
    [ConversationArtifactID] [uniqueidentifier] NOT NULL,
    [Version] [int] NOT NULL,
    [Configuration] [nvarchar](max) NOT NULL,
    [Content] [nvarchar](max) NULL,
    [Comments] [nvarchar](max) NULL
);

-- Add table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores versions of conversation artifacts',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifactVersion';

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the parent artifact',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifactVersion',
    @level2type = N'COLUMN', @level2name = N'ConversationArtifactID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sequential version number (starting from 1) for this artifact',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifactVersion',
    @level2type = N'COLUMN', @level2name = N'Version';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration and metadata for this artifact version',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifactVersion',
    @level2type = N'COLUMN', @level2name = N'Configuration';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Actual content of the artifact, if stored separately from configuration',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifactVersion',
    @level2type = N'COLUMN', @level2name = N'Content';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User comments specific to this version',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifactVersion',
    @level2type = N'COLUMN', @level2name = N'Comments';

-- Add foreign key reference to ConversationArtifact
ALTER TABLE [__mj].[ConversationArtifactVersion]
ADD CONSTRAINT [FK_ConversationArtifactVersion_ConversationArtifact]
FOREIGN KEY ([ConversationArtifactID]) REFERENCES [__mj].[ConversationArtifact] ([ID]);

-- Add CHECK constraint for Version
ALTER TABLE [__mj].[ConversationArtifactVersion]
ADD CONSTRAINT [CK_ConversationArtifactVersion_Version]
CHECK ([Version] > 0);

-- Add unique constraint for ConversationArtifactID + Version
ALTER TABLE [__mj].[ConversationArtifactVersion]
ADD CONSTRAINT [UQ_ConversationArtifactVersion_ArtifactVersion]
UNIQUE ([ConversationArtifactID], [Version]);

-- Create ConversationArtifactPermission table
CREATE TABLE [__mj].[ConversationArtifactPermission](
    [ID] [uniqueidentifier] PRIMARY KEY DEFAULT (newsequentialid()),
    [ConversationArtifactID] [uniqueidentifier] NOT NULL,
    [UserID] [uniqueidentifier] NOT NULL,
    [AccessLevel] [nvarchar](20) NOT NULL
);

-- Add table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Manages user permissions for conversation artifacts',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifactPermission';

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the artifact this permission applies to',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifactPermission',
    @level2type = N'COLUMN', @level2name = N'ConversationArtifactID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User this permission applies to',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifactPermission',
    @level2type = N'COLUMN', @level2name = N'UserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Level of access granted (Read, Edit, Owner)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'ConversationArtifactPermission',
    @level2type = N'COLUMN', @level2name = N'AccessLevel';

-- Add foreign key reference to ConversationArtifact
ALTER TABLE [__mj].[ConversationArtifactPermission]
ADD CONSTRAINT [FK_ConversationArtifactPermission_ConversationArtifact]
FOREIGN KEY ([ConversationArtifactID]) REFERENCES [__mj].[ConversationArtifact] ([ID]);

-- Add CHECK constraint for AccessLevel
ALTER TABLE [__mj].[ConversationArtifactPermission]
ADD CONSTRAINT [CK_ConversationArtifactPermission_AccessLevel]
CHECK ([AccessLevel] IN (N'Read', N'Edit', N'Owner'));

-- Add unique constraint for ConversationArtifactID + UserID
ALTER TABLE [__mj].[ConversationArtifactPermission]
ADD CONSTRAINT [UQ_ConversationArtifactPermission_ArtifactUser]
UNIQUE ([ConversationArtifactID], [UserID]);


/**********************************************************************
 **********************************************************************
        CODE GEN RUN FOR THE ABOVE IS SHOWN BELOW
 **********************************************************************
 ***********************************************************************/


/* SQL generated to create new entity MJ: Artifact Types */

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
         '91797885-7128-4b71-8c4b-81c5fee24f38',
         'MJ: Artifact Types',
         NULL,
         NULL,
         'ArtifactType',
         'vwArtifactTypes',
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


/* SQL generated to add new permission for entity MJ: Artifact Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('91797885-7128-4b71-8c4b-81c5fee24f38', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Artifact Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('91797885-7128-4b71-8c4b-81c5fee24f38', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Artifact Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('91797885-7128-4b71-8c4b-81c5fee24f38', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Conversation Artifacts */

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
         '355ece47-bc5b-45d7-8b52-967446517137',
         'MJ: Conversation Artifacts',
         NULL,
         NULL,
         'ConversationArtifact',
         'vwConversationArtifacts',
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


/* SQL generated to add new permission for entity MJ: Conversation Artifacts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('355ece47-bc5b-45d7-8b52-967446517137', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Conversation Artifacts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('355ece47-bc5b-45d7-8b52-967446517137', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Conversation Artifacts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('355ece47-bc5b-45d7-8b52-967446517137', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Conversation Artifact Versions */

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
         'b51cf0e1-2a79-407e-b716-610a608badae',
         'MJ: Conversation Artifact Versions',
         NULL,
         NULL,
         'ConversationArtifactVersion',
         'vwConversationArtifactVersions',
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


/* SQL generated to add new permission for entity MJ: Conversation Artifact Versions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b51cf0e1-2a79-407e-b716-610a608badae', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Conversation Artifact Versions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b51cf0e1-2a79-407e-b716-610a608badae', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Conversation Artifact Versions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b51cf0e1-2a79-407e-b716-610a608badae', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Conversation Artifact Permissions */

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
         'e9fa7e1c-1ca1-4315-8a60-d5a92b8e23aa',
         'MJ: Conversation Artifact Permissions',
         NULL,
         NULL,
         'ConversationArtifactPermission',
         'vwConversationArtifactPermissions',
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


/* SQL generated to add new permission for entity MJ: Conversation Artifact Permissions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e9fa7e1c-1ca1-4315-8a60-d5a92b8e23aa', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Conversation Artifact Permissions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e9fa7e1c-1ca1-4315-8a60-d5a92b8e23aa', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Conversation Artifact Permissions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e9fa7e1c-1ca1-4315-8a60-d5a92b8e23aa', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationArtifactVersion */
ALTER TABLE [${flyway:defaultSchema}].[ConversationArtifactVersion] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationArtifactVersion */
ALTER TABLE [${flyway:defaultSchema}].[ConversationArtifactVersion] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactType */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactType */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationArtifact */
ALTER TABLE [${flyway:defaultSchema}].[ConversationArtifact] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationArtifact */
ALTER TABLE [${flyway:defaultSchema}].[ConversationArtifact] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationArtifactPermission */
ALTER TABLE [${flyway:defaultSchema}].[ConversationArtifactPermission] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationArtifactPermission */
ALTER TABLE [${flyway:defaultSchema}].[ConversationArtifactPermission] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/*****************************************************************************/
/**** BELOW TWO FIELDS MISSED FROM THE V202502241523__v2.28.x_CommunicationProviderNewColumns.sql MIGRATION ****/
/*****************************************************************************/
      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '0ecea1e9-3c58-473c-a766-89a8001e69fa'  OR
               (EntityID = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SupportsForwarding')
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
            '0ecea1e9-3c58-473c-a766-89a8001e69fa',
            '43248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Communication Providers
            10,
            'SupportsForwarding',
            'Supports Forwarding',
            'Whether or not the provider supports forwarding messages to another recipient ',
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'c7a89b24-93eb-4fbe-ae9b-2c1e46356104'  OR
               (EntityID = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SupportsReplying')
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
            'c7a89b24-93eb-4fbe-ae9b-2c1e46356104',
            '43248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Communication Providers
            11,
            'SupportsReplying',
            'Supports Replying',
            'Whether or not the provider supports replying to messages',
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
            'Dropdown'
         )
      END

/*****************************************************************************/
/**** END: ABOVE TWO FIELDS MISSED FROM THE V202502241523__v2.28.x_CommunicationProviderNewColumns.sql MIGRATION ****/
/*****************************************************************************/



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'eef99498-9189-4c1a-a73a-1bc0d252ca91'  OR
               (EntityID = 'B51CF0E1-2A79-407E-B716-610A608BADAE' AND Name = 'ID')
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
            'eef99498-9189-4c1a-a73a-1bc0d252ca91',
            'B51CF0E1-2A79-407E-B716-610A608BADAE', -- Entity: MJ: Conversation Artifact Versions
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
         WHERE ID = 'e217bece-8ce3-4e21-853f-3e5ee46843e6'  OR
               (EntityID = 'B51CF0E1-2A79-407E-B716-610A608BADAE' AND Name = 'ConversationArtifactID')
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
            'e217bece-8ce3-4e21-853f-3e5ee46843e6',
            'B51CF0E1-2A79-407E-B716-610A608BADAE', -- Entity: MJ: Conversation Artifact Versions
            2,
            'ConversationArtifactID',
            'Conversation Artifact ID',
            'Reference to the parent artifact',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '355ECE47-BC5B-45D7-8B52-967446517137',
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
         WHERE ID = 'cadce41f-647e-464b-af87-da2ccd7fcecd'  OR
               (EntityID = 'B51CF0E1-2A79-407E-B716-610A608BADAE' AND Name = 'Version')
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
            'cadce41f-647e-464b-af87-da2ccd7fcecd',
            'B51CF0E1-2A79-407E-B716-610A608BADAE', -- Entity: MJ: Conversation Artifact Versions
            3,
            'Version',
            'Version',
            'Sequential version number (starting from 1) for this artifact',
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
         WHERE ID = 'dd61d6b5-ad74-4f56-b49d-63b230c36374'  OR
               (EntityID = 'B51CF0E1-2A79-407E-B716-610A608BADAE' AND Name = 'Configuration')
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
            'dd61d6b5-ad74-4f56-b49d-63b230c36374',
            'B51CF0E1-2A79-407E-B716-610A608BADAE', -- Entity: MJ: Conversation Artifact Versions
            4,
            'Configuration',
            'Configuration',
            'JSON configuration and metadata for this artifact version',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'b0fef895-d608-4ca9-afcf-b1cb590cd0cc'  OR
               (EntityID = 'B51CF0E1-2A79-407E-B716-610A608BADAE' AND Name = 'Content')
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
            'b0fef895-d608-4ca9-afcf-b1cb590cd0cc',
            'B51CF0E1-2A79-407E-B716-610A608BADAE', -- Entity: MJ: Conversation Artifact Versions
            5,
            'Content',
            'Content',
            'Actual content of the artifact, if stored separately from configuration',
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
         WHERE ID = '87c94e02-54c2-4434-9fc8-c97e4f97b137'  OR
               (EntityID = 'B51CF0E1-2A79-407E-B716-610A608BADAE' AND Name = 'Comments')
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
            '87c94e02-54c2-4434-9fc8-c97e4f97b137',
            'B51CF0E1-2A79-407E-B716-610A608BADAE', -- Entity: MJ: Conversation Artifact Versions
            6,
            'Comments',
            'Comments',
            'User comments specific to this version',
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
         WHERE ID = '147c490e-b5ab-4fbc-a0bf-7181319805ce'  OR
               (EntityID = 'B51CF0E1-2A79-407E-B716-610A608BADAE' AND Name = '__mj_CreatedAt')
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
            '147c490e-b5ab-4fbc-a0bf-7181319805ce',
            'B51CF0E1-2A79-407E-B716-610A608BADAE', -- Entity: MJ: Conversation Artifact Versions
            7,
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
         WHERE ID = 'e62c8b21-ce08-4a61-98a4-29eadb4ecc73'  OR
               (EntityID = 'B51CF0E1-2A79-407E-B716-610A608BADAE' AND Name = '__mj_UpdatedAt')
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
            'e62c8b21-ce08-4a61-98a4-29eadb4ecc73',
            'B51CF0E1-2A79-407E-B716-610A608BADAE', -- Entity: MJ: Conversation Artifact Versions
            8,
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
         WHERE ID = 'e3c8a690-7e75-499e-b603-3f900ab94704'  OR
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'ID')
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
            'e3c8a690-7e75-499e-b603-3f900ab94704',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
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
         WHERE ID = '79a9cc18-2f29-4d9c-93cb-82d9ed497b05'  OR
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'Name')
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
            '79a9cc18-2f29-4d9c-93cb-82d9ed497b05',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            2,
            'Name',
            'Name',
            'Display name of the artifact type',
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
         WHERE ID = '874e9b47-a201-4c78-896a-d41a607b1840'  OR
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'Description')
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
            '874e9b47-a201-4c78-896a-d41a607b1840',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            3,
            'Description',
            'Description',
            'Detailed description of the artifact type',
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
         WHERE ID = 'b7b428ef-de10-4882-8517-28636332c6db'  OR
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'ContentType')
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
            'b7b428ef-de10-4882-8517-28636332c6db',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            4,
            'ContentType',
            'Content Type',
            'MIME type or content identifier for this artifact type',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'a0b16e34-7c24-4811-84e6-75cca5c499fb'  OR
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'IsEnabled')
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
            'a0b16e34-7c24-4811-84e6-75cca5c499fb',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            5,
            'IsEnabled',
            'Is Enabled',
            'Indicates if this artifact type is currently available for use',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'a8cc25c6-c9de-4726-9ba5-81e0c4749281'  OR
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = '__mj_CreatedAt')
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
            'a8cc25c6-c9de-4726-9ba5-81e0c4749281',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            6,
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
         WHERE ID = '6ae8938f-5656-4cc8-89bc-1ccaac9df213'  OR
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = '__mj_UpdatedAt')
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
            '6ae8938f-5656-4cc8-89bc-1ccaac9df213',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            7,
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
         WHERE ID = 'd8fa6290-1a70-4cf7-8673-cc1e9650c460'  OR
               (EntityID = '355ECE47-BC5B-45D7-8B52-967446517137' AND Name = 'ID')
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
            'd8fa6290-1a70-4cf7-8673-cc1e9650c460',
            '355ECE47-BC5B-45D7-8B52-967446517137', -- Entity: MJ: Conversation Artifacts
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
         WHERE ID = 'b6021a47-ae22-48c5-a52b-bb004542fa14'  OR
               (EntityID = '355ECE47-BC5B-45D7-8B52-967446517137' AND Name = 'Name')
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
            'b6021a47-ae22-48c5-a52b-bb004542fa14',
            '355ECE47-BC5B-45D7-8B52-967446517137', -- Entity: MJ: Conversation Artifacts
            2,
            'Name',
            'Name',
            'Display name of the artifact',
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
         WHERE ID = '398863be-f3b9-45e9-9df0-add73a5fed0d'  OR
               (EntityID = '355ECE47-BC5B-45D7-8B52-967446517137' AND Name = 'Description')
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
            '398863be-f3b9-45e9-9df0-add73a5fed0d',
            '355ECE47-BC5B-45D7-8B52-967446517137', -- Entity: MJ: Conversation Artifacts
            3,
            'Description',
            'Description',
            'Extended description of the artifact',
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
         WHERE ID = '6b315237-c70d-469e-970a-93af8c7f0557'  OR
               (EntityID = '355ECE47-BC5B-45D7-8B52-967446517137' AND Name = 'ConversationID')
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
            '6b315237-c70d-469e-970a-93af8c7f0557',
            '355ECE47-BC5B-45D7-8B52-967446517137', -- Entity: MJ: Conversation Artifacts
            4,
            'ConversationID',
            'Conversation ID',
            'Reference to the conversation this artifact belongs to',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '13248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'e82d647c-bac8-46ca-9118-efe11ecd0bd6'  OR
               (EntityID = '355ECE47-BC5B-45D7-8B52-967446517137' AND Name = 'ArtifactTypeID')
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
            'e82d647c-bac8-46ca-9118-efe11ecd0bd6',
            '355ECE47-BC5B-45D7-8B52-967446517137', -- Entity: MJ: Conversation Artifacts
            5,
            'ArtifactTypeID',
            'Artifact Type ID',
            'Reference to the type of artifact',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '91797885-7128-4B71-8C4B-81C5FEE24F38',
            'ID',
            0,
            0,
            1,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '0e223dfa-f70d-4185-adf4-196aaeb2b9ca'  OR
               (EntityID = '355ECE47-BC5B-45D7-8B52-967446517137' AND Name = 'SharingScope')
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
            '0e223dfa-f70d-4185-adf4-196aaeb2b9ca',
            '355ECE47-BC5B-45D7-8B52-967446517137', -- Entity: MJ: Conversation Artifacts
            6,
            'SharingScope',
            'Sharing Scope',
            'Controls who can view this artifact (None, SpecificUsers, Everyone, Public)',
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
         WHERE ID = 'e9f9b56d-d80f-4117-aa19-9fcbcab096fc'  OR
               (EntityID = '355ECE47-BC5B-45D7-8B52-967446517137' AND Name = 'Comments')
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
            'e9f9b56d-d80f-4117-aa19-9fcbcab096fc',
            '355ECE47-BC5B-45D7-8B52-967446517137', -- Entity: MJ: Conversation Artifacts
            7,
            'Comments',
            'Comments',
            'User comments about the artifact',
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
         WHERE ID = '2fcfc36d-4233-4034-a9f5-2ea366130e40'  OR
               (EntityID = '355ECE47-BC5B-45D7-8B52-967446517137' AND Name = '__mj_CreatedAt')
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
            '2fcfc36d-4233-4034-a9f5-2ea366130e40',
            '355ECE47-BC5B-45D7-8B52-967446517137', -- Entity: MJ: Conversation Artifacts
            8,
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
         WHERE ID = '3ea0e905-5396-43dd-9413-f7b4d1ae3580'  OR
               (EntityID = '355ECE47-BC5B-45D7-8B52-967446517137' AND Name = '__mj_UpdatedAt')
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
            '3ea0e905-5396-43dd-9413-f7b4d1ae3580',
            '355ECE47-BC5B-45D7-8B52-967446517137', -- Entity: MJ: Conversation Artifacts
            9,
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
         WHERE ID = 'ac740c25-77ca-4973-96cd-44b2bf8c8910'  OR
               (EntityID = 'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA' AND Name = 'ID')
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
            'ac740c25-77ca-4973-96cd-44b2bf8c8910',
            'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA', -- Entity: MJ: Conversation Artifact Permissions
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
         WHERE ID = '4ba8855a-a06c-4af8-bfe8-6d8f4e2e0715'  OR
               (EntityID = 'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA' AND Name = 'ConversationArtifactID')
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
            '4ba8855a-a06c-4af8-bfe8-6d8f4e2e0715',
            'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA', -- Entity: MJ: Conversation Artifact Permissions
            2,
            'ConversationArtifactID',
            'Conversation Artifact ID',
            'Reference to the artifact this permission applies to',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '355ECE47-BC5B-45D7-8B52-967446517137',
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
         WHERE ID = 'be267a6d-750a-48f0-bf48-87b090103803'  OR
               (EntityID = 'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA' AND Name = 'UserID')
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
            'be267a6d-750a-48f0-bf48-87b090103803',
            'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA', -- Entity: MJ: Conversation Artifact Permissions
            3,
            'UserID',
            'User ID',
            'User this permission applies to',
            'uniqueidentifier',
            16,
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
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '5f8b5527-c9c9-4b72-8b5b-cf07eabff61d'  OR
               (EntityID = 'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA' AND Name = 'AccessLevel')
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
            '5f8b5527-c9c9-4b72-8b5b-cf07eabff61d',
            'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA', -- Entity: MJ: Conversation Artifact Permissions
            4,
            'AccessLevel',
            'Access Level',
            'Level of access granted (Read, Edit, Owner)',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '414096c8-db5c-4999-a1a0-b3aa937f6f5a'  OR
               (EntityID = 'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA' AND Name = '__mj_CreatedAt')
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
            '414096c8-db5c-4999-a1a0-b3aa937f6f5a',
            'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA', -- Entity: MJ: Conversation Artifact Permissions
            5,
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '6e467b08-f033-4fa9-b61d-003b14aef584'  OR
               (EntityID = 'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA' AND Name = '__mj_UpdatedAt')
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
            '6e467b08-f033-4fa9-b61d-003b14aef584',
            'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA', -- Entity: MJ: Conversation Artifact Permissions
            6,
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

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '596157c2-2da4-485e-857f-56f740595bd0'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('596157c2-2da4-485e-857f-56f740595bd0', '13248F34-2837-EF11-86D4-6045BDEE16E6', '355ECE47-BC5B-45D7-8B52-967446517137', 'ConversationID', 'One To Many', 1, 1, 'MJ: Conversation Artifacts', 1);
   END


/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '9b5ec71d-2a9c-4b26-92d8-f85855721ac8'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9b5ec71d-2a9c-4b26-92d8-f85855721ac8', '91797885-7128-4B71-8C4B-81C5FEE24F38', '355ECE47-BC5B-45D7-8B52-967446517137', 'ArtifactTypeID', 'One To Many', 1, 1, 'MJ: Conversation Artifacts', 2);
   END

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd1196c16-bda9-4af4-9c95-a74ee1a7b152'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d1196c16-bda9-4af4-9c95-a74ee1a7b152', '355ECE47-BC5B-45D7-8B52-967446517137', 'B51CF0E1-2A79-407E-B716-610A608BADAE', 'ConversationArtifactID', 'One To Many', 1, 1, 'MJ: Conversation Artifact Versions', 1);
   END

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '7402ee53-f9ff-4202-8d4c-220bf4595f33'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('7402ee53-f9ff-4202-8d4c-220bf4595f33', '355ECE47-BC5B-45D7-8B52-967446517137', 'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA', 'ConversationArtifactID', 'One To Many', 1, 1, 'MJ: Conversation Artifact Permissions', 1);
   END




/* Base View SQL for Communication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Providers
-- Item: vwCommunicationProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Communication Providers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CommunicationProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwCommunicationProviders]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCommunicationProviders]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[CommunicationProvider] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationProviders] TO [cdp_UI], [cdp_Integration], [cdp_Developer]


/* Base View Permissions SQL for Communication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Providers
-- Item: Permissions for vwCommunicationProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationProviders] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Communication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Providers
-- Item: spCreateCommunicationProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommunicationProvider
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateCommunicationProvider]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationProvider]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @SupportsSending bit,
    @SupportsReceiving bit,
    @SupportsScheduledSending bit,
    @SupportsForwarding bit,
    @SupportsReplying bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[CommunicationProvider]
        (
            [Name],
            [Description],
            [Status],
            [SupportsSending],
            [SupportsReceiving],
            [SupportsScheduledSending],
            [SupportsForwarding],
            [SupportsReplying]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Status,
            @SupportsSending,
            @SupportsReceiving,
            @SupportsScheduledSending,
            @SupportsForwarding,
            @SupportsReplying
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCommunicationProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationProvider] TO [cdp_Integration], [cdp_Developer]


/* spCreate Permissions for Communication Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationProvider] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Communication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Providers
-- Item: spUpdateCommunicationProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommunicationProvider
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateCommunicationProvider]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationProvider]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @SupportsSending bit,
    @SupportsReceiving bit,
    @SupportsScheduledSending bit,
    @SupportsForwarding bit,
    @SupportsReplying bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationProvider]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status,
        [SupportsSending] = @SupportsSending,
        [SupportsReceiving] = @SupportsReceiving,
        [SupportsScheduledSending] = @SupportsScheduledSending,
        [SupportsForwarding] = @SupportsForwarding,
        [SupportsReplying] = @SupportsReplying
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCommunicationProviders]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationProvider] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommunicationProvider table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateCommunicationProvider
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCommunicationProvider
ON [${flyway:defaultSchema}].[CommunicationProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CommunicationProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for Communication Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationProvider] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Communication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Providers
-- Item: spDeleteCommunicationProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommunicationProvider
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteCommunicationProvider]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CommunicationProvider]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationProvider] TO [cdp_Integration]


/* spDelete Permissions for Communication Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationProvider] TO [cdp_Integration]



/* Index for Foreign Keys for ConversationArtifactVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationArtifactID in table ConversationArtifactVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifactVersion_ConversationArtifactID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifactVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifactVersion_ConversationArtifactID ON [${flyway:defaultSchema}].[ConversationArtifactVersion] ([ConversationArtifactID]);

/* SQL text to update entity field related entity name field map for entity field ID E217BECE-8CE3-4E21-853F-3E5EE46843E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E217BECE-8CE3-4E21-853F-3E5EE46843E6',
         @RelatedEntityNameFieldMap='ConversationArtifact'


/* Base View SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: vwConversationArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Artifact Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationArtifactVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationArtifactVersions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationArtifactVersions]
AS
SELECT
    c.*,
    ConversationArtifact_ConversationArtifactID.[Name] AS [ConversationArtifact]
FROM
    [${flyway:defaultSchema}].[ConversationArtifactVersion] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS ConversationArtifact_ConversationArtifactID
  ON
    [c].[ConversationArtifactID] = ConversationArtifact_ConversationArtifactID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: Permissions for vwConversationArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spCreateConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationArtifactVersion]
    @ConversationArtifactID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @Version int,
    @Configuration nvarchar(MAX),
    @Content nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ConversationArtifactVersion]
        (
            [ConversationArtifactID],
            [Version],
            [Configuration],
            [Content],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            CASE @ConversationArtifactID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @ConversationArtifactID END,
            @Version,
            @Configuration,
            @Content,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationArtifactVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spUpdateConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion]
    @ID uniqueidentifier,
    @ConversationArtifactID uniqueidentifier,
    @Version int,
    @Configuration nvarchar(MAX),
    @Content nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    SET
        [ConversationArtifactID] = @ConversationArtifactID,
        [Version] = @Version,
        [Configuration] = @Configuration,
        [Content] = @Content,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationArtifactVersions]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifactVersion table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationArtifactVersion
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationArtifactVersion
ON [${flyway:defaultSchema}].[ConversationArtifactVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spDeleteConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]


/* spDelete Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]



/* Index for Foreign Keys for ArtifactType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for ConversationArtifact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationID in table ConversationArtifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifact_ConversationID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifact_ConversationID ON [${flyway:defaultSchema}].[ConversationArtifact] ([ConversationID]);

-- Index for foreign key ArtifactTypeID in table ConversationArtifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifact_ArtifactTypeID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifact_ArtifactTypeID ON [${flyway:defaultSchema}].[ConversationArtifact] ([ArtifactTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 6B315237-C70D-469E-970A-93AF8C7F0557 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6B315237-C70D-469E-970A-93AF8C7F0557',
         @RelatedEntityNameFieldMap='Conversation'

/* SQL text to update entity field related entity name field map for entity field ID 9366433E-F36B-1410-8DA6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9366433E-F36B-1410-8DA6-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID C966433E-F36B-1410-8DA6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C966433E-F36B-1410-8DA6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID F366433E-F36B-1410-8DA6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F366433E-F36B-1410-8DA6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* Base View SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwArtifactTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactTypes]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[ArtifactType] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Permissions for vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spCreateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactType]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ArtifactType]
        (
            [Name],
            [Description],
            [ContentType],
            [IsEnabled]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ContentType,
            @IsEnabled
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spUpdateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ContentType] = @ContentType,
        [IsEnabled] = @IsEnabled
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactTypes]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateArtifactType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactType
ON [${flyway:defaultSchema}].[ArtifactType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spDeleteArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteArtifactType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]


/* spDelete Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID E82D647C-BAC8-46CA-9118-EFE11ECD0BD6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E82D647C-BAC8-46CA-9118-EFE11ECD0BD6',
         @RelatedEntityNameFieldMap='ArtifactType'

/* SQL text to update entity field related entity name field map for entity field ID CF66433E-F36B-1410-8DA6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CF66433E-F36B-1410-8DA6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* Base View SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: vwConversationArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Artifacts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationArtifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationArtifacts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationArtifacts]
AS
SELECT
    c.*,
    Conversation_ConversationID.[Name] AS [Conversation],
    ArtifactType_ArtifactTypeID.[Name] AS [ArtifactType]
FROM
    [${flyway:defaultSchema}].[ConversationArtifact] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [c].[ConversationID] = Conversation_ConversationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_ArtifactTypeID
  ON
    [c].[ArtifactTypeID] = ArtifactType_ArtifactTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: Permissions for vwConversationArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spCreateConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationArtifact]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ConversationID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @ArtifactTypeID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @SharingScope nvarchar(50),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ConversationArtifact]
        (
            [Name],
            [Description],
            [ConversationID],
            [ArtifactTypeID],
            [SharingScope],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            CASE @ConversationID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @ConversationID END,
            CASE @ArtifactTypeID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @ArtifactTypeID END,
            @SharingScope,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationArtifacts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifact] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifact] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spUpdateConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationArtifact]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @ArtifactTypeID uniqueidentifier,
    @SharingScope nvarchar(50),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifact]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ConversationID] = @ConversationID,
        [ArtifactTypeID] = @ArtifactTypeID,
        [SharingScope] = @SharingScope,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationArtifacts]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifact] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifact table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationArtifact
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationArtifact
ON [${flyway:defaultSchema}].[ConversationArtifact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationArtifact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifact] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spDeleteConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifact]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]


/* spDelete Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]



/* Index for Foreign Keys for ConversationArtifactPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationArtifactID in table ConversationArtifactPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifactPermission_ConversationArtifactID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifactPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifactPermission_ConversationArtifactID ON [${flyway:defaultSchema}].[ConversationArtifactPermission] ([ConversationArtifactID]);

/* SQL text to update entity field related entity name field map for entity field ID 4BA8855A-A06C-4AF8-BFE8-6D8F4E2E0715 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4BA8855A-A06C-4AF8-BFE8-6D8F4E2E0715',
         @RelatedEntityNameFieldMap='ConversationArtifact'


/* Base View SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: vwConversationArtifactPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Artifact Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationArtifactPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationArtifactPermissions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationArtifactPermissions]
AS
SELECT
    c.*,
    ConversationArtifact_ConversationArtifactID.[Name] AS [ConversationArtifact]
FROM
    [${flyway:defaultSchema}].[ConversationArtifactPermission] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS ConversationArtifact_ConversationArtifactID
  ON
    [c].[ConversationArtifactID] = ConversationArtifact_ConversationArtifactID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: Permissions for vwConversationArtifactPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: spCreateConversationArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationArtifactPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationArtifactPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationArtifactPermission]
    @ConversationArtifactID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @UserID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @AccessLevel nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ConversationArtifactPermission]
        (
            [ConversationArtifactID],
            [UserID],
            [AccessLevel]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            CASE @ConversationArtifactID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @ConversationArtifactID END,
            CASE @UserID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @UserID END,
            @AccessLevel
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationArtifactPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: Conversation Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: spUpdateConversationArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationArtifactPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission]
    @ID uniqueidentifier,
    @ConversationArtifactID uniqueidentifier,
    @UserID uniqueidentifier,
    @AccessLevel nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactPermission]
    SET
        [ConversationArtifactID] = @ConversationArtifactID,
        [UserID] = @UserID,
        [AccessLevel] = @AccessLevel
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationArtifactPermissions]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifactPermission table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationArtifactPermission
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationArtifactPermission
ON [${flyway:defaultSchema}].[ConversationArtifactPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationArtifactPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: Conversation Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: spDeleteConversationArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactPermission]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission] TO [cdp_Integration]


/* spDelete Permissions for MJ: Conversation Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission] TO [cdp_Integration]




/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '05ea2928-735e-4fb3-a75a-1615972d47ef'  OR
               (EntityID = 'B51CF0E1-2A79-407E-B716-610A608BADAE' AND Name = 'ConversationArtifact')
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
            '05ea2928-735e-4fb3-a75a-1615972d47ef',
            'B51CF0E1-2A79-407E-B716-610A608BADAE', -- Entity: MJ: Conversation Artifact Versions
            9,
            'ConversationArtifact',
            'Conversation Artifact',
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
         WHERE ID = 'ff4d73d8-b33c-498e-9a35-fdeda886769c'  OR
               (EntityID = '355ECE47-BC5B-45D7-8B52-967446517137' AND Name = 'Conversation')
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
            'ff4d73d8-b33c-498e-9a35-fdeda886769c',
            '355ECE47-BC5B-45D7-8B52-967446517137', -- Entity: MJ: Conversation Artifacts
            10,
            'Conversation',
            'Conversation',
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
         WHERE ID = '433d19cb-6c60-4f69-a5f8-179a213dd7fe'  OR
               (EntityID = '355ECE47-BC5B-45D7-8B52-967446517137' AND Name = 'ArtifactType')
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
            '433d19cb-6c60-4f69-a5f8-179a213dd7fe',
            '355ECE47-BC5B-45D7-8B52-967446517137', -- Entity: MJ: Conversation Artifacts
            11,
            'ArtifactType',
            'Artifact Type',
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
         WHERE ID = '7406877a-e307-4f42-b135-ce85f98e8ea2'  OR
               (EntityID = 'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA' AND Name = 'ConversationArtifact')
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
            '7406877a-e307-4f42-b135-ce85f98e8ea2',
            'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA', -- Entity: MJ: Conversation Artifact Permissions
            7,
            'ConversationArtifact',
            'Conversation Artifact',
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

-- CHECK constraint for MJ: Conversation Artifact Permissions: Field: AccessLevel was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', GETUTCDATE(), 'TypeScript','Approved', '([AccessLevel]=N''Owner'' OR [AccessLevel]=N''Edit'' OR [AccessLevel]=N''Read'')', 'public ValidateAccessLevelMustBeValid(result: ValidationResult) {
	if (this.AccessLevel !== ''Owner'' && this.AccessLevel !== ''Edit'' && this.AccessLevel !== ''Read'') {
		result.Errors.push(new ValidationErrorInfo(''AccessLevel'', ''Access level must be either Owner, Edit, or Read.'', this.AccessLevel, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the access level of a user can only be one of three specific values: ''Owner'', ''Edit'', or ''Read''.', 'ValidateAccessLevelMustBeValid', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '5F8B5527-C9C9-4B72-8B5B-CF07EABFF61D');



-- CHECK constraint for MJ: Conversation Artifact Versions: Field: Version was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', GETUTCDATE(), 'TypeScript','Approved', '([Version]>(0))', 'public ValidateVersionGreaterThanZero(result: ValidationResult) {
	if (this.Version <= 0) {
		result.Errors.push(new ValidationErrorInfo("Version", "The version number must be greater than zero.", this.Version, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the version number must be greater than zero.', 'ValidateVersionGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'CADCE41F-647E-464B-AF87-DA2CCD7FCECD');



-- CHECK constraint for MJ: Conversation Artifacts: Field: SharingScope was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', GETUTCDATE(), 'TypeScript','Approved', '([SharingScope]=N''Public'' OR [SharingScope]=N''Everyone'' OR [SharingScope]=N''SpecificUsers'' OR [SharingScope]=N''None'')', 'public ValidateSharingScopeAgainstPredefinedOptions(result: ValidationResult) {
	if (this.SharingScope !== ''Public'' && this.SharingScope !== ''Everyone'' && this.SharingScope !== ''SpecificUsers'' && this.SharingScope !== ''None'') {
		result.Errors.push(new ValidationErrorInfo("SharingScope", "The SharingScope must be one of the following: ''Public'', ''Everyone'', ''SpecificUsers'', or ''None''.", this.SharingScope, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the sharing scope of an entity can only be one of the predefined options: ''Public'', ''Everyone'', ''SpecificUsers'', or ''None''.', 'ValidateSharingScopeAgainstPredefinedOptions', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0E223DFA-F70D-4185-ADF4-196AAEB2B9CA');





/************************************************************************

 ************************************************************************
 ************************************************************************

 ADDITIONAL CODE GEN RUN BELOW TO REMOVE ERRANT FIELDS FROM EntityFields table that should have been gone long ago

 ************************************************************************
 ************************************************************************

 *****************************************************************************/

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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntityField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField]
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
    @ValuesToPackWithSchema nvarchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[EntityField]
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
            [ValuesToPackWithSchema]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @DisplayName,
            @Description,
            @AutoUpdateDescription,
            @IsPrimaryKey,
            @IsUnique,
            @Category,
            @ValueListType,
            @ExtendedType,
            @CodeType,
            @DefaultInView,
            @ViewCellTemplate,
            @DefaultColumnWidth,
            @AllowUpdateAPI,
            @AllowUpdateInView,
            @IncludeInUserSearchAPI,
            @FullTextSearchEnabled,
            @UserSearchParamFormatAPI,
            @IncludeInGeneratedForm,
            @GeneratedFormSection,
            @IsNameField,
            @RelatedEntityID,
            @RelatedEntityFieldName,
            @IncludeRelatedEntityNameFieldInBaseView,
            @RelatedEntityNameFieldMap,
            @RelatedEntityDisplayType,
            @EntityIDFieldName,
            @ScopeDefault,
            @AutoUpdateRelatedEntityInfo,
            @ValuesToPackWithSchema
        )
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntityField]
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
    @ValuesToPackWithSchema nvarchar(10)
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
        [ValuesToPackWithSchema] = @ValuesToPackWithSchema
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
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
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntityField
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntityField]
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


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]


/* spDelete Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for ConversationArtifactVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationArtifactID in table ConversationArtifactVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifactVersion_ConversationArtifactID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifactVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifactVersion_ConversationArtifactID ON [${flyway:defaultSchema}].[ConversationArtifactVersion] ([ConversationArtifactID]);

/* Base View SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: vwConversationArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Artifact Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationArtifactVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationArtifactVersions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationArtifactVersions]
AS
SELECT
    c.*,
    ConversationArtifact_ConversationArtifactID.[Name] AS [ConversationArtifact]
FROM
    [${flyway:defaultSchema}].[ConversationArtifactVersion] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS ConversationArtifact_ConversationArtifactID
  ON
    [c].[ConversationArtifactID] = ConversationArtifact_ConversationArtifactID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: Permissions for vwConversationArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spCreateConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationArtifactVersion]
    @ConversationArtifactID uniqueidentifier,
    @Version int,
    @Configuration nvarchar(MAX),
    @Content nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ConversationArtifactVersion]
        (
            [ConversationArtifactID],
            [Version],
            [Configuration],
            [Content],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ConversationArtifactID,
            @Version,
            @Configuration,
            @Content,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationArtifactVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spUpdateConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion]
    @ID uniqueidentifier,
    @ConversationArtifactID uniqueidentifier,
    @Version int,
    @Configuration nvarchar(MAX),
    @Content nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    SET
        [ConversationArtifactID] = @ConversationArtifactID,
        [Version] = @Version,
        [Configuration] = @Configuration,
        [Content] = @Content,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationArtifactVersions]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifactVersion table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationArtifactVersion
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationArtifactVersion
ON [${flyway:defaultSchema}].[ConversationArtifactVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spDeleteConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]


/* spDelete Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]



/* Index for Foreign Keys for ConversationArtifact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationID in table ConversationArtifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifact_ConversationID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifact_ConversationID ON [${flyway:defaultSchema}].[ConversationArtifact] ([ConversationID]);

-- Index for foreign key ArtifactTypeID in table ConversationArtifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifact_ArtifactTypeID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifact_ArtifactTypeID ON [${flyway:defaultSchema}].[ConversationArtifact] ([ArtifactTypeID]);

/* Base View SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: vwConversationArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Artifacts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationArtifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationArtifacts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationArtifacts]
AS
SELECT
    c.*,
    Conversation_ConversationID.[Name] AS [Conversation],
    ArtifactType_ArtifactTypeID.[Name] AS [ArtifactType]
FROM
    [${flyway:defaultSchema}].[ConversationArtifact] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [c].[ConversationID] = Conversation_ConversationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_ArtifactTypeID
  ON
    [c].[ArtifactTypeID] = ArtifactType_ArtifactTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: Permissions for vwConversationArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spCreateConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationArtifact]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @ArtifactTypeID uniqueidentifier,
    @SharingScope nvarchar(50),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ConversationArtifact]
        (
            [Name],
            [Description],
            [ConversationID],
            [ArtifactTypeID],
            [SharingScope],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ConversationID,
            @ArtifactTypeID,
            @SharingScope,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationArtifacts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifact] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifact] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spUpdateConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationArtifact]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @ArtifactTypeID uniqueidentifier,
    @SharingScope nvarchar(50),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifact]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ConversationID] = @ConversationID,
        [ArtifactTypeID] = @ArtifactTypeID,
        [SharingScope] = @SharingScope,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationArtifacts]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifact] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifact table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationArtifact
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationArtifact
ON [${flyway:defaultSchema}].[ConversationArtifact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationArtifact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifact] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spDeleteConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifact]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]


/* spDelete Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]



/* Index for Foreign Keys for ConversationArtifactPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationArtifactID in table ConversationArtifactPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationArtifactPermission_ConversationArtifactID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationArtifactPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationArtifactPermission_ConversationArtifactID ON [${flyway:defaultSchema}].[ConversationArtifactPermission] ([ConversationArtifactID]);

/* Base View SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: vwConversationArtifactPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Artifact Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationArtifactPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversationArtifactPermissions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationArtifactPermissions]
AS
SELECT
    c.*,
    ConversationArtifact_ConversationArtifactID.[Name] AS [ConversationArtifact]
FROM
    [${flyway:defaultSchema}].[ConversationArtifactPermission] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS ConversationArtifact_ConversationArtifactID
  ON
    [c].[ConversationArtifactID] = ConversationArtifact_ConversationArtifactID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: Permissions for vwConversationArtifactPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationArtifactPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: spCreateConversationArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationArtifactPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateConversationArtifactPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationArtifactPermission]
    @ConversationArtifactID uniqueidentifier,
    @UserID uniqueidentifier,
    @AccessLevel nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ConversationArtifactPermission]
        (
            [ConversationArtifactID],
            [UserID],
            [AccessLevel]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ConversationArtifactID,
            @UserID,
            @AccessLevel
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationArtifactPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: Conversation Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: spUpdateConversationArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationArtifactPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission]
    @ID uniqueidentifier,
    @ConversationArtifactID uniqueidentifier,
    @UserID uniqueidentifier,
    @AccessLevel nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactPermission]
    SET
        [ConversationArtifactID] = @ConversationArtifactID,
        [UserID] = @UserID,
        [AccessLevel] = @AccessLevel
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationArtifactPermissions]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationArtifactPermission table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateConversationArtifactPermission
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationArtifactPermission
ON [${flyway:defaultSchema}].[ConversationArtifactPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationArtifactPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationArtifactPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: Conversation Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationArtifactPermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: spDeleteConversationArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactPermission]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission] TO [cdp_Integration]


/* spDelete Permissions for MJ: Conversation Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission] TO [cdp_Integration]



