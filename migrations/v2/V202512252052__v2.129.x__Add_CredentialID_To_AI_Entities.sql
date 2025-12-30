-- Migration: Add AI Credential Binding System
-- Description: Creates AICredentialBinding table for decoupled credential management
--              and adds CredentialTypeID to AIVendor to declare expected credential type.
--
-- Design Philosophy:
-- Rather than embedding CredentialID directly into AIVendor, AIModelVendor, and AIPromptModel,
-- we use a separate binding table. This decouples credential assignments from core MJ entities,
-- ensuring that MJ core data updates (new models, vendor configs) never risk overwriting
-- customer-specific credential bindings.
--
-- Credential Resolution Hierarchy (highest to lowest priority):
-- 1. AIPromptParams.credentialId (runtime override)
-- 2. AICredentialBinding WHERE BindingType='PromptModel' (ordered by Priority)
-- 3. AICredentialBinding WHERE BindingType='ModelVendor' (ordered by Priority)
-- 4. AICredentialBinding WHERE BindingType='Vendor' (ordered by Priority)
-- 5. Credential.IsDefault=1 matching AIVendor.CredentialTypeID (type-based default)
-- 6. Legacy: AIPromptParams.apiKeys[] array
-- 7. Legacy: AI_VENDOR_API_KEY__<DRIVER> environment variables
--
-- Priority-Based Failover:
-- Multiple bindings can exist at each level with different Priority values.
-- Lower Priority = higher precedence (0 is highest). If a credential fails
-- (expired, invalid, rate-limited), the system can fall back to the next priority.

--------------------------------------------------------------------------------
-- TABLE: AICredentialBinding
-- Junction table for binding credentials to AI entities at various levels
--------------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.AICredentialBinding (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    CredentialID UNIQUEIDENTIFIER NOT NULL,
    BindingType NVARCHAR(20) NOT NULL,

    -- Polymorphic foreign keys: only one populated based on BindingType
    AIVendorID UNIQUEIDENTIFIER NULL,
    AIModelVendorID UNIQUEIDENTIFIER NULL,
    AIPromptModelID UNIQUEIDENTIFIER NULL,

    -- Priority for failover (lower = higher priority, 0 is highest)
    Priority INT NOT NULL DEFAULT 0,

    -- Active flag to enable/disable bindings without deleting
    IsActive BIT NOT NULL DEFAULT 1,

    -- Standard MJ timestamp columns
    __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

    -- Foreign key constraints
    CONSTRAINT FK_AICredentialBinding_Credential
        FOREIGN KEY (CredentialID) REFERENCES ${flyway:defaultSchema}.Credential(ID),
    CONSTRAINT FK_AICredentialBinding_AIVendor
        FOREIGN KEY (AIVendorID) REFERENCES ${flyway:defaultSchema}.AIVendor(ID),
    CONSTRAINT FK_AICredentialBinding_AIModelVendor
        FOREIGN KEY (AIModelVendorID) REFERENCES ${flyway:defaultSchema}.AIModelVendor(ID),
    CONSTRAINT FK_AICredentialBinding_AIPromptModel
        FOREIGN KEY (AIPromptModelID) REFERENCES ${flyway:defaultSchema}.AIPromptModel(ID),

    -- Ensure BindingType is valid
    CONSTRAINT CK_AICredentialBinding_BindingType
        CHECK (BindingType IN ('Vendor', 'ModelVendor', 'PromptModel')),

    -- Ensure exactly one target FK is populated based on BindingType
    CONSTRAINT CK_AICredentialBinding_SingleTarget CHECK (
        (BindingType = 'Vendor' AND AIVendorID IS NOT NULL
            AND AIModelVendorID IS NULL AND AIPromptModelID IS NULL) OR
        (BindingType = 'ModelVendor' AND AIVendorID IS NULL
            AND AIModelVendorID IS NOT NULL AND AIPromptModelID IS NULL) OR
        (BindingType = 'PromptModel' AND AIVendorID IS NULL
            AND AIModelVendorID IS NULL AND AIPromptModelID IS NOT NULL)
    )
);
GO

--------------------------------------------------------------------------------
-- INDEXES: AICredentialBinding
--------------------------------------------------------------------------------
-- Index for looking up bindings by type and target
CREATE INDEX IDX_AICredentialBinding_Vendor
    ON ${flyway:defaultSchema}.AICredentialBinding (AIVendorID, Priority)
    WHERE BindingType = 'Vendor' AND IsActive = 1;
GO

CREATE INDEX IDX_AICredentialBinding_ModelVendor
    ON ${flyway:defaultSchema}.AICredentialBinding (AIModelVendorID, Priority)
    WHERE BindingType = 'ModelVendor' AND IsActive = 1;
GO

CREATE INDEX IDX_AICredentialBinding_PromptModel
    ON ${flyway:defaultSchema}.AICredentialBinding (AIPromptModelID, Priority)
    WHERE BindingType = 'PromptModel' AND IsActive = 1;
GO

-- Index for credential lookups (e.g., finding all usages of a credential)
CREATE INDEX IDX_AICredentialBinding_CredentialID
    ON ${flyway:defaultSchema}.AICredentialBinding (CredentialID);
GO

--------------------------------------------------------------------------------
-- EXTENDED PROPERTIES: AICredentialBinding
--------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Junction table that binds credentials to AI entities (Vendors, ModelVendors, PromptModels). Decouples credential assignments from core AI entities to prevent MJ updates from overwriting customer configurations. Supports priority-based failover with multiple credentials per binding level.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AICredentialBinding';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the credential being bound.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AICredentialBinding',
    @level2type = N'COLUMN', @level2name = N'CredentialID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The type of AI entity this credential is bound to: Vendor (broadest), ModelVendor (model+vendor specific), or PromptModel (most specific). Resolution follows prompt → model → vendor hierarchy.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AICredentialBinding',
    @level2type = N'COLUMN', @level2name = N'BindingType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to AIVendor when BindingType is Vendor. NULL otherwise.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AICredentialBinding',
    @level2type = N'COLUMN', @level2name = N'AIVendorID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to AIModelVendor when BindingType is ModelVendor. NULL otherwise.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AICredentialBinding',
    @level2type = N'COLUMN', @level2name = N'AIModelVendorID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to AIPromptModel when BindingType is PromptModel. NULL otherwise.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AICredentialBinding',
    @level2type = N'COLUMN', @level2name = N'AIPromptModelID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Priority for credential selection when multiple bindings exist at the same level. Lower values have higher priority (0 is highest). Enables failover when primary credentials are unavailable.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AICredentialBinding',
    @level2type = N'COLUMN', @level2name = N'Priority';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When false, this binding is ignored during credential resolution. Allows temporary disabling without deletion.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AICredentialBinding',
    @level2type = N'COLUMN', @level2name = N'IsActive';
GO

--------------------------------------------------------------------------------
-- ADD COLUMN: AIVendor.CredentialTypeID
-- Declares what type of credential the vendor expects (API Key, OAuth, GCP, etc.)
--------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[AIVendor]
ADD [CredentialTypeID] UNIQUEIDENTIFIER NULL
    CONSTRAINT [FK_AIVendor_CredentialType] FOREIGN KEY
    REFERENCES [${flyway:defaultSchema}].[CredentialType]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the type of credential this vendor expects (e.g., API Key, GCP Service Account, Azure Service Principal). Used for type-based default credential resolution when no explicit binding exists, and for UI guidance when creating credentials.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIVendor',
    @level2type = N'COLUMN', @level2name = N'CredentialTypeID';
GO

-- Index for CredentialTypeID lookups
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIVendor_CredentialTypeID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIVendor_CredentialTypeID ON [${flyway:defaultSchema}].[AIVendor] ([CredentialTypeID]);
GO












 











-- CODE GEN RUN
/* SQL generated to create new entity MJ: AI Credential Bindings */

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
         'e546d71e-002c-43f6-8581-d2c0813580d4',
         'MJ: AI Credential Bindings',
         'AI Credential Bindings',
         NULL,
         NULL,
         'AICredentialBinding',
         'vwAICredentialBindings',
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
   

/* SQL generated to add new entity MJ: AI Credential Bindings to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e546d71e-002c-43f6-8581-d2c0813580d4', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Credential Bindings for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e546d71e-002c-43f6-8581-d2c0813580d4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Credential Bindings for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e546d71e-002c-43f6-8581-d2c0813580d4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Credential Bindings for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e546d71e-002c-43f6-8581-d2c0813580d4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a179c3ac-5499-4141-8b13-c8963ee47534'  OR 
               (EntityID = 'D95A17EE-5750-4218-86AD-10F06E4DFBCA' AND Name = 'CredentialTypeID')
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
            'a179c3ac-5499-4141-8b13-c8963ee47534',
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA', -- Entity: MJ: AI Vendors
            100011,
            'CredentialTypeID',
            'Credential Type ID',
            'Reference to the type of credential this vendor expects (e.g., API Key, GCP Service Account, Azure Service Principal). Used for type-based default credential resolution when no explicit binding exists, and for UI guidance when creating credentials.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cd42bab8-2f08-40f6-b791-0cd2ce785f18'  OR 
               (EntityID = 'ED238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRun')
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
            'cd42bab8-2f08-40f6-b791-0cd2ce785f18',
            'ED238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Company Integration Run API Logs
            100019,
            'CompanyIntegrationRun',
            'Company Integration Run',
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
         WHERE ID = 'c0659d37-75b1-4fb4-8ce4-c7ea3a243a1d'  OR 
               (EntityID = '2D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DuplicateRunDetail')
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
            'c0659d37-75b1-4fb4-8ce4-c7ea3a243a1d',
            '2D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Duplicate Run Detail Matches
            100027,
            'DuplicateRunDetail',
            'Duplicate Run Detail',
            NULL,
            'nvarchar',
            1000,
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
         WHERE ID = '064ef859-8c2f-464e-8df0-822e69644e1b'  OR 
               (EntityID = '2D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecordMergeLog')
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
            '064ef859-8c2f-464e-8df0-822e69644e1b',
            '2D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Duplicate Run Detail Matches
            100028,
            'RecordMergeLog',
            'Record Merge Log',
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
         WHERE ID = '7731bc0c-a260-41f3-95cc-1c00e21973d5'  OR 
               (EntityID = '46248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CommunicationRun')
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
            '7731bc0c-a260-41f3-95cc-1c00e21973d5',
            '46248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Communication Logs
            100027,
            'CommunicationRun',
            'Communication Run',
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
         WHERE ID = 'dec9cd2b-a374-417e-93a9-34f74912f7b1'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'ID')
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
            'dec9cd2b-a374-417e-93a9-34f74912f7b1',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
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
         WHERE ID = '684271db-be05-4ac4-8ad9-e1562d7afa54'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'CredentialID')
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
            '684271db-be05-4ac4-8ad9-e1562d7afa54',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100002,
            'CredentialID',
            'Credential ID',
            'Reference to the credential being bound.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
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
         WHERE ID = '07c77dbb-3ee2-4c06-88fe-11e0da249673'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'BindingType')
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
            '07c77dbb-3ee2-4c06-88fe-11e0da249673',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100003,
            'BindingType',
            'Binding Type',
            'The type of AI entity this credential is bound to: Vendor (broadest), ModelVendor (model+vendor specific), or PromptModel (most specific). Resolution follows prompt → model → vendor hierarchy.',
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
         WHERE ID = 'a1b693c1-eac1-4084-936d-54d6351f5c58'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'AIVendorID')
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
            'a1b693c1-eac1-4084-936d-54d6351f5c58',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100004,
            'AIVendorID',
            'AI Vendor ID',
            'Reference to AIVendor when BindingType is Vendor. NULL otherwise.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA',
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
         WHERE ID = '07306d16-45cf-43e7-90ce-8a3e74494590'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'AIModelVendorID')
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
            '07306d16-45cf-43e7-90ce-8a3e74494590',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100005,
            'AIModelVendorID',
            'AI Model Vendor ID',
            'Reference to AIModelVendor when BindingType is ModelVendor. NULL otherwise.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'F386546E-EC07-46E6-B780-6B1FEA5892E6',
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
         WHERE ID = 'b9a5415f-8041-484c-84b6-8402f1ddf2af'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'AIPromptModelID')
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
            'b9a5415f-8041-484c-84b6-8402f1ddf2af',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100006,
            'AIPromptModelID',
            'AI Prompt Model ID',
            'Reference to AIPromptModel when BindingType is PromptModel. NULL otherwise.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'AD4D32AE-6848-41A0-A966-2A1F8B751251',
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
         WHERE ID = 'fb11309d-3b3f-4241-9bca-24fa27653b7e'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'Priority')
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
            'fb11309d-3b3f-4241-9bca-24fa27653b7e',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100007,
            'Priority',
            'Priority',
            'Priority for credential selection when multiple bindings exist at the same level. Lower values have higher priority (0 is highest). Enables failover when primary credentials are unavailable.',
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
         WHERE ID = '56e1ae50-3882-4841-8819-8fb5d4d7835d'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'IsActive')
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
            '56e1ae50-3882-4841-8819-8fb5d4d7835d',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100008,
            'IsActive',
            'Is Active',
            'When false, this binding is ignored during credential resolution. Allows temporary disabling without deletion.',
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
         WHERE ID = '2b7fc526-3dd3-4231-9acb-17e51c1853e4'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = '__mj_CreatedAt')
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
            '2b7fc526-3dd3-4231-9acb-17e51c1853e4',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100009,
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
         WHERE ID = 'd0763f51-a773-4e4a-901a-7016e0056a3d'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = '__mj_UpdatedAt')
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
            'd0763f51-a773-4e4a-901a-7016e0056a3d',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100010,
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

/* SQL text to insert entity field value with ID 42b4bca0-f127-477f-9cca-deb579f1092a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('42b4bca0-f127-477f-9cca-deb579f1092a', '07C77DBB-3EE2-4C06-88FE-11E0DA249673', 1, 'ModelVendor', 'ModelVendor')

/* SQL text to insert entity field value with ID 9f3d9e69-5889-4f2e-8b8e-d362bece99b6 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9f3d9e69-5889-4f2e-8b8e-d362bece99b6', '07C77DBB-3EE2-4C06-88FE-11E0DA249673', 2, 'PromptModel', 'PromptModel')

/* SQL text to insert entity field value with ID 5553d6aa-81df-4732-8378-84f3e5a5ed9f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5553d6aa-81df-4732-8378-84f3e5a5ed9f', '07C77DBB-3EE2-4C06-88FE-11E0DA249673', 3, 'Vendor', 'Vendor')

/* SQL text to update ValueListType for entity field ID 07C77DBB-3EE2-4C06-88FE-11E0DA249673 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='07C77DBB-3EE2-4C06-88FE-11E0DA249673'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1faa8830-3620-45c4-82d8-5c09b1073f06'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1faa8830-3620-45c4-82d8-5c09b1073f06', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', 'E546D71E-002C-43F6-8581-D2C0813580D4', 'AIVendorID', 'One To Many', 1, 1, 'MJ: AI Credential Bindings', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '180f4e23-bb0b-44ca-b952-98c4be315a17'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('180f4e23-bb0b-44ca-b952-98c4be315a17', 'D512FF2E-A140-45A2-979A-20657AB77137', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', 'CredentialTypeID', 'One To Many', 1, 1, 'MJ: AI Vendors', 8);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6a2b2428-19a4-48d7-8cdb-f94dff81bd9d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6a2b2428-19a4-48d7-8cdb-f94dff81bd9d', 'AD4D32AE-6848-41A0-A966-2A1F8B751251', 'E546D71E-002C-43F6-8581-D2C0813580D4', 'AIPromptModelID', 'One To Many', 1, 1, 'MJ: AI Credential Bindings', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'e29b8508-602e-4071-a37a-10e87621667e'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('e29b8508-602e-4071-a37a-10e87621667e', 'F386546E-EC07-46E6-B780-6B1FEA5892E6', 'E546D71E-002C-43F6-8581-D2C0813580D4', 'AIModelVendorID', 'One To Many', 1, 1, 'MJ: AI Credential Bindings', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '627bc23b-2461-4128-b5de-3e71e7ef3eef'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('627bc23b-2461-4128-b5de-3e71e7ef3eef', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'E546D71E-002C-43F6-8581-D2C0813580D4', 'CredentialID', 'One To Many', 1, 1, 'MJ: AI Credential Bindings', 4);
   END
                              

/* Index for Foreign Keys for Action */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_CategoryID ON [${flyway:defaultSchema}].[Action] ([CategoryID]);

-- Index for foreign key CodeApprovedByUserID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_CodeApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_CodeApprovedByUserID ON [${flyway:defaultSchema}].[Action] ([CodeApprovedByUserID]);

-- Index for foreign key ParentID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_ParentID ON [${flyway:defaultSchema}].[Action] ([ParentID]);

-- Index for foreign key DefaultCompactPromptID in table Action
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Action_DefaultCompactPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Action_DefaultCompactPromptID ON [${flyway:defaultSchema}].[Action] ([DefaultCompactPromptID]);

/* Root ID Function SQL for Actions.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: fnActionParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Action].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnActionParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnActionParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnActionParentID_GetRootID]
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
            [${flyway:defaultSchema}].[Action]
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
            [${flyway:defaultSchema}].[Action] c
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


/* Base View SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: vwActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Actions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Action
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwActions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwActions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActions]
AS
SELECT
    a.*,
    ActionCategory_CategoryID.[Name] AS [Category],
    User_CodeApprovedByUserID.[Name] AS [CodeApprovedByUser],
    Action_ParentID.[Name] AS [Parent],
    AIPrompt_DefaultCompactPromptID.[Name] AS [DefaultCompactPrompt],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[Action] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ActionCategory] AS ActionCategory_CategoryID
  ON
    [a].[CategoryID] = ActionCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_CodeApprovedByUserID
  ON
    [a].[CodeApprovedByUserID] = User_CodeApprovedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ParentID
  ON
    [a].[ParentID] = Action_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_DefaultCompactPromptID
  ON
    [a].[DefaultCompactPromptID] = AIPrompt_DefaultCompactPromptID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnActionParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: Permissions for vwActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: spCreateAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAction]
    @ID uniqueidentifier = NULL,
    @CategoryID uniqueidentifier,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20) = NULL,
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20) = NULL,
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID uniqueidentifier,
    @CodeApprovedAt datetimeoffset,
    @CodeLocked bit = NULL,
    @ForceCodeGeneration bit = NULL,
    @RetentionPeriod int,
    @Status nvarchar(20) = NULL,
    @DriverClass nvarchar(255),
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100),
    @DefaultCompactPromptID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Action]
            (
                [ID],
                [CategoryID],
                [Name],
                [Description],
                [Type],
                [UserPrompt],
                [UserComments],
                [Code],
                [CodeComments],
                [CodeApprovalStatus],
                [CodeApprovalComments],
                [CodeApprovedByUserID],
                [CodeApprovedAt],
                [CodeLocked],
                [ForceCodeGeneration],
                [RetentionPeriod],
                [Status],
                [DriverClass],
                [ParentID],
                [IconClass],
                [DefaultCompactPromptID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CategoryID,
                @Name,
                @Description,
                ISNULL(@Type, 'Generated'),
                @UserPrompt,
                @UserComments,
                @Code,
                @CodeComments,
                ISNULL(@CodeApprovalStatus, 'Pending'),
                @CodeApprovalComments,
                @CodeApprovedByUserID,
                @CodeApprovedAt,
                ISNULL(@CodeLocked, 0),
                ISNULL(@ForceCodeGeneration, 0),
                @RetentionPeriod,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @ParentID,
                @IconClass,
                @DefaultCompactPromptID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Action]
            (
                [CategoryID],
                [Name],
                [Description],
                [Type],
                [UserPrompt],
                [UserComments],
                [Code],
                [CodeComments],
                [CodeApprovalStatus],
                [CodeApprovalComments],
                [CodeApprovedByUserID],
                [CodeApprovedAt],
                [CodeLocked],
                [ForceCodeGeneration],
                [RetentionPeriod],
                [Status],
                [DriverClass],
                [ParentID],
                [IconClass],
                [DefaultCompactPromptID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CategoryID,
                @Name,
                @Description,
                ISNULL(@Type, 'Generated'),
                @UserPrompt,
                @UserComments,
                @Code,
                @CodeComments,
                ISNULL(@CodeApprovalStatus, 'Pending'),
                @CodeApprovalComments,
                @CodeApprovedByUserID,
                @CodeApprovedAt,
                ISNULL(@CodeLocked, 0),
                ISNULL(@ForceCodeGeneration, 0),
                @RetentionPeriod,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @ParentID,
                @IconClass,
                @DefaultCompactPromptID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAction] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAction] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: spUpdateAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAction]
    @ID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID uniqueidentifier,
    @CodeApprovedAt datetimeoffset,
    @CodeLocked bit,
    @ForceCodeGeneration bit,
    @RetentionPeriod int,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100),
    @DefaultCompactPromptID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Action]
    SET
        [CategoryID] = @CategoryID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [UserPrompt] = @UserPrompt,
        [UserComments] = @UserComments,
        [Code] = @Code,
        [CodeComments] = @CodeComments,
        [CodeApprovalStatus] = @CodeApprovalStatus,
        [CodeApprovalComments] = @CodeApprovalComments,
        [CodeApprovedByUserID] = @CodeApprovedByUserID,
        [CodeApprovedAt] = @CodeApprovedAt,
        [CodeLocked] = @CodeLocked,
        [ForceCodeGeneration] = @ForceCodeGeneration,
        [RetentionPeriod] = @RetentionPeriod,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [ParentID] = @ParentID,
        [IconClass] = @IconClass,
        [DefaultCompactPromptID] = @DefaultCompactPromptID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwActions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAction] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Action table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAction]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAction];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAction
ON [${flyway:defaultSchema}].[Action]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Action]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Action] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAction] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Actions
-- Item: spDeleteAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Action]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration]
    

/* spDelete Permissions for Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration]



/* Index for Foreign Keys for AIAgentRequest */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRequest_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRequest_AgentID ON [${flyway:defaultSchema}].[AIAgentRequest] ([AgentID]);

-- Index for foreign key RequestForUserID in table AIAgentRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRequest_RequestForUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRequest_RequestForUserID ON [${flyway:defaultSchema}].[AIAgentRequest] ([RequestForUserID]);

-- Index for foreign key ResponseByUserID in table AIAgentRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRequest_ResponseByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRequest_ResponseByUserID ON [${flyway:defaultSchema}].[AIAgentRequest] ([ResponseByUserID]);

