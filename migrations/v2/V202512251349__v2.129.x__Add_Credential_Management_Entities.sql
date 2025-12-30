-- Migration: Add Credential Management Entities
-- Description: Creates CredentialCategory, CredentialType, and Credential tables
--              for centralized, encrypted credential management in MemberJunction.
--
-- These entities support:
-- - Hierarchical credential organization (CredentialCategory)
-- - Credential type definitions with JSON Schema validation (CredentialType)
-- - Encrypted credential storage (Credential with field-level encryption on Values column)

--------------------------------------------------------------------------------
-- TABLE: CredentialCategory
-- Hierarchical organization for credentials (e.g., AI Services > Language Models)
--------------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.CredentialCategory (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    ParentID UNIQUEIDENTIFIER NULL,
    IconClass NVARCHAR(100) NULL,
    CONSTRAINT FK_CredentialCategory_ParentID FOREIGN KEY (ParentID)
        REFERENCES ${flyway:defaultSchema}.CredentialCategory(ID)
);
GO

--------------------------------------------------------------------------------
-- TABLE: CredentialType
-- Defines credential templates with JSON Schema for field validation
--------------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.CredentialType (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Category NVARCHAR(50) NOT NULL,
    FieldSchema NVARCHAR(MAX) NOT NULL,
    IconClass NVARCHAR(100) NULL,
    ValidationEndpoint NVARCHAR(500) NULL,
    CONSTRAINT UQ_CredentialType_Name UNIQUE (Name),
    CONSTRAINT CK_CredentialType_Category CHECK (Category IN ('AI', 'Communication', 'Storage', 'Authentication', 'Database', 'Integration'))
);
GO

--------------------------------------------------------------------------------
-- TABLE: Credential
-- Actual credential instances with encrypted Values field
--------------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.Credential (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    CredentialTypeID UNIQUEIDENTIFIER NOT NULL,
    CategoryID UNIQUEIDENTIFIER NULL,
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    [Values] NVARCHAR(MAX) NOT NULL,
    IsDefault BIT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    ExpiresAt DATETIMEOFFSET NULL,
    LastValidatedAt DATETIMEOFFSET NULL,
    LastUsedAt DATETIMEOFFSET NULL,
    IconClass NVARCHAR(100) NULL,
    CONSTRAINT FK_Credential_CredentialTypeID FOREIGN KEY (CredentialTypeID)
        REFERENCES ${flyway:defaultSchema}.CredentialType(ID),
    CONSTRAINT FK_Credential_CategoryID FOREIGN KEY (CategoryID)
        REFERENCES ${flyway:defaultSchema}.CredentialCategory(ID),
    CONSTRAINT UQ_Credential_TypeName UNIQUE (CredentialTypeID, Name)
);
GO

--------------------------------------------------------------------------------
-- EXTENDED PROPERTIES: CredentialCategory
--------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hierarchical organization for credentials. Allows grouping credentials by service type, department, or any organizational structure.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialCategory';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name for the category.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialCategory',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional description of the category.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialCategory',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Parent category for hierarchical organization. NULL for root categories.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialCategory',
    @level2type = N'COLUMN', @level2name = N'ParentID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Font Awesome icon class for UI display (e.g., fa-solid fa-folder).',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialCategory',
    @level2type = N'COLUMN', @level2name = N'IconClass';
GO

--------------------------------------------------------------------------------
-- EXTENDED PROPERTIES: CredentialType
--------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines credential templates for different services (e.g., OpenAI, SendGrid). Uses JSON Schema to define required fields and validation rules.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique name for the credential type (e.g., OpenAI, SendGrid, AWS S3).',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialType',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional description of the credential type.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialType',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'High-level category: AI, Communication, Storage, Authentication, Database, or Integration.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialType',
    @level2type = N'COLUMN', @level2name = N'Category';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON Schema defining the required fields for this credential type. Includes field names, types, validation rules, and UI hints.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialType',
    @level2type = N'COLUMN', @level2name = N'FieldSchema';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Font Awesome icon class for UI display (e.g., fa-brands fa-openai).',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialType',
    @level2type = N'COLUMN', @level2name = N'IconClass';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional URL endpoint to validate credentials against the service provider.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'CredentialType',
    @level2type = N'COLUMN', @level2name = N'ValidationEndpoint';
GO

--------------------------------------------------------------------------------
-- EXTENDED PROPERTIES: Credential
--------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores credential instances with encrypted values. All access should go through CredentialEngine for proper audit logging.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the credential type that defines the schema for this credential.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential',
    @level2type = N'COLUMN', @level2name = N'CredentialTypeID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional category for organizational grouping.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential',
    @level2type = N'COLUMN', @level2name = N'CategoryID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable name for this credential (e.g., Production SendGrid, Development OpenAI).',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional description of this credential instance.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Encrypted JSON blob containing all credential values. This field uses MemberJunction field-level encryption.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential',
    @level2type = N'COLUMN', @level2name = N'Values';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'If true, this is the default credential for its type when no specific credential is requested.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential',
    @level2type = N'COLUMN', @level2name = N'IsDefault';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'If false, the credential is disabled and will not be used.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential',
    @level2type = N'COLUMN', @level2name = N'IsActive';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional expiration date. Expired credentials are treated as inactive.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential',
    @level2type = N'COLUMN', @level2name = N'ExpiresAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the last successful validation against the provider.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential',
    @level2type = N'COLUMN', @level2name = N'LastValidatedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the last time this credential was used.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential',
    @level2type = N'COLUMN', @level2name = N'LastUsedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional Font Awesome icon class to override the type icon for this specific credential.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Credential',
    @level2type = N'COLUMN', @level2name = N'IconClass';
