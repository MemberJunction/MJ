-- AI Model Cost Tracking Schema
-- Creates tables for tracking AI model pricing across vendors with temporal support

-- =====================================================
-- AIModelPriceType Table
-- =====================================================
CREATE TABLE ${flyway:defaultSchema}.AIModelPriceType (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    
    CONSTRAINT chk_AIModelPriceType_Name CHECK (LEN(LTRIM(RTRIM(Name))) > 0),
    CONSTRAINT uq_AIModelPriceType_Name UNIQUE (Name)
);

-- =====================================================
-- AIModelPriceUnitType Table  
-- =====================================================
CREATE TABLE ${flyway:defaultSchema}.AIModelPriceUnitType (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DriverClass NVARCHAR(255) NOT NULL,
    
    CONSTRAINT chk_AIModelPriceUnitType_Name CHECK (LEN(LTRIM(RTRIM(Name))) > 0),
    CONSTRAINT chk_AIModelPriceUnitType_DriverClass CHECK (LEN(LTRIM(RTRIM(DriverClass))) > 0),
    CONSTRAINT uq_AIModelPriceUnitType_Name UNIQUE (Name) 
);

-- =====================================================
-- AIModelCost Table
-- =====================================================
CREATE TABLE ${flyway:defaultSchema}.AIModelCost (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    ModelID UNIQUEIDENTIFIER NOT NULL,
    VendorID UNIQUEIDENTIFIER NOT NULL,
    StartedAt DATETIMEOFFSET(7) NULL DEFAULT SYSDATETIMEOFFSET(),
    EndedAt DATETIMEOFFSET(7) NULL,
    Status NVARCHAR(20) NOT NULL,
    Currency NCHAR(3) NOT NULL,
    PriceTypeID UNIQUEIDENTIFIER NOT NULL,
    InputPricePerUnit DECIMAL(18,8) NOT NULL,
    OutputPricePerUnit DECIMAL(18,8) NOT NULL,
    UnitTypeID UNIQUEIDENTIFIER NOT NULL,
    ProcessingType NVARCHAR(20) NOT NULL,
    Comments NVARCHAR(MAX) NULL,
    
    -- Check Constraints
    CONSTRAINT chk_AIModelCost_Status CHECK (Status IN ('Active', 'Pending', 'Expired', 'Invalid')),
    CONSTRAINT chk_AIModelCost_Currency CHECK (LEN(Currency) = 3 AND Currency = UPPER(Currency)),
    CONSTRAINT chk_AIModelCost_ProcessingType CHECK (ProcessingType IN ('Realtime', 'Batch')),
    CONSTRAINT chk_AIModelCost_InputPrice CHECK (InputPricePerUnit >= 0),
    CONSTRAINT chk_AIModelCost_OutputPrice CHECK (OutputPricePerUnit >= 0),
    CONSTRAINT chk_AIModelCost_DateRange CHECK (EndedAt IS NULL OR StartedAt IS NULL OR EndedAt > StartedAt),
    
    -- Foreign Keys
    CONSTRAINT fk_AIModelCost_ModelID FOREIGN KEY (ModelID) REFERENCES ${flyway:defaultSchema}.AIModel(ID),
    CONSTRAINT fk_AIModelCost_VendorID FOREIGN KEY (VendorID) REFERENCES ${flyway:defaultSchema}.AIVendor(ID),
    CONSTRAINT fk_AIModelCost_PriceTypeID FOREIGN KEY (PriceTypeID) REFERENCES ${flyway:defaultSchema}.AIModelPriceType(ID),
    CONSTRAINT fk_AIModelCost_UnitTypeID FOREIGN KEY (UnitTypeID) REFERENCES ${flyway:defaultSchema}.AIModelPriceUnitType(ID)
);

-- =====================================================
-- Extended Properties Documentation
-- =====================================================

-- AIModelPriceType Table Documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Defines the different types of pricing metrics used by AI model vendors (e.g., Tokens, Minutes, Characters, API Calls)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelPriceType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Short, descriptive name for the price type (e.g., "Tokens", "Minutes", "Characters")',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelPriceType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Detailed description of what this price type represents and how it is measured',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelPriceType',
    @level2type = N'COLUMN', @level2name = N'Description';