/* Base View SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: vwAIAgentRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agent Requests
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRequest
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRequests]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRequests];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRequests]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    User_RequestForUserID.[Name] AS [RequestForUser],
    User_ResponseByUserID.[Name] AS [ResponseByUser]
FROM
    [${flyway:defaultSchema}].[AIAgentRequest] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_RequestForUserID
  ON
    [a].[RequestForUserID] = User_RequestForUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_ResponseByUserID
  ON
    [a].[ResponseByUserID] = User_ResponseByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: Permissions for vwAIAgentRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: spCreateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRequest]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @RequestedAt datetimeoffset,
    @RequestForUserID uniqueidentifier,
    @Status nvarchar(20),
    @Request nvarchar(MAX),
    @Response nvarchar(MAX),
    @ResponseByUserID uniqueidentifier,
    @RespondedAt datetimeoffset,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRequest]
            (
                [ID],
                [AgentID],
                [RequestedAt],
                [RequestForUserID],
                [Status],
                [Request],
                [Response],
                [ResponseByUserID],
                [RespondedAt],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @RequestedAt,
                @RequestForUserID,
                @Status,
                @Request,
                @Response,
                @ResponseByUserID,
                @RespondedAt,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRequest]
            (
                [AgentID],
                [RequestedAt],
                [RequestForUserID],
                [Status],
                [Request],
                [Response],
                [ResponseByUserID],
                [RespondedAt],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @RequestedAt,
                @RequestForUserID,
                @Status,
                @Request,
                @Response,
                @ResponseByUserID,
                @RespondedAt,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRequests] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: spUpdateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRequest]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @RequestedAt datetimeoffset,
    @RequestForUserID uniqueidentifier,
    @Status nvarchar(20),
    @Request nvarchar(MAX),
    @Response nvarchar(MAX),
    @ResponseByUserID uniqueidentifier,
    @RespondedAt datetimeoffset,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRequest]
    SET
        [AgentID] = @AgentID,
        [RequestedAt] = @RequestedAt,
        [RequestForUserID] = @RequestForUserID,
        [Status] = @Status,
        [Request] = @Request,
        [Response] = @Response,
        [ResponseByUserID] = @ResponseByUserID,
        [RespondedAt] = @RespondedAt,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRequests] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRequests]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRequest table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRequest]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRequest];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRequest
ON [${flyway:defaultSchema}].[AIAgentRequest]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRequest]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRequest] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: spDeleteAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRequest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRequest]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRequest] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRequest] TO [cdp_Integration]



/* Index for Foreign Keys for CommunicationLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CommunicationProviderID in table CommunicationLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CommunicationLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationProviderID ON [${flyway:defaultSchema}].[CommunicationLog] ([CommunicationProviderID]);

-- Index for foreign key CommunicationProviderMessageTypeID in table CommunicationLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationProviderMessageTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CommunicationLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationProviderMessageTypeID ON [${flyway:defaultSchema}].[CommunicationLog] ([CommunicationProviderMessageTypeID]);

-- Index for foreign key CommunicationRunID in table CommunicationLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CommunicationLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CommunicationLog_CommunicationRunID ON [${flyway:defaultSchema}].[CommunicationLog] ([CommunicationRunID]);

/* Base View SQL for Communication Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: vwCommunicationLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Communication Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CommunicationLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCommunicationLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCommunicationLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCommunicationLogs]
AS
SELECT
    c.*,
    CommunicationProvider_CommunicationProviderID.[Name] AS [CommunicationProvider],
    CommunicationProviderMessageType_CommunicationProviderMessageTypeID.[Name] AS [CommunicationProviderMessageType],
    CommunicationRun_CommunicationRunID.[User] AS [CommunicationRun]
FROM
    [${flyway:defaultSchema}].[CommunicationLog] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CommunicationProvider] AS CommunicationProvider_CommunicationProviderID
  ON
    [c].[CommunicationProviderID] = CommunicationProvider_CommunicationProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[CommunicationProviderMessageType] AS CommunicationProviderMessageType_CommunicationProviderMessageTypeID
  ON
    [c].[CommunicationProviderMessageTypeID] = CommunicationProviderMessageType_CommunicationProviderMessageTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwCommunicationRuns] AS CommunicationRun_CommunicationRunID
  ON
    [c].[CommunicationRunID] = CommunicationRun_CommunicationRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationLogs] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for Communication Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: Permissions for vwCommunicationLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationLogs] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Communication Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: spCreateCommunicationLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommunicationLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCommunicationLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationLog]
    @ID uniqueidentifier = NULL,
    @CommunicationProviderID uniqueidentifier,
    @CommunicationProviderMessageTypeID uniqueidentifier,
    @CommunicationRunID uniqueidentifier,
    @Direction nvarchar(20),
    @MessageDate datetimeoffset,
    @Status nvarchar(20) = NULL,
    @MessageContent nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CommunicationLog]
            (
                [ID],
                [CommunicationProviderID],
                [CommunicationProviderMessageTypeID],
                [CommunicationRunID],
                [Direction],
                [MessageDate],
                [Status],
                [MessageContent],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CommunicationProviderID,
                @CommunicationProviderMessageTypeID,
                @CommunicationRunID,
                @Direction,
                @MessageDate,
                ISNULL(@Status, 'Pending'),
                @MessageContent,
                @ErrorMessage
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CommunicationLog]
            (
                [CommunicationProviderID],
                [CommunicationProviderMessageTypeID],
                [CommunicationRunID],
                [Direction],
                [MessageDate],
                [Status],
                [MessageContent],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CommunicationProviderID,
                @CommunicationProviderMessageTypeID,
                @CommunicationRunID,
                @Direction,
                @MessageDate,
                ISNULL(@Status, 'Pending'),
                @MessageContent,
                @ErrorMessage
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCommunicationLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Communication Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Communication Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: spUpdateCommunicationLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommunicationLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCommunicationLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationLog]
    @ID uniqueidentifier,
    @CommunicationProviderID uniqueidentifier,
    @CommunicationProviderMessageTypeID uniqueidentifier,
    @CommunicationRunID uniqueidentifier,
    @Direction nvarchar(20),
    @MessageDate datetimeoffset,
    @Status nvarchar(20),
    @MessageContent nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationLog]
    SET
        [CommunicationProviderID] = @CommunicationProviderID,
        [CommunicationProviderMessageTypeID] = @CommunicationProviderMessageTypeID,
        [CommunicationRunID] = @CommunicationRunID,
        [Direction] = @Direction,
        [MessageDate] = @MessageDate,
        [Status] = @Status,
        [MessageContent] = @MessageContent,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCommunicationLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCommunicationLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommunicationLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCommunicationLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCommunicationLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCommunicationLog
ON [${flyway:defaultSchema}].[CommunicationLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CommunicationLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Communication Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Communication Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Logs
-- Item: spDeleteCommunicationLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommunicationLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCommunicationLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CommunicationLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationLog] TO [cdp_Integration]
    

/* spDelete Permissions for Communication Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationLog] TO [cdp_Integration]



/* Index for Foreign Keys for CommunicationRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table CommunicationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CommunicationRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CommunicationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CommunicationRun_UserID ON [${flyway:defaultSchema}].[CommunicationRun] ([UserID]);

/* Index for Foreign Keys for CompanyIntegrationRunAPILog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationRunID in table CompanyIntegrationRunAPILog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRunAPILog_CompanyIntegrationRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRunAPILog_CompanyIntegrationRunID ON [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog] ([CompanyIntegrationRunID]);

/* Base View SQL for Communication Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: vwCommunicationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Communication Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CommunicationRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCommunicationRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCommunicationRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCommunicationRuns]
AS
SELECT
    c.*,
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[CommunicationRun] AS c
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Communication Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: Permissions for vwCommunicationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Communication Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: spCreateCommunicationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommunicationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCommunicationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationRun]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @Direction nvarchar(20),
    @Status nvarchar(20),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Comments nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CommunicationRun]
            (
                [ID],
                [UserID],
                [Direction],
                [Status],
                [StartedAt],
                [EndedAt],
                [Comments],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @Direction,
                @Status,
                @StartedAt,
                @EndedAt,
                @Comments,
                @ErrorMessage
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CommunicationRun]
            (
                [UserID],
                [Direction],
                [Status],
                [StartedAt],
                [EndedAt],
                [Comments],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @Direction,
                @Status,
                @StartedAt,
                @EndedAt,
                @Comments,
                @ErrorMessage
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCommunicationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Communication Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Communication Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: spUpdateCommunicationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommunicationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCommunicationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationRun]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @Direction nvarchar(20),
    @Status nvarchar(20),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Comments nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationRun]
    SET
        [UserID] = @UserID,
        [Direction] = @Direction,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Comments] = @Comments,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCommunicationRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCommunicationRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommunicationRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCommunicationRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCommunicationRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCommunicationRun
ON [${flyway:defaultSchema}].[CommunicationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CommunicationRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Communication Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Communication Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Runs
-- Item: spDeleteCommunicationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommunicationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCommunicationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CommunicationRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationRun] TO [cdp_Integration]
    

/* spDelete Permissions for Communication Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationRun] TO [cdp_Integration]



/* Base View SQL for Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: vwCompanyIntegrationRunAPILogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Company Integration Run API Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CompanyIntegrationRunAPILog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs]
AS
SELECT
    c.*,
    CompanyIntegrationRun_CompanyIntegrationRunID.[Integration] AS [CompanyIntegrationRun]
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog] AS c
INNER JOIN
    [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] AS CompanyIntegrationRun_CompanyIntegrationRunID
  ON
    [c].[CompanyIntegrationRunID] = CompanyIntegrationRun_CompanyIntegrationRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: Permissions for vwCompanyIntegrationRunAPILogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: spCreateCompanyIntegrationRunAPILog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationRunAPILog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationRunID uniqueidentifier,
    @ExecutedAt datetimeoffset = NULL,
    @IsSuccess bit = NULL,
    @RequestMethod nvarchar(12),
    @URL nvarchar(MAX),
    @Parameters nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
            (
                [ID],
                [CompanyIntegrationRunID],
                [ExecutedAt],
                [IsSuccess],
                [RequestMethod],
                [URL],
                [Parameters]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationRunID,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0),
                @RequestMethod,
                @URL,
                @Parameters
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
            (
                [CompanyIntegrationRunID],
                [ExecutedAt],
                [IsSuccess],
                [RequestMethod],
                [URL],
                [Parameters]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationRunID,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0),
                @RequestMethod,
                @URL,
                @Parameters
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Company Integration Run API Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: spUpdateCompanyIntegrationRunAPILog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationRunAPILog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog]
    @ID uniqueidentifier,
    @CompanyIntegrationRunID uniqueidentifier,
    @ExecutedAt datetimeoffset,
    @IsSuccess bit,
    @RequestMethod nvarchar(12),
    @URL nvarchar(MAX),
    @Parameters nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
    SET
        [CompanyIntegrationRunID] = @CompanyIntegrationRunID,
        [ExecutedAt] = @ExecutedAt,
        [IsSuccess] = @IsSuccess,
        [RequestMethod] = @RequestMethod,
        [URL] = @URL,
        [Parameters] = @Parameters
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationRunAPILogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRunAPILog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunAPILog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunAPILog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationRunAPILog
ON [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Company Integration Run API Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run API Logs
-- Item: spDeleteCompanyIntegrationRunAPILog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRunAPILog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunAPILog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunAPILog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunAPILog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Company Integration Run API Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for CompanyIntegrationRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationRunID in table CompanyIntegrationRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRunDetail_CompanyIntegrationRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRunDetail_CompanyIntegrationRunID ON [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] ([CompanyIntegrationRunID]);

-- Index for foreign key EntityID in table CompanyIntegrationRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRunDetail_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRunDetail_EntityID ON [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] ([EntityID]);

/* Base View Permissions SQL for Company Integration Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run Details
-- Item: Permissions for vwCompanyIntegrationRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationRunDetails] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Company Integration Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run Details
-- Item: spCreateCompanyIntegrationRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Action nchar(20),
    @ExecutedAt datetimeoffset = NULL,
    @IsSuccess bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
            (
                [ID],
                [CompanyIntegrationRunID],
                [EntityID],
                [RecordID],
                [Action],
                [ExecutedAt],
                [IsSuccess]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationRunID,
                @EntityID,
                @RecordID,
                @Action,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
            (
                [CompanyIntegrationRunID],
                [EntityID],
                [RecordID],
                [Action],
                [ExecutedAt],
                [IsSuccess]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationRunID,
                @EntityID,
                @RecordID,
                @Action,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Company Integration Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Company Integration Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run Details
-- Item: spUpdateCompanyIntegrationRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail]
    @ID uniqueidentifier,
    @CompanyIntegrationRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Action nchar(20),
    @ExecutedAt datetimeoffset,
    @IsSuccess bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
    SET
        [CompanyIntegrationRunID] = @CompanyIntegrationRunID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [Action] = @Action,
        [ExecutedAt] = @ExecutedAt,
        [IsSuccess] = @IsSuccess
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationRunDetail
ON [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Company Integration Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Company Integration Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Run Details
-- Item: spDeleteCompanyIntegrationRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Company Integration Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for CompanyIntegrationRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationID in table CompanyIntegrationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_CompanyIntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_CompanyIntegrationID ON [${flyway:defaultSchema}].[CompanyIntegrationRun] ([CompanyIntegrationID]);

-- Index for foreign key RunByUserID in table CompanyIntegrationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_RunByUserID ON [${flyway:defaultSchema}].[CompanyIntegrationRun] ([RunByUserID]);

/* Base View Permissions SQL for Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Runs
-- Item: Permissions for vwCompanyIntegrationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Runs
-- Item: spCreateCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @TotalRecords int,
    @Comments nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @ErrorLog nvarchar(MAX),
    @ConfigData nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun]
            (
                [ID],
                [CompanyIntegrationID],
                [RunByUserID],
                [StartedAt],
                [EndedAt],
                [TotalRecords],
                [Comments],
                [Status],
                [ErrorLog],
                [ConfigData]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationID,
                @RunByUserID,
                @StartedAt,
                @EndedAt,
                @TotalRecords,
                @Comments,
                ISNULL(@Status, 'Pending'),
                @ErrorLog,
                @ConfigData
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun]
            (
                [CompanyIntegrationID],
                [RunByUserID],
                [StartedAt],
                [EndedAt],
                [TotalRecords],
                [Comments],
                [Status],
                [ErrorLog],
                [ConfigData]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationID,
                @RunByUserID,
                @StartedAt,
                @EndedAt,
                @TotalRecords,
                @Comments,
                ISNULL(@Status, 'Pending'),
                @ErrorLog,
                @ConfigData
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Company Integration Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Runs
-- Item: spUpdateCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun]
    @ID uniqueidentifier,
    @CompanyIntegrationID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @TotalRecords int,
    @Comments nvarchar(MAX),
    @Status nvarchar(20),
    @ErrorLog nvarchar(MAX),
    @ConfigData nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRun]
    SET
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [RunByUserID] = @RunByUserID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [TotalRecords] = @TotalRecords,
        [Comments] = @Comments,
        [Status] = @Status,
        [ErrorLog] = @ErrorLog,
        [ConfigData] = @ConfigData
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationRun
ON [${flyway:defaultSchema}].[CompanyIntegrationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Company Integration Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integration Runs
-- Item: spDeleteCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Company Integration Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for CompanyIntegration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID ON [${flyway:defaultSchema}].[CompanyIntegration] ([CompanyID]);

-- Index for foreign key IntegrationID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID ON [${flyway:defaultSchema}].[CompanyIntegration] ([IntegrationID]);

/* Base View Permissions SQL for Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integrations
-- Item: Permissions for vwCompanyIntegrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrations] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integrations
-- Item: spCreateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegration]
    @ID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetimeoffset,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit = NULL,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255),
    @Name nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (
                [ID],
                [CompanyID],
                [IntegrationID],
                [IsActive],
                [AccessToken],
                [RefreshToken],
                [TokenExpirationDate],
                [APIKey],
                [ExternalSystemID],
                [IsExternalSystemReadOnly],
                [ClientID],
                [ClientSecret],
                [CustomAttribute1],
                [Name]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyID,
                @IntegrationID,
                @IsActive,
                @AccessToken,
                @RefreshToken,
                @TokenExpirationDate,
                @APIKey,
                @ExternalSystemID,
                ISNULL(@IsExternalSystemReadOnly, 0),
                @ClientID,
                @ClientSecret,
                @CustomAttribute1,
                @Name
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (
                [CompanyID],
                [IntegrationID],
                [IsActive],
                [AccessToken],
                [RefreshToken],
                [TokenExpirationDate],
                [APIKey],
                [ExternalSystemID],
                [IsExternalSystemReadOnly],
                [ClientID],
                [ClientSecret],
                [CustomAttribute1],
                [Name]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyID,
                @IntegrationID,
                @IsActive,
                @AccessToken,
                @RefreshToken,
                @TokenExpirationDate,
                @APIKey,
                @ExternalSystemID,
                ISNULL(@IsExternalSystemReadOnly, 0),
                @ClientID,
                @ClientSecret,
                @CustomAttribute1,
                @Name
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integrations
-- Item: spUpdateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegration]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetimeoffset,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255),
    @Name nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegration]
    SET
        [CompanyID] = @CompanyID,
        [IntegrationID] = @IntegrationID,
        [IsActive] = @IsActive,
        [AccessToken] = @AccessToken,
        [RefreshToken] = @RefreshToken,
        [TokenExpirationDate] = @TokenExpirationDate,
        [APIKey] = @APIKey,
        [ExternalSystemID] = @ExternalSystemID,
        [IsExternalSystemReadOnly] = @IsExternalSystemReadOnly,
        [ClientID] = @ClientID,
        [ClientSecret] = @ClientSecret,
        [CustomAttribute1] = @CustomAttribute1,
        [Name] = @Name
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegration
ON [${flyway:defaultSchema}].[CompanyIntegration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Integrations
-- Item: spDeleteCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* SQL text to update entity field related entity name field map for entity field ID 1552433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1552433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 3F52433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3F52433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID C151433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C151433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* Index for Foreign Keys for ContentProcessRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SourceID in table ContentProcessRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRun_SourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRun_SourceID ON [${flyway:defaultSchema}].[ContentProcessRun] ([SourceID]);

/* SQL text to update entity field related entity name field map for entity field ID 4050433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4050433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID B050433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B050433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* Base View SQL for Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: vwContentProcessRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Content Process Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentProcessRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentProcessRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentProcessRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentProcessRuns]
AS
SELECT
    c.*,
    ContentSource_SourceID.[Name] AS [Source]
FROM
    [${flyway:defaultSchema}].[ContentProcessRun] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS ContentSource_SourceID
  ON
    [c].[SourceID] = ContentSource_SourceID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: Permissions for vwContentProcessRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: spCreateContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRun]
    @ID uniqueidentifier = NULL,
    @SourceID uniqueidentifier,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @Status nvarchar(100),
    @ProcessedItems int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRun]
            (
                [ID],
                [SourceID],
                [StartTime],
                [EndTime],
                [Status],
                [ProcessedItems]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SourceID,
                @StartTime,
                @EndTime,
                @Status,
                @ProcessedItems
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRun]
            (
                [SourceID],
                [StartTime],
                [EndTime],
                [Status],
                [ProcessedItems]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SourceID,
                @StartTime,
                @EndTime,
                @Status,
                @ProcessedItems
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentProcessRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: spUpdateContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRun]
    @ID uniqueidentifier,
    @SourceID uniqueidentifier,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @Status nvarchar(100),
    @ProcessedItems int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRun]
    SET
        [SourceID] = @SourceID,
        [StartTime] = @StartTime,
        [EndTime] = @EndTime,
        [Status] = @Status,
        [ProcessedItems] = @ProcessedItems
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentProcessRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentProcessRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentProcessRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentProcessRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentProcessRun
ON [${flyway:defaultSchema}].[ContentProcessRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentProcessRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Process Runs
-- Item: spDeleteContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentProcessRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRun] TO [cdp_Integration]
    

/* spDelete Permissions for Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRun] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID D651433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D651433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID DD51433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DD51433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID E451433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E451433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 7F50433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7F50433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 4351433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4351433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* Index for Foreign Keys for ConversationDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID ON [${flyway:defaultSchema}].[ConversationDetail] ([ConversationID]);

-- Index for foreign key UserID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_UserID ON [${flyway:defaultSchema}].[ConversationDetail] ([UserID]);

-- Index for foreign key ArtifactID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactID]);

-- Index for foreign key ArtifactVersionID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactVersionID]);

-- Index for foreign key ParentID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ParentID ON [${flyway:defaultSchema}].[ConversationDetail] ([ParentID]);

-- Index for foreign key AgentID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_AgentID ON [${flyway:defaultSchema}].[ConversationDetail] ([AgentID]);

-- Index for foreign key TestRunID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_TestRunID ON [${flyway:defaultSchema}].[ConversationDetail] ([TestRunID]);

/* Root ID Function SQL for Conversation Details.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: fnConversationDetailParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ConversationDetail].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]
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
            [${flyway:defaultSchema}].[ConversationDetail]
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
            [${flyway:defaultSchema}].[ConversationDetail] c
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


/* Base View SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Conversation Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetails]
AS
SELECT
    c.*,
    Conversation_ConversationID.[Name] AS [Conversation],
    User_UserID.[Name] AS [User],
    ConversationArtifact_ArtifactID.[Name] AS [Artifact],
    ConversationArtifactVersion_ArtifactVersionID.[ConversationArtifact] AS [ArtifactVersion],
    ConversationDetail_ParentID.[Message] AS [Parent],
    AIAgent_AgentID.[Name] AS [Agent],
    TestRun_TestRunID.[Test] AS [TestRun],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[ConversationDetail] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [c].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS ConversationArtifact_ArtifactID
  ON
    [c].[ArtifactID] = ConversationArtifact_ArtifactID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwConversationArtifactVersions] AS ConversationArtifactVersion_ArtifactVersionID
  ON
    [c].[ArtifactVersionID] = ConversationArtifactVersion_ArtifactVersionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS ConversationDetail_ParentID
  ON
    [c].[ParentID] = ConversationDetail_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [c].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS TestRun_TestRunID
  ON
    [c].[TestRunID] = TestRun_TestRunID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]([c].[ID], [c].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: Permissions for vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spCreateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail]
    @ID uniqueidentifier = NULL,
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20) = NULL,
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit = NULL,
    @UserRating int,
    @UserFeedback nvarchar(MAX),
    @ReflectionInsights nvarchar(MAX),
    @SummaryOfEarlierConversation nvarchar(MAX),
    @UserID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CompletionTime bigint,
    @IsPinned bit = NULL,
    @ParentID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @SuggestedResponses nvarchar(MAX),
    @TestRunID uniqueidentifier,
    @ResponseForm nvarchar(MAX),
    @ActionableCommands nvarchar(MAX),
    @AutomaticCommands nvarchar(MAX),
    @OriginalMessageChanged bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ID],
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationID,
                @ExternalID,
                ISNULL(@Role, user_name()),
                @Message,
                @Error,
                ISNULL(@HiddenToUser, 0),
                @UserRating,
                @UserFeedback,
                @ReflectionInsights,
                @SummaryOfEarlierConversation,
                @UserID,
                @ArtifactID,
                @ArtifactVersionID,
                @CompletionTime,
                ISNULL(@IsPinned, 0),
                @ParentID,
                @AgentID,
                ISNULL(@Status, 'Complete'),
                @SuggestedResponses,
                @TestRunID,
                @ResponseForm,
                @ActionableCommands,
                @AutomaticCommands,
                ISNULL(@OriginalMessageChanged, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationID,
                @ExternalID,
                ISNULL(@Role, user_name()),
                @Message,
                @Error,
                ISNULL(@HiddenToUser, 0),
                @UserRating,
                @UserFeedback,
                @ReflectionInsights,
                @SummaryOfEarlierConversation,
                @UserID,
                @ArtifactID,
                @ArtifactVersionID,
                @CompletionTime,
                ISNULL(@IsPinned, 0),
                @ParentID,
                @AgentID,
                ISNULL(@Status, 'Complete'),
                @SuggestedResponses,
                @TestRunID,
                @ResponseForm,
                @ActionableCommands,
                @AutomaticCommands,
                ISNULL(@OriginalMessageChanged, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spUpdate SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spUpdateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail]
    @ID uniqueidentifier,
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit,
    @UserRating int,
    @UserFeedback nvarchar(MAX),
    @ReflectionInsights nvarchar(MAX),
    @SummaryOfEarlierConversation nvarchar(MAX),
    @UserID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CompletionTime bigint,
    @IsPinned bit,
    @ParentID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(20),
    @SuggestedResponses nvarchar(MAX),
    @TestRunID uniqueidentifier,
    @ResponseForm nvarchar(MAX),
    @ActionableCommands nvarchar(MAX),
    @AutomaticCommands nvarchar(MAX),
    @OriginalMessageChanged bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        [ConversationID] = @ConversationID,
        [ExternalID] = @ExternalID,
        [Role] = @Role,
        [Message] = @Message,
        [Error] = @Error,
        [HiddenToUser] = @HiddenToUser,
        [UserRating] = @UserRating,
        [UserFeedback] = @UserFeedback,
        [ReflectionInsights] = @ReflectionInsights,
        [SummaryOfEarlierConversation] = @SummaryOfEarlierConversation,
        [UserID] = @UserID,
        [ArtifactID] = @ArtifactID,
        [ArtifactVersionID] = @ArtifactVersionID,
        [CompletionTime] = @CompletionTime,
        [IsPinned] = @IsPinned,
        [ParentID] = @ParentID,
        [AgentID] = @AgentID,
        [Status] = @Status,
        [SuggestedResponses] = @SuggestedResponses,
        [TestRunID] = @TestRunID,
        [ResponseForm] = @ResponseForm,
        [ActionableCommands] = @ActionableCommands,
        [AutomaticCommands] = @AutomaticCommands,
        [OriginalMessageChanged] = @OriginalMessageChanged
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationDetail
ON [${flyway:defaultSchema}].[ConversationDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spDelete SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @AIAgentNotesID uniqueidentifier
    DECLARE @AIAgentNotes_AgentID uniqueidentifier
    DECLARE @AIAgentNotes_AgentNoteTypeID uniqueidentifier
    DECLARE @AIAgentNotes_Note nvarchar(MAX)
    DECLARE @AIAgentNotes_UserID uniqueidentifier
    DECLARE @AIAgentNotes_Type nvarchar(20)
    DECLARE @AIAgentNotes_IsAutoGenerated bit
    DECLARE @AIAgentNotes_Comments nvarchar(MAX)
    DECLARE @AIAgentNotes_Status nvarchar(20)
    DECLARE @AIAgentNotes_SourceConversationID uniqueidentifier
    DECLARE @AIAgentNotes_SourceConversationDetailID uniqueidentifier
    DECLARE @AIAgentNotes_SourceAIAgentRunID uniqueidentifier
    DECLARE @AIAgentNotes_CompanyID uniqueidentifier
    DECLARE @AIAgentNotes_EmbeddingVector nvarchar(MAX)
    DECLARE @AIAgentNotes_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_AIAgentNotes_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationDetailID] = @ID
    
    OPEN cascade_update_AIAgentNotes_cursor
    FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @AIAgentNotes_SourceConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @AIAgentNotesID, @AgentID = @AIAgentNotes_AgentID, @AgentNoteTypeID = @AIAgentNotes_AgentNoteTypeID, @Note = @AIAgentNotes_Note, @UserID = @AIAgentNotes_UserID, @Type = @AIAgentNotes_Type, @IsAutoGenerated = @AIAgentNotes_IsAutoGenerated, @Comments = @AIAgentNotes_Comments, @Status = @AIAgentNotes_Status, @SourceConversationID = @AIAgentNotes_SourceConversationID, @SourceConversationDetailID = @AIAgentNotes_SourceConversationDetailID, @SourceAIAgentRunID = @AIAgentNotes_SourceAIAgentRunID, @CompanyID = @AIAgentNotes_CompanyID, @EmbeddingVector = @AIAgentNotes_EmbeddingVector, @EmbeddingModelID = @AIAgentNotes_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    END
    
    CLOSE cascade_update_AIAgentNotes_cursor
    DEALLOCATE cascade_update_AIAgentNotes_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE @ConversationDetails_ConversationID uniqueidentifier
    DECLARE @ConversationDetails_ExternalID nvarchar(100)
    DECLARE @ConversationDetails_Role nvarchar(20)
    DECLARE @ConversationDetails_Message nvarchar(MAX)
    DECLARE @ConversationDetails_Error nvarchar(MAX)
    DECLARE @ConversationDetails_HiddenToUser bit
    DECLARE @ConversationDetails_UserRating int
    DECLARE @ConversationDetails_UserFeedback nvarchar(MAX)
    DECLARE @ConversationDetails_ReflectionInsights nvarchar(MAX)
    DECLARE @ConversationDetails_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @ConversationDetails_UserID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactVersionID uniqueidentifier
    DECLARE @ConversationDetails_CompletionTime bigint
    DECLARE @ConversationDetails_IsPinned bit
    DECLARE @ConversationDetails_ParentID uniqueidentifier
    DECLARE @ConversationDetails_AgentID uniqueidentifier
    DECLARE @ConversationDetails_Status nvarchar(20)
    DECLARE @ConversationDetails_SuggestedResponses nvarchar(MAX)
    DECLARE @ConversationDetails_TestRunID uniqueidentifier
    DECLARE @ConversationDetails_ResponseForm nvarchar(MAX)
    DECLARE @ConversationDetails_ActionableCommands nvarchar(MAX)
    DECLARE @ConversationDetails_AutomaticCommands nvarchar(MAX)
    DECLARE @ConversationDetails_OriginalMessageChanged bit
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ParentID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses, @TestRunID = @ConversationDetails_TestRunID, @ResponseForm = @ConversationDetails_ResponseForm, @ActionableCommands = @ConversationDetails_ActionableCommands, @AutomaticCommands = @ConversationDetails_AutomaticCommands, @OriginalMessageChanged = @ConversationDetails_OriginalMessageChanged
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJ_AIAgentExamplesID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_UserID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_CompanyID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_Type nvarchar(20)
    DECLARE @MJ_AIAgentExamples_ExampleInput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_ExampleOutput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_IsAutoGenerated bit
    DECLARE @MJ_AIAgentExamples_SourceConversationID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SuccessScore decimal(5, 2)
    DECLARE @MJ_AIAgentExamples_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_Status nvarchar(20)
    DECLARE @MJ_AIAgentExamples_EmbeddingVector nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentExamples_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentExamples_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentExamples_SourceConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJ_AIAgentExamplesID, @AgentID = @MJ_AIAgentExamples_AgentID, @UserID = @MJ_AIAgentExamples_UserID, @CompanyID = @MJ_AIAgentExamples_CompanyID, @Type = @MJ_AIAgentExamples_Type, @ExampleInput = @MJ_AIAgentExamples_ExampleInput, @ExampleOutput = @MJ_AIAgentExamples_ExampleOutput, @IsAutoGenerated = @MJ_AIAgentExamples_IsAutoGenerated, @SourceConversationID = @MJ_AIAgentExamples_SourceConversationID, @SourceConversationDetailID = @MJ_AIAgentExamples_SourceConversationDetailID, @SourceAIAgentRunID = @MJ_AIAgentExamples_SourceAIAgentRunID, @SuccessScore = @MJ_AIAgentExamples_SuccessScore, @Comments = @MJ_AIAgentExamples_Comments, @Status = @MJ_AIAgentExamples_Status, @EmbeddingVector = @MJ_AIAgentExamples_EmbeddingVector, @EmbeddingModelID = @MJ_AIAgentExamples_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    END
    
    CLOSE cascade_update_MJ_AIAgentExamples_cursor
    DEALLOCATE cascade_update_MJ_AIAgentExamples_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJ_AIAgentRunsID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ParentRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Status nvarchar(50)
    DECLARE @MJ_AIAgentRuns_StartedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_CompletedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_Success bit
    DECLARE @MJ_AIAgentRuns_ErrorMessage nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ConversationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_UserID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Result nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_AgentState nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCost decimal(18, 6)
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCostRollup decimal(19, 8)
    DECLARE @MJ_AIAgentRuns_ConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ConversationDetailSequence int
    DECLARE @MJ_AIAgentRuns_CancellationReason nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalStep nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Message nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_LastRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_StartingPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalPromptIterations int
    DECLARE @MJ_AIAgentRuns_ConfigurationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideModelID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideVendorID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Data nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Verbose bit
    DECLARE @MJ_AIAgentRuns_EffortLevel int
    DECLARE @MJ_AIAgentRuns_RunName nvarchar(255)
    DECLARE @MJ_AIAgentRuns_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ScheduledJobRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_TestRunID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID, @TestRunID = @MJ_AIAgentRuns_TestRunID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJ_ConversationDetailArtifactsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailArtifacts_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailArtifacts_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJ_ConversationDetailArtifactsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating
    DECLARE @MJ_ConversationDetailRatingsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailRatings_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailRating]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailRatings_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailRatings_cursor INTO @MJ_ConversationDetailRatingsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailRating] @ID = @MJ_ConversationDetailRatingsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailRatings_cursor INTO @MJ_ConversationDetailRatingsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailRatings_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailRatings_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJ_TasksID uniqueidentifier
    DECLARE @MJ_Tasks_ParentID uniqueidentifier
    DECLARE @MJ_Tasks_Name nvarchar(255)
    DECLARE @MJ_Tasks_Description nvarchar(MAX)
    DECLARE @MJ_Tasks_TypeID uniqueidentifier
    DECLARE @MJ_Tasks_EnvironmentID uniqueidentifier
    DECLARE @MJ_Tasks_ProjectID uniqueidentifier
    DECLARE @MJ_Tasks_ConversationDetailID uniqueidentifier
    DECLARE @MJ_Tasks_UserID uniqueidentifier
    DECLARE @MJ_Tasks_AgentID uniqueidentifier
    DECLARE @MJ_Tasks_Status nvarchar(50)
    DECLARE @MJ_Tasks_PercentComplete int
    DECLARE @MJ_Tasks_DueAt datetimeoffset
    DECLARE @MJ_Tasks_StartedAt datetimeoffset
    DECLARE @MJ_Tasks_CompletedAt datetimeoffset
    DECLARE cascade_update_MJ_Tasks_cursor CURSOR FOR 
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_Tasks_cursor
    FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_Tasks_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJ_TasksID, @ParentID = @MJ_Tasks_ParentID, @Name = @MJ_Tasks_Name, @Description = @MJ_Tasks_Description, @TypeID = @MJ_Tasks_TypeID, @EnvironmentID = @MJ_Tasks_EnvironmentID, @ProjectID = @MJ_Tasks_ProjectID, @ConversationDetailID = @MJ_Tasks_ConversationDetailID, @UserID = @MJ_Tasks_UserID, @AgentID = @MJ_Tasks_AgentID, @Status = @MJ_Tasks_Status, @PercentComplete = @MJ_Tasks_PercentComplete, @DueAt = @MJ_Tasks_DueAt, @StartedAt = @MJ_Tasks_StartedAt, @CompletedAt = @MJ_Tasks_CompletedAt
        
        FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    END
    
    CLOSE cascade_update_MJ_Tasks_cursor
    DEALLOCATE cascade_update_MJ_Tasks_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @ReportsID uniqueidentifier
    DECLARE @Reports_Name nvarchar(255)
    DECLARE @Reports_Description nvarchar(MAX)
    DECLARE @Reports_CategoryID uniqueidentifier
    DECLARE @Reports_UserID uniqueidentifier
    DECLARE @Reports_SharingScope nvarchar(20)
    DECLARE @Reports_ConversationID uniqueidentifier
    DECLARE @Reports_ConversationDetailID uniqueidentifier
    DECLARE @Reports_DataContextID uniqueidentifier
    DECLARE @Reports_Configuration nvarchar(MAX)
    DECLARE @Reports_OutputTriggerTypeID uniqueidentifier
    DECLARE @Reports_OutputFormatTypeID uniqueidentifier
    DECLARE @Reports_OutputDeliveryTypeID uniqueidentifier
    DECLARE @Reports_OutputFrequency nvarchar(50)
    DECLARE @Reports_OutputTargetEmail nvarchar(255)
    DECLARE @Reports_OutputWorkflowID uniqueidentifier
    DECLARE @Reports_Thumbnail nvarchar(MAX)
    DECLARE @Reports_EnvironmentID uniqueidentifier
    DECLARE cascade_update_Reports_cursor CURSOR FOR 
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_Reports_cursor
    FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @Reports_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @ReportsID, @Name = @Reports_Name, @Description = @Reports_Description, @CategoryID = @Reports_CategoryID, @UserID = @Reports_UserID, @SharingScope = @Reports_SharingScope, @ConversationID = @Reports_ConversationID, @ConversationDetailID = @Reports_ConversationDetailID, @DataContextID = @Reports_DataContextID, @Configuration = @Reports_Configuration, @OutputTriggerTypeID = @Reports_OutputTriggerTypeID, @OutputFormatTypeID = @Reports_OutputFormatTypeID, @OutputDeliveryTypeID = @Reports_OutputDeliveryTypeID, @OutputFrequency = @Reports_OutputFrequency, @OutputTargetEmail = @Reports_OutputTargetEmail, @OutputWorkflowID = @Reports_OutputWorkflowID, @Thumbnail = @Reports_Thumbnail, @EnvironmentID = @Reports_EnvironmentID
        
        FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    END
    
    CLOSE cascade_update_Reports_cursor
    DEALLOCATE cascade_update_Reports_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 8650433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8650433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 8D50433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8D50433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for DataContextItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DataContextID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_DataContextID ON [${flyway:defaultSchema}].[DataContextItem] ([DataContextID]);

-- Index for foreign key ViewID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_ViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_ViewID ON [${flyway:defaultSchema}].[DataContextItem] ([ViewID]);

-- Index for foreign key QueryID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_QueryID ON [${flyway:defaultSchema}].[DataContextItem] ([QueryID]);

-- Index for foreign key EntityID in table DataContextItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContextItem_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContextItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContextItem_EntityID ON [${flyway:defaultSchema}].[DataContextItem] ([EntityID]);

/* Index for Foreign Keys for DataContext */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table DataContext
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DataContext_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DataContext]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DataContext_UserID ON [${flyway:defaultSchema}].[DataContext] ([UserID]);