GO


















































-- CODE GEN RUN
/* SQL generated to create new entity MJ: Credential Categories */

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
         '31027859-1b84-4a79-9769-c6ae13aeb5a6',
         'MJ: Credential Categories',
         'Credential Categories',
         NULL,
         NULL,
         'CredentialCategory',
         'vwCredentialCategories',
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
   

/* SQL generated to add new entity MJ: Credential Categories to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '31027859-1b84-4a79-9769-c6ae13aeb5a6', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Credential Categories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('31027859-1b84-4a79-9769-c6ae13aeb5a6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Credential Categories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('31027859-1b84-4a79-9769-c6ae13aeb5a6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Credential Categories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('31027859-1b84-4a79-9769-c6ae13aeb5a6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Credential Types */

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
         'd512ff2e-a140-45a2-979a-20657ab77137',
         'MJ: Credential Types',
         'Credential Types',
         NULL,
         NULL,
         'CredentialType',
         'vwCredentialTypes',
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
   

/* SQL generated to add new entity MJ: Credential Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd512ff2e-a140-45a2-979a-20657ab77137', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Credential Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d512ff2e-a140-45a2-979a-20657ab77137', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Credential Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d512ff2e-a140-45a2-979a-20657ab77137', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Credential Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d512ff2e-a140-45a2-979a-20657ab77137', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Credentials */

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
         '7e023ddf-82c6-4b0c-9650-8d35699b9fd0',
         'MJ: Credentials',
         'Credentials',
         NULL,
         NULL,
         'Credential',
         'vwCredentials',
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
   