-- AIModelPriceUnitType Table Documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Defines the unit scales used for pricing (e.g., Per 1M Tokens, Per 1K Tokens, Per Minute). Includes driver class for normalization calculations',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelPriceUnitType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Display name for the pricing unit (e.g., "Per 1M Tokens", "Per 1K Tokens", "Per Minute")',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelPriceUnitType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Detailed explanation of the unit scale and any special considerations for this pricing unit',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelPriceUnitType',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Fully qualified class name that handles cost calculations and unit normalization for this pricing unit (e.g., "TokenPer1M", "TokenPer1K")',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelPriceUnitType',
    @level2type = N'COLUMN', @level2name = N'DriverClass';

-- AIModelCost Table Documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Stores historical and current pricing information for AI models across different vendors, with optional temporal tracking and support for different processing types',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelCost';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Date and time with timezone when this pricing became effective. NULL disables temporal tracking. Defaults to current UTC time when record is created',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'StartedAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Date and time with timezone when this pricing expired or will expire. NULL indicates currently active pricing',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'EndedAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Current status of this pricing record. Active=currently in use, Pending=scheduled for future, Expired=no longer valid, Invalid=data error',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'ISO 4217 three-letter currency code (e.g., USD, EUR, GBP) in uppercase',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'Currency';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Price per unit for input tokens/requests. Must be non-negative. Precision allows for micro-pricing scenarios',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'InputPricePerUnit';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Price per unit for output tokens/responses. Must be non-negative. Often higher than input pricing',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'OutputPricePerUnit';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Processing method that affects pricing. Realtime=immediate response, Batch=delayed processing often with discounts',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'ProcessingType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Optional notes about pricing context, source, special conditions, or vendor-specific details',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'Comments';








/************** CODE GEN OUTPUT **************/
/* SQL generated to create new entity MJ: AI Model Price Types */

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
         '4f51dae4-4f4d-444a-b931-4f29ab2a871a',
         'MJ: AI Model Price Types',
         NULL,
         NULL,
         'AIModelPriceType',
         'vwAIModelPriceTypes',
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
   

/* SQL generated to add new entity MJ: AI Model Price Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4f51dae4-4f4d-444a-b931-4f29ab2a871a', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Model Price Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4f51dae4-4f4d-444a-b931-4f29ab2a871a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Model Price Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4f51dae4-4f4d-444a-b931-4f29ab2a871a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Model Price Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4f51dae4-4f4d-444a-b931-4f29ab2a871a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Model Price Unit Types */

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
         '7815f891-ef05-4b4b-bb1c-db60c1df9c21',
         'MJ: AI Model Price Unit Types',
         NULL,
         NULL,
         'AIModelPriceUnitType',
         'vwAIModelPriceUnitTypes',
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
   

/* SQL generated to add new entity MJ: AI Model Price Unit Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7815f891-ef05-4b4b-bb1c-db60c1df9c21', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Model Price Unit Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7815f891-ef05-4b4b-bb1c-db60c1df9c21', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Model Price Unit Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7815f891-ef05-4b4b-bb1c-db60c1df9c21', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Model Price Unit Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7815f891-ef05-4b4b-bb1c-db60c1df9c21', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Model Costs */

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
         '5a5cf9a9-eae7-4ecb-b1b7-277baac73127',
         'MJ: AI Model Costs',
         NULL,
         NULL,
         'AIModelCost',
         'vwAIModelCosts',
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
   