/* Base View SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: vwDataContextItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Data Context Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DataContextItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDataContextItems]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDataContextItems];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDataContextItems]
AS
SELECT
    d.*,
    DataContext_DataContextID.[Name] AS [DataContext],
    UserView_ViewID.[Name] AS [View],
    Query_QueryID.[Name] AS [Query],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[DataContextItem] AS d
INNER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [d].[DataContextID] = DataContext_DataContextID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserView] AS UserView_ViewID
  ON
    [d].[ViewID] = UserView_ViewID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Query] AS Query_QueryID
  ON
    [d].[QueryID] = Query_QueryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [d].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDataContextItems] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: Permissions for vwDataContextItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDataContextItems] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: spCreateDataContextItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DataContextItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDataContextItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDataContextItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDataContextItem]
    @ID uniqueidentifier = NULL,
    @DataContextID uniqueidentifier,
    @Type nvarchar(50),
    @ViewID uniqueidentifier,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @SQL nvarchar(MAX),
    @DataJSON nvarchar(MAX),
    @LastRefreshedAt datetimeoffset,
    @Description nvarchar(MAX),
    @CodeName nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DataContextItem]
            (
                [ID],
                [DataContextID],
                [Type],
                [ViewID],
                [QueryID],
                [EntityID],
                [RecordID],
                [SQL],
                [DataJSON],
                [LastRefreshedAt],
                [Description],
                [CodeName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DataContextID,
                @Type,
                @ViewID,
                @QueryID,
                @EntityID,
                @RecordID,
                @SQL,
                @DataJSON,
                @LastRefreshedAt,
                @Description,
                @CodeName
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DataContextItem]
            (
                [DataContextID],
                [Type],
                [ViewID],
                [QueryID],
                [EntityID],
                [RecordID],
                [SQL],
                [DataJSON],
                [LastRefreshedAt],
                [Description],
                [CodeName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DataContextID,
                @Type,
                @ViewID,
                @QueryID,
                @EntityID,
                @RecordID,
                @SQL,
                @DataJSON,
                @LastRefreshedAt,
                @Description,
                @CodeName
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDataContextItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Data Context Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: spUpdateDataContextItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DataContextItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDataContextItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDataContextItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDataContextItem]
    @ID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Type nvarchar(50),
    @ViewID uniqueidentifier,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @SQL nvarchar(MAX),
    @DataJSON nvarchar(MAX),
    @LastRefreshedAt datetimeoffset,
    @Description nvarchar(MAX),
    @CodeName nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DataContextItem]
    SET
        [DataContextID] = @DataContextID,
        [Type] = @Type,
        [ViewID] = @ViewID,
        [QueryID] = @QueryID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [SQL] = @SQL,
        [DataJSON] = @DataJSON,
        [LastRefreshedAt] = @LastRefreshedAt,
        [Description] = @Description,
        [CodeName] = @CodeName
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDataContextItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDataContextItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DataContextItem table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDataContextItem]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDataContextItem];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDataContextItem
ON [${flyway:defaultSchema}].[DataContextItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DataContextItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DataContextItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Data Context Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Context Items
-- Item: spDeleteDataContextItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DataContextItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDataContextItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDataContextItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDataContextItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DataContextItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Data Context Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDataContextItem] TO [cdp_UI], [cdp_Integration], [cdp_Developer]



/* Base View SQL for Data Contexts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: vwDataContexts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Data Contexts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DataContext
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDataContexts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDataContexts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDataContexts]
AS
SELECT
    d.*,
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[DataContext] AS d
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDataContexts] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for Data Contexts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: Permissions for vwDataContexts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDataContexts] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Data Contexts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: spCreateDataContext
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DataContext
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDataContext]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDataContext];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDataContext]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @LastRefreshedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DataContext]
            (
                [ID],
                [Name],
                [Description],
                [UserID],
                [LastRefreshedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @UserID,
                @LastRefreshedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DataContext]
            (
                [Name],
                [Description],
                [UserID],
                [LastRefreshedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @UserID,
                @LastRefreshedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDataContexts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for Data Contexts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for Data Contexts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: spUpdateDataContext
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DataContext
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDataContext]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDataContext];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDataContext]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @LastRefreshedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DataContext]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID,
        [LastRefreshedAt] = @LastRefreshedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDataContexts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDataContexts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DataContext table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDataContext]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDataContext];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDataContext
ON [${flyway:defaultSchema}].[DataContext]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DataContext]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DataContext] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Data Contexts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for Data Contexts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Data Contexts
-- Item: spDeleteDataContext
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DataContext
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDataContext]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDataContext];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDataContext]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DataContext]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spDelete Permissions for Data Contexts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDataContext] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* Index for Foreign Keys for DuplicateRunDetailMatch */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DuplicateRunDetailID in table DuplicateRunDetailMatch
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_DuplicateRunDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRunDetailMatch]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_DuplicateRunDetailID ON [${flyway:defaultSchema}].[DuplicateRunDetailMatch] ([DuplicateRunDetailID]);

-- Index for foreign key RecordMergeLogID in table DuplicateRunDetailMatch
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_RecordMergeLogID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRunDetailMatch]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_RecordMergeLogID ON [${flyway:defaultSchema}].[DuplicateRunDetailMatch] ([RecordMergeLogID]);

/* Index for Foreign Keys for DuplicateRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID ON [${flyway:defaultSchema}].[DuplicateRun] ([EntityID]);

-- Index for foreign key StartedByUserID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID ON [${flyway:defaultSchema}].[DuplicateRun] ([StartedByUserID]);

-- Index for foreign key SourceListID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID ON [${flyway:defaultSchema}].[DuplicateRun] ([SourceListID]);

-- Index for foreign key ApprovedByUserID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID ON [${flyway:defaultSchema}].[DuplicateRun] ([ApprovedByUserID]);

/* Base View SQL for Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: vwDuplicateRunDetailMatches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Duplicate Run Detail Matches
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DuplicateRunDetailMatch
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDuplicateRunDetailMatches]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches]
AS
SELECT
    d.*,
    DuplicateRunDetail_DuplicateRunDetailID.[RecordID] AS [DuplicateRunDetail],
    RecordMergeLog_RecordMergeLogID.[SurvivingRecordID] AS [RecordMergeLog]
FROM
    [${flyway:defaultSchema}].[DuplicateRunDetailMatch] AS d
INNER JOIN
    [${flyway:defaultSchema}].[DuplicateRunDetail] AS DuplicateRunDetail_DuplicateRunDetailID
  ON
    [d].[DuplicateRunDetailID] = DuplicateRunDetail_DuplicateRunDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RecordMergeLog] AS RecordMergeLog_RecordMergeLogID
  ON
    [d].[RecordMergeLogID] = RecordMergeLog_RecordMergeLogID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: Permissions for vwDuplicateRunDetailMatches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: spCreateDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch]
    @ID uniqueidentifier = NULL,
    @DuplicateRunDetailID uniqueidentifier,
    @MatchSource nvarchar(20) = NULL,
    @MatchRecordID nvarchar(500),
    @MatchProbability numeric(12, 11) = NULL,
    @MatchedAt datetimeoffset = NULL,
    @Action nvarchar(20) = NULL,
    @ApprovalStatus nvarchar(20) = NULL,
    @RecordMergeLogID uniqueidentifier,
    @MergeStatus nvarchar(20) = NULL,
    @MergedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
            (
                [ID],
                [DuplicateRunDetailID],
                [MatchSource],
                [MatchRecordID],
                [MatchProbability],
                [MatchedAt],
                [Action],
                [ApprovalStatus],
                [RecordMergeLogID],
                [MergeStatus],
                [MergedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DuplicateRunDetailID,
                ISNULL(@MatchSource, 'Vector'),
                @MatchRecordID,
                ISNULL(@MatchProbability, 0),
                ISNULL(@MatchedAt, sysdatetimeoffset()),
                ISNULL(@Action, 'Ignore'),
                ISNULL(@ApprovalStatus, 'Pending'),
                @RecordMergeLogID,
                ISNULL(@MergeStatus, 'Pending'),
                ISNULL(@MergedAt, sysdatetimeoffset())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
            (
                [DuplicateRunDetailID],
                [MatchSource],
                [MatchRecordID],
                [MatchProbability],
                [MatchedAt],
                [Action],
                [ApprovalStatus],
                [RecordMergeLogID],
                [MergeStatus],
                [MergedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DuplicateRunDetailID,
                ISNULL(@MatchSource, 'Vector'),
                @MatchRecordID,
                ISNULL(@MatchProbability, 0),
                ISNULL(@MatchedAt, sysdatetimeoffset()),
                ISNULL(@Action, 'Ignore'),
                ISNULL(@ApprovalStatus, 'Pending'),
                @RecordMergeLogID,
                ISNULL(@MergeStatus, 'Pending'),
                ISNULL(@MergedAt, sysdatetimeoffset())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Duplicate Run Detail Matches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: spUpdateDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch]
    @ID uniqueidentifier,
    @DuplicateRunDetailID uniqueidentifier,
    @MatchSource nvarchar(20),
    @MatchRecordID nvarchar(500),
    @MatchProbability numeric(12, 11),
    @MatchedAt datetimeoffset,
    @Action nvarchar(20),
    @ApprovalStatus nvarchar(20),
    @RecordMergeLogID uniqueidentifier,
    @MergeStatus nvarchar(20),
    @MergedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
    SET
        [DuplicateRunDetailID] = @DuplicateRunDetailID,
        [MatchSource] = @MatchSource,
        [MatchRecordID] = @MatchRecordID,
        [MatchProbability] = @MatchProbability,
        [MatchedAt] = @MatchedAt,
        [Action] = @Action,
        [ApprovalStatus] = @ApprovalStatus,
        [RecordMergeLogID] = @RecordMergeLogID,
        [MergeStatus] = @MergeStatus,
        [MergedAt] = @MergedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRunDetailMatch table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDuplicateRunDetailMatch]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDuplicateRunDetailMatch];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDuplicateRunDetailMatch
ON [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Duplicate Run Detail Matches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Run Detail Matches
-- Item: spDeleteDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch] TO [cdp_Integration]
    

/* spDelete Permissions for Duplicate Run Detail Matches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch] TO [cdp_Integration]



/* Base View SQL for Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Duplicate Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DuplicateRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDuplicateRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDuplicateRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDuplicateRuns]
AS
SELECT
    d.*,
    Entity_EntityID.[Name] AS [Entity],
    User_StartedByUserID.[Name] AS [StartedByUser],
    List_SourceListID.[Name] AS [SourceList],
    User_ApprovedByUserID.[Name] AS [ApprovedByUser]
FROM
    [${flyway:defaultSchema}].[DuplicateRun] AS d
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [d].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_StartedByUserID
  ON
    [d].[StartedByUserID] = User_StartedByUserID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[List] AS List_SourceListID
  ON
    [d].[SourceListID] = List_SourceListID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_ApprovedByUserID
  ON
    [d].[ApprovedByUserID] = User_ApprovedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: Permissions for vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: spCreateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRun]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @StartedByUserID uniqueidentifier,
    @SourceListID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @EndedAt datetimeoffset,
    @ApprovalStatus nvarchar(20) = NULL,
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(20) = NULL,
    @ProcessingErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRun]
            (
                [ID],
                [EntityID],
                [StartedByUserID],
                [SourceListID],
                [StartedAt],
                [EndedAt],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @StartedByUserID,
                @SourceListID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @EndedAt,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovalComments,
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                @ProcessingErrorMessage
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRun]
            (
                [EntityID],
                [StartedByUserID],
                [SourceListID],
                [StartedAt],
                [EndedAt],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @StartedByUserID,
                @SourceListID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @EndedAt,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovalComments,
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                @ProcessingErrorMessage
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDuplicateRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: spUpdateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRun]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @StartedByUserID uniqueidentifier,
    @SourceListID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @ApprovalStatus nvarchar(20),
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(20),
    @ProcessingErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRun]
    SET
        [EntityID] = @EntityID,
        [StartedByUserID] = @StartedByUserID,
        [SourceListID] = @SourceListID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovalComments] = @ApprovalComments,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingErrorMessage] = @ProcessingErrorMessage
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDuplicateRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDuplicateRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDuplicateRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDuplicateRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDuplicateRun
ON [${flyway:defaultSchema}].[DuplicateRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DuplicateRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Duplicate Runs
-- Item: spDeleteDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DuplicateRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] TO [cdp_Integration]
    

/* spDelete Permissions for Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] TO [cdp_Integration]



/* Index for Foreign Keys for EntityDocumentRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityDocumentID in table EntityDocumentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocumentRun_EntityDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocumentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocumentRun_EntityDocumentID ON [${flyway:defaultSchema}].[EntityDocumentRun] ([EntityDocumentID]);

/* Base View SQL for Entity Document Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: vwEntityDocumentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Entity Document Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityDocumentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityDocumentRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityDocumentRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityDocumentRuns]
AS
SELECT
    e.*,
    EntityDocument_EntityDocumentID.[Name] AS [EntityDocument]
FROM
    [${flyway:defaultSchema}].[EntityDocumentRun] AS e
INNER JOIN
    [${flyway:defaultSchema}].[EntityDocument] AS EntityDocument_EntityDocumentID
  ON
    [e].[EntityDocumentID] = EntityDocument_EntityDocumentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityDocumentRuns] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Entity Document Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: Permissions for vwEntityDocumentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityDocumentRuns] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Entity Document Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: spCreateEntityDocumentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityDocumentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityDocumentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityDocumentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityDocumentRun]
    @ID uniqueidentifier = NULL,
    @EntityDocumentID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(15) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityDocumentRun]
            (
                [ID],
                [EntityDocumentID],
                [StartedAt],
                [EndedAt],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityDocumentID,
                @StartedAt,
                @EndedAt,
                ISNULL(@Status, 'Pending')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityDocumentRun]
            (
                [EntityDocumentID],
                [StartedAt],
                [EndedAt],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityDocumentID,
                @StartedAt,
                @EndedAt,
                ISNULL(@Status, 'Pending')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityDocumentRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityDocumentRun] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Document Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityDocumentRun] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Document Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: spUpdateEntityDocumentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityDocumentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityDocumentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityDocumentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityDocumentRun]
    @ID uniqueidentifier,
    @EntityDocumentID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(15)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityDocumentRun]
    SET
        [EntityDocumentID] = @EntityDocumentID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityDocumentRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityDocumentRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityDocumentRun] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityDocumentRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityDocumentRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityDocumentRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityDocumentRun
ON [${flyway:defaultSchema}].[EntityDocumentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityDocumentRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityDocumentRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Document Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityDocumentRun] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Document Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Document Runs
-- Item: spDeleteEntityDocumentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityDocumentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityDocumentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityDocumentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityDocumentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityDocumentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocumentRun] TO [cdp_Integration]
    

/* spDelete Permissions for Entity Document Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocumentRun] TO [cdp_Integration]



/* Index for Foreign Keys for EntityFieldValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityFieldID in table EntityFieldValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFieldValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID ON [${flyway:defaultSchema}].[EntityFieldValue] ([EntityFieldID]);

/* Base View Permissions SQL for Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Values
-- Item: Permissions for vwEntityFieldValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFieldValues] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Values
-- Item: spCreateEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFieldValue]
    @ID uniqueidentifier = NULL,
    @EntityFieldID uniqueidentifier,
    @Sequence int,
    @Value nvarchar(255),
    @Code nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
            (
                [ID],
                [EntityFieldID],
                [Sequence],
                [Value],
                [Code],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityFieldID,
                @Sequence,
                @Value,
                @Code,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
            (
                [EntityFieldID],
                [Sequence],
                [Value],
                [Code],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityFieldID,
                @Sequence,
                @Value,
                @Code,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFieldValues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
    

/* spCreate Permissions for Entity Field Values */