/* SQL generated to add new entity MJ: Credentials to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7e023ddf-82c6-4b0c-9650-8d35699b9fd0', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Credentials for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7e023ddf-82c6-4b0c-9650-8d35699b9fd0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Credentials for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7e023ddf-82c6-4b0c-9650-8d35699b9fd0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Credentials for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7e023ddf-82c6-4b0c-9650-8d35699b9fd0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CredentialType */
ALTER TABLE [${flyway:defaultSchema}].[CredentialType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CredentialType */
ALTER TABLE [${flyway:defaultSchema}].[CredentialType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Credential */
ALTER TABLE [${flyway:defaultSchema}].[Credential] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Credential */
ALTER TABLE [${flyway:defaultSchema}].[Credential] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CredentialCategory */
ALTER TABLE [${flyway:defaultSchema}].[CredentialCategory] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CredentialCategory */
ALTER TABLE [${flyway:defaultSchema}].[CredentialCategory] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '373b4a4f-f61d-43d1-adb9-4abc27739e54'  OR 
               (EntityID = 'D512FF2E-A140-45A2-979A-20657AB77137' AND Name = 'ID')
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
            '373b4a4f-f61d-43d1-adb9-4abc27739e54',
            'D512FF2E-A140-45A2-979A-20657AB77137', -- Entity: MJ: Credential Types
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
         WHERE ID = 'ef48ca69-b29d-46d2-970b-d6beb1580bc2'  OR 
               (EntityID = 'D512FF2E-A140-45A2-979A-20657AB77137' AND Name = 'Name')
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
            'ef48ca69-b29d-46d2-970b-d6beb1580bc2',
            'D512FF2E-A140-45A2-979A-20657AB77137', -- Entity: MJ: Credential Types
            100002,
            'Name',
            'Name',
            'Unique name for the credential type (e.g., OpenAI, SendGrid, AWS S3).',
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
         WHERE ID = 'b2907933-a6dc-4791-8704-830ce4e05c59'  OR 
               (EntityID = 'D512FF2E-A140-45A2-979A-20657AB77137' AND Name = 'Description')
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
            'b2907933-a6dc-4791-8704-830ce4e05c59',
            'D512FF2E-A140-45A2-979A-20657AB77137', -- Entity: MJ: Credential Types
            100003,
            'Description',
            'Description',
            'Optional description of the credential type.',
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
         WHERE ID = 'd2720268-ac00-42ed-b27a-cb4d91f58c34'  OR 
               (EntityID = 'D512FF2E-A140-45A2-979A-20657AB77137' AND Name = 'Category')
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
            'd2720268-ac00-42ed-b27a-cb4d91f58c34',
            'D512FF2E-A140-45A2-979A-20657AB77137', -- Entity: MJ: Credential Types
            100004,
            'Category',
            'Category',
            'High-level category: AI, Communication, Storage, Authentication, Database, or Integration.',
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
         WHERE ID = '6aaeea0b-e863-4686-9040-0f1dd7f79411'  OR 
               (EntityID = 'D512FF2E-A140-45A2-979A-20657AB77137' AND Name = 'FieldSchema')
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
            '6aaeea0b-e863-4686-9040-0f1dd7f79411',
            'D512FF2E-A140-45A2-979A-20657AB77137', -- Entity: MJ: Credential Types
            100005,
            'FieldSchema',
            'Field Schema',
            'JSON Schema defining the required fields for this credential type. Includes field names, types, validation rules, and UI hints.',
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
         WHERE ID = '98a4f983-0feb-4015-a26b-a97fcc36e7f7'  OR 
               (EntityID = 'D512FF2E-A140-45A2-979A-20657AB77137' AND Name = 'IconClass')
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
            '98a4f983-0feb-4015-a26b-a97fcc36e7f7',
            'D512FF2E-A140-45A2-979A-20657AB77137', -- Entity: MJ: Credential Types
            100006,
            'IconClass',
            'Icon Class',
            'Font Awesome icon class for UI display (e.g., fa-brands fa-openai).',
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
         WHERE ID = '83e310df-6478-4215-8f34-430eea327cc7'  OR 
               (EntityID = 'D512FF2E-A140-45A2-979A-20657AB77137' AND Name = 'ValidationEndpoint')
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
            '83e310df-6478-4215-8f34-430eea327cc7',
            'D512FF2E-A140-45A2-979A-20657AB77137', -- Entity: MJ: Credential Types
            100007,
            'ValidationEndpoint',
            'Validation Endpoint',
            'Optional URL endpoint to validate credentials against the service provider.',
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
         WHERE ID = '8e202b61-036c-4b9d-9bfa-47b2fe7e9b3e'  OR 
               (EntityID = 'D512FF2E-A140-45A2-979A-20657AB77137' AND Name = '__mj_CreatedAt')
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
            '8e202b61-036c-4b9d-9bfa-47b2fe7e9b3e',
            'D512FF2E-A140-45A2-979A-20657AB77137', -- Entity: MJ: Credential Types
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
         WHERE ID = '9bc6e5c4-b06c-457a-9888-e950e0138a9c'  OR 
               (EntityID = 'D512FF2E-A140-45A2-979A-20657AB77137' AND Name = '__mj_UpdatedAt')
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
            '9bc6e5c4-b06c-457a-9888-e950e0138a9c',
            'D512FF2E-A140-45A2-979A-20657AB77137', -- Entity: MJ: Credential Types
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
         WHERE ID = '0b9cf868-2155-44f0-bf8e-64290f4cd0e9'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'ID')
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
            '0b9cf868-2155-44f0-bf8e-64290f4cd0e9',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
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
         WHERE ID = '2e11e4b6-17d3-4167-8cc3-5a040a7e7e88'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'CredentialTypeID')
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
            '2e11e4b6-17d3-4167-8cc3-5a040a7e7e88',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100002,
            'CredentialTypeID',
            'Credential Type ID',
            'Reference to the credential type that defines the schema for this credential.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'D512FF2E-A140-45A2-979A-20657AB77137',
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
         WHERE ID = '8429927a-9942-4844-9153-0a8e2ba6ada2'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'CategoryID')
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
            '8429927a-9942-4844-9153-0a8e2ba6ada2',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100003,
            'CategoryID',
            'Category ID',
            'Optional category for organizational grouping.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '31027859-1B84-4A79-9769-C6AE13AEB5A6',
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
         WHERE ID = '90f3ae8f-432b-4a90-9f2b-25375e1e5fb3'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'Name')
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
            '90f3ae8f-432b-4a90-9f2b-25375e1e5fb3',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100004,
            'Name',
            'Name',
            'Human-readable name for this credential (e.g., Production SendGrid, Development OpenAI).',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '73466632-7929-45dc-ab62-8221988aa3e9'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'Description')
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
            '73466632-7929-45dc-ab62-8221988aa3e9',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100005,
            'Description',
            'Description',
            'Optional description of this credential instance.',
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
         WHERE ID = '999b362e-639a-4c77-91d7-4b27f94bb81a'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'Values')
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
            '999b362e-639a-4c77-91d7-4b27f94bb81a',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100006,
            'Values',
            'Values',
            'Encrypted JSON blob containing all credential values. This field uses MemberJunction field-level encryption.',
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
         WHERE ID = '1c403f16-ba63-4db4-ab9f-23a0529e4389'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'IsDefault')
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
            '1c403f16-ba63-4db4-ab9f-23a0529e4389',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100007,
            'IsDefault',
            'Is Default',
            'If true, this is the default credential for its type when no specific credential is requested.',
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
         WHERE ID = '80bc4495-225d-4d55-a0f1-ade707a796e9'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'IsActive')
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
            '80bc4495-225d-4d55-a0f1-ade707a796e9',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100008,
            'IsActive',
            'Is Active',
            'If false, the credential is disabled and will not be used.',
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
         WHERE ID = '8a6e550f-8339-4139-8737-35ea7908bdfe'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'ExpiresAt')
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
            '8a6e550f-8339-4139-8737-35ea7908bdfe',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100009,
            'ExpiresAt',
            'Expires At',
            'Optional expiration date. Expired credentials are treated as inactive.',
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
         WHERE ID = '8fdf81cf-382d-4d1b-b759-1f63c14ac0c5'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'LastValidatedAt')
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
            '8fdf81cf-382d-4d1b-b759-1f63c14ac0c5',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100010,
            'LastValidatedAt',
            'Last Validated At',
            'Timestamp of the last successful validation against the provider.',
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
         WHERE ID = 'b5e614f3-d8b9-41dd-a41f-36723e2d3193'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'LastUsedAt')
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
            'b5e614f3-d8b9-41dd-a41f-36723e2d3193',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100011,
            'LastUsedAt',
            'Last Used At',
            'Timestamp of the last time this credential was used.',
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
         WHERE ID = 'b96eb523-0870-4432-b86c-d5aa0758ab2d'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'IconClass')
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
            'b96eb523-0870-4432-b86c-d5aa0758ab2d',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100012,
            'IconClass',
            'Icon Class',
            'Optional Font Awesome icon class to override the type icon for this specific credential.',
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
         WHERE ID = '9c844b11-14df-4ae6-9289-f6aa0e2b29b1'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = '__mj_CreatedAt')
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
            '9c844b11-14df-4ae6-9289-f6aa0e2b29b1',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
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
         WHERE ID = 'ce0eca61-cddb-4fd3-9849-9fc3ad7cc13b'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = '__mj_UpdatedAt')
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
            'ce0eca61-cddb-4fd3-9849-9fc3ad7cc13b',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
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
         WHERE ID = '8bf4d3c2-b3c4-43a7-b105-7473bf82b9c4'  OR 
               (EntityID = '31027859-1B84-4A79-9769-C6AE13AEB5A6' AND Name = 'ID')
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
            '8bf4d3c2-b3c4-43a7-b105-7473bf82b9c4',
            '31027859-1B84-4A79-9769-C6AE13AEB5A6', -- Entity: MJ: Credential Categories
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
         WHERE ID = '48dcc2cd-f5af-4355-946b-b97a86de5122'  OR 
               (EntityID = '31027859-1B84-4A79-9769-C6AE13AEB5A6' AND Name = 'Name')
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
            '48dcc2cd-f5af-4355-946b-b97a86de5122',
            '31027859-1B84-4A79-9769-C6AE13AEB5A6', -- Entity: MJ: Credential Categories
            100002,
            'Name',
            'Name',
            'Display name for the category.',
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f9d8c59d-fed8-4899-b8d7-a1c92776847b'  OR 
               (EntityID = '31027859-1B84-4A79-9769-C6AE13AEB5A6' AND Name = 'Description')
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
            'f9d8c59d-fed8-4899-b8d7-a1c92776847b',
            '31027859-1B84-4A79-9769-C6AE13AEB5A6', -- Entity: MJ: Credential Categories
            100003,
            'Description',
            'Description',
            'Optional description of the category.',
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
         WHERE ID = '7af9046d-8b2f-4373-bece-d240162c5cc5'  OR 
               (EntityID = '31027859-1B84-4A79-9769-C6AE13AEB5A6' AND Name = 'ParentID')
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
            '7af9046d-8b2f-4373-bece-d240162c5cc5',
            '31027859-1B84-4A79-9769-C6AE13AEB5A6', -- Entity: MJ: Credential Categories
            100004,
            'ParentID',
            'Parent ID',
            'Parent category for hierarchical organization. NULL for root categories.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '31027859-1B84-4A79-9769-C6AE13AEB5A6',
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
         WHERE ID = '948a6793-1038-4998-bef1-5409b08c3d90'  OR 
               (EntityID = '31027859-1B84-4A79-9769-C6AE13AEB5A6' AND Name = 'IconClass')
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
            '948a6793-1038-4998-bef1-5409b08c3d90',
            '31027859-1B84-4A79-9769-C6AE13AEB5A6', -- Entity: MJ: Credential Categories
            100005,
            'IconClass',
            'Icon Class',
            'Font Awesome icon class for UI display (e.g., fa-solid fa-folder).',
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
         WHERE ID = '2d07c3fe-e883-4e65-a41a-107983857865'  OR 
               (EntityID = '31027859-1B84-4A79-9769-C6AE13AEB5A6' AND Name = '__mj_CreatedAt')
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
            '2d07c3fe-e883-4e65-a41a-107983857865',
            '31027859-1B84-4A79-9769-C6AE13AEB5A6', -- Entity: MJ: Credential Categories
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
         WHERE ID = '806c1a81-221e-44aa-a555-43e89304b88a'  OR 
               (EntityID = '31027859-1B84-4A79-9769-C6AE13AEB5A6' AND Name = '__mj_UpdatedAt')
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
            '806c1a81-221e-44aa-a555-43e89304b88a',
            '31027859-1B84-4A79-9769-C6AE13AEB5A6', -- Entity: MJ: Credential Categories
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