/* SQL generated to add new entity MJ: AI Model Costs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '5a5cf9a9-eae7-4ecb-b1b7-277baac73127', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Model Costs for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5a5cf9a9-eae7-4ecb-b1b7-277baac73127', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Model Costs for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5a5cf9a9-eae7-4ecb-b1b7-277baac73127', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Model Costs for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5a5cf9a9-eae7-4ecb-b1b7-277baac73127', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIModelCost */
ALTER TABLE [${flyway:defaultSchema}].[AIModelCost] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIModelCost */
ALTER TABLE [${flyway:defaultSchema}].[AIModelCost] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIModelPriceType */
ALTER TABLE [${flyway:defaultSchema}].[AIModelPriceType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIModelPriceType */
ALTER TABLE [${flyway:defaultSchema}].[AIModelPriceType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIModelPriceUnitType */
ALTER TABLE [${flyway:defaultSchema}].[AIModelPriceUnitType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIModelPriceUnitType */
ALTER TABLE [${flyway:defaultSchema}].[AIModelPriceUnitType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd17303ca-6ff4-4ae7-967d-280a513d86b1'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd17303ca-6ff4-4ae7-967d-280a513d86b1',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
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
         WHERE ID = 'f4ce42af-8176-4ae7-abbc-920e05246bdc'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'ModelID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f4ce42af-8176-4ae7-abbc-920e05246bdc',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            2,
            'ModelID',
            'Model ID',
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
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '0fbbf368-839d-4af7-8511-367e1c2192b5'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'VendorID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0fbbf368-839d-4af7-8511-367e1c2192b5',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            3,
            'VendorID',
            'Vendor ID',
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
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA',
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
         WHERE ID = '0bc22b43-6899-4c85-a5cb-9bcba5921adb'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'StartedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0bc22b43-6899-4c85-a5cb-9bcba5921adb',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            4,
            'StartedAt',
            'Started At',
            'Date and time with timezone when this pricing became effective. NULL disables temporal tracking. Defaults to current UTC time when record is created',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'sysdatetimeoffset()',
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
         WHERE ID = 'e492cea6-2fc8-406d-afd4-cada71500c5f'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'EndedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e492cea6-2fc8-406d-afd4-cada71500c5f',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            5,
            'EndedAt',
            'Ended At',
            'Date and time with timezone when this pricing expired or will expire. NULL indicates currently active pricing',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a6584c65-63f7-46ca-8a58-25bc5b6bfd54'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a6584c65-63f7-46ca-8a58-25bc5b6bfd54',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            6,
            'Status',
            'Status',
            'Current status of this pricing record. Active=currently in use, Pending=scheduled for future, Expired=no longer valid, Invalid=data error',
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
         WHERE ID = '7c3423fb-4c5a-47d8-8028-86c118673ae9'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'Currency')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7c3423fb-4c5a-47d8-8028-86c118673ae9',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            7,
            'Currency',
            'Currency',
            'ISO 4217 three-letter currency code (e.g., USD, EUR, GBP) in uppercase',
            'nchar',
            6,
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
         WHERE ID = 'e15e12cb-7d14-477d-adba-29486bd55ec7'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'PriceTypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e15e12cb-7d14-477d-adba-29486bd55ec7',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            8,
            'PriceTypeID',
            'Price Type ID',
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
            '4F51DAE4-4F4D-444A-B931-4F29AB2A871A',
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
         WHERE ID = '3b3bfa27-ed58-4919-9c16-cd1b367d7662'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'InputPricePerUnit')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3b3bfa27-ed58-4919-9c16-cd1b367d7662',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            9,
            'InputPricePerUnit',
            'Input Price Per Unit',
            'Price per unit for input tokens/requests. Must be non-negative. Precision allows for micro-pricing scenarios',
            'decimal',
            9,
            18,
            8,
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
         WHERE ID = 'b308ad69-d31b-4b46-802c-09698dbbaf18'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'OutputPricePerUnit')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b308ad69-d31b-4b46-802c-09698dbbaf18',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            10,
            'OutputPricePerUnit',
            'Output Price Per Unit',
            'Price per unit for output tokens/responses. Must be non-negative. Often higher than input pricing',
            'decimal',
            9,
            18,
            8,
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
         WHERE ID = '298cfc42-48ae-4409-9d39-20014fff1234'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'UnitTypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '298cfc42-48ae-4409-9d39-20014fff1234',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            11,
            'UnitTypeID',
            'Unit Type ID',
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
            '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21',
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
         WHERE ID = '4333eae9-2185-403f-b742-b8ff9631c860'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'ProcessingType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4333eae9-2185-403f-b742-b8ff9631c860',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            12,
            'ProcessingType',
            'Processing Type',
            'Processing method that affects pricing. Realtime=immediate response, Batch=delayed processing often with discounts',
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
         WHERE ID = '28ea9fcf-10da-4b66-b861-a19025acee01'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'Comments')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '28ea9fcf-10da-4b66-b861-a19025acee01',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            13,
            'Comments',
            'Comments',
            'Optional notes about pricing context, source, special conditions, or vendor-specific details',
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
         WHERE ID = '9fabb12a-530b-4ba6-b010-45764ac367d2'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9fabb12a-530b-4ba6-b010-45764ac367d2',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            14,
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
         WHERE ID = '4bd7f876-9955-4709-be02-e7b08def0183'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4bd7f876-9955-4709-be02-e7b08def0183',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            15,
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
         WHERE ID = '076d8806-dd48-4b7b-9421-18ea56b53aca'  OR 
               (EntityID = '4F51DAE4-4F4D-444A-B931-4F29AB2A871A' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '076d8806-dd48-4b7b-9421-18ea56b53aca',
            '4F51DAE4-4F4D-444A-B931-4F29AB2A871A', -- Entity: MJ: AI Model Price Types
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
         WHERE ID = 'a45416cf-66e0-461c-82d9-9600a6648a9e'  OR 
               (EntityID = '4F51DAE4-4F4D-444A-B931-4F29AB2A871A' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a45416cf-66e0-461c-82d9-9600a6648a9e',
            '4F51DAE4-4F4D-444A-B931-4F29AB2A871A', -- Entity: MJ: AI Model Price Types
            2,
            'Name',
            'Name',
            'Short, descriptive name for the price type (e.g., "Tokens", "Minutes", "Characters")',
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
         WHERE ID = '644f1c19-2316-49fe-a218-0804e001f3d1'  OR 
               (EntityID = '4F51DAE4-4F4D-444A-B931-4F29AB2A871A' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '644f1c19-2316-49fe-a218-0804e001f3d1',
            '4F51DAE4-4F4D-444A-B931-4F29AB2A871A', -- Entity: MJ: AI Model Price Types
            3,
            'Description',
            'Description',
            'Detailed description of what this price type represents and how it is measured',
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
         WHERE ID = '60060b54-fb4e-4b6a-89fc-92a29fbfb8ce'  OR 
               (EntityID = '4F51DAE4-4F4D-444A-B931-4F29AB2A871A' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '60060b54-fb4e-4b6a-89fc-92a29fbfb8ce',
            '4F51DAE4-4F4D-444A-B931-4F29AB2A871A', -- Entity: MJ: AI Model Price Types
            4,
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
         WHERE ID = '7761180c-2daf-46d7-9b46-288f5f00577b'  OR 
               (EntityID = '4F51DAE4-4F4D-444A-B931-4F29AB2A871A' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7761180c-2daf-46d7-9b46-288f5f00577b',
            '4F51DAE4-4F4D-444A-B931-4F29AB2A871A', -- Entity: MJ: AI Model Price Types
            5,
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e403cf0e-8cf3-4651-838d-f9a7f5e4b2b1'  OR 
               (EntityID = '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e403cf0e-8cf3-4651-838d-f9a7f5e4b2b1',
            '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21', -- Entity: MJ: AI Model Price Unit Types
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
         WHERE ID = 'a5b9b23e-ce32-4fbf-96d5-02e101672f48'  OR 
               (EntityID = '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a5b9b23e-ce32-4fbf-96d5-02e101672f48',
            '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21', -- Entity: MJ: AI Model Price Unit Types
            2,
            'Name',
            'Name',
            'Display name for the pricing unit (e.g., "Per 1M Tokens", "Per 1K Tokens", "Per Minute")',
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
         WHERE ID = 'e038637e-4ed4-4cfa-aff4-10739fdd6d80'  OR 
               (EntityID = '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e038637e-4ed4-4cfa-aff4-10739fdd6d80',
            '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21', -- Entity: MJ: AI Model Price Unit Types
            3,
            'Description',
            'Description',
            'Detailed explanation of the unit scale and any special considerations for this pricing unit',
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
         WHERE ID = '7601d15b-b4a2-4f34-b208-f6c7668a8578'  OR 
               (EntityID = '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21' AND Name = 'DriverClass')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7601d15b-b4a2-4f34-b208-f6c7668a8578',
            '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21', -- Entity: MJ: AI Model Price Unit Types
            4,
            'DriverClass',
            'Driver Class',
            'Fully qualified class name that handles cost calculations and unit normalization for this pricing unit (e.g., "TokenPer1M", "TokenPer1K")',
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
         WHERE ID = 'd25e9888-39af-4c77-bd94-f98f5b6f5c6d'  OR 
               (EntityID = '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd25e9888-39af-4c77-bd94-f98f5b6f5c6d',
            '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21', -- Entity: MJ: AI Model Price Unit Types
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
         WHERE ID = '063f58c9-e2f3-4fc0-a539-b95c5be3fc23'  OR 
               (EntityID = '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '063f58c9-e2f3-4fc0-a539-b95c5be3fc23',
            '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21', -- Entity: MJ: AI Model Price Unit Types
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

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A6584C65-63F7-46CA-8A58-25BC5B6BFD54', 1, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A6584C65-63F7-46CA-8A58-25BC5B6BFD54', 2, 'Pending', 'Pending')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A6584C65-63F7-46CA-8A58-25BC5B6BFD54', 3, 'Expired', 'Expired')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A6584C65-63F7-46CA-8A58-25BC5B6BFD54', 4, 'Invalid', 'Invalid')

/* SQL text to update ValueListType for entity field ID A6584C65-63F7-46CA-8A58-25BC5B6BFD54 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A6584C65-63F7-46CA-8A58-25BC5B6BFD54'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4333EAE9-2185-403F-B742-B8FF9631C860', 1, 'Realtime', 'Realtime')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4333EAE9-2185-403F-B742-B8FF9631C860', 2, 'Batch', 'Batch')

/* SQL text to update ValueListType for entity field ID 4333EAE9-2185-403F-B742-B8FF9631C860 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='4333EAE9-2185-403F-B742-B8FF9631C860'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'e750abcb-2ff4-4220-a7c2-449ad9156250'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('e750abcb-2ff4-4220-a7c2-449ad9156250', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', 'VendorID', 'One To Many', 1, 1, 'MJ: AI Model Costs', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '097fa67e-eb4e-45aa-8f44-a79fcb540db4'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('097fa67e-eb4e-45aa-8f44-a79fcb540db4', '4F51DAE4-4F4D-444A-B931-4F29AB2A871A', '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', 'PriceTypeID', 'One To Many', 1, 1, 'MJ: AI Model Costs', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd68e712c-c0ba-4b96-a70c-2e1ecea7f1b1'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d68e712c-c0ba-4b96-a70c-2e1ecea7f1b1', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', 'ModelID', 'One To Many', 1, 1, 'MJ: AI Model Costs', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '7eb94294-01a0-4625-9b09-7bd7f9806eeb'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('7eb94294-01a0-4625-9b09-7bd7f9806eeb', '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21', '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', 'UnitTypeID', 'One To Many', 1, 1, 'MJ: AI Model Costs', 4);
   END
                              

/* Index for Foreign Keys for AIModelCost */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_ModelID ON [${flyway:defaultSchema}].[AIModelCost] ([ModelID]);

-- Index for foreign key VendorID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_VendorID ON [${flyway:defaultSchema}].[AIModelCost] ([VendorID]);

-- Index for foreign key PriceTypeID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_PriceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_PriceTypeID ON [${flyway:defaultSchema}].[AIModelCost] ([PriceTypeID]);

-- Index for foreign key UnitTypeID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_UnitTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_UnitTypeID ON [${flyway:defaultSchema}].[AIModelCost] ([UnitTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID F4CE42AF-8176-4AE7-ABBC-920E05246BDC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F4CE42AF-8176-4AE7-ABBC-920E05246BDC',
         @RelatedEntityNameFieldMap='Model'

/* SQL text to update entity field related entity name field map for entity field ID 0FBBF368-839D-4AF7-8511-367E1C2192B5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0FBBF368-839D-4AF7-8511-367E1C2192B5',
         @RelatedEntityNameFieldMap='Vendor'

/* SQL text to update entity field related entity name field map for entity field ID E15E12CB-7D14-477D-ADBA-29486BD55EC7 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E15E12CB-7D14-477D-ADBA-29486BD55EC7',
         @RelatedEntityNameFieldMap='PriceType'

/* SQL text to update entity field related entity name field map for entity field ID 298CFC42-48AE-4409-9D39-20014FFF1234 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='298CFC42-48AE-4409-9D39-20014FFF1234',
         @RelatedEntityNameFieldMap='UnitType'

/* Base View SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: vwAIModelCosts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Costs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelCost
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIModelCosts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelCosts]
AS
SELECT
    a.*,
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIModelPriceType_PriceTypeID.[Name] AS [PriceType],
    AIModelPriceUnitType_UnitTypeID.[Name] AS [UnitType]
FROM
    [${flyway:defaultSchema}].[AIModelCost] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModelPriceType] AS AIModelPriceType_PriceTypeID
  ON
    [a].[PriceTypeID] = AIModelPriceType_PriceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModelPriceUnitType] AS AIModelPriceUnitType_UnitTypeID
  ON
    [a].[UnitTypeID] = AIModelPriceUnitType_UnitTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelCosts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: Permissions for vwAIModelCosts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelCosts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: spCreateAIModelCost
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelCost
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIModelCost]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelCost]
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(20),
    @Currency nchar(3),
    @PriceTypeID uniqueidentifier,
    @InputPricePerUnit decimal(18, 8),
    @OutputPricePerUnit decimal(18, 8),
    @UnitTypeID uniqueidentifier,
    @ProcessingType nvarchar(20),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIModelCost]
        (
            [ModelID],
            [VendorID],
            [StartedAt],
            [EndedAt],
            [Status],
            [Currency],
            [PriceTypeID],
            [InputPricePerUnit],
            [OutputPricePerUnit],
            [UnitTypeID],
            [ProcessingType],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ModelID,
            @VendorID,
            @StartedAt,
            @EndedAt,
            @Status,
            @Currency,
            @PriceTypeID,
            @InputPricePerUnit,
            @OutputPricePerUnit,
            @UnitTypeID,
            @ProcessingType,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelCosts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelCost] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Model Costs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelCost] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: spUpdateAIModelCost
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelCost
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIModelCost]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelCost]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(20),
    @Currency nchar(3),
    @PriceTypeID uniqueidentifier,
    @InputPricePerUnit decimal(18, 8),
    @OutputPricePerUnit decimal(18, 8),
    @UnitTypeID uniqueidentifier,
    @ProcessingType nvarchar(20),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelCost]
    SET
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [Currency] = @Currency,
        [PriceTypeID] = @PriceTypeID,
        [InputPricePerUnit] = @InputPricePerUnit,
        [OutputPricePerUnit] = @OutputPricePerUnit,
        [UnitTypeID] = @UnitTypeID,
        [ProcessingType] = @ProcessingType,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelCosts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelCost] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelCost table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIModelCost
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelCost
ON [${flyway:defaultSchema}].[AIModelCost]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelCost]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelCost] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Model Costs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelCost] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: spDeleteAIModelCost
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelCost
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIModelCost]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelCost]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelCost]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelCost] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Model Costs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelCost] TO [cdp_Integration]



/* Index for Foreign Keys for AIModelPriceType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: AI Model Price Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Types
-- Item: vwAIModelPriceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Price Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelPriceType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIModelPriceTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelPriceTypes]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIModelPriceType] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelPriceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Model Price Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Types
-- Item: Permissions for vwAIModelPriceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelPriceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Model Price Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Types
-- Item: spCreateAIModelPriceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelPriceType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIModelPriceType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelPriceType]
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIModelPriceType]
        (
            [Name],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelPriceTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelPriceType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Model Price Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelPriceType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Model Price Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Types
-- Item: spUpdateAIModelPriceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelPriceType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIModelPriceType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelPriceType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelPriceType]
    SET
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelPriceTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelPriceType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelPriceType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIModelPriceType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelPriceType
ON [${flyway:defaultSchema}].[AIModelPriceType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelPriceType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelPriceType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Model Price Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelPriceType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Model Price Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Types
-- Item: spDeleteAIModelPriceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelPriceType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIModelPriceType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelPriceType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelPriceType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelPriceType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Model Price Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelPriceType] TO [cdp_Integration]



/* Index for Foreign Keys for AIModelPriceUnitType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Unit Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: AI Model Price Unit Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Unit Types
-- Item: vwAIModelPriceUnitTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Price Unit Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelPriceUnitType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIModelPriceUnitTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelPriceUnitTypes]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIModelPriceUnitType] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelPriceUnitTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Model Price Unit Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Unit Types
-- Item: Permissions for vwAIModelPriceUnitTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelPriceUnitTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Model Price Unit Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Unit Types
-- Item: spCreateAIModelPriceUnitType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelPriceUnitType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIModelPriceUnitType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelPriceUnitType]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIModelPriceUnitType]
        (
            [Name],
            [Description],
            [DriverClass]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @DriverClass
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelPriceUnitTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelPriceUnitType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Model Price Unit Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelPriceUnitType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Model Price Unit Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Unit Types
-- Item: spUpdateAIModelPriceUnitType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelPriceUnitType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIModelPriceUnitType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelPriceUnitType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelPriceUnitType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DriverClass] = @DriverClass
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelPriceUnitTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelPriceUnitType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelPriceUnitType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIModelPriceUnitType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelPriceUnitType
ON [${flyway:defaultSchema}].[AIModelPriceUnitType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelPriceUnitType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelPriceUnitType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Model Price Unit Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelPriceUnitType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Model Price Unit Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Unit Types
-- Item: spDeleteAIModelPriceUnitType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelPriceUnitType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIModelPriceUnitType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelPriceUnitType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelPriceUnitType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelPriceUnitType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Model Price Unit Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelPriceUnitType] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bb204d9e-2d75-4db7-8022-55e73a56cbca'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'Model')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bb204d9e-2d75-4db7-8022-55e73a56cbca',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            16,
            'Model',
            'Model',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = 'efafc399-58a9-42e6-aff4-a31cbe7cac16'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'Vendor')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'efafc399-58a9-42e6-aff4-a31cbe7cac16',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            17,
            'Vendor',
            'Vendor',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = '29d4e0f8-b86c-4eb4-bf82-b44778494a53'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'PriceType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '29d4e0f8-b86c-4eb4-bf82-b44778494a53',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            18,
            'PriceType',
            'Price Type',
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
         WHERE ID = 'e3600dea-e0e2-46a3-9fb3-2b0fd203e01f'  OR 
               (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'UnitType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e3600dea-e0e2-46a3-9fb3-2b0fd203e01f',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            19,
            'UnitType',
            'Unit Type',
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

-- CHECK constraint for MJ: AI Model Costs: Field: InputPricePerUnit was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([InputPricePerUnit]>=(0))', 'public ValidateInputPricePerUnitNonNegative(result: ValidationResult) {
	if (this.InputPricePerUnit < 0) {
		result.Errors.push(new ValidationErrorInfo("InputPricePerUnit", "Input price per unit cannot be negative.", this.InputPricePerUnit, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the input price per unit cannot be negative. It must be zero or greater.', 'ValidateInputPricePerUnitNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '3B3BFA27-ED58-4919-9C16-CD1B367D7662');
  
            -- CHECK constraint for MJ: AI Model Costs: Field: OutputPricePerUnit was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([OutputPricePerUnit]>=(0))', 'public ValidateOutputPricePerUnitNonNegative(result: ValidationResult) {
	if (this.OutputPricePerUnit < 0) {
		result.Errors.push(new ValidationErrorInfo("OutputPricePerUnit", "Output price per unit must be zero or a positive value.", this.OutputPricePerUnit, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the output price per unit cannot be negative. It must be zero or greater.', 'ValidateOutputPricePerUnitNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'B308AD69-D31B-4B46-802C-09698DBBAF18');
  
            -- CHECK constraint for MJ: AI Model Costs: Field: Currency was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '(len([Currency])=(3) AND [Currency]=upper([Currency]))', 'public ValidateCurrencyIsThreeUppercaseLetters(result: ValidationResult) {
	if (typeof this.Currency !== "string" || this.Currency.length !== 3 || this.Currency !== this.Currency.toUpperCase()) {
		result.Errors.push(new ValidationErrorInfo("Currency", "Currency code must be exactly three uppercase letters (e.g., ''USD'').", this.Currency, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the currency code consists of exactly three uppercase letters. For example, ''USD'', ''EUR'', or ''JPY'' are valid, but anything with lowercase letters or a different length is not allowed.', 'ValidateCurrencyIsThreeUppercaseLetters', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '7C3423FB-4C5A-47D8-8028-86C118673AE9');
  
            -- CHECK constraint for MJ: AI Model Costs @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([EndedAt] IS NULL OR [StartedAt] IS NULL OR [EndedAt]>[StartedAt])', 'public ValidateEndedAtAfterStartedAt(result: ValidationResult) {
	if (this.EndedAt !== null && this.StartedAt !== null) {
		if (this.EndedAt <= this.StartedAt) {
			result.Errors.push(new ValidationErrorInfo("EndedAt", "The end date must be after the start date when both are specified.", this.EndedAt, ValidationErrorType.Failure));
		}
	}
}', 'This rule ensures that the end date must be after the start date if both are specified. If either the start date or end date is missing, any value is allowed.', 'ValidateEndedAtAfterStartedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127');
  
            

-- CHECK constraint for MJ: AI Model Price Types: Field: Name was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '(len(ltrim(rtrim([Name])))>(0))', 'public ValidateNameNotEmptyOrWhitespace(result: ValidationResult) {
	if (!this.Name || this.Name.trim().length === 0) {
		result.Errors.push(new ValidationErrorInfo("Name", "The Name field cannot be empty or just spaces.", this.Name, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the Name field cannot be empty or consist only of spaces; it must contain at least one non-space character.', 'ValidateNameNotEmptyOrWhitespace', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A45416CF-66E0-461C-82D9-9600A6648A9E');
  
            

-- CHECK constraint for MJ: AI Model Price Unit Types: Field: Name was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '(len(ltrim(rtrim([Name])))>(0))', 'public ValidateNameNotEmptyOrWhitespace(result: ValidationResult) {
	if (!this.Name || this.Name.trim().length === 0) {
		result.Errors.push(new ValidationErrorInfo("Name", "The Name field must not be empty or contain only spaces.", this.Name, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the Name field cannot be empty or contain only spaces; it must have at least one non-space character.', 'ValidateNameNotEmptyOrWhitespace', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A5B9B23E-CE32-4FBF-96D5-02E101672F48');
  
            -- CHECK constraint for MJ: AI Model Price Unit Types: Field: DriverClass was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '(len(ltrim(rtrim([DriverClass])))>(0))', 'public ValidateDriverClassNotEmpty(result: ValidationResult) {
	if (this.DriverClass === null || this.DriverClass.trim().length === 0) {
		result.Errors.push(new ValidationErrorInfo("DriverClass", "DriverClass must not be empty or only spaces.", this.DriverClass, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the DriverClass field cannot be empty or consist only of spaces. The value must contain at least one character when leading and trailing spaces are ignored.', 'ValidateDriverClassNotEmpty', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '7601D15B-B4A2-4F34-B208-F6C7668A8578');
  
            

/********** MORE CODEGEN OUTPUT **********/
/* Index for Foreign Keys for AIModelCost */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_ModelID ON [${flyway:defaultSchema}].[AIModelCost] ([ModelID]);

-- Index for foreign key VendorID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_VendorID ON [${flyway:defaultSchema}].[AIModelCost] ([VendorID]);

-- Index for foreign key PriceTypeID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_PriceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_PriceTypeID ON [${flyway:defaultSchema}].[AIModelCost] ([PriceTypeID]);

-- Index for foreign key UnitTypeID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_UnitTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_UnitTypeID ON [${flyway:defaultSchema}].[AIModelCost] ([UnitTypeID]);

/* Base View SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: vwAIModelCosts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Costs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelCost
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIModelCosts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelCosts]
AS
SELECT
    a.*,
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIModelPriceType_PriceTypeID.[Name] AS [PriceType],
    AIModelPriceUnitType_UnitTypeID.[Name] AS [UnitType]
FROM
    [${flyway:defaultSchema}].[AIModelCost] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModelPriceType] AS AIModelPriceType_PriceTypeID
  ON
    [a].[PriceTypeID] = AIModelPriceType_PriceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModelPriceUnitType] AS AIModelPriceUnitType_UnitTypeID
  ON
    [a].[UnitTypeID] = AIModelPriceUnitType_UnitTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelCosts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: Permissions for vwAIModelCosts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelCosts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: spCreateAIModelCost
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelCost
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIModelCost]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelCost]
    @ID uniqueidentifier = NULL,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(20),
    @Currency nchar(3),
    @PriceTypeID uniqueidentifier,
    @InputPricePerUnit decimal(18, 8),
    @OutputPricePerUnit decimal(18, 8),
    @UnitTypeID uniqueidentifier,
    @ProcessingType nvarchar(20),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
            (
                [ID],
                [ModelID],
                [VendorID],
                [StartedAt],
                [EndedAt],
                [Status],
                [Currency],
                [PriceTypeID],
                [InputPricePerUnit],
                [OutputPricePerUnit],
                [UnitTypeID],
                [ProcessingType],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ModelID,
                @VendorID,
                @StartedAt,
                @EndedAt,
                @Status,
                @Currency,
                @PriceTypeID,
                @InputPricePerUnit,
                @OutputPricePerUnit,
                @UnitTypeID,
                @ProcessingType,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
            (
                [ModelID],
                [VendorID],
                [StartedAt],
                [EndedAt],
                [Status],
                [Currency],
                [PriceTypeID],
                [InputPricePerUnit],
                [OutputPricePerUnit],
                [UnitTypeID],
                [ProcessingType],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ModelID,
                @VendorID,
                @StartedAt,
                @EndedAt,
                @Status,
                @Currency,
                @PriceTypeID,
                @InputPricePerUnit,
                @OutputPricePerUnit,
                @UnitTypeID,
                @ProcessingType,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelCosts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelCost] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Model Costs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelCost] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: spUpdateAIModelCost
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelCost
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIModelCost]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelCost]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(20),
    @Currency nchar(3),
    @PriceTypeID uniqueidentifier,
    @InputPricePerUnit decimal(18, 8),
    @OutputPricePerUnit decimal(18, 8),
    @UnitTypeID uniqueidentifier,
    @ProcessingType nvarchar(20),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelCost]
    SET
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [Currency] = @Currency,
        [PriceTypeID] = @PriceTypeID,
        [InputPricePerUnit] = @InputPricePerUnit,
        [OutputPricePerUnit] = @OutputPricePerUnit,
        [UnitTypeID] = @UnitTypeID,
        [ProcessingType] = @ProcessingType,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelCosts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelCost] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelCost table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIModelCost
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelCost
ON [${flyway:defaultSchema}].[AIModelCost]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelCost]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelCost] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Model Costs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelCost] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: spDeleteAIModelCost
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelCost
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIModelCost]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelCost]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelCost]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelCost] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Model Costs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelCost] TO [cdp_Integration]