/* spUpdate SQL for Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Values
-- Item: spUpdateEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFieldValue]
    @ID uniqueidentifier,
    @EntityFieldID uniqueidentifier,
    @Sequence int,
    @Value nvarchar(255),
    @Code nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFieldValue]
    SET
        [EntityFieldID] = @EntityFieldID,
        [Sequence] = @Sequence,
        [Value] = @Value,
        [Code] = @Code,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFieldValues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFieldValues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFieldValue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityFieldValue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityFieldValue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityFieldValue
ON [${flyway:defaultSchema}].[EntityFieldValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFieldValue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityFieldValue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Field Values */




/* spDelete SQL for Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Values
-- Item: spDeleteEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFieldValue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityFieldValue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for Entity Field Values */




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
    @SendEncryptedValue bit = NULL
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
                [SendEncryptedValue]
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
                ISNULL(@SendEncryptedValue, 0)
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
                [SendEncryptedValue]
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
                ISNULL(@SendEncryptedValue, 0)
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
    @SendEncryptedValue bit
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
        [SendEncryptedValue] = @SendEncryptedValue
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



/* Index for Foreign Keys for EntityRecordDocument */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityRecordDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRecordDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityID ON [${flyway:defaultSchema}].[EntityRecordDocument] ([EntityID]);

-- Index for foreign key EntityDocumentID in table EntityRecordDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRecordDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityDocumentID ON [${flyway:defaultSchema}].[EntityRecordDocument] ([EntityDocumentID]);

-- Index for foreign key VectorIndexID in table EntityRecordDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRecordDocument_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRecordDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRecordDocument_VectorIndexID ON [${flyway:defaultSchema}].[EntityRecordDocument] ([VectorIndexID]);

/* Base View SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: vwEntityRecordDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Entity Record Documents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityRecordDocument
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityRecordDocuments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityRecordDocuments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityRecordDocuments]
AS
SELECT
    e.*,
    Entity_EntityID.[Name] AS [Entity],
    EntityDocument_EntityDocumentID.[Name] AS [EntityDocument],
    VectorIndex_VectorIndexID.[Name] AS [VectorIndex]
FROM
    [${flyway:defaultSchema}].[EntityRecordDocument] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[EntityDocument] AS EntityDocument_EntityDocumentID
  ON
    [e].[EntityDocumentID] = EntityDocument_EntityDocumentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS VectorIndex_VectorIndexID
  ON
    [e].[VectorIndexID] = VectorIndex_VectorIndexID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRecordDocuments] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: Permissions for vwEntityRecordDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRecordDocuments] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: spCreateEntityRecordDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRecordDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityRecordDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRecordDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRecordDocument]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EntityDocumentID uniqueidentifier,
    @DocumentText nvarchar(MAX),
    @VectorIndexID uniqueidentifier,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityRecordDocument]
            (
                [ID],
                [EntityID],
                [RecordID],
                [EntityDocumentID],
                [DocumentText],
                [VectorIndexID],
                [VectorID],
                [VectorJSON],
                [EntityRecordUpdatedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @RecordID,
                @EntityDocumentID,
                @DocumentText,
                @VectorIndexID,
                @VectorID,
                @VectorJSON,
                @EntityRecordUpdatedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityRecordDocument]
            (
                [EntityID],
                [RecordID],
                [EntityDocumentID],
                [DocumentText],
                [VectorIndexID],
                [VectorID],
                [VectorJSON],
                [EntityRecordUpdatedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @RecordID,
                @EntityDocumentID,
                @DocumentText,
                @VectorIndexID,
                @VectorID,
                @VectorJSON,
                @EntityRecordUpdatedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRecordDocuments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Entity Record Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: spUpdateEntityRecordDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRecordDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityRecordDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRecordDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRecordDocument]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EntityDocumentID uniqueidentifier,
    @DocumentText nvarchar(MAX),
    @VectorIndexID uniqueidentifier,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRecordDocument]
    SET
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [EntityDocumentID] = @EntityDocumentID,
        [DocumentText] = @DocumentText,
        [VectorIndexID] = @VectorIndexID,
        [VectorID] = @VectorID,
        [VectorJSON] = @VectorJSON,
        [EntityRecordUpdatedAt] = @EntityRecordUpdatedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityRecordDocuments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityRecordDocuments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityRecordDocument table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityRecordDocument]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityRecordDocument];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityRecordDocument
ON [${flyway:defaultSchema}].[EntityRecordDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRecordDocument]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityRecordDocument] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Record Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: spDeleteEntityRecordDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRecordDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityRecordDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRecordDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRecordDocument]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityRecordDocument]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRecordDocument] TO [cdp_Integration]
    

/* spDelete Permissions for Entity Record Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRecordDocument] TO [cdp_Integration]



/* Index for Foreign Keys for AICredentialBinding */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Credential Bindings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialID in table AICredentialBinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AICredentialBinding_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AICredentialBinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AICredentialBinding_CredentialID ON [${flyway:defaultSchema}].[AICredentialBinding] ([CredentialID]);

-- Index for foreign key AIVendorID in table AICredentialBinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AICredentialBinding_AIVendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AICredentialBinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AICredentialBinding_AIVendorID ON [${flyway:defaultSchema}].[AICredentialBinding] ([AIVendorID]);

-- Index for foreign key AIModelVendorID in table AICredentialBinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AICredentialBinding_AIModelVendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AICredentialBinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AICredentialBinding_AIModelVendorID ON [${flyway:defaultSchema}].[AICredentialBinding] ([AIModelVendorID]);

-- Index for foreign key AIPromptModelID in table AICredentialBinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AICredentialBinding_AIPromptModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AICredentialBinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AICredentialBinding_AIPromptModelID ON [${flyway:defaultSchema}].[AICredentialBinding] ([AIPromptModelID]);