/* SQL text to insert entity field value with ID fc042de5-f576-46aa-b2f6-766bbf3ca5a8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('fc042de5-f576-46aa-b2f6-766bbf3ca5a8', 'D2720268-AC00-42ED-B27A-CB4D91F58C34', 1, 'AI', 'AI')

/* SQL text to insert entity field value with ID aaf9d66e-3b34-4562-b9f1-9de6b73c070a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('aaf9d66e-3b34-4562-b9f1-9de6b73c070a', 'D2720268-AC00-42ED-B27A-CB4D91F58C34', 2, 'Authentication', 'Authentication')

/* SQL text to insert entity field value with ID 55737ba1-6602-44dd-812d-9c1019b668b4 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('55737ba1-6602-44dd-812d-9c1019b668b4', 'D2720268-AC00-42ED-B27A-CB4D91F58C34', 3, 'Communication', 'Communication')

/* SQL text to insert entity field value with ID 09eb6cf1-6310-40b3-ab21-406f7716b2c4 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('09eb6cf1-6310-40b3-ab21-406f7716b2c4', 'D2720268-AC00-42ED-B27A-CB4D91F58C34', 4, 'Database', 'Database')

/* SQL text to insert entity field value with ID 6ced0ca5-0dc0-43d0-b148-8d8d2ca719b1 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6ced0ca5-0dc0-43d0-b148-8d8d2ca719b1', 'D2720268-AC00-42ED-B27A-CB4D91F58C34', 5, 'Integration', 'Integration')

/* SQL text to insert entity field value with ID 806511ba-0bd6-426a-bc42-9924c9a3a2d2 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('806511ba-0bd6-426a-bc42-9924c9a3a2d2', 'D2720268-AC00-42ED-B27A-CB4D91F58C34', 6, 'Storage', 'Storage')

/* SQL text to update ValueListType for entity field ID D2720268-AC00-42ED-B27A-CB4D91F58C34 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D2720268-AC00-42ED-B27A-CB4D91F58C34'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '2a670016-60e5-4d04-a889-ab2e6b179d3a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('2a670016-60e5-4d04-a889-ab2e6b179d3a', 'D512FF2E-A140-45A2-979A-20657AB77137', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'CredentialTypeID', 'One To Many', 1, 1, 'MJ: Credentials', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '13774126-5b28-4601-8328-39c88f6fb585'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('13774126-5b28-4601-8328-39c88f6fb585', '31027859-1B84-4A79-9769-C6AE13AEB5A6', '31027859-1B84-4A79-9769-C6AE13AEB5A6', 'ParentID', 'One To Many', 1, 1, 'MJ: Credential Categories', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '93fc36df-8eae-48c3-aafa-1af98f437e95'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('93fc36df-8eae-48c3-aafa-1af98f437e95', '31027859-1B84-4A79-9769-C6AE13AEB5A6', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'CategoryID', 'One To Many', 1, 1, 'MJ: Credentials', 2);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID B4BAC05B-4345-49B2-97B2-FB761777078D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B4BAC05B-4345-49B2-97B2-FB761777078D',
         @RelatedEntityNameFieldMap='TestRun'

/* SQL text to update entity field related entity name field map for entity field ID 3E687A08-D39E-4488-9AF9-C71394F7217A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3E687A08-D39E-4488-9AF9-C71394F7217A',
         @RelatedEntityNameFieldMap='TestRun'

/* SQL text to update entity field related entity name field map for entity field ID 7685B81B-FD95-40F8-A3D6-4EB710DB054D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7685B81B-FD95-40F8-A3D6-4EB710DB054D',
         @RelatedEntityNameFieldMap='TestRun'

/* SQL text to update entity field related entity name field map for entity field ID CECDF34F-B76C-421E-9746-416F3C1CAB0B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CECDF34F-B76C-421E-9746-416F3C1CAB0B',
         @RelatedEntityNameFieldMap='TestRun'

/* Index for Foreign Keys for CredentialCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table CredentialCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CredentialCategory_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CredentialCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CredentialCategory_ParentID ON [${flyway:defaultSchema}].[CredentialCategory] ([ParentID]);

/* Root ID Function SQL for MJ: Credential Categories.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: fnCredentialCategoryParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [CredentialCategory].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnCredentialCategoryParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnCredentialCategoryParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnCredentialCategoryParentID_GetRootID]
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
            [${flyway:defaultSchema}].[CredentialCategory]
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
            [${flyway:defaultSchema}].[CredentialCategory] c
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


/* SQL text to update entity field related entity name field map for entity field ID 7AF9046D-8B2F-4373-BECE-D240162C5CC5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7AF9046D-8B2F-4373-BECE-D240162C5CC5',
         @RelatedEntityNameFieldMap='Parent'

/* Index for Foreign Keys for CredentialType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Credential Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Types
-- Item: vwCredentialTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Credential Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CredentialType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCredentialTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCredentialTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCredentialTypes]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[CredentialType] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCredentialTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Credential Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Types
-- Item: Permissions for vwCredentialTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCredentialTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Credential Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Types
-- Item: spCreateCredentialType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CredentialType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCredentialType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCredentialType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCredentialType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Category nvarchar(50),
    @FieldSchema nvarchar(MAX),
    @IconClass nvarchar(100),
    @ValidationEndpoint nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CredentialType]
            (
                [ID],
                [Name],
                [Description],
                [Category],
                [FieldSchema],
                [IconClass],
                [ValidationEndpoint]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @Category,
                @FieldSchema,
                @IconClass,
                @ValidationEndpoint
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CredentialType]
            (
                [Name],
                [Description],
                [Category],
                [FieldSchema],
                [IconClass],
                [ValidationEndpoint]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @Category,
                @FieldSchema,
                @IconClass,
                @ValidationEndpoint
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCredentialTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCredentialType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Credential Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCredentialType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Credential Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Types
-- Item: spUpdateCredentialType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CredentialType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCredentialType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCredentialType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCredentialType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Category nvarchar(50),
    @FieldSchema nvarchar(MAX),
    @IconClass nvarchar(100),
    @ValidationEndpoint nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CredentialType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Category] = @Category,
        [FieldSchema] = @FieldSchema,
        [IconClass] = @IconClass,
        [ValidationEndpoint] = @ValidationEndpoint
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCredentialTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCredentialTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCredentialType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CredentialType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCredentialType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCredentialType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCredentialType
ON [${flyway:defaultSchema}].[CredentialType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CredentialType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CredentialType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Credential Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCredentialType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Credential Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Types
-- Item: spDeleteCredentialType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CredentialType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCredentialType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCredentialType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCredentialType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CredentialType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCredentialType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Credential Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCredentialType] TO [cdp_Integration]



/* Base View SQL for MJ: Credential Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: vwCredentialCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Credential Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CredentialCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCredentialCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCredentialCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCredentialCategories]
AS
SELECT
    c.*,
    CredentialCategory_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[CredentialCategory] AS c
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CredentialCategory] AS CredentialCategory_ParentID
  ON
    [c].[ParentID] = CredentialCategory_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnCredentialCategoryParentID_GetRootID]([c].[ID], [c].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCredentialCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Credential Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: Permissions for vwCredentialCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCredentialCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Credential Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: spCreateCredentialCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CredentialCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCredentialCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCredentialCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCredentialCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CredentialCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ParentID,
                @IconClass
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CredentialCategory]
            (
                [Name],
                [Description],
                [ParentID],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ParentID,
                @IconClass
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCredentialCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCredentialCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Credential Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCredentialCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Credential Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: spUpdateCredentialCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CredentialCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCredentialCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCredentialCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCredentialCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CredentialCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [IconClass] = @IconClass
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCredentialCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCredentialCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCredentialCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CredentialCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCredentialCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCredentialCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCredentialCategory
ON [${flyway:defaultSchema}].[CredentialCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CredentialCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CredentialCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Credential Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCredentialCategory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Credential Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: spDeleteCredentialCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CredentialCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCredentialCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCredentialCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCredentialCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CredentialCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCredentialCategory] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Credential Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCredentialCategory] TO [cdp_Integration]



/* Index for Foreign Keys for Credential */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credentials
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialTypeID in table Credential
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Credential_CredentialTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Credential]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Credential_CredentialTypeID ON [${flyway:defaultSchema}].[Credential] ([CredentialTypeID]);