/* SQL text to update entity field related entity name field map for entity field ID 684271DB-BE05-4AC4-8AD9-E1562D7AFA54 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='684271DB-BE05-4AC4-8AD9-E1562D7AFA54',
         @RelatedEntityNameFieldMap='Credential'

/* SQL text to update entity field related entity name field map for entity field ID A1B693C1-EAC1-4084-936D-54D6351F5C58 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A1B693C1-EAC1-4084-936D-54D6351F5C58',
         @RelatedEntityNameFieldMap='AIVendor'

/* SQL text to update entity field related entity name field map for entity field ID 07306D16-45CF-43E7-90CE-8A3E74494590 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='07306D16-45CF-43E7-90CE-8A3E74494590',
         @RelatedEntityNameFieldMap='AIModelVendor'

/* SQL text to update entity field related entity name field map for entity field ID B9A5415F-8041-484C-84B6-8402F1DDF2AF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B9A5415F-8041-484C-84B6-8402F1DDF2AF',
         @RelatedEntityNameFieldMap='AIPromptModel'

/* Base View SQL for MJ: AI Credential Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Credential Bindings
-- Item: vwAICredentialBindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Credential Bindings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AICredentialBinding
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAICredentialBindings]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAICredentialBindings];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAICredentialBindings]
AS
SELECT
    a.*,
    Credential_CredentialID.[Name] AS [Credential],
    AIVendor_AIVendorID.[Name] AS [AIVendor],
    AIModelVendor_AIModelVendorID.[Model] AS [AIModelVendor],
    AIPromptModel_AIPromptModelID.[Prompt] AS [AIPromptModel]
FROM
    [${flyway:defaultSchema}].[AICredentialBinding] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Credential] AS Credential_CredentialID
  ON
    [a].[CredentialID] = Credential_CredentialID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_AIVendorID
  ON
    [a].[AIVendorID] = AIVendor_AIVendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwAIModelVendors] AS AIModelVendor_AIModelVendorID
  ON
    [a].[AIModelVendorID] = AIModelVendor_AIModelVendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwAIPromptModels] AS AIPromptModel_AIPromptModelID
  ON
    [a].[AIPromptModelID] = AIPromptModel_AIPromptModelID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAICredentialBindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Credential Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Credential Bindings
-- Item: Permissions for vwAICredentialBindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAICredentialBindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Credential Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Credential Bindings
-- Item: spCreateAICredentialBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AICredentialBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAICredentialBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAICredentialBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAICredentialBinding]
    @ID uniqueidentifier = NULL,
    @CredentialID uniqueidentifier,
    @BindingType nvarchar(20),
    @AIVendorID uniqueidentifier,
    @AIModelVendorID uniqueidentifier,
    @AIPromptModelID uniqueidentifier,
    @Priority int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AICredentialBinding]
            (
                [ID],
                [CredentialID],
                [BindingType],
                [AIVendorID],
                [AIModelVendorID],
                [AIPromptModelID],
                [Priority],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CredentialID,
                @BindingType,
                @AIVendorID,
                @AIModelVendorID,
                @AIPromptModelID,
                ISNULL(@Priority, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AICredentialBinding]
            (
                [CredentialID],
                [BindingType],
                [AIVendorID],
                [AIModelVendorID],
                [AIPromptModelID],
                [Priority],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CredentialID,
                @BindingType,
                @AIVendorID,
                @AIModelVendorID,
                @AIPromptModelID,
                ISNULL(@Priority, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAICredentialBindings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAICredentialBinding] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Credential Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAICredentialBinding] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Credential Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Credential Bindings
-- Item: spUpdateAICredentialBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AICredentialBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAICredentialBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAICredentialBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAICredentialBinding]
    @ID uniqueidentifier,
    @CredentialID uniqueidentifier,
    @BindingType nvarchar(20),
    @AIVendorID uniqueidentifier,
    @AIModelVendorID uniqueidentifier,
    @AIPromptModelID uniqueidentifier,
    @Priority int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AICredentialBinding]
    SET
        [CredentialID] = @CredentialID,
        [BindingType] = @BindingType,
        [AIVendorID] = @AIVendorID,
        [AIModelVendorID] = @AIModelVendorID,
        [AIPromptModelID] = @AIPromptModelID,
        [Priority] = @Priority,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAICredentialBindings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAICredentialBindings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAICredentialBinding] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AICredentialBinding table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAICredentialBinding]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAICredentialBinding];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAICredentialBinding
ON [${flyway:defaultSchema}].[AICredentialBinding]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AICredentialBinding]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AICredentialBinding] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Credential Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAICredentialBinding] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Credential Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Credential Bindings
-- Item: spDeleteAICredentialBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AICredentialBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAICredentialBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAICredentialBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAICredentialBinding]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AICredentialBinding]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAICredentialBinding] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Credential Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAICredentialBinding] TO [cdp_Integration]



/* Index for Foreign Keys for AIPromptRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PromptID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_PromptID ON [${flyway:defaultSchema}].[AIPromptRun] ([PromptID]);

-- Index for foreign key ModelID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ModelID ON [${flyway:defaultSchema}].[AIPromptRun] ([ModelID]);

-- Index for foreign key VendorID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_VendorID ON [${flyway:defaultSchema}].[AIPromptRun] ([VendorID]);

-- Index for foreign key AgentID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_AgentID ON [${flyway:defaultSchema}].[AIPromptRun] ([AgentID]);

-- Index for foreign key ConfigurationID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ConfigurationID ON [${flyway:defaultSchema}].[AIPromptRun] ([ConfigurationID]);

-- Index for foreign key ParentID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ParentID ON [${flyway:defaultSchema}].[AIPromptRun] ([ParentID]);

-- Index for foreign key AgentRunID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_AgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_AgentRunID ON [${flyway:defaultSchema}].[AIPromptRun] ([AgentRunID]);

-- Index for foreign key OriginalModelID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_OriginalModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_OriginalModelID ON [${flyway:defaultSchema}].[AIPromptRun] ([OriginalModelID]);

-- Index for foreign key RerunFromPromptRunID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_RerunFromPromptRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_RerunFromPromptRunID ON [${flyway:defaultSchema}].[AIPromptRun] ([RerunFromPromptRunID]);

-- Index for foreign key JudgeID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_JudgeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_JudgeID ON [${flyway:defaultSchema}].[AIPromptRun] ([JudgeID]);

-- Index for foreign key ChildPromptID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ChildPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ChildPromptID ON [${flyway:defaultSchema}].[AIPromptRun] ([ChildPromptID]);

-- Index for foreign key TestRunID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_TestRunID ON [${flyway:defaultSchema}].[AIPromptRun] ([TestRunID]);

/* Root ID Function SQL for MJ: AI Prompt Runs.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: fnAIPromptRunParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIPromptRun].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID]
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
            [${flyway:defaultSchema}].[AIPromptRun]
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
            [${flyway:defaultSchema}].[AIPromptRun] c
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


/* Root ID Function SQL for MJ: AI Prompt Runs.RerunFromPromptRunID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: fnAIPromptRunRerunFromPromptRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIPromptRun].[RerunFromPromptRunID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID]
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
            [RerunFromPromptRunID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIPromptRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until RerunFromPromptRunID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[RerunFromPromptRunID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIPromptRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[RerunFromPromptRunID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [RerunFromPromptRunID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* Base View SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIPromptRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIPromptRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptRuns]
AS
SELECT
    a.*,
    AIPrompt_PromptID.[Name] AS [Prompt],
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIAgent_AgentID.[Name] AS [Agent],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration],
    AIPromptRun_ParentID.[RunName] AS [Parent],
    AIAgentRun_AgentRunID.[RunName] AS [AgentRun],
    AIModel_OriginalModelID.[Name] AS [OriginalModel],
    AIPromptRun_RerunFromPromptRunID.[RunName] AS [RerunFromPromptRun],
    AIPrompt_JudgeID.[Name] AS [Judge],
    AIPrompt_ChildPromptID.[Name] AS [ChildPrompt],
    TestRun_TestRunID.[Test] AS [TestRun],
    root_ParentID.RootID AS [RootParentID],
    root_RerunFromPromptRunID.RootID AS [RootRerunFromPromptRunID]
FROM
    [${flyway:defaultSchema}].[AIPromptRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS AIPromptRun_ParentID
  ON
    [a].[ParentID] = AIPromptRun_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS AIAgentRun_AgentRunID
  ON
    [a].[AgentRunID] = AIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_OriginalModelID
  ON
    [a].[OriginalModelID] = AIModel_OriginalModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS AIPromptRun_RerunFromPromptRunID
  ON
    [a].[RerunFromPromptRunID] = AIPromptRun_RerunFromPromptRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_JudgeID
  ON
    [a].[JudgeID] = AIPrompt_JudgeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ChildPromptID
  ON
    [a].[ChildPromptID] = AIPrompt_ChildPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS TestRun_TestRunID
  ON
    [a].[TestRunID] = TestRun_TestRunID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID]([a].[ID], [a].[RerunFromPromptRunID]) AS root_RerunFromPromptRunID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Permissions for vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun]
    @ID uniqueidentifier = NULL,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetimeoffset = NULL,
    @CompletedAt datetimeoffset,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit = NULL,
    @ErrorMessage nvarchar(MAX),
    @ParentID uniqueidentifier,
    @RunType nvarchar(20) = NULL,
    @ExecutionOrder int,
    @AgentRunID uniqueidentifier,
    @Cost decimal(19, 8),
    @CostCurrency nvarchar(10),
    @TokensUsedRollup int,
    @TokensPromptRollup int,
    @TokensCompletionRollup int,
    @Temperature decimal(3, 2),
    @TopP decimal(3, 2),
    @TopK int,
    @MinP decimal(3, 2),
    @FrequencyPenalty decimal(3, 2),
    @PresencePenalty decimal(3, 2),
    @Seed int,
    @StopSequences nvarchar(MAX),
    @ResponseFormat nvarchar(50),
    @LogProbs bit,
    @TopLogProbs int,
    @DescendantCost decimal(18, 6),
    @ValidationAttemptCount int,
    @SuccessfulValidationCount int,
    @FinalValidationPassed bit,
    @ValidationBehavior nvarchar(50),
    @RetryStrategy nvarchar(50),
    @MaxRetriesConfigured int,
    @FinalValidationError nvarchar(500),
    @ValidationErrorCount int,
    @CommonValidationError nvarchar(255),
    @FirstAttemptAt datetimeoffset,
    @LastAttemptAt datetimeoffset,
    @TotalRetryDurationMS int,
    @ValidationAttempts nvarchar(MAX),
    @ValidationSummary nvarchar(MAX),
    @FailoverAttempts int,
    @FailoverErrors nvarchar(MAX),
    @FailoverDurations nvarchar(MAX),
    @OriginalModelID uniqueidentifier,
    @OriginalRequestStartTime datetimeoffset,
    @TotalFailoverDuration int,
    @RerunFromPromptRunID uniqueidentifier,
    @ModelSelection nvarchar(MAX),
    @Status nvarchar(50) = NULL,
    @Cancelled bit = NULL,
    @CancellationReason nvarchar(MAX),
    @ModelPowerRank int,
    @SelectionStrategy nvarchar(50),
    @CacheHit bit = NULL,
    @CacheKey nvarchar(500),
    @JudgeID uniqueidentifier,
    @JudgeScore float(53),
    @WasSelectedResult bit = NULL,
    @StreamingEnabled bit = NULL,
    @FirstTokenTime int,
    @ErrorDetails nvarchar(MAX),
    @ChildPromptID uniqueidentifier,
    @QueueTime int,
    @PromptTime int,
    @CompletionTime int,
    @ModelSpecificResponseDetails nvarchar(MAX),
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @TestRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRun]
            (
                [ID],
                [PromptID],
                [ModelID],
                [VendorID],
                [AgentID],
                [ConfigurationID],
                [RunAt],
                [CompletedAt],
                [ExecutionTimeMS],
                [Messages],
                [Result],
                [TokensUsed],
                [TokensPrompt],
                [TokensCompletion],
                [TotalCost],
                [Success],
                [ErrorMessage],
                [ParentID],
                [RunType],
                [ExecutionOrder],
                [AgentRunID],
                [Cost],
                [CostCurrency],
                [TokensUsedRollup],
                [TokensPromptRollup],
                [TokensCompletionRollup],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [ResponseFormat],
                [LogProbs],
                [TopLogProbs],
                [DescendantCost],
                [ValidationAttemptCount],
                [SuccessfulValidationCount],
                [FinalValidationPassed],
                [ValidationBehavior],
                [RetryStrategy],
                [MaxRetriesConfigured],
                [FinalValidationError],
                [ValidationErrorCount],
                [CommonValidationError],
                [FirstAttemptAt],
                [LastAttemptAt],
                [TotalRetryDurationMS],
                [ValidationAttempts],
                [ValidationSummary],
                [FailoverAttempts],
                [FailoverErrors],
                [FailoverDurations],
                [OriginalModelID],
                [OriginalRequestStartTime],
                [TotalFailoverDuration],
                [RerunFromPromptRunID],
                [ModelSelection],
                [Status],
                [Cancelled],
                [CancellationReason],
                [ModelPowerRank],
                [SelectionStrategy],
                [CacheHit],
                [CacheKey],
                [JudgeID],
                [JudgeScore],
                [WasSelectedResult],
                [StreamingEnabled],
                [FirstTokenTime],
                [ErrorDetails],
                [ChildPromptID],
                [QueueTime],
                [PromptTime],
                [CompletionTime],
                [ModelSpecificResponseDetails],
                [EffortLevel],
                [RunName],
                [Comments],
                [TestRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PromptID,
                @ModelID,
                @VendorID,
                @AgentID,
                @ConfigurationID,
                ISNULL(@RunAt, sysdatetimeoffset()),
                @CompletedAt,
                @ExecutionTimeMS,
                @Messages,
                @Result,
                @TokensUsed,
                @TokensPrompt,
                @TokensCompletion,
                @TotalCost,
                ISNULL(@Success, 0),
                @ErrorMessage,
                @ParentID,
                ISNULL(@RunType, 'Single'),
                @ExecutionOrder,
                @AgentRunID,
                @Cost,
                @CostCurrency,
                @TokensUsedRollup,
                @TokensPromptRollup,
                @TokensCompletionRollup,
                @Temperature,
                @TopP,
                @TopK,
                @MinP,
                @FrequencyPenalty,
                @PresencePenalty,
                @Seed,
                @StopSequences,
                @ResponseFormat,
                @LogProbs,
                @TopLogProbs,
                @DescendantCost,
                @ValidationAttemptCount,
                @SuccessfulValidationCount,
                @FinalValidationPassed,
                @ValidationBehavior,
                @RetryStrategy,
                @MaxRetriesConfigured,
                @FinalValidationError,
                @ValidationErrorCount,
                @CommonValidationError,
                @FirstAttemptAt,
                @LastAttemptAt,
                @TotalRetryDurationMS,
                @ValidationAttempts,
                @ValidationSummary,
                @FailoverAttempts,
                @FailoverErrors,
                @FailoverDurations,
                @OriginalModelID,
                @OriginalRequestStartTime,
                @TotalFailoverDuration,
                @RerunFromPromptRunID,
                @ModelSelection,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                @CancellationReason,
                @ModelPowerRank,
                @SelectionStrategy,
                ISNULL(@CacheHit, 0),
                @CacheKey,
                @JudgeID,
                @JudgeScore,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                @FirstTokenTime,
                @ErrorDetails,
                @ChildPromptID,
                @QueueTime,
                @PromptTime,
                @CompletionTime,
                @ModelSpecificResponseDetails,
                @EffortLevel,
                @RunName,
                @Comments,
                @TestRunID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRun]
            (
                [PromptID],
                [ModelID],
                [VendorID],
                [AgentID],
                [ConfigurationID],
                [RunAt],
                [CompletedAt],
                [ExecutionTimeMS],
                [Messages],
                [Result],
                [TokensUsed],
                [TokensPrompt],
                [TokensCompletion],
                [TotalCost],
                [Success],
                [ErrorMessage],
                [ParentID],
                [RunType],
                [ExecutionOrder],
                [AgentRunID],
                [Cost],
                [CostCurrency],
                [TokensUsedRollup],
                [TokensPromptRollup],
                [TokensCompletionRollup],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [ResponseFormat],
                [LogProbs],
                [TopLogProbs],
                [DescendantCost],
                [ValidationAttemptCount],
                [SuccessfulValidationCount],
                [FinalValidationPassed],
                [ValidationBehavior],
                [RetryStrategy],
                [MaxRetriesConfigured],
                [FinalValidationError],
                [ValidationErrorCount],
                [CommonValidationError],
                [FirstAttemptAt],
                [LastAttemptAt],
                [TotalRetryDurationMS],
                [ValidationAttempts],
                [ValidationSummary],
                [FailoverAttempts],
                [FailoverErrors],
                [FailoverDurations],
                [OriginalModelID],
                [OriginalRequestStartTime],
                [TotalFailoverDuration],
                [RerunFromPromptRunID],
                [ModelSelection],
                [Status],
                [Cancelled],
                [CancellationReason],
                [ModelPowerRank],
                [SelectionStrategy],
                [CacheHit],
                [CacheKey],
                [JudgeID],
                [JudgeScore],
                [WasSelectedResult],
                [StreamingEnabled],
                [FirstTokenTime],
                [ErrorDetails],
                [ChildPromptID],
                [QueueTime],
                [PromptTime],
                [CompletionTime],
                [ModelSpecificResponseDetails],
                [EffortLevel],
                [RunName],
                [Comments],
                [TestRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PromptID,
                @ModelID,
                @VendorID,
                @AgentID,
                @ConfigurationID,
                ISNULL(@RunAt, sysdatetimeoffset()),
                @CompletedAt,
                @ExecutionTimeMS,
                @Messages,
                @Result,
                @TokensUsed,
                @TokensPrompt,
                @TokensCompletion,
                @TotalCost,
                ISNULL(@Success, 0),
                @ErrorMessage,
                @ParentID,
                ISNULL(@RunType, 'Single'),
                @ExecutionOrder,
                @AgentRunID,
                @Cost,
                @CostCurrency,
                @TokensUsedRollup,
                @TokensPromptRollup,
                @TokensCompletionRollup,
                @Temperature,
                @TopP,
                @TopK,
                @MinP,
                @FrequencyPenalty,
                @PresencePenalty,
                @Seed,
                @StopSequences,
                @ResponseFormat,
                @LogProbs,
                @TopLogProbs,
                @DescendantCost,
                @ValidationAttemptCount,
                @SuccessfulValidationCount,
                @FinalValidationPassed,
                @ValidationBehavior,
                @RetryStrategy,
                @MaxRetriesConfigured,
                @FinalValidationError,
                @ValidationErrorCount,
                @CommonValidationError,
                @FirstAttemptAt,
                @LastAttemptAt,
                @TotalRetryDurationMS,
                @ValidationAttempts,
                @ValidationSummary,
                @FailoverAttempts,
                @FailoverErrors,
                @FailoverDurations,
                @OriginalModelID,
                @OriginalRequestStartTime,
                @TotalFailoverDuration,
                @RerunFromPromptRunID,
                @ModelSelection,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                @CancellationReason,
                @ModelPowerRank,
                @SelectionStrategy,
                ISNULL(@CacheHit, 0),
                @CacheKey,
                @JudgeID,
                @JudgeScore,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                @FirstTokenTime,
                @ErrorDetails,
                @ChildPromptID,
                @QueueTime,
                @PromptTime,
                @CompletionTime,
                @ModelSpecificResponseDetails,
                @EffortLevel,
                @RunName,
                @Comments,
                @TestRunID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRun]
    @ID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ParentID uniqueidentifier,
    @RunType nvarchar(20),
    @ExecutionOrder int,
    @AgentRunID uniqueidentifier,
    @Cost decimal(19, 8),
    @CostCurrency nvarchar(10),
    @TokensUsedRollup int,
    @TokensPromptRollup int,
    @TokensCompletionRollup int,
    @Temperature decimal(3, 2),
    @TopP decimal(3, 2),
    @TopK int,
    @MinP decimal(3, 2),
    @FrequencyPenalty decimal(3, 2),
    @PresencePenalty decimal(3, 2),
    @Seed int,
    @StopSequences nvarchar(MAX),
    @ResponseFormat nvarchar(50),
    @LogProbs bit,
    @TopLogProbs int,
    @DescendantCost decimal(18, 6),
    @ValidationAttemptCount int,
    @SuccessfulValidationCount int,
    @FinalValidationPassed bit,
    @ValidationBehavior nvarchar(50),
    @RetryStrategy nvarchar(50),
    @MaxRetriesConfigured int,
    @FinalValidationError nvarchar(500),
    @ValidationErrorCount int,
    @CommonValidationError nvarchar(255),
    @FirstAttemptAt datetimeoffset,
    @LastAttemptAt datetimeoffset,
    @TotalRetryDurationMS int,
    @ValidationAttempts nvarchar(MAX),
    @ValidationSummary nvarchar(MAX),
    @FailoverAttempts int,
    @FailoverErrors nvarchar(MAX),
    @FailoverDurations nvarchar(MAX),
    @OriginalModelID uniqueidentifier,
    @OriginalRequestStartTime datetimeoffset,
    @TotalFailoverDuration int,
    @RerunFromPromptRunID uniqueidentifier,
    @ModelSelection nvarchar(MAX),
    @Status nvarchar(50),
    @Cancelled bit,
    @CancellationReason nvarchar(MAX),
    @ModelPowerRank int,
    @SelectionStrategy nvarchar(50),
    @CacheHit bit,
    @CacheKey nvarchar(500),
    @JudgeID uniqueidentifier,
    @JudgeScore float(53),
    @WasSelectedResult bit,
    @StreamingEnabled bit,
    @FirstTokenTime int,
    @ErrorDetails nvarchar(MAX),
    @ChildPromptID uniqueidentifier,
    @QueueTime int,
    @PromptTime int,
    @CompletionTime int,
    @ModelSpecificResponseDetails nvarchar(MAX),
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @TestRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        [PromptID] = @PromptID,
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [AgentID] = @AgentID,
        [ConfigurationID] = @ConfigurationID,
        [RunAt] = @RunAt,
        [CompletedAt] = @CompletedAt,
        [ExecutionTimeMS] = @ExecutionTimeMS,
        [Messages] = @Messages,
        [Result] = @Result,
        [TokensUsed] = @TokensUsed,
        [TokensPrompt] = @TokensPrompt,
        [TokensCompletion] = @TokensCompletion,
        [TotalCost] = @TotalCost,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [ParentID] = @ParentID,
        [RunType] = @RunType,
        [ExecutionOrder] = @ExecutionOrder,
        [AgentRunID] = @AgentRunID,
        [Cost] = @Cost,
        [CostCurrency] = @CostCurrency,
        [TokensUsedRollup] = @TokensUsedRollup,
        [TokensPromptRollup] = @TokensPromptRollup,
        [TokensCompletionRollup] = @TokensCompletionRollup,
        [Temperature] = @Temperature,
        [TopP] = @TopP,
        [TopK] = @TopK,
        [MinP] = @MinP,
        [FrequencyPenalty] = @FrequencyPenalty,
        [PresencePenalty] = @PresencePenalty,
        [Seed] = @Seed,
        [StopSequences] = @StopSequences,
        [ResponseFormat] = @ResponseFormat,
        [LogProbs] = @LogProbs,
        [TopLogProbs] = @TopLogProbs,
        [DescendantCost] = @DescendantCost,
        [ValidationAttemptCount] = @ValidationAttemptCount,
        [SuccessfulValidationCount] = @SuccessfulValidationCount,
        [FinalValidationPassed] = @FinalValidationPassed,
        [ValidationBehavior] = @ValidationBehavior,
        [RetryStrategy] = @RetryStrategy,
        [MaxRetriesConfigured] = @MaxRetriesConfigured,
        [FinalValidationError] = @FinalValidationError,
        [ValidationErrorCount] = @ValidationErrorCount,
        [CommonValidationError] = @CommonValidationError,
        [FirstAttemptAt] = @FirstAttemptAt,
        [LastAttemptAt] = @LastAttemptAt,
        [TotalRetryDurationMS] = @TotalRetryDurationMS,
        [ValidationAttempts] = @ValidationAttempts,
        [ValidationSummary] = @ValidationSummary,
        [FailoverAttempts] = @FailoverAttempts,
        [FailoverErrors] = @FailoverErrors,
        [FailoverDurations] = @FailoverDurations,
        [OriginalModelID] = @OriginalModelID,
        [OriginalRequestStartTime] = @OriginalRequestStartTime,
        [TotalFailoverDuration] = @TotalFailoverDuration,
        [RerunFromPromptRunID] = @RerunFromPromptRunID,
        [ModelSelection] = @ModelSelection,
        [Status] = @Status,
        [Cancelled] = @Cancelled,
        [CancellationReason] = @CancellationReason,
        [ModelPowerRank] = @ModelPowerRank,
        [SelectionStrategy] = @SelectionStrategy,
        [CacheHit] = @CacheHit,
        [CacheKey] = @CacheKey,
        [JudgeID] = @JudgeID,
        [JudgeScore] = @JudgeScore,
        [WasSelectedResult] = @WasSelectedResult,
        [StreamingEnabled] = @StreamingEnabled,
        [FirstTokenTime] = @FirstTokenTime,
        [ErrorDetails] = @ErrorDetails,
        [ChildPromptID] = @ChildPromptID,
        [QueueTime] = @QueueTime,
        [PromptTime] = @PromptTime,
        [CompletionTime] = @CompletionTime,
        [ModelSpecificResponseDetails] = @ModelSpecificResponseDetails,
        [EffortLevel] = @EffortLevel,
        [RunName] = @RunName,
        [Comments] = @Comments,
        [TestRunID] = @TestRunID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIPromptRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPromptRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPromptRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPromptRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptRun
ON [${flyway:defaultSchema}].[AIPromptRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for AIVendor */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialTypeID in table AIVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIVendor_CredentialTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIVendor_CredentialTypeID ON [${flyway:defaultSchema}].[AIVendor] ([CredentialTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID A179C3AC-5499-4141-8B13-C8963EE47534 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A179C3AC-5499-4141-8B13-C8963EE47534',
         @RelatedEntityNameFieldMap='CredentialType'

/* Base View SQL for MJ: AI Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: vwAIVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Vendors
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIVendor
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIVendors]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIVendors];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIVendors]
AS
SELECT
    a.*,
    CredentialType_CredentialTypeID.[Name] AS [CredentialType]
FROM
    [${flyway:defaultSchema}].[AIVendor] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CredentialType] AS CredentialType_CredentialTypeID
  ON
    [a].[CredentialTypeID] = CredentialType_CredentialTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: Permissions for vwAIVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: spCreateAIVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIVendor
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIVendor]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIVendor];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIVendor]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @CredentialTypeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIVendor]
            (
                [ID],
                [Name],
                [Description],
                [CredentialTypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @CredentialTypeID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIVendor]
            (
                [Name],
                [Description],
                [CredentialTypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @CredentialTypeID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIVendors] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIVendor] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIVendor] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: spUpdateAIVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIVendor
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIVendor]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIVendor];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIVendor]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @CredentialTypeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIVendor]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [CredentialTypeID] = @CredentialTypeID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIVendors] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIVendors]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIVendor] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIVendor table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIVendor]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIVendor];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIVendor
ON [${flyway:defaultSchema}].[AIVendor]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIVendor]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIVendor] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIVendor] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: spDeleteAIVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIVendor
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIVendor]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIVendor];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIVendor]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIVendor]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIVendor] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIVendor] TO [cdp_Integration]



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


/* Index for Foreign Keys for CredentialType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


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



/* Index for Foreign Keys for EncryptionAlgorithm */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for EncryptionKeySource */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for EncryptionKey */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EncryptionKeySourceID in table EncryptionKey
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EncryptionKey_EncryptionKeySourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EncryptionKey]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EncryptionKey_EncryptionKeySourceID ON [${flyway:defaultSchema}].[EncryptionKey] ([EncryptionKeySourceID]);

-- Index for foreign key EncryptionAlgorithmID in table EncryptionKey
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EncryptionKey_EncryptionAlgorithmID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EncryptionKey]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EncryptionKey_EncryptionAlgorithmID ON [${flyway:defaultSchema}].[EncryptionKey] ([EncryptionAlgorithmID]);

/* Base View SQL for MJ: Encryption Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: vwEncryptionAlgorithms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Encryption Algorithms
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EncryptionAlgorithm
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEncryptionAlgorithms]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEncryptionAlgorithms];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEncryptionAlgorithms]
AS
SELECT
    e.*
FROM
    [${flyway:defaultSchema}].[EncryptionAlgorithm] AS e
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEncryptionAlgorithms] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Encryption Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: Permissions for vwEncryptionAlgorithms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEncryptionAlgorithms] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Encryption Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: spCreateEncryptionAlgorithm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EncryptionAlgorithm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEncryptionAlgorithm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEncryptionAlgorithm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEncryptionAlgorithm]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @NodeCryptoName nvarchar(50),
    @KeyLengthBits int,
    @IVLengthBytes int,
    @IsAEAD bit = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EncryptionAlgorithm]
            (
                [ID],
                [Name],
                [Description],
                [NodeCryptoName],
                [KeyLengthBits],
                [IVLengthBytes],
                [IsAEAD],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @NodeCryptoName,
                @KeyLengthBits,
                @IVLengthBytes,
                ISNULL(@IsAEAD, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EncryptionAlgorithm]
            (
                [Name],
                [Description],
                [NodeCryptoName],
                [KeyLengthBits],
                [IVLengthBytes],
                [IsAEAD],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @NodeCryptoName,
                @KeyLengthBits,
                @IVLengthBytes,
                ISNULL(@IsAEAD, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEncryptionAlgorithms] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEncryptionAlgorithm] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Encryption Algorithms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEncryptionAlgorithm] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Encryption Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: spUpdateEncryptionAlgorithm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EncryptionAlgorithm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEncryptionAlgorithm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEncryptionAlgorithm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEncryptionAlgorithm]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @NodeCryptoName nvarchar(50),
    @KeyLengthBits int,
    @IVLengthBytes int,
    @IsAEAD bit,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EncryptionAlgorithm]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [NodeCryptoName] = @NodeCryptoName,
        [KeyLengthBits] = @KeyLengthBits,
        [IVLengthBytes] = @IVLengthBytes,
        [IsAEAD] = @IsAEAD,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEncryptionAlgorithms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEncryptionAlgorithms]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEncryptionAlgorithm] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EncryptionAlgorithm table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEncryptionAlgorithm]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEncryptionAlgorithm];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEncryptionAlgorithm
ON [${flyway:defaultSchema}].[EncryptionAlgorithm]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EncryptionAlgorithm]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EncryptionAlgorithm] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Encryption Algorithms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEncryptionAlgorithm] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Encryption Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: spDeleteEncryptionAlgorithm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EncryptionAlgorithm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEncryptionAlgorithm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEncryptionAlgorithm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEncryptionAlgorithm]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EncryptionAlgorithm]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEncryptionAlgorithm] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Encryption Algorithms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEncryptionAlgorithm] TO [cdp_Integration]



/* Base View SQL for MJ: Encryption Key Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: vwEncryptionKeySources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Encryption Key Sources
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EncryptionKeySource
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEncryptionKeySources]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEncryptionKeySources];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEncryptionKeySources]
AS
SELECT
    e.*
FROM
    [${flyway:defaultSchema}].[EncryptionKeySource] AS e
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEncryptionKeySources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Encryption Key Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: Permissions for vwEncryptionKeySources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEncryptionKeySources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Encryption Key Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: spCreateEncryptionKeySource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EncryptionKeySource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEncryptionKeySource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEncryptionKeySource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEncryptionKeySource]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(255),
    @DriverImportPath nvarchar(500),
    @ConfigTemplate nvarchar(MAX),
    @IsActive bit = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EncryptionKeySource]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [DriverImportPath],
                [ConfigTemplate],
                [IsActive],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @DriverClass,
                @DriverImportPath,
                @ConfigTemplate,
                ISNULL(@IsActive, 1),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EncryptionKeySource]
            (
                [Name],
                [Description],
                [DriverClass],
                [DriverImportPath],
                [ConfigTemplate],
                [IsActive],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @DriverClass,
                @DriverImportPath,
                @ConfigTemplate,
                ISNULL(@IsActive, 1),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEncryptionKeySources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEncryptionKeySource] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Encryption Key Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEncryptionKeySource] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Encryption Key Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: spUpdateEncryptionKeySource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EncryptionKeySource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEncryptionKeySource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEncryptionKeySource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEncryptionKeySource]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(255),
    @DriverImportPath nvarchar(500),
    @ConfigTemplate nvarchar(MAX),
    @IsActive bit,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EncryptionKeySource]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [ConfigTemplate] = @ConfigTemplate,
        [IsActive] = @IsActive,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEncryptionKeySources] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEncryptionKeySources]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEncryptionKeySource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EncryptionKeySource table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEncryptionKeySource]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEncryptionKeySource];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEncryptionKeySource
ON [${flyway:defaultSchema}].[EncryptionKeySource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EncryptionKeySource]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EncryptionKeySource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Encryption Key Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEncryptionKeySource] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Encryption Key Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: spDeleteEncryptionKeySource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EncryptionKeySource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEncryptionKeySource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEncryptionKeySource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEncryptionKeySource]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EncryptionKeySource]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEncryptionKeySource] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Encryption Key Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEncryptionKeySource] TO [cdp_Integration]



/* Base View SQL for MJ: Encryption Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: vwEncryptionKeys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Encryption Keys
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EncryptionKey
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEncryptionKeys]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEncryptionKeys];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEncryptionKeys]
AS
SELECT
    e.*,
    EncryptionKeySource_EncryptionKeySourceID.[Name] AS [EncryptionKeySource],
    EncryptionAlgorithm_EncryptionAlgorithmID.[Name] AS [EncryptionAlgorithm]
FROM
    [${flyway:defaultSchema}].[EncryptionKey] AS e
INNER JOIN
    [${flyway:defaultSchema}].[EncryptionKeySource] AS EncryptionKeySource_EncryptionKeySourceID
  ON
    [e].[EncryptionKeySourceID] = EncryptionKeySource_EncryptionKeySourceID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[EncryptionAlgorithm] AS EncryptionAlgorithm_EncryptionAlgorithmID
  ON
    [e].[EncryptionAlgorithmID] = EncryptionAlgorithm_EncryptionAlgorithmID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEncryptionKeys] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Encryption Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: Permissions for vwEncryptionKeys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEncryptionKeys] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Encryption Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: spCreateEncryptionKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EncryptionKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEncryptionKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEncryptionKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEncryptionKey]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EncryptionKeySourceID uniqueidentifier,
    @EncryptionAlgorithmID uniqueidentifier,
    @KeyLookupValue nvarchar(500),
    @KeyVersion nvarchar(20) = NULL,
    @Marker nvarchar(20) = NULL,
    @IsActive bit = NULL,
    @Status nvarchar(20) = NULL,
    @ActivatedAt datetimeoffset,
    @ExpiresAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EncryptionKey]
            (
                [ID],
                [Name],
                [Description],
                [EncryptionKeySourceID],
                [EncryptionAlgorithmID],
                [KeyLookupValue],
                [KeyVersion],
                [Marker],
                [IsActive],
                [Status],
                [ActivatedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @EncryptionKeySourceID,
                @EncryptionAlgorithmID,
                @KeyLookupValue,
                ISNULL(@KeyVersion, '1'),
                ISNULL(@Marker, '$ENC$'),
                ISNULL(@IsActive, 1),
                ISNULL(@Status, 'Active'),
                @ActivatedAt,
                @ExpiresAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EncryptionKey]
            (
                [Name],
                [Description],
                [EncryptionKeySourceID],
                [EncryptionAlgorithmID],
                [KeyLookupValue],
                [KeyVersion],
                [Marker],
                [IsActive],
                [Status],
                [ActivatedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @EncryptionKeySourceID,
                @EncryptionAlgorithmID,
                @KeyLookupValue,
                ISNULL(@KeyVersion, '1'),
                ISNULL(@Marker, '$ENC$'),
                ISNULL(@IsActive, 1),
                ISNULL(@Status, 'Active'),
                @ActivatedAt,
                @ExpiresAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEncryptionKeys] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEncryptionKey] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Encryption Keys */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEncryptionKey] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Encryption Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: spUpdateEncryptionKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EncryptionKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEncryptionKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEncryptionKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEncryptionKey]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EncryptionKeySourceID uniqueidentifier,
    @EncryptionAlgorithmID uniqueidentifier,
    @KeyLookupValue nvarchar(500),
    @KeyVersion nvarchar(20),
    @Marker nvarchar(20),
    @IsActive bit,
    @Status nvarchar(20),
    @ActivatedAt datetimeoffset,
    @ExpiresAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EncryptionKey]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [EncryptionKeySourceID] = @EncryptionKeySourceID,
        [EncryptionAlgorithmID] = @EncryptionAlgorithmID,
        [KeyLookupValue] = @KeyLookupValue,
        [KeyVersion] = @KeyVersion,
        [Marker] = @Marker,
        [IsActive] = @IsActive,
        [Status] = @Status,
        [ActivatedAt] = @ActivatedAt,
        [ExpiresAt] = @ExpiresAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEncryptionKeys] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEncryptionKeys]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEncryptionKey] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EncryptionKey table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEncryptionKey]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEncryptionKey];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEncryptionKey
ON [${flyway:defaultSchema}].[EncryptionKey]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EncryptionKey]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EncryptionKey] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Encryption Keys */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEncryptionKey] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Encryption Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: spDeleteEncryptionKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EncryptionKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEncryptionKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEncryptionKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEncryptionKey]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EncryptionKey]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEncryptionKey] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Encryption Keys */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEncryptionKey] TO [cdp_Integration]



/* Index for Foreign Keys for TestRunFeedback */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TestRunID in table TestRunFeedback
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRunFeedback_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRunFeedback]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRunFeedback_TestRunID ON [${flyway:defaultSchema}].[TestRunFeedback] ([TestRunID]);

-- Index for foreign key ReviewerUserID in table TestRunFeedback
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRunFeedback_ReviewerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRunFeedback]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRunFeedback_ReviewerUserID ON [${flyway:defaultSchema}].[TestRunFeedback] ([ReviewerUserID]);

/* Index for Foreign Keys for TestRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TestID in table TestRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRun_TestID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRun_TestID ON [${flyway:defaultSchema}].[TestRun] ([TestID]);

-- Index for foreign key TestSuiteRunID in table TestRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRun_TestSuiteRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRun_TestSuiteRunID ON [${flyway:defaultSchema}].[TestRun] ([TestSuiteRunID]);

-- Index for foreign key RunByUserID in table TestRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRun_RunByUserID ON [${flyway:defaultSchema}].[TestRun] ([RunByUserID]);

/* Index for Foreign Keys for TestSuiteRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SuiteID in table TestSuiteRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestSuiteRun_SuiteID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestSuiteRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestSuiteRun_SuiteID ON [${flyway:defaultSchema}].[TestSuiteRun] ([SuiteID]);

-- Index for foreign key RunByUserID in table TestSuiteRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestSuiteRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestSuiteRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestSuiteRun_RunByUserID ON [${flyway:defaultSchema}].[TestSuiteRun] ([RunByUserID]);

/* Base View SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: vwTestRunFeedbacks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Run Feedbacks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestRunFeedback
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestRunFeedbacks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestRunFeedbacks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestRunFeedbacks]
AS
SELECT
    t.*,
    TestRun_TestRunID.[Test] AS [TestRun],
    User_ReviewerUserID.[Name] AS [ReviewerUser]
FROM
    [${flyway:defaultSchema}].[TestRunFeedback] AS t
INNER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS TestRun_TestRunID
  ON
    [t].[TestRunID] = TestRun_TestRunID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_ReviewerUserID
  ON
    [t].[ReviewerUserID] = User_ReviewerUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRunFeedbacks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: Permissions for vwTestRunFeedbacks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRunFeedbacks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: spCreateTestRunFeedback
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRunFeedback
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestRunFeedback]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunFeedback];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunFeedback]
    @ID uniqueidentifier = NULL,
    @TestRunID uniqueidentifier,
    @ReviewerUserID uniqueidentifier,
    @Rating int,
    @IsCorrect bit,
    @CorrectionSummary nvarchar(MAX),
    @Comments nvarchar(MAX),
    @ReviewedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestRunFeedback]
            (
                [ID],
                [TestRunID],
                [ReviewerUserID],
                [Rating],
                [IsCorrect],
                [CorrectionSummary],
                [Comments],
                [ReviewedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TestRunID,
                @ReviewerUserID,
                @Rating,
                @IsCorrect,
                @CorrectionSummary,
                @Comments,
                ISNULL(@ReviewedAt, sysdatetimeoffset())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestRunFeedback]
            (
                [TestRunID],
                [ReviewerUserID],
                [Rating],
                [IsCorrect],
                [CorrectionSummary],
                [Comments],
                [ReviewedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TestRunID,
                @ReviewerUserID,
                @Rating,
                @IsCorrect,
                @CorrectionSummary,
                @Comments,
                ISNULL(@ReviewedAt, sysdatetimeoffset())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestRunFeedbacks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Run Feedbacks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: spUpdateTestRunFeedback
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRunFeedback
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestRunFeedback]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunFeedback];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunFeedback]
    @ID uniqueidentifier,
    @TestRunID uniqueidentifier,
    @ReviewerUserID uniqueidentifier,
    @Rating int,
    @IsCorrect bit,
    @CorrectionSummary nvarchar(MAX),
    @Comments nvarchar(MAX),
    @ReviewedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunFeedback]
    SET
        [TestRunID] = @TestRunID,
        [ReviewerUserID] = @ReviewerUserID,
        [Rating] = @Rating,
        [IsCorrect] = @IsCorrect,
        [CorrectionSummary] = @CorrectionSummary,
        [Comments] = @Comments,
        [ReviewedAt] = @ReviewedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestRunFeedbacks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestRunFeedbacks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRunFeedback table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestRunFeedback]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestRunFeedback];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestRunFeedback
ON [${flyway:defaultSchema}].[TestRunFeedback]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunFeedback]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestRunFeedback] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Run Feedbacks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunFeedback] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: spDeleteTestRunFeedback
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRunFeedback
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestRunFeedback]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRunFeedback];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRunFeedback]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestRunFeedback]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRunFeedback] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Run Feedbacks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRunFeedback] TO [cdp_Integration]



/* Base View SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: vwTestRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestRuns]
AS
SELECT
    t.*,
    Test_TestID.[Name] AS [Test],
    TestSuiteRun_TestSuiteRunID.[Suite] AS [TestSuiteRun],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[TestRun] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Test] AS Test_TestID
  ON
    [t].[TestID] = Test_TestID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestSuiteRuns] AS TestSuiteRun_TestSuiteRunID
  ON
    [t].[TestSuiteRunID] = TestSuiteRun_TestSuiteRunID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_RunByUserID
  ON
    [t].[RunByUserID] = User_RunByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: Permissions for vwTestRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spCreateTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestRun]
    @ID uniqueidentifier = NULL,
    @TestID uniqueidentifier,
    @TestSuiteRunID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Sequence int,
    @TargetType nvarchar(100),
    @TargetLogID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @DurationSeconds decimal(10, 3),
    @InputData nvarchar(MAX),
    @ExpectedOutputData nvarchar(MAX),
    @ActualOutputData nvarchar(MAX),
    @PassedChecks int,
    @FailedChecks int,
    @TotalChecks int,
    @Score decimal(5, 4),
    @CostUSD decimal(10, 6),
    @ErrorMessage nvarchar(MAX),
    @ResultDetails nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestRun]
            (
                [ID],
                [TestID],
                [TestSuiteRunID],
                [RunByUserID],
                [Sequence],
                [TargetType],
                [TargetLogID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationSeconds],
                [InputData],
                [ExpectedOutputData],
                [ActualOutputData],
                [PassedChecks],
                [FailedChecks],
                [TotalChecks],
                [Score],
                [CostUSD],
                [ErrorMessage],
                [ResultDetails]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TestID,
                @TestSuiteRunID,
                @RunByUserID,
                @Sequence,
                @TargetType,
                @TargetLogID,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @DurationSeconds,
                @InputData,
                @ExpectedOutputData,
                @ActualOutputData,
                @PassedChecks,
                @FailedChecks,
                @TotalChecks,
                @Score,
                @CostUSD,
                @ErrorMessage,
                @ResultDetails
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestRun]
            (
                [TestID],
                [TestSuiteRunID],
                [RunByUserID],
                [Sequence],
                [TargetType],
                [TargetLogID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationSeconds],
                [InputData],
                [ExpectedOutputData],
                [ActualOutputData],
                [PassedChecks],
                [FailedChecks],
                [TotalChecks],
                [Score],
                [CostUSD],
                [ErrorMessage],
                [ResultDetails]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TestID,
                @TestSuiteRunID,
                @RunByUserID,
                @Sequence,
                @TargetType,
                @TargetLogID,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @DurationSeconds,
                @InputData,
                @ExpectedOutputData,
                @ActualOutputData,
                @PassedChecks,
                @FailedChecks,
                @TotalChecks,
                @Score,
                @CostUSD,
                @ErrorMessage,
                @ResultDetails
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spUpdateTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRun]
    @ID uniqueidentifier,
    @TestID uniqueidentifier,
    @TestSuiteRunID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Sequence int,
    @TargetType nvarchar(100),
    @TargetLogID uniqueidentifier,
    @Status nvarchar(20),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @DurationSeconds decimal(10, 3),
    @InputData nvarchar(MAX),
    @ExpectedOutputData nvarchar(MAX),
    @ActualOutputData nvarchar(MAX),
    @PassedChecks int,
    @FailedChecks int,
    @TotalChecks int,
    @Score decimal(5, 4),
    @CostUSD decimal(10, 6),
    @ErrorMessage nvarchar(MAX),
    @ResultDetails nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRun]
    SET
        [TestID] = @TestID,
        [TestSuiteRunID] = @TestSuiteRunID,
        [RunByUserID] = @RunByUserID,
        [Sequence] = @Sequence,
        [TargetType] = @TargetType,
        [TargetLogID] = @TargetLogID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [DurationSeconds] = @DurationSeconds,
        [InputData] = @InputData,
        [ExpectedOutputData] = @ExpectedOutputData,
        [ActualOutputData] = @ActualOutputData,
        [PassedChecks] = @PassedChecks,
        [FailedChecks] = @FailedChecks,
        [TotalChecks] = @TotalChecks,
        [Score] = @Score,
        [CostUSD] = @CostUSD,
        [ErrorMessage] = @ErrorMessage,
        [ResultDetails] = @ResultDetails
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestRun
ON [${flyway:defaultSchema}].[TestRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spDeleteTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRun] TO [cdp_Integration]



/* Base View SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: vwTestSuiteRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Suite Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestSuiteRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestSuiteRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestSuiteRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestSuiteRuns]
AS
SELECT
    t.*,
    TestSuite_SuiteID.[Name] AS [Suite],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[TestSuiteRun] AS t
INNER JOIN
    [${flyway:defaultSchema}].[TestSuite] AS TestSuite_SuiteID
  ON
    [t].[SuiteID] = TestSuite_SuiteID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_RunByUserID
  ON
    [t].[RunByUserID] = User_RunByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestSuiteRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: Permissions for vwTestSuiteRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestSuiteRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: spCreateTestSuiteRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestSuiteRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestSuiteRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestSuiteRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestSuiteRun]
    @ID uniqueidentifier = NULL,
    @SuiteID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Environment nvarchar(50),
    @TriggerType nvarchar(50),
    @GitCommit nvarchar(100),
    @AgentVersion nvarchar(100),
    @Status nvarchar(20) = NULL,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @TotalTests int,
    @PassedTests int,
    @FailedTests int,
    @SkippedTests int,
    @ErrorTests int,
    @TotalDurationSeconds decimal(10, 3),
    @TotalCostUSD decimal(10, 6),
    @Configuration nvarchar(MAX),
    @ResultSummary nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestSuiteRun]
            (
                [ID],
                [SuiteID],
                [RunByUserID],
                [Environment],
                [TriggerType],
                [GitCommit],
                [AgentVersion],
                [Status],
                [StartedAt],
                [CompletedAt],
                [TotalTests],
                [PassedTests],
                [FailedTests],
                [SkippedTests],
                [ErrorTests],
                [TotalDurationSeconds],
                [TotalCostUSD],
                [Configuration],
                [ResultSummary],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SuiteID,
                @RunByUserID,
                @Environment,
                @TriggerType,
                @GitCommit,
                @AgentVersion,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @TotalTests,
                @PassedTests,
                @FailedTests,
                @SkippedTests,
                @ErrorTests,
                @TotalDurationSeconds,
                @TotalCostUSD,
                @Configuration,
                @ResultSummary,
                @ErrorMessage
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestSuiteRun]
            (
                [SuiteID],
                [RunByUserID],
                [Environment],
                [TriggerType],
                [GitCommit],
                [AgentVersion],
                [Status],
                [StartedAt],
                [CompletedAt],
                [TotalTests],
                [PassedTests],
                [FailedTests],
                [SkippedTests],
                [ErrorTests],
                [TotalDurationSeconds],
                [TotalCostUSD],
                [Configuration],
                [ResultSummary],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SuiteID,
                @RunByUserID,
                @Environment,
                @TriggerType,
                @GitCommit,
                @AgentVersion,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @CompletedAt,
                @TotalTests,
                @PassedTests,
                @FailedTests,
                @SkippedTests,
                @ErrorTests,
                @TotalDurationSeconds,
                @TotalCostUSD,
                @Configuration,
                @ResultSummary,
                @ErrorMessage
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestSuiteRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Suite Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: spUpdateTestSuiteRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestSuiteRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestSuiteRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestSuiteRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestSuiteRun]
    @ID uniqueidentifier,
    @SuiteID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @Environment nvarchar(50),
    @TriggerType nvarchar(50),
    @GitCommit nvarchar(100),
    @AgentVersion nvarchar(100),
    @Status nvarchar(20),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @TotalTests int,
    @PassedTests int,
    @FailedTests int,
    @SkippedTests int,
    @ErrorTests int,
    @TotalDurationSeconds decimal(10, 3),
    @TotalCostUSD decimal(10, 6),
    @Configuration nvarchar(MAX),
    @ResultSummary nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestSuiteRun]
    SET
        [SuiteID] = @SuiteID,
        [RunByUserID] = @RunByUserID,
        [Environment] = @Environment,
        [TriggerType] = @TriggerType,
        [GitCommit] = @GitCommit,
        [AgentVersion] = @AgentVersion,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [TotalTests] = @TotalTests,
        [PassedTests] = @PassedTests,
        [FailedTests] = @FailedTests,
        [SkippedTests] = @SkippedTests,
        [ErrorTests] = @ErrorTests,
        [TotalDurationSeconds] = @TotalDurationSeconds,
        [TotalCostUSD] = @TotalCostUSD,
        [Configuration] = @Configuration,
        [ResultSummary] = @ResultSummary,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestSuiteRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestSuiteRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestSuiteRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestSuiteRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestSuiteRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestSuiteRun
ON [${flyway:defaultSchema}].[TestSuiteRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestSuiteRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestSuiteRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Suite Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestSuiteRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: spDeleteTestSuiteRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestSuiteRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestSuiteRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestSuiteRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestSuiteRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestSuiteRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestSuiteRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Suite Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestSuiteRun] TO [cdp_Integration]



/* Index for Foreign Keys for QueueTask */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueueID in table QueueTask
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueueTask_QueueID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueueTask]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueueTask_QueueID ON [${flyway:defaultSchema}].[QueueTask] ([QueueID]);

/* Index for Foreign Keys for Queue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueueTypeID in table Queue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Queue_QueueTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Queue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Queue_QueueTypeID ON [${flyway:defaultSchema}].[Queue] ([QueueTypeID]);

/* Base View SQL for Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: vwQueueTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Queue Tasks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueueTask
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueueTasks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueueTasks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueueTasks]
AS
SELECT
    q.*,
    Queue_QueueID.[Name] AS [Queue]
FROM
    [${flyway:defaultSchema}].[QueueTask] AS q
INNER JOIN
    [${flyway:defaultSchema}].[Queue] AS Queue_QueueID
  ON
    [q].[QueueID] = Queue_QueueID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueueTasks] TO [cdp_UI]
    

/* Base View Permissions SQL for Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: Permissions for vwQueueTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueueTasks] TO [cdp_UI]

/* spCreate SQL for Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: spCreateQueueTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueueTask
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQueueTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQueueTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueueTask]
    @ID uniqueidentifier = NULL,
    @QueueID uniqueidentifier,
    @Status nchar(10) = NULL,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Data nvarchar(MAX),
    @Options nvarchar(MAX),
    @Output nvarchar(MAX),
    @ErrorMessage nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueueTask]
            (
                [ID],
                [QueueID],
                [Status],
                [StartedAt],
                [EndedAt],
                [Data],
                [Options],
                [Output],
                [ErrorMessage],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QueueID,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @EndedAt,
                @Data,
                @Options,
                @Output,
                @ErrorMessage,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueueTask]
            (
                [QueueID],
                [Status],
                [StartedAt],
                [EndedAt],
                [Data],
                [Options],
                [Output],
                [ErrorMessage],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QueueID,
                ISNULL(@Status, 'Pending'),
                @StartedAt,
                @EndedAt,
                @Data,
                @Options,
                @Output,
                @ErrorMessage,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueueTasks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueueTask] TO [cdp_UI]
    

/* spCreate Permissions for Queue Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueueTask] TO [cdp_UI]



/* spUpdate SQL for Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: spUpdateQueueTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueueTask
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQueueTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQueueTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueueTask]
    @ID uniqueidentifier,
    @QueueID uniqueidentifier,
    @Status nchar(10),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Data nvarchar(MAX),
    @Options nvarchar(MAX),
    @Output nvarchar(MAX),
    @ErrorMessage nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueueTask]
    SET
        [QueueID] = @QueueID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Data] = @Data,
        [Options] = @Options,
        [Output] = @Output,
        [ErrorMessage] = @ErrorMessage,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueueTasks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueueTasks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueueTask table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQueueTask]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQueueTask];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueueTask
ON [${flyway:defaultSchema}].[QueueTask]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueueTask]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueueTask] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Queue Tasks */




/* spDelete SQL for Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queue Tasks
-- Item: spDeleteQueueTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueueTask
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQueueTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQueueTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueueTask]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QueueTask]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for Queue Tasks */




/* Base View SQL for Queues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: vwQueues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Queues
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Queue
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueues]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueues];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueues]
AS
SELECT
    q.*,
    QueueType_QueueTypeID.[Name] AS [QueueType]
FROM
    [${flyway:defaultSchema}].[Queue] AS q
INNER JOIN
    [${flyway:defaultSchema}].[QueueType] AS QueueType_QueueTypeID
  ON
    [q].[QueueTypeID] = QueueType_QueueTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueues] TO [cdp_UI]
    

/* Base View Permissions SQL for Queues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: Permissions for vwQueues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueues] TO [cdp_UI]

/* spCreate SQL for Queues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: spCreateQueue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Queue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQueue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQueue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueue]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @QueueTypeID uniqueidentifier,
    @IsActive bit = NULL,
    @ProcessPID int,
    @ProcessPlatform nvarchar(30),
    @ProcessVersion nvarchar(15),
    @ProcessCwd nvarchar(100),
    @ProcessIPAddress nvarchar(50),
    @ProcessMacAddress nvarchar(50),
    @ProcessOSName nvarchar(25),
    @ProcessOSVersion nvarchar(10),
    @ProcessHostName nvarchar(50),
    @ProcessUserID nvarchar(25),
    @ProcessUserName nvarchar(50),
    @LastHeartbeat datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Queue]
            (
                [ID],
                [Name],
                [Description],
                [QueueTypeID],
                [IsActive],
                [ProcessPID],
                [ProcessPlatform],
                [ProcessVersion],
                [ProcessCwd],
                [ProcessIPAddress],
                [ProcessMacAddress],
                [ProcessOSName],
                [ProcessOSVersion],
                [ProcessHostName],
                [ProcessUserID],
                [ProcessUserName],
                [LastHeartbeat]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @QueueTypeID,
                ISNULL(@IsActive, 0),
                @ProcessPID,
                @ProcessPlatform,
                @ProcessVersion,
                @ProcessCwd,
                @ProcessIPAddress,
                @ProcessMacAddress,
                @ProcessOSName,
                @ProcessOSVersion,
                @ProcessHostName,
                @ProcessUserID,
                @ProcessUserName,
                ISNULL(@LastHeartbeat, sysdatetimeoffset())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Queue]
            (
                [Name],
                [Description],
                [QueueTypeID],
                [IsActive],
                [ProcessPID],
                [ProcessPlatform],
                [ProcessVersion],
                [ProcessCwd],
                [ProcessIPAddress],
                [ProcessMacAddress],
                [ProcessOSName],
                [ProcessOSVersion],
                [ProcessHostName],
                [ProcessUserID],
                [ProcessUserName],
                [LastHeartbeat]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @QueueTypeID,
                ISNULL(@IsActive, 0),
                @ProcessPID,
                @ProcessPlatform,
                @ProcessVersion,
                @ProcessCwd,
                @ProcessIPAddress,
                @ProcessMacAddress,
                @ProcessOSName,
                @ProcessOSVersion,
                @ProcessHostName,
                @ProcessUserID,
                @ProcessUserName,
                ISNULL(@LastHeartbeat, sysdatetimeoffset())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueue] TO [cdp_UI]
    

/* spCreate Permissions for Queues */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueue] TO [cdp_UI]



/* spUpdate SQL for Queues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: spUpdateQueue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Queue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQueue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQueue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueue]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @QueueTypeID uniqueidentifier,
    @IsActive bit,
    @ProcessPID int,
    @ProcessPlatform nvarchar(30),
    @ProcessVersion nvarchar(15),
    @ProcessCwd nvarchar(100),
    @ProcessIPAddress nvarchar(50),
    @ProcessMacAddress nvarchar(50),
    @ProcessOSName nvarchar(25),
    @ProcessOSVersion nvarchar(10),
    @ProcessHostName nvarchar(50),
    @ProcessUserID nvarchar(25),
    @ProcessUserName nvarchar(50),
    @LastHeartbeat datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Queue]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [QueueTypeID] = @QueueTypeID,
        [IsActive] = @IsActive,
        [ProcessPID] = @ProcessPID,
        [ProcessPlatform] = @ProcessPlatform,
        [ProcessVersion] = @ProcessVersion,
        [ProcessCwd] = @ProcessCwd,
        [ProcessIPAddress] = @ProcessIPAddress,
        [ProcessMacAddress] = @ProcessMacAddress,
        [ProcessOSName] = @ProcessOSName,
        [ProcessOSVersion] = @ProcessOSVersion,
        [ProcessHostName] = @ProcessHostName,
        [ProcessUserID] = @ProcessUserID,
        [ProcessUserName] = @ProcessUserName,
        [LastHeartbeat] = @LastHeartbeat
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Queue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQueue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQueue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueue
ON [${flyway:defaultSchema}].[Queue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Queue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Queue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Queues */




/* spDelete SQL for Queues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queues
-- Item: spDeleteQueue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Queue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQueue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQueue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Queue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for Queues */