-- Index for foreign key CategoryID in table Credential
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Credential_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Credential]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Credential_CategoryID ON [${flyway:defaultSchema}].[Credential] ([CategoryID]);

/* SQL text to update entity field related entity name field map for entity field ID 2E11E4B6-17D3-4167-8CC3-5A040A7E7E88 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2E11E4B6-17D3-4167-8CC3-5A040A7E7E88',
         @RelatedEntityNameFieldMap='CredentialType'

/* SQL text to update entity field related entity name field map for entity field ID 8429927A-9942-4844-9153-0A8E2BA6ADA2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8429927A-9942-4844-9153-0A8E2BA6ADA2',
         @RelatedEntityNameFieldMap='Category'

/* Base View SQL for MJ: Credentials */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credentials
-- Item: vwCredentials
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Credentials
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Credential
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCredentials]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCredentials];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCredentials]
AS
SELECT
    c.*,
    CredentialType_CredentialTypeID.[Name] AS [CredentialType],
    CredentialCategory_CategoryID.[Name] AS [Category]
FROM
    [${flyway:defaultSchema}].[Credential] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CredentialType] AS CredentialType_CredentialTypeID
  ON
    [c].[CredentialTypeID] = CredentialType_CredentialTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CredentialCategory] AS CredentialCategory_CategoryID
  ON
    [c].[CategoryID] = CredentialCategory_CategoryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCredentials] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Credentials */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credentials