/* Index for Foreign Keys for RecommendationRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RecommendationProviderID in table RecommendationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecommendationRun_RecommendationProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecommendationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecommendationRun_RecommendationProviderID ON [${flyway:defaultSchema}].[RecommendationRun] ([RecommendationProviderID]);

-- Index for foreign key RunByUserID in table RecommendationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecommendationRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecommendationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecommendationRun_RunByUserID ON [${flyway:defaultSchema}].[RecommendationRun] ([RunByUserID]);

/* Index for Foreign Keys for RecordChangeReplayRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table RecordChangeReplayRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChangeReplayRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChangeReplayRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChangeReplayRun_UserID ON [${flyway:defaultSchema}].[RecordChangeReplayRun] ([UserID]);

/* Base View SQL for Recommendation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: vwRecommendationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Recommendation Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecommendationRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRecommendationRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRecommendationRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecommendationRuns]
AS
SELECT
    r.*,
    RecommendationProvider_RecommendationProviderID.[Name] AS [RecommendationProvider],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[RecommendationRun] AS r
INNER JOIN
    [${flyway:defaultSchema}].[RecommendationProvider] AS RecommendationProvider_RecommendationProviderID
  ON
    [r].[RecommendationProviderID] = RecommendationProvider_RecommendationProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_RunByUserID
  ON
    [r].[RunByUserID] = User_RunByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecommendationRuns] TO [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for Recommendation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: Permissions for vwRecommendationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecommendationRuns] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for Recommendation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: spCreateRecommendationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecommendationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecommendationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecommendationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecommendationRun]
    @ID uniqueidentifier = NULL,
    @RecommendationProviderID uniqueidentifier,
    @StartDate datetimeoffset,
    @EndDate datetimeoffset,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @RunByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecommendationRun]
            (
                [ID],
                [RecommendationProviderID],
                [StartDate],
                [EndDate],
                [Status],
                [Description],
                [RunByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RecommendationProviderID,
                @StartDate,
                @EndDate,
                @Status,
                @Description,
                @RunByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecommendationRun]
            (
                [RecommendationProviderID],
                [StartDate],
                [EndDate],
                [Status],
                [Description],
                [RunByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RecommendationProviderID,
                @StartDate,
                @EndDate,
                @Status,
                @Description,
                @RunByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecommendationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecommendationRun] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Recommendation Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecommendationRun] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Recommendation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: spUpdateRecommendationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecommendationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecommendationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecommendationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecommendationRun]
    @ID uniqueidentifier,
    @RecommendationProviderID uniqueidentifier,
    @StartDate datetimeoffset,
    @EndDate datetimeoffset,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @RunByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecommendationRun]
    SET
        [RecommendationProviderID] = @RecommendationProviderID,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [Status] = @Status,
        [Description] = @Description,
        [RunByUserID] = @RunByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecommendationRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecommendationRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecommendationRun] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecommendationRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecommendationRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecommendationRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecommendationRun
ON [${flyway:defaultSchema}].[RecommendationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecommendationRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecommendationRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Recommendation Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecommendationRun] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Recommendation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recommendation Runs
-- Item: spDeleteRecommendationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecommendationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRecommendationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRecommendationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecommendationRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecommendationRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecommendationRun] TO [cdp_Integration]
    

/* spDelete Permissions for Recommendation Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecommendationRun] TO [cdp_Integration]



/* Base View SQL for Record Change Replay Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: vwRecordChangeReplayRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Record Change Replay Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordChangeReplayRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRecordChangeReplayRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRecordChangeReplayRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordChangeReplayRuns]
AS
SELECT
    r.*,
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[RecordChangeReplayRun] AS r
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordChangeReplayRuns] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Record Change Replay Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: Permissions for vwRecordChangeReplayRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordChangeReplayRuns] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Record Change Replay Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: spCreateRecordChangeReplayRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordChangeReplayRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordChangeReplayRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordChangeReplayRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordChangeReplayRun]
    @ID uniqueidentifier = NULL,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(50),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordChangeReplayRun]
            (
                [ID],
                [StartedAt],
                [EndedAt],
                [Status],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @StartedAt,
                @EndedAt,
                @Status,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordChangeReplayRun]
            (
                [StartedAt],
                [EndedAt],
                [Status],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @StartedAt,
                @EndedAt,
                @Status,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordChangeReplayRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChangeReplayRun] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Record Change Replay Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChangeReplayRun] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Record Change Replay Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: spUpdateRecordChangeReplayRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordChangeReplayRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecordChangeReplayRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordChangeReplayRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordChangeReplayRun]
    @ID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(50),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordChangeReplayRun]
    SET
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecordChangeReplayRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordChangeReplayRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChangeReplayRun] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordChangeReplayRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecordChangeReplayRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecordChangeReplayRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordChangeReplayRun
ON [${flyway:defaultSchema}].[RecordChangeReplayRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordChangeReplayRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordChangeReplayRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Record Change Replay Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChangeReplayRun] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Record Change Replay Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Change Replay Runs
-- Item: spDeleteRecordChangeReplayRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordChangeReplayRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRecordChangeReplayRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordChangeReplayRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordChangeReplayRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecordChangeReplayRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordChangeReplayRun] TO [cdp_Integration]
    

/* spDelete Permissions for Record Change Replay Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordChangeReplayRun] TO [cdp_Integration]



/* Index for Foreign Keys for RecordMergeLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table RecordMergeLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordMergeLog_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordMergeLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordMergeLog_EntityID ON [${flyway:defaultSchema}].[RecordMergeLog] ([EntityID]);

-- Index for foreign key InitiatedByUserID in table RecordMergeLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordMergeLog_InitiatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordMergeLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordMergeLog_InitiatedByUserID ON [${flyway:defaultSchema}].[RecordMergeLog] ([InitiatedByUserID]);

-- Index for foreign key ApprovedByUserID in table RecordMergeLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordMergeLog_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordMergeLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordMergeLog_ApprovedByUserID ON [${flyway:defaultSchema}].[RecordMergeLog] ([ApprovedByUserID]);

/* Base View SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: vwRecordMergeLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Record Merge Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordMergeLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRecordMergeLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRecordMergeLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordMergeLogs]
AS
SELECT
    r.*,
    Entity_EntityID.[Name] AS [Entity],
    User_InitiatedByUserID.[Name] AS [InitiatedByUser],
    User_ApprovedByUserID.[Name] AS [ApprovedByUser]
FROM
    [${flyway:defaultSchema}].[RecordMergeLog] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [r].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_InitiatedByUserID
  ON
    [r].[InitiatedByUserID] = User_InitiatedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_ApprovedByUserID
  ON
    [r].[ApprovedByUserID] = User_ApprovedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordMergeLogs] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: Permissions for vwRecordMergeLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordMergeLogs] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: spCreateRecordMergeLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordMergeLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordMergeLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordMergeLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordMergeLog]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @SurvivingRecordID nvarchar(450),
    @InitiatedByUserID uniqueidentifier,
    @ApprovalStatus nvarchar(10) = NULL,
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(10) = NULL,
    @ProcessingStartedAt datetimeoffset = NULL,
    @ProcessingEndedAt datetimeoffset,
    @ProcessingLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordMergeLog]
            (
                [ID],
                [EntityID],
                [SurvivingRecordID],
                [InitiatedByUserID],
                [ApprovalStatus],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingStartedAt],
                [ProcessingEndedAt],
                [ProcessingLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @SurvivingRecordID,
                @InitiatedByUserID,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                ISNULL(@ProcessingStartedAt, sysdatetimeoffset()),
                @ProcessingEndedAt,
                @ProcessingLog,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordMergeLog]
            (
                [EntityID],
                [SurvivingRecordID],
                [InitiatedByUserID],
                [ApprovalStatus],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingStartedAt],
                [ProcessingEndedAt],
                [ProcessingLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @SurvivingRecordID,
                @InitiatedByUserID,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                ISNULL(@ProcessingStartedAt, sysdatetimeoffset()),
                @ProcessingEndedAt,
                @ProcessingLog,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordMergeLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Record Merge Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: spUpdateRecordMergeLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordMergeLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecordMergeLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordMergeLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordMergeLog]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @SurvivingRecordID nvarchar(450),
    @InitiatedByUserID uniqueidentifier,
    @ApprovalStatus nvarchar(10),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(10),
    @ProcessingStartedAt datetimeoffset,
    @ProcessingEndedAt datetimeoffset,
    @ProcessingLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordMergeLog]
    SET
        [EntityID] = @EntityID,
        [SurvivingRecordID] = @SurvivingRecordID,
        [InitiatedByUserID] = @InitiatedByUserID,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingStartedAt] = @ProcessingStartedAt,
        [ProcessingEndedAt] = @ProcessingEndedAt,
        [ProcessingLog] = @ProcessingLog,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecordMergeLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordMergeLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordMergeLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecordMergeLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecordMergeLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordMergeLog
ON [${flyway:defaultSchema}].[RecordMergeLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordMergeLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordMergeLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Record Merge Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: spDeleteRecordMergeLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordMergeLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRecordMergeLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordMergeLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordMergeLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecordMergeLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordMergeLog] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Record Merge Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordMergeLog] TO [cdp_Integration], [cdp_Developer]



/* SQL text to update entity field related entity name field map for entity field ID CB52433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CB52433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID B252433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B252433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID B652433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B652433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID CE52433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CE52433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID B752433E-F36B-1410-8DD3-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B752433E-F36B-1410-8DD3-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for Template */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Template
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Template_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Template]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Template_CategoryID ON [${flyway:defaultSchema}].[Template] ([CategoryID]);

-- Index for foreign key UserID in table Template
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Template_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Template]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Template_UserID ON [${flyway:defaultSchema}].[Template] ([UserID]);

/* Base View SQL for Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: vwTemplates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Templates
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Template
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTemplates]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTemplates];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTemplates]
AS
SELECT
    t.*,
    TemplateCategory_CategoryID.[Name] AS [Category],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[Template] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[TemplateCategory] AS TemplateCategory_CategoryID
  ON
    [t].[CategoryID] = TemplateCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [t].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTemplates] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: Permissions for vwTemplates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTemplates] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: spCreateTemplate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Template
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTemplate]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTemplate];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTemplate]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserPrompt nvarchar(MAX),
    @UserID uniqueidentifier,
    @ActiveAt datetimeoffset,
    @DisabledAt datetimeoffset,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Template]
            (
                [ID],
                [Name],
                [Description],
                [CategoryID],
                [UserPrompt],
                [UserID],
                [ActiveAt],
                [DisabledAt],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @CategoryID,
                @UserPrompt,
                @UserID,
                @ActiveAt,
                @DisabledAt,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Template]
            (
                [Name],
                [Description],
                [CategoryID],
                [UserPrompt],
                [UserID],
                [ActiveAt],
                [DisabledAt],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @CategoryID,
                @UserPrompt,
                @UserID,
                @ActiveAt,
                @DisabledAt,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTemplates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTemplate] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Templates */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTemplate] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: spUpdateTemplate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Template
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTemplate]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTemplate];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTemplate]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserPrompt nvarchar(MAX),
    @UserID uniqueidentifier,
    @ActiveAt datetimeoffset,
    @DisabledAt datetimeoffset,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Template]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [UserPrompt] = @UserPrompt,
        [UserID] = @UserID,
        [ActiveAt] = @ActiveAt,
        [DisabledAt] = @DisabledAt,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTemplates] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTemplates]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTemplate] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Template table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTemplate]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTemplate];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTemplate
ON [${flyway:defaultSchema}].[Template]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Template]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Template] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Templates */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTemplate] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Templates
-- Item: spDeleteTemplate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Template
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTemplate]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTemplate];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTemplate]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Template]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTemplate] TO [cdp_Integration]
    

/* spDelete Permissions for Templates */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTemplate] TO [cdp_Integration]



/* Index for Foreign Keys for UserNotification */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserNotification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotification_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotification_UserID ON [${flyway:defaultSchema}].[UserNotification] ([UserID]);

-- Index for foreign key ResourceTypeID in table UserNotification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotification_ResourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotification_ResourceTypeID ON [${flyway:defaultSchema}].[UserNotification] ([ResourceTypeID]);

/* Index for Foreign Keys for UserRecordLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserRecordLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRecordLog_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRecordLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRecordLog_UserID ON [${flyway:defaultSchema}].[UserRecordLog] ([UserID]);

-- Index for foreign key EntityID in table UserRecordLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRecordLog_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRecordLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRecordLog_EntityID ON [${flyway:defaultSchema}].[UserRecordLog] ([EntityID]);

/* Base View Permissions SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: Permissions for vwUserRecordLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserRecordLogs] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spCreateUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserRecordLog]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EarliestAt datetimeoffset = NULL,
    @LatestAt datetimeoffset = NULL,
    @TotalCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserRecordLog]
            (
                [ID],
                [UserID],
                [EntityID],
                [RecordID],
                [EarliestAt],
                [LatestAt],
                [TotalCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @EntityID,
                @RecordID,
                ISNULL(@EarliestAt, sysdatetimeoffset()),
                ISNULL(@LatestAt, sysdatetimeoffset()),
                ISNULL(@TotalCount, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserRecordLog]
            (
                [UserID],
                [EntityID],
                [RecordID],
                [EarliestAt],
                [LatestAt],
                [TotalCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @EntityID,
                @RecordID,
                ISNULL(@EarliestAt, sysdatetimeoffset()),
                ISNULL(@LatestAt, sysdatetimeoffset()),
                ISNULL(@TotalCount, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserRecordLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRecordLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spUpdateUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRecordLog]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EarliestAt datetimeoffset,
    @LatestAt datetimeoffset,
    @TotalCount int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRecordLog]
    SET
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [EarliestAt] = @EarliestAt,
        [LatestAt] = @LatestAt,
        [TotalCount] = @TotalCount
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserRecordLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserRecordLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRecordLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRecordLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserRecordLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserRecordLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserRecordLog
ON [${flyway:defaultSchema}].[UserRecordLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRecordLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserRecordLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spDeleteUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRecordLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserRecordLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRecordLog] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: vwUserNotifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      User Notifications
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserNotification
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserNotifications]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserNotifications];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserNotifications]
AS
SELECT
    u.*,
    User_UserID.[Name] AS [User],
    ResourceType_ResourceTypeID.[Name] AS [ResourceType]
FROM
    [${flyway:defaultSchema}].[UserNotification] AS u
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ResourceType] AS ResourceType_ResourceTypeID
  ON
    [u].[ResourceTypeID] = ResourceType_ResourceTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotifications] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: Permissions for vwUserNotifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotifications] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spCreateUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotification]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID uniqueidentifier,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit = NULL,
    @ReadAt datetimeoffset,
    @ResourceRecordID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserNotification]
            (
                [ID],
                [UserID],
                [Title],
                [Message],
                [ResourceTypeID],
                [ResourceConfiguration],
                [Unread],
                [ReadAt],
                [ResourceRecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @Title,
                @Message,
                @ResourceTypeID,
                @ResourceConfiguration,
                ISNULL(@Unread, 1),
                @ReadAt,
                @ResourceRecordID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserNotification]
            (
                [UserID],
                [Title],
                [Message],
                [ResourceTypeID],
                [ResourceConfiguration],
                [Unread],
                [ReadAt],
                [ResourceRecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @Title,
                @Message,
                @ResourceTypeID,
                @ResourceConfiguration,
                ISNULL(@Unread, 1),
                @ReadAt,
                @ResourceRecordID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserNotifications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for User Notifications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spUpdateUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotification]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID uniqueidentifier,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit,
    @ReadAt datetimeoffset,
    @ResourceRecordID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotification]
    SET
        [UserID] = @UserID,
        [Title] = @Title,
        [Message] = @Message,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceConfiguration] = @ResourceConfiguration,
        [Unread] = @Unread,
        [ReadAt] = @ReadAt,
        [ResourceRecordID] = @ResourceRecordID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserNotifications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserNotifications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserNotification table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserNotification]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserNotification];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserNotification
ON [${flyway:defaultSchema}].[UserNotification]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotification]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserNotification] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User Notifications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spDeleteUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotification]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserNotification]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for User Notifications */




/* Index for Foreign Keys for UserViewRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserViewID in table UserViewRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserViewRun_UserViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserViewRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserViewRun_UserViewID ON [${flyway:defaultSchema}].[UserViewRun] ([UserViewID]);

-- Index for foreign key RunByUserID in table UserViewRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserViewRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserViewRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserViewRun_RunByUserID ON [${flyway:defaultSchema}].[UserViewRun] ([RunByUserID]);

/* Base View SQL for User View Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: vwUserViewRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      User View Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserViewRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserViewRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserViewRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserViewRuns]
AS
SELECT
    u.*,
    UserView_UserViewID.[Name] AS [UserView],
    User_RunByUserID.[Name] AS [RunByUser]
FROM
    [${flyway:defaultSchema}].[UserViewRun] AS u
INNER JOIN
    [${flyway:defaultSchema}].[UserView] AS UserView_UserViewID
  ON
    [u].[UserViewID] = UserView_UserViewID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_RunByUserID
  ON
    [u].[RunByUserID] = User_RunByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for User View Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: Permissions for vwUserViewRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for User View Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: spCreateUserViewRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserViewRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserViewRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserViewRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserViewRun]
    @ID uniqueidentifier = NULL,
    @UserViewID uniqueidentifier,
    @RunAt datetimeoffset,
    @RunByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserViewRun]
            (
                [ID],
                [UserViewID],
                [RunAt],
                [RunByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserViewID,
                @RunAt,
                @RunByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserViewRun]
            (
                [UserViewID],
                [RunAt],
                [RunByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserViewID,
                @RunAt,
                @RunByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserViewRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewRun] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for User View Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewRun] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spUpdate SQL for User View Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: spUpdateUserViewRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserViewRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserViewRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserViewRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserViewRun]
    @ID uniqueidentifier,
    @UserViewID uniqueidentifier,
    @RunAt datetimeoffset,
    @RunByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewRun]
    SET
        [UserViewID] = @UserViewID,
        [RunAt] = @RunAt,
        [RunByUserID] = @RunByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserViewRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserViewRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserViewRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserViewRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserViewRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserViewRun
ON [${flyway:defaultSchema}].[UserViewRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserViewRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User View Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for User View Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Runs
-- Item: spDeleteUserViewRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserViewRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserViewRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserViewRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserViewRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserViewRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for User View Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewRun] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for VersionInstallation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Version Installations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View Permissions SQL for Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Version Installations
-- Item: Permissions for vwVersionInstallations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionInstallations] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Version Installations
-- Item: spCreateVersionInstallation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VersionInstallation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateVersionInstallation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateVersionInstallation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateVersionInstallation]
    @ID uniqueidentifier = NULL,
    @MajorVersion int,
    @MinorVersion int,
    @PatchVersion int,
    @Type nvarchar(20),
    @InstalledAt datetimeoffset,
    @Status nvarchar(20) = NULL,
    @InstallLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[VersionInstallation]
            (
                [ID],
                [MajorVersion],
                [MinorVersion],
                [PatchVersion],
                [Type],
                [InstalledAt],
                [Status],
                [InstallLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MajorVersion,
                @MinorVersion,
                @PatchVersion,
                @Type,
                @InstalledAt,
                ISNULL(@Status, 'Pending'),
                @InstallLog,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[VersionInstallation]
            (
                [MajorVersion],
                [MinorVersion],
                [PatchVersion],
                [Type],
                [InstalledAt],
                [Status],
                [InstallLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MajorVersion,
                @MinorVersion,
                @PatchVersion,
                @Type,
                @InstalledAt,
                ISNULL(@Status, 'Pending'),
                @InstallLog,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwVersionInstallations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionInstallation] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Version Installations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionInstallation] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Version Installations
-- Item: spUpdateVersionInstallation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VersionInstallation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateVersionInstallation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionInstallation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionInstallation]
    @ID uniqueidentifier,
    @MajorVersion int,
    @MinorVersion int,
    @PatchVersion int,
    @Type nvarchar(20),
    @InstalledAt datetimeoffset,
    @Status nvarchar(20),
    @InstallLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionInstallation]
    SET
        [MajorVersion] = @MajorVersion,
        [MinorVersion] = @MinorVersion,
        [PatchVersion] = @PatchVersion,
        [Type] = @Type,
        [InstalledAt] = @InstalledAt,
        [Status] = @Status,
        [InstallLog] = @InstallLog,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwVersionInstallations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwVersionInstallations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionInstallation] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the VersionInstallation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateVersionInstallation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateVersionInstallation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateVersionInstallation
ON [${flyway:defaultSchema}].[VersionInstallation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionInstallation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[VersionInstallation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Version Installations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionInstallation] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Version Installations
-- Item: spDeleteVersionInstallation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VersionInstallation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteVersionInstallation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionInstallation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionInstallation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[VersionInstallation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionInstallation] TO [cdp_Integration]
    

/* spDelete Permissions for Version Installations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionInstallation] TO [cdp_Integration]



/* Index for Foreign Keys for WorkflowRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Workflow Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key WorkflowID in table WorkflowRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WorkflowRun_WorkflowID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WorkflowRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WorkflowRun_WorkflowID ON [${flyway:defaultSchema}].[WorkflowRun] ([WorkflowID]);

/* Base View Permissions SQL for Workflow Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Workflow Runs
-- Item: Permissions for vwWorkflowRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkflowRuns] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Workflow Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Workflow Runs
-- Item: spCreateWorkflowRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR WorkflowRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWorkflowRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWorkflowRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateWorkflowRun]
    @ID uniqueidentifier = NULL,
    @WorkflowID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(500),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nchar(10) = NULL,
    @Results nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[WorkflowRun]
            (
                [ID],
                [WorkflowID],
                [ExternalSystemRecordID],
                [StartedAt],
                [EndedAt],
                [Status],
                [Results]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @WorkflowID,
                @ExternalSystemRecordID,
                @StartedAt,
                @EndedAt,
                ISNULL(@Status, 'Pending'),
                @Results
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[WorkflowRun]
            (
                [WorkflowID],
                [ExternalSystemRecordID],
                [StartedAt],
                [EndedAt],
                [Status],
                [Results]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @WorkflowID,
                @ExternalSystemRecordID,
                @StartedAt,
                @EndedAt,
                ISNULL(@Status, 'Pending'),
                @Results
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwWorkflowRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkflowRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Workflow Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkflowRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Workflow Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Workflow Runs
-- Item: spUpdateWorkflowRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR WorkflowRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWorkflowRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkflowRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkflowRun]
    @ID uniqueidentifier,
    @WorkflowID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(500),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nchar(10),
    @Results nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkflowRun]
    SET
        [WorkflowID] = @WorkflowID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [Results] = @Results
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwWorkflowRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwWorkflowRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkflowRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkflowRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateWorkflowRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateWorkflowRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateWorkflowRun
ON [${flyway:defaultSchema}].[WorkflowRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkflowRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[WorkflowRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Workflow Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkflowRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Workflow Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Workflow Runs
-- Item: spDeleteWorkflowRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WorkflowRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWorkflowRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkflowRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkflowRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[WorkflowRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkflowRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Workflow Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkflowRun] TO [cdp_Developer], [cdp_Integration]



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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE @ConversationDetails_ConversationID uniqueidentifier
    DECLARE @ConversationDetails_ExternalID nvarchar(100)
    DECLARE @ConversationDetails_Role nvarchar(20)
    DECLARE @ConversationDetails_Message nvarchar(MAX)
    DECLARE @ConversationDetails_Error nvarchar(MAX)
    DECLARE @ConversationDetails_HiddenToUser bit
    DECLARE @ConversationDetails_UserRating int
    DECLARE @ConversationDetails_UserFeedback nvarchar(MAX)
    DECLARE @ConversationDetails_ReflectionInsights nvarchar(MAX)
    DECLARE @ConversationDetails_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @ConversationDetails_UserID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactVersionID uniqueidentifier
    DECLARE @ConversationDetails_CompletionTime bigint
    DECLARE @ConversationDetails_IsPinned bit
    DECLARE @ConversationDetails_ParentID uniqueidentifier
    DECLARE @ConversationDetails_AgentID uniqueidentifier
    DECLARE @ConversationDetails_Status nvarchar(20)
    DECLARE @ConversationDetails_SuggestedResponses nvarchar(MAX)
    DECLARE @ConversationDetails_TestRunID uniqueidentifier
    DECLARE @ConversationDetails_ResponseForm nvarchar(MAX)
    DECLARE @ConversationDetails_ActionableCommands nvarchar(MAX)
    DECLARE @ConversationDetails_AutomaticCommands nvarchar(MAX)
    DECLARE @ConversationDetails_OriginalMessageChanged bit
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactVersionID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ArtifactVersionID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses, @TestRunID = @ConversationDetails_TestRunID, @ResponseForm = @ConversationDetails_ResponseForm, @ActionableCommands = @ConversationDetails_ActionableCommands, @AutomaticCommands = @ConversationDetails_AutomaticCommands, @OriginalMessageChanged = @ConversationDetails_OriginalMessageChanged
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]



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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE @ConversationDetails_ConversationID uniqueidentifier
    DECLARE @ConversationDetails_ExternalID nvarchar(100)
    DECLARE @ConversationDetails_Role nvarchar(20)
    DECLARE @ConversationDetails_Message nvarchar(MAX)
    DECLARE @ConversationDetails_Error nvarchar(MAX)
    DECLARE @ConversationDetails_HiddenToUser bit
    DECLARE @ConversationDetails_UserRating int
    DECLARE @ConversationDetails_UserFeedback nvarchar(MAX)
    DECLARE @ConversationDetails_ReflectionInsights nvarchar(MAX)
    DECLARE @ConversationDetails_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @ConversationDetails_UserID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactVersionID uniqueidentifier
    DECLARE @ConversationDetails_CompletionTime bigint
    DECLARE @ConversationDetails_IsPinned bit
    DECLARE @ConversationDetails_ParentID uniqueidentifier
    DECLARE @ConversationDetails_AgentID uniqueidentifier
    DECLARE @ConversationDetails_Status nvarchar(20)
    DECLARE @ConversationDetails_SuggestedResponses nvarchar(MAX)
    DECLARE @ConversationDetails_TestRunID uniqueidentifier
    DECLARE @ConversationDetails_ResponseForm nvarchar(MAX)
    DECLARE @ConversationDetails_ActionableCommands nvarchar(MAX)
    DECLARE @ConversationDetails_AutomaticCommands nvarchar(MAX)
    DECLARE @ConversationDetails_OriginalMessageChanged bit
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ArtifactID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses, @TestRunID = @ConversationDetails_TestRunID, @ResponseForm = @ConversationDetails_ResponseForm, @ActionableCommands = @ConversationDetails_ActionableCommands, @AutomaticCommands = @ConversationDetails_AutomaticCommands, @OriginalMessageChanged = @ConversationDetails_OriginalMessageChanged
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    
    -- Cascade delete from ConversationArtifactPermission using cursor to call spDeleteConversationArtifactPermission
    DECLARE @MJ_ConversationArtifactPermissionsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationArtifactPermissions_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifactPermission]
        WHERE [ConversationArtifactID] = @ID
    
    OPEN cascade_delete_MJ_ConversationArtifactPermissions_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactPermissions_cursor INTO @MJ_ConversationArtifactPermissionsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission] @ID = @MJ_ConversationArtifactPermissionsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactPermissions_cursor INTO @MJ_ConversationArtifactPermissionsID
    END
    
    CLOSE cascade_delete_MJ_ConversationArtifactPermissions_cursor
    DEALLOCATE cascade_delete_MJ_ConversationArtifactPermissions_cursor
    
    -- Cascade delete from ConversationArtifactVersion using cursor to call spDeleteConversationArtifactVersion
    DECLARE @MJ_ConversationArtifactVersionsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationArtifactVersions_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifactVersion]
        WHERE [ConversationArtifactID] = @ID
    
    OPEN cascade_delete_MJ_ConversationArtifactVersions_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactVersions_cursor INTO @MJ_ConversationArtifactVersionsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] @ID = @MJ_ConversationArtifactVersionsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactVersions_cursor INTO @MJ_ConversationArtifactVersionsID
    END
    
    CLOSE cascade_delete_MJ_ConversationArtifactVersions_cursor
    DEALLOCATE cascade_delete_MJ_ConversationArtifactVersions_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]



/* spDelete SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spDeleteConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Conversation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @AIAgentNotesID uniqueidentifier
    DECLARE @AIAgentNotes_AgentID uniqueidentifier
    DECLARE @AIAgentNotes_AgentNoteTypeID uniqueidentifier
    DECLARE @AIAgentNotes_Note nvarchar(MAX)
    DECLARE @AIAgentNotes_UserID uniqueidentifier
    DECLARE @AIAgentNotes_Type nvarchar(20)
    DECLARE @AIAgentNotes_IsAutoGenerated bit
    DECLARE @AIAgentNotes_Comments nvarchar(MAX)
    DECLARE @AIAgentNotes_Status nvarchar(20)
    DECLARE @AIAgentNotes_SourceConversationID uniqueidentifier
    DECLARE @AIAgentNotes_SourceConversationDetailID uniqueidentifier
    DECLARE @AIAgentNotes_SourceAIAgentRunID uniqueidentifier
    DECLARE @AIAgentNotes_CompanyID uniqueidentifier
    DECLARE @AIAgentNotes_EmbeddingVector nvarchar(MAX)
    DECLARE @AIAgentNotes_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_AIAgentNotes_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationID] = @ID
    
    OPEN cascade_update_AIAgentNotes_cursor
    FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @AIAgentNotes_SourceConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @AIAgentNotesID, @AgentID = @AIAgentNotes_AgentID, @AgentNoteTypeID = @AIAgentNotes_AgentNoteTypeID, @Note = @AIAgentNotes_Note, @UserID = @AIAgentNotes_UserID, @Type = @AIAgentNotes_Type, @IsAutoGenerated = @AIAgentNotes_IsAutoGenerated, @Comments = @AIAgentNotes_Comments, @Status = @AIAgentNotes_Status, @SourceConversationID = @AIAgentNotes_SourceConversationID, @SourceConversationDetailID = @AIAgentNotes_SourceConversationDetailID, @SourceAIAgentRunID = @AIAgentNotes_SourceAIAgentRunID, @CompanyID = @AIAgentNotes_CompanyID, @EmbeddingVector = @AIAgentNotes_EmbeddingVector, @EmbeddingModelID = @AIAgentNotes_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    END
    
    CLOSE cascade_update_AIAgentNotes_cursor
    DEALLOCATE cascade_update_AIAgentNotes_cursor
    
    -- Cascade delete from ConversationDetail using cursor to call spDeleteConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE cascade_delete_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_ConversationDetails_cursor
    FETCH NEXT FROM cascade_delete_ConversationDetails_cursor INTO @ConversationDetailsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetail] @ID = @ConversationDetailsID
        
        FETCH NEXT FROM cascade_delete_ConversationDetails_cursor INTO @ConversationDetailsID
    END
    
    CLOSE cascade_delete_ConversationDetails_cursor
    DEALLOCATE cascade_delete_ConversationDetails_cursor
    
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJ_AIAgentExamplesID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_UserID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_CompanyID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_Type nvarchar(20)
    DECLARE @MJ_AIAgentExamples_ExampleInput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_ExampleOutput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_IsAutoGenerated bit
    DECLARE @MJ_AIAgentExamples_SourceConversationID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SuccessScore decimal(5, 2)
    DECLARE @MJ_AIAgentExamples_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_Status nvarchar(20)
    DECLARE @MJ_AIAgentExamples_EmbeddingVector nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentExamples_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationID] = @ID
    
    OPEN cascade_update_MJ_AIAgentExamples_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentExamples_SourceConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJ_AIAgentExamplesID, @AgentID = @MJ_AIAgentExamples_AgentID, @UserID = @MJ_AIAgentExamples_UserID, @CompanyID = @MJ_AIAgentExamples_CompanyID, @Type = @MJ_AIAgentExamples_Type, @ExampleInput = @MJ_AIAgentExamples_ExampleInput, @ExampleOutput = @MJ_AIAgentExamples_ExampleOutput, @IsAutoGenerated = @MJ_AIAgentExamples_IsAutoGenerated, @SourceConversationID = @MJ_AIAgentExamples_SourceConversationID, @SourceConversationDetailID = @MJ_AIAgentExamples_SourceConversationDetailID, @SourceAIAgentRunID = @MJ_AIAgentExamples_SourceAIAgentRunID, @SuccessScore = @MJ_AIAgentExamples_SuccessScore, @Comments = @MJ_AIAgentExamples_Comments, @Status = @MJ_AIAgentExamples_Status, @EmbeddingVector = @MJ_AIAgentExamples_EmbeddingVector, @EmbeddingModelID = @MJ_AIAgentExamples_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    END
    
    CLOSE cascade_update_MJ_AIAgentExamples_cursor
    DEALLOCATE cascade_update_MJ_AIAgentExamples_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJ_AIAgentRunsID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ParentRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Status nvarchar(50)
    DECLARE @MJ_AIAgentRuns_StartedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_CompletedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_Success bit
    DECLARE @MJ_AIAgentRuns_ErrorMessage nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ConversationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_UserID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Result nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_AgentState nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCost decimal(18, 6)
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCostRollup decimal(19, 8)
    DECLARE @MJ_AIAgentRuns_ConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ConversationDetailSequence int
    DECLARE @MJ_AIAgentRuns_CancellationReason nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalStep nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Message nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_LastRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_StartingPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalPromptIterations int
    DECLARE @MJ_AIAgentRuns_ConfigurationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideModelID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideVendorID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Data nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Verbose bit
    DECLARE @MJ_AIAgentRuns_EffortLevel int
    DECLARE @MJ_AIAgentRuns_RunName nvarchar(255)
    DECLARE @MJ_AIAgentRuns_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ScheduledJobRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_TestRunID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID, @TestRunID = @MJ_AIAgentRuns_TestRunID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
    -- Cascade delete from ConversationArtifact using cursor to call spDeleteConversationArtifact
    DECLARE @MJ_ConversationArtifactsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationArtifacts_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifact]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJ_ConversationArtifacts_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationArtifacts_cursor INTO @MJ_ConversationArtifactsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifact] @ID = @MJ_ConversationArtifactsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationArtifacts_cursor INTO @MJ_ConversationArtifactsID
    END
    
    CLOSE cascade_delete_MJ_ConversationArtifacts_cursor
    DEALLOCATE cascade_delete_MJ_ConversationArtifacts_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @ReportsID uniqueidentifier
    DECLARE @Reports_Name nvarchar(255)
    DECLARE @Reports_Description nvarchar(MAX)
    DECLARE @Reports_CategoryID uniqueidentifier
    DECLARE @Reports_UserID uniqueidentifier
    DECLARE @Reports_SharingScope nvarchar(20)
    DECLARE @Reports_ConversationID uniqueidentifier
    DECLARE @Reports_ConversationDetailID uniqueidentifier
    DECLARE @Reports_DataContextID uniqueidentifier
    DECLARE @Reports_Configuration nvarchar(MAX)
    DECLARE @Reports_OutputTriggerTypeID uniqueidentifier
    DECLARE @Reports_OutputFormatTypeID uniqueidentifier
    DECLARE @Reports_OutputDeliveryTypeID uniqueidentifier
    DECLARE @Reports_OutputFrequency nvarchar(50)
    DECLARE @Reports_OutputTargetEmail nvarchar(255)
    DECLARE @Reports_OutputWorkflowID uniqueidentifier
    DECLARE @Reports_Thumbnail nvarchar(MAX)
    DECLARE @Reports_EnvironmentID uniqueidentifier
    DECLARE cascade_update_Reports_cursor CURSOR FOR 
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_update_Reports_cursor
    FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @Reports_ConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @ReportsID, @Name = @Reports_Name, @Description = @Reports_Description, @CategoryID = @Reports_CategoryID, @UserID = @Reports_UserID, @SharingScope = @Reports_SharingScope, @ConversationID = @Reports_ConversationID, @ConversationDetailID = @Reports_ConversationDetailID, @DataContextID = @Reports_DataContextID, @Configuration = @Reports_Configuration, @OutputTriggerTypeID = @Reports_OutputTriggerTypeID, @OutputFormatTypeID = @Reports_OutputFormatTypeID, @OutputDeliveryTypeID = @Reports_OutputDeliveryTypeID, @OutputFrequency = @Reports_OutputFrequency, @OutputTargetEmail = @Reports_OutputTargetEmail, @OutputWorkflowID = @Reports_OutputWorkflowID, @Thumbnail = @Reports_Thumbnail, @EnvironmentID = @Reports_EnvironmentID
        
        FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    END
    
    CLOSE cascade_update_Reports_cursor
    DEALLOCATE cascade_update_Reports_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Conversation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spDelete SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: spDeleteQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on DataContextItem using cursor to call spUpdateDataContextItem
    DECLARE @DataContextItemsID uniqueidentifier
    DECLARE @DataContextItems_DataContextID uniqueidentifier
    DECLARE @DataContextItems_Type nvarchar(50)
    DECLARE @DataContextItems_ViewID uniqueidentifier
    DECLARE @DataContextItems_QueryID uniqueidentifier
    DECLARE @DataContextItems_EntityID uniqueidentifier
    DECLARE @DataContextItems_RecordID nvarchar(450)
    DECLARE @DataContextItems_SQL nvarchar(MAX)
    DECLARE @DataContextItems_DataJSON nvarchar(MAX)
    DECLARE @DataContextItems_LastRefreshedAt datetimeoffset
    DECLARE @DataContextItems_Description nvarchar(MAX)
    DECLARE @DataContextItems_CodeName nvarchar(255)
    DECLARE cascade_update_DataContextItems_cursor CURSOR FOR 
        SELECT [ID], [DataContextID], [Type], [ViewID], [QueryID], [EntityID], [RecordID], [SQL], [DataJSON], [LastRefreshedAt], [Description], [CodeName]
        FROM [${flyway:defaultSchema}].[DataContextItem]
        WHERE [QueryID] = @ID
    
    OPEN cascade_update_DataContextItems_cursor
    FETCH NEXT FROM cascade_update_DataContextItems_cursor INTO @DataContextItemsID, @DataContextItems_DataContextID, @DataContextItems_Type, @DataContextItems_ViewID, @DataContextItems_QueryID, @DataContextItems_EntityID, @DataContextItems_RecordID, @DataContextItems_SQL, @DataContextItems_DataJSON, @DataContextItems_LastRefreshedAt, @DataContextItems_Description, @DataContextItems_CodeName
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @DataContextItems_QueryID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDataContextItem] @ID = @DataContextItemsID, @DataContextID = @DataContextItems_DataContextID, @Type = @DataContextItems_Type, @ViewID = @DataContextItems_ViewID, @QueryID = @DataContextItems_QueryID, @EntityID = @DataContextItems_EntityID, @RecordID = @DataContextItems_RecordID, @SQL = @DataContextItems_SQL, @DataJSON = @DataContextItems_DataJSON, @LastRefreshedAt = @DataContextItems_LastRefreshedAt, @Description = @DataContextItems_Description, @CodeName = @DataContextItems_CodeName
        
        FETCH NEXT FROM cascade_update_DataContextItems_cursor INTO @DataContextItemsID, @DataContextItems_DataContextID, @DataContextItems_Type, @DataContextItems_ViewID, @DataContextItems_QueryID, @DataContextItems_EntityID, @DataContextItems_RecordID, @DataContextItems_SQL, @DataContextItems_DataJSON, @DataContextItems_LastRefreshedAt, @DataContextItems_Description, @DataContextItems_CodeName
    END
    
    CLOSE cascade_update_DataContextItems_cursor
    DEALLOCATE cascade_update_DataContextItems_cursor
    
    -- Cascade delete from QueryParameter using cursor to call spDeleteQueryParameter
    DECLARE @MJ_QueryParametersID uniqueidentifier
    DECLARE cascade_delete_MJ_QueryParameters_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryParameter]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJ_QueryParameters_cursor
    FETCH NEXT FROM cascade_delete_MJ_QueryParameters_cursor INTO @MJ_QueryParametersID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryParameter] @ID = @MJ_QueryParametersID
        
        FETCH NEXT FROM cascade_delete_MJ_QueryParameters_cursor INTO @MJ_QueryParametersID
    END
    
    CLOSE cascade_delete_MJ_QueryParameters_cursor
    DEALLOCATE cascade_delete_MJ_QueryParameters_cursor
    
    -- Cascade delete from QueryEntity using cursor to call spDeleteQueryEntity
    DECLARE @QueryEntitiesID uniqueidentifier
    DECLARE cascade_delete_QueryEntities_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryEntity]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_QueryEntities_cursor
    FETCH NEXT FROM cascade_delete_QueryEntities_cursor INTO @QueryEntitiesID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryEntity] @ID = @QueryEntitiesID
        
        FETCH NEXT FROM cascade_delete_QueryEntities_cursor INTO @QueryEntitiesID
    END
    
    CLOSE cascade_delete_QueryEntities_cursor
    DEALLOCATE cascade_delete_QueryEntities_cursor
    
    -- Cascade delete from QueryField using cursor to call spDeleteQueryField
    DECLARE @QueryFieldsID uniqueidentifier
    DECLARE cascade_delete_QueryFields_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryField]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_QueryFields_cursor
    FETCH NEXT FROM cascade_delete_QueryFields_cursor INTO @QueryFieldsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryField] @ID = @QueryFieldsID
        
        FETCH NEXT FROM cascade_delete_QueryFields_cursor INTO @QueryFieldsID
    END
    
    CLOSE cascade_delete_QueryFields_cursor
    DEALLOCATE cascade_delete_QueryFields_cursor
    
    -- Cascade delete from QueryPermission using cursor to call spDeleteQueryPermission
    DECLARE @QueryPermissionsID uniqueidentifier
    DECLARE cascade_delete_QueryPermissions_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryPermission]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_QueryPermissions_cursor
    FETCH NEXT FROM cascade_delete_QueryPermissions_cursor INTO @QueryPermissionsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryPermission] @ID = @QueryPermissionsID
        
        FETCH NEXT FROM cascade_delete_QueryPermissions_cursor INTO @QueryPermissionsID
    END
    
    CLOSE cascade_delete_QueryPermissions_cursor
    DEALLOCATE cascade_delete_QueryPermissions_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Query]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Integration]
    

/* spDelete Permissions for Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'eed41ed3-16bf-4fc2-b333-241ccb366587'  OR 
               (EntityID = '99B00220-BABA-4C42-BC7C-00E1EE14651C' AND Name = 'TestRun')
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
            'eed41ed3-16bf-4fc2-b333-241ccb366587',
            '99B00220-BABA-4C42-BC7C-00E1EE14651C', -- Entity: MJ: Test Run Feedbacks
            100022,
            'TestRun',
            'Test Run',
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
         WHERE ID = 'fb214dd1-96d7-41d4-be42-15685e8663ec'  OR 
               (EntityID = 'D95A17EE-5750-4218-86AD-10F06E4DFBCA' AND Name = 'CredentialType')
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
            'fb214dd1-96d7-41d4-be42-15685e8663ec',
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA', -- Entity: MJ: AI Vendors
            100013,
            'CredentialType',
            'Credential Type',
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
         WHERE ID = '84fa19a3-7667-43c6-9273-070a9a925d7f'  OR 
               (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TestRun')
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
            '84fa19a3-7667-43c6-9273-070a9a925d7f',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversation Details
            100068,
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
         WHERE ID = 'df46472c-28a2-4352-8699-d29597540b8d'  OR 
               (EntityID = '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA' AND Name = 'TestSuiteRun')
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
            'df46472c-28a2-4352-8699-d29597540b8d',
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', -- Entity: MJ: Test Runs
            100050,
            'TestSuiteRun',
            'Test Suite Run',
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
         WHERE ID = '3f5b9551-eb7d-4ca9-b177-9d0473598e32'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'TestRun')
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
            '3f5b9551-eb7d-4ca9-b177-9d0473598e32',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100193,
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
         WHERE ID = '232c993c-453f-486a-b601-c47d99ad4ad5'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'Credential')
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
            '232c993c-453f-486a-b601-c47d99ad4ad5',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100021,
            'Credential',
            'Credential',
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
         WHERE ID = '3d12f8d7-b14b-439d-b600-8e68d96c62a2'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'AIVendor')
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
            '3d12f8d7-b14b-439d-b600-8e68d96c62a2',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100022,
            'AIVendor',
            'AI Vendor',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = 'e4467c1f-b2cd-46d0-ae75-b14fc484c4d2'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'AIModelVendor')
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
            'e4467c1f-b2cd-46d0-ae75-b14fc484c4d2',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100023,
            'AIModelVendor',
            'AI Model Vendor',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = '7418eb4e-f89f-438a-a1ce-70592c1e3099'  OR 
               (EntityID = 'E546D71E-002C-43F6-8581-D2C0813580D4' AND Name = 'AIPromptModel')
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
            '7418eb4e-f89f-438a-a1ce-70592c1e3099',
            'E546D71E-002C-43F6-8581-D2C0813580D4', -- Entity: MJ: AI Credential Bindings
            100024,
            'AIPromptModel',
            'AI Prompt Model',
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

/* Generated Validation Functions for MJ: AI Credential Bindings */
-- CHECK constraint for MJ: AI Credential Bindings @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([BindingType]=''Vendor'' AND [AIVendorID] IS NOT NULL AND [AIModelVendorID] IS NULL AND [AIPromptModelID] IS NULL OR [BindingType]=''ModelVendor'' AND [AIVendorID] IS NULL AND [AIModelVendorID] IS NOT NULL AND [AIPromptModelID] IS NULL OR [BindingType]=''PromptModel'' AND [AIVendorID] IS NULL AND [AIModelVendorID] IS NULL AND [AIPromptModelID] IS NOT NULL)', 'public ValidateBindingTypeAndRelatedIds(result: ValidationResult) {
	// Validate that the ID fields correspond to the selected BindingType
	if (this.BindingType === ''Vendor'') {
		// AIVendorID must be present
		if (this.AIVendorID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"AIVendorID",
				"When BindingType is ''Vendor'', AIVendorID must be provided.",
				this.AIVendorID,
				ValidationErrorType.Failure
			));
		}
		// The other IDs must be empty
		if (this.AIModelVendorID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AIModelVendorID",
				"When BindingType is ''Vendor'', AIModelVendorID must be empty.",
				this.AIModelVendorID,
				ValidationErrorType.Failure
			));
		}
		if (this.AIPromptModelID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AIPromptModelID",
				"When BindingType is ''Vendor'', AIPromptModelID must be empty.",
				this.AIPromptModelID,
				ValidationErrorType.Failure
			));
		}
	} else if (this.BindingType === ''ModelVendor'') {
		// AIModelVendorID must be present
		if (this.AIModelVendorID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"AIModelVendorID",
				"When BindingType is ''ModelVendor'', AIModelVendorID must be provided.",
				this.AIModelVendorID,
				ValidationErrorType.Failure
			));
		}
		// The other IDs must be empty
		if (this.AIVendorID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AIVendorID",
				"When BindingType is ''ModelVendor'', AIVendorID must be empty.",
				this.AIVendorID,
				ValidationErrorType.Failure
			));
		}
		if (this.AIPromptModelID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AIPromptModelID",
				"When BindingType is ''ModelVendor'', AIPromptModelID must be empty.",
				this.AIPromptModelID,
				ValidationErrorType.Failure
			));
		}
	} else if (this.BindingType === ''PromptModel'') {
		// AIPromptModelID must be present
		if (this.AIPromptModelID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"AIPromptModelID",
				"When BindingType is ''PromptModel'', AIPromptModelID must be provided.",
				this.AIPromptModelID,
				ValidationErrorType.Failure
			));
		}
		// The other IDs must be empty
		if (this.AIVendorID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AIVendorID",
				"When BindingType is ''PromptModel'', AIVendorID must be empty.",
				this.AIVendorID,
				ValidationErrorType.Failure
			));
		}
		if (this.AIModelVendorID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AIModelVendorID",
				"When BindingType is ''PromptModel'', AIModelVendorID must be empty.",
				this.AIModelVendorID,
				ValidationErrorType.Failure
			));
		}
	} else {
		// Unexpected BindingType value
		result.Errors.push(new ValidationErrorInfo(
			"BindingType",
			"BindingType must be one of ''Vendor'', ''ModelVendor'', or ''PromptModel''.",
			this.BindingType,
			ValidationErrorType.Failure
		));
	}
}', 'Ensures that the type of binding specified in the record matches exactly one related ID column: when BindingType is ''Vendor'' an AIVendorID must be provided and the other two IDs must be empty; when BindingType is ''ModelVendor'' an AIModelVendorID must be provided and the other IDs must be empty; when BindingType is ''PromptModel'' an AIPromptModelID must be provided and the other IDs must be empty. This prevents ambiguous or missing references.', 'ValidateBindingTypeAndRelatedIds', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E546D71E-002C-43F6-8581-D2C0813580D4');
  
            