-- Item: Permissions for vwCredentials
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCredentials] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Credentials */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credentials
-- Item: spCreateCredential
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Credential
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCredential]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCredential];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCredential]
    @ID uniqueidentifier = NULL,
    @CredentialTypeID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @Values nvarchar(MAX),
    @IsDefault bit = NULL,
    @IsActive bit = NULL,
    @ExpiresAt datetimeoffset,
    @LastValidatedAt datetimeoffset,
    @LastUsedAt datetimeoffset,
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Credential]
            (
                [ID],
                [CredentialTypeID],
                [CategoryID],
                [Name],
                [Description],
                [Values],
                [IsDefault],
                [IsActive],
                [ExpiresAt],
                [LastValidatedAt],
                [LastUsedAt],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CredentialTypeID,
                @CategoryID,
                @Name,
                @Description,
                @Values,
                ISNULL(@IsDefault, 0),
                ISNULL(@IsActive, 1),
                @ExpiresAt,
                @LastValidatedAt,
                @LastUsedAt,
                @IconClass
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Credential]
            (
                [CredentialTypeID],
                [CategoryID],
                [Name],
                [Description],
                [Values],
                [IsDefault],
                [IsActive],
                [ExpiresAt],
                [LastValidatedAt],
                [LastUsedAt],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CredentialTypeID,
                @CategoryID,
                @Name,
                @Description,
                @Values,
                ISNULL(@IsDefault, 0),
                ISNULL(@IsActive, 1),
                @ExpiresAt,
                @LastValidatedAt,
                @LastUsedAt,
                @IconClass
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCredentials] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCredential] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Credentials */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCredential] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Credentials */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credentials
-- Item: spUpdateCredential
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Credential
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCredential]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCredential];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCredential]
    @ID uniqueidentifier,
    @CredentialTypeID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @Values nvarchar(MAX),
    @IsDefault bit,
    @IsActive bit,
    @ExpiresAt datetimeoffset,
    @LastValidatedAt datetimeoffset,
    @LastUsedAt datetimeoffset,
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Credential]
    SET
        [CredentialTypeID] = @CredentialTypeID,
        [CategoryID] = @CategoryID,
        [Name] = @Name,
        [Description] = @Description,
        [Values] = @Values,
        [IsDefault] = @IsDefault,
        [IsActive] = @IsActive,
        [ExpiresAt] = @ExpiresAt,
        [LastValidatedAt] = @LastValidatedAt,
        [LastUsedAt] = @LastUsedAt,
        [IconClass] = @IconClass
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCredentials] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCredentials]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCredential] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Credential table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCredential]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCredential];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCredential
ON [${flyway:defaultSchema}].[Credential]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Credential]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Credential] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Credentials */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCredential] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Credentials */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credentials
-- Item: spDeleteCredential
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Credential
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCredential]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCredential];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCredential]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Credential]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCredential] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Credentials */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCredential] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 2114C507-DB13-4864-8CF8-76B205F55FE3 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2114C507-DB13-4864-8CF8-76B205F55FE3',
         @RelatedEntityNameFieldMap='TestRun'

/* SQL text to update entity field related entity name field map for entity field ID 474B4535-FEF5-4F52-AB4B-0FF00D355F81 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='474B4535-FEF5-4F52-AB4B-0FF00D355F81',
         @RelatedEntityNameFieldMap='TestSuiteRun'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a8f3e48e-151d-454f-b538-a05dfc8c2d6d'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'CredentialType')
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
            'a8f3e48e-151d-454f-b538-a05dfc8c2d6d',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100029,
            'CredentialType',
            'Credential Type',
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
         WHERE ID = '3f3e58a6-92f1-4c1d-9191-39bd95e03811'  OR 
               (EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0' AND Name = 'Category')
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
            '3f3e58a6-92f1-4c1d-9191-39bd95e03811',
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', -- Entity: MJ: Credentials
            100030,
            'Category',
            'Category',
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
         WHERE ID = 'f5387b3f-e179-46e2-a9d4-3269d0c4b211'  OR 
               (EntityID = '31027859-1B84-4A79-9769-C6AE13AEB5A6' AND Name = 'Parent')
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
            'f5387b3f-e179-46e2-a9d4-3269d0c4b211',
            '31027859-1B84-4A79-9769-C6AE13AEB5A6', -- Entity: MJ: Credential Categories
            100015,
            'Parent',
            'Parent',
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
         WHERE ID = 'a9acb318-51b7-452c-8d1b-8ce6a20acd19'  OR 
               (EntityID = '31027859-1B84-4A79-9769-C6AE13AEB5A6' AND Name = 'RootParentID')
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
            'a9acb318-51b7-452c-8d1b-8ce6a20acd19',
            '31027859-1B84-4A79-9769-C6AE13AEB5A6', -- Entity: MJ: Credential Categories
            100016,
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '48DCC2CD-F5AF-4355-946B-B97A86DE5122'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '48DCC2CD-F5AF-4355-946B-B97A86DE5122'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '948A6793-1038-4998-BEF1-5409B08C3D90'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F5387B3F-E179-46E2-A9D4-3269D0C4B211'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '48DCC2CD-F5AF-4355-946B-B97A86DE5122'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F9D8C59D-FED8-4899-B8D7-A1C92776847B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F5387B3F-E179-46E2-A9D4-3269D0C4B211'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '90F3AE8F-432B-4A90-9F2B-25375E1E5FB3'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '90F3AE8F-432B-4A90-9F2B-25375E1E5FB3'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1C403F16-BA63-4DB4-AB9F-23A0529E4389'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '80BC4495-225D-4D55-A0F1-ADE707A796E9'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8A6E550F-8339-4139-8737-35EA7908BDFE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A8F3E48E-151D-454F-B538-A05DFC8C2D6D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3F3E58A6-92F1-4C1D-9191-39BD95E03811'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '90F3AE8F-432B-4A90-9F2B-25375E1E5FB3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '73466632-7929-45DC-AB62-8221988AA3E9'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A8F3E48E-151D-454F-B538-A05DFC8C2D6D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3F3E58A6-92F1-4C1D-9191-39BD95E03811'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'EF48CA69-B29D-46D2-970B-D6BEB1580BC2'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EF48CA69-B29D-46D2-970B-D6BEB1580BC2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D2720268-AC00-42ED-B27A-CB4D91F58C34'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '98A4F983-0FEB-4015-A26B-A97FCC36E7F7'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EF48CA69-B29D-46D2-970B-D6BEB1580BC2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B2907933-A6DC-4791-8704-830CE4E05C59'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D2720268-AC00-42ED-B27A-CB4D91F58C34'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Category Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48DCC2CD-F5AF-4355-946B-B97A86DE5122'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Category Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F9D8C59D-FED8-4899-B8D7-A1C92776847B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Category Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '948A6793-1038-4998-BEF1-5409B08C3D90'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7AF9046D-8B2F-4373-BECE-D240162C5CC5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F5387B3F-E179-46E2-A9D4-3269D0C4B211'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A9ACB318-51B7-452C-8D1B-8CE6A20ACD19'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8BF4D3C2-B3C4-43A7-B105-7473BF82B9C4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2D07C3FE-E883-4E65-A41A-107983857865'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '806C1A81-221E-44AA-A555-43E89304B88A'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-key */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-key',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '31027859-1B84-4A79-9769-C6AE13AEB5A6'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('419648d3-5227-4f35-acfb-f95ca09753aa', '31027859-1B84-4A79-9769-C6AE13AEB5A6', 'FieldCategoryInfo', '{"Category Details":{"icon":"fa fa-info-circle","description":"Core information about the credential category, including its name, description, and display icon."},"Hierarchy":{"icon":"fa fa-sitemap","description":"Fields defining parent‑child relationships and root lineage for organizing categories."},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed identifiers and audit timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a62df140-2020-4359-88dd-615d310524aa', '31027859-1B84-4A79-9769-C6AE13AEB5A6', 'FieldCategoryIcons', '{"Category Details":"fa fa-info-circle","Hierarchy":"fa fa-sitemap","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '31027859-1B84-4A79-9769-C6AE13AEB5A6'
         

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '373B4A4F-F61D-43D1-ADB9-4ABC27739E54'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF48CA69-B29D-46D2-970B-D6BEB1580BC2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B2907933-A6DC-4791-8704-830CE4E05C59'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2720268-AC00-42ED-B27A-CB4D91F58C34'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Field Schema',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = '6AAEEA0B-E863-4686-9040-0F1DD7F79411'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '98A4F983-0FEB-4015-A26B-A97FCC36E7F7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Validation Endpoint',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '83E310DF-6478-4215-8F34-430EEA327CC7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8E202B61-036C-4B9D-9BFA-47B2FE7E9B3E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9BC6E5C4-B06C-457A-9888-E950E0138A9C'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-key */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-key',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'D512FF2E-A140-45A2-979A-20657AB77137'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('99a4f3f3-b058-4265-a9a2-8cba82f7ad22', 'D512FF2E-A140-45A2-979A-20657AB77137', 'FieldCategoryInfo', '{"General Information":{"icon":"fa fa-info-circle","description":"Core descriptive attributes of the credential type such as name, description, and high‑level category"},"Technical Details":{"icon":"fa fa-cog","description":"Technical configuration including JSON schema, icon class, and optional validation endpoint"},"System Metadata":{"icon":"fa fa-database","description":"System‑managed audit fields tracking creation and modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('fff90ffc-9d7d-49e4-9ed6-f0a71fc39f11', 'D512FF2E-A140-45A2-979A-20657AB77137', 'FieldCategoryIcons', '{"General Information":"fa fa-info-circle","Technical Details":"fa fa-cog","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'D512FF2E-A140-45A2-979A-20657AB77137'
         

/* Set categories for 16 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0B9CF868-2155-44F0-BF8E-64290F4CD0E9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2E11E4B6-17D3-4167-8CC3-5A040A7E7E88'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8429927A-9942-4844-9153-0A8E2BA6ADA2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '90F3AE8F-432B-4A90-9F2B-25375E1E5FB3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73466632-7929-45DC-AB62-8221988AA3E9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Values',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '999B362E-639A-4C77-91D7-4B27F94BB81A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C403F16-BA63-4DB4-AB9F-23A0529E4389'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '80BC4495-225D-4D55-A0F1-ADE707A796E9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expires At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A6E550F-8339-4139-8737-35EA7908BDFE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Validated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8FDF81CF-382D-4D1B-B759-1F63C14AC0C5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Used At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B5E614F3-D8B9-41DD-A41F-36723E2D3193'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B96EB523-0870-4432-B86C-D5AA0758AB2D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C844B11-14DF-4AE6-9289-F6AA0E2B29B1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CE0ECA61-CDDB-4FD3-9849-9FC3AD7CC13B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A8F3E48E-151D-454F-B538-A05DFC8C2D6D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3F3E58A6-92F1-4C1D-9191-39BD95E03811'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-key */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-key',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e71f7bab-f13f-4082-80ff-901e6123283a', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'FieldCategoryInfo', '{"Basic Information":{"icon":"fa fa-info-circle","description":"Core descriptive fields for the credential such as name, description, and custom icon"},"Classification":{"icon":"fa fa-tags","description":"Defines the credential''s type and optional organizational category"},"Access Details":{"icon":"fa fa-key","description":"Credential values and lifecycle flags including default status, activity, expiration and usage timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('55a821a5-586b-4539-8ba3-6c9666f81d6b', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'FieldCategoryIcons', '{"Basic Information":"fa fa-info-circle","Classification":"fa fa-tags","Access Details":"fa fa-key"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '7E023DDF-82C6-4B0C-9650-8D35699B9FD0'
         

