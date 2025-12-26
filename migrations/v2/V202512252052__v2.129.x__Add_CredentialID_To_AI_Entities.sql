-- Migration: Add CredentialID to AI Entities
-- Description: Adds CredentialID foreign key columns to AIVendor, AIModelVendor, and AIPromptModel
--              to support the new hierarchical credential resolution system.
--
-- Credential Resolution Hierarchy (highest to lowest priority):
-- 1. AIPromptParams.credentialId (runtime override)
-- 2. AIPromptModel.CredentialID (prompt-specific)
-- 3. AIModelVendor.CredentialID (model-vendor specific)
-- 4. AIVendor.CredentialID (vendor default)
-- 5. Legacy: Environment variables (backward compatibility)
--
-- When ANY credential ID is found (priorities 1-4), the system uses the Credentials path
-- and ignores legacy methods. This ensures consistent, audited credential usage.

--------------------------------------------------------------------------------
-- ADD COLUMN: AIVendor.CredentialID
-- Default credential for all models from this vendor
--------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[AIVendor]
ADD [CredentialID] UNIQUEIDENTIFIER NULL
    CONSTRAINT [FK_AIVendor_Credential] FOREIGN KEY
    REFERENCES [${flyway:defaultSchema}].[Credential]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to a default credential for this vendor. When set, all models using this vendor will use this credential unless overridden at a higher priority level (AIModelVendor or AIPromptModel). When any credential is configured in the hierarchy, legacy authentication methods (environment variables, apiKeys parameter) are bypassed in favor of the Credentials system.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIVendor',
    @level2type = N'COLUMN', @level2name = N'CredentialID';
GO

--------------------------------------------------------------------------------
-- ADD COLUMN: AIModelVendor.CredentialID
-- Overrides AIVendor credential for specific model+vendor combination
--------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor]
ADD [CredentialID] UNIQUEIDENTIFIER NULL
    CONSTRAINT [FK_AIModelVendor_Credential] FOREIGN KEY
    REFERENCES [${flyway:defaultSchema}].[Credential]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to a credential specific to this model-vendor combination. Takes precedence over AIVendor.CredentialID. Useful for scenarios where a model requires different credentials per vendor (e.g., Azure OpenAI vs direct OpenAI). When any credential is configured in the hierarchy, legacy authentication methods are bypassed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIModelVendor',
    @level2type = N'COLUMN', @level2name = N'CredentialID';
GO

--------------------------------------------------------------------------------
-- ADD COLUMN: AIPromptModel.CredentialID
-- Overrides both AIModelVendor and AIVendor credentials for specific prompt+model
--------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel]
ADD [CredentialID] UNIQUEIDENTIFIER NULL
    CONSTRAINT [FK_AIPromptModel_Credential] FOREIGN KEY
    REFERENCES [${flyway:defaultSchema}].[Credential]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to a credential specific to this prompt-model configuration. Takes precedence over AIModelVendor.CredentialID and AIVendor.CredentialID. Useful for prompts that require dedicated credentials (e.g., high-rate-limit keys for critical prompts). When any credential is configured in the hierarchy, legacy authentication methods are bypassed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPromptModel',
    @level2type = N'COLUMN', @level2name = N'CredentialID';
GO
 































-- CODE GEN RUN
 
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bbb5a364-233a-418b-b1de-4e8fc57d40ff'  OR 
               (EntityID = 'D95A17EE-5750-4218-86AD-10F06E4DFBCA' AND Name = 'CredentialID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bbb5a364-233a-418b-b1de-4e8fc57d40ff',
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA', -- Entity: MJ: AI Vendors
            100011,
            'CredentialID',
            'Credential ID',
            'Optional reference to a default credential for this vendor. When set, all models using this vendor will use this credential unless overridden at a higher priority level (AIModelVendor or AIPromptModel). When any credential is configured in the hierarchy, legacy authentication methods (environment variables, apiKeys parameter) are bypassed in favor of the Credentials system.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
         WHERE ID = 'dcf0ab5d-5700-4518-9ab7-058766229e06'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'CredentialID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dcf0ab5d-5700-4518-9ab7-058766229e06',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            100035,
            'CredentialID',
            'Credential ID',
            'Optional reference to a credential specific to this prompt-model configuration. Takes precedence over AIModelVendor.CredentialID and AIVendor.CredentialID. Useful for prompts that require dedicated credentials (e.g., high-rate-limit keys for critical prompts). When any credential is configured in the hierarchy, legacy authentication methods are bypassed.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
         WHERE ID = '4bd221fc-0cae-4e2a-bf1e-1c62fb03fdd3'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'CredentialID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4bd221fc-0cae-4e2a-bf1e-1c62fb03fdd3',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            100036,
            'CredentialID',
            'Credential ID',
            'Optional reference to a credential specific to this model-vendor combination. Takes precedence over AIVendor.CredentialID. Useful for scenarios where a model requires different credentials per vendor (e.g., Azure OpenAI vs direct OpenAI). When any credential is configured in the hierarchy, legacy authentication methods are bypassed.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '3fcd61eb-0d35-4d63-a554-d38d48e2ec48'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('3fcd61eb-0d35-4d63-a554-d38d48e2ec48', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', 'CredentialID', 'One To Many', 1, 1, 'MJ: AI Vendors', 8);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f3a2dee4-bc54-4bac-bcd7-7ae852206492'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f3a2dee4-bc54-4bac-bcd7-7ae852206492', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'AD4D32AE-6848-41A0-A966-2A1F8B751251', 'CredentialID', 'One To Many', 1, 1, 'MJ: AI Prompt Models', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a34b2c11-09ac-47bc-87d8-e6705f5e858d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a34b2c11-09ac-47bc-87d8-e6705f5e858d', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'F386546E-EC07-46E6-B780-6B1FEA5892E6', 'CredentialID', 'One To Many', 1, 1, 'MJ: AI Model Vendors', 1);
   END
                              

/* Index for Foreign Keys for AIModelVendor */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table AIModelVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_ModelID ON [${flyway:defaultSchema}].[AIModelVendor] ([ModelID]);

-- Index for foreign key VendorID in table AIModelVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_VendorID ON [${flyway:defaultSchema}].[AIModelVendor] ([VendorID]);

-- Index for foreign key TypeID in table AIModelVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_TypeID ON [${flyway:defaultSchema}].[AIModelVendor] ([TypeID]);

-- Index for foreign key CredentialID in table AIModelVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_CredentialID ON [${flyway:defaultSchema}].[AIModelVendor] ([CredentialID]);

/* SQL text to update entity field related entity name field map for entity field ID 4BD221FC-0CAE-4E2A-BF1E-1C62FB03FDD3 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4BD221FC-0CAE-4E2A-BF1E-1C62FB03FDD3',
         @RelatedEntityNameFieldMap='Credential'

/* Index for Foreign Keys for AIPromptModel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PromptID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_PromptID ON [${flyway:defaultSchema}].[AIPromptModel] ([PromptID]);

-- Index for foreign key ModelID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_ModelID ON [${flyway:defaultSchema}].[AIPromptModel] ([ModelID]);

-- Index for foreign key VendorID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_VendorID ON [${flyway:defaultSchema}].[AIPromptModel] ([VendorID]);

-- Index for foreign key ConfigurationID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_ConfigurationID ON [${flyway:defaultSchema}].[AIPromptModel] ([ConfigurationID]);

-- Index for foreign key CredentialID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_CredentialID ON [${flyway:defaultSchema}].[AIPromptModel] ([CredentialID]);

/* SQL text to update entity field related entity name field map for entity field ID DCF0AB5D-5700-4518-9AB7-058766229E06 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DCF0AB5D-5700-4518-9AB7-058766229E06',
         @RelatedEntityNameFieldMap='Credential'

/* Base View SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Vendors
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelVendor
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIModelVendors]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIModelVendors];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelVendors]
AS
SELECT
    a.*,
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIVendorTypeDefinition_TypeID.[Name] AS [Type],
    Credential_CredentialID.[Name] AS [Credential]
FROM
    [${flyway:defaultSchema}].[AIModelVendor] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendorTypeDefinition] AS AIVendorTypeDefinition_TypeID
  ON
    [a].[TypeID] = AIVendorTypeDefinition_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Credential] AS Credential_CredentialID
  ON
    [a].[CredentialID] = Credential_CredentialID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: Permissions for vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spCreateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIModelVendor]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelVendor];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelVendor]
    @ID uniqueidentifier = NULL,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @Priority int = NULL,
    @Status nvarchar(20) = NULL,
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @MaxInputTokens int,
    @MaxOutputTokens int,
    @SupportedResponseFormats nvarchar(100) = NULL,
    @SupportsEffortLevel bit = NULL,
    @SupportsStreaming bit = NULL,
    @TypeID uniqueidentifier,
    @CredentialID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
            (
                [ID],
                [ModelID],
                [VendorID],
                [Priority],
                [Status],
                [DriverClass],
                [DriverImportPath],
                [APIName],
                [MaxInputTokens],
                [MaxOutputTokens],
                [SupportedResponseFormats],
                [SupportsEffortLevel],
                [SupportsStreaming],
                [TypeID],
                [CredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ModelID,
                @VendorID,
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active'),
                @DriverClass,
                @DriverImportPath,
                @APIName,
                @MaxInputTokens,
                @MaxOutputTokens,
                ISNULL(@SupportedResponseFormats, 'Any'),
                ISNULL(@SupportsEffortLevel, 0),
                ISNULL(@SupportsStreaming, 0),
                @TypeID,
                @CredentialID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIModelVendor]
            (
                [ModelID],
                [VendorID],
                [Priority],
                [Status],
                [DriverClass],
                [DriverImportPath],
                [APIName],
                [MaxInputTokens],
                [MaxOutputTokens],
                [SupportedResponseFormats],
                [SupportsEffortLevel],
                [SupportsStreaming],
                [TypeID],
                [CredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ModelID,
                @VendorID,
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active'),
                @DriverClass,
                @DriverImportPath,
                @APIName,
                @MaxInputTokens,
                @MaxOutputTokens,
                ISNULL(@SupportedResponseFormats, 'Any'),
                ISNULL(@SupportsEffortLevel, 0),
                ISNULL(@SupportsStreaming, 0),
                @TypeID,
                @CredentialID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelVendors] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelVendor] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelVendor] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spUpdateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIModelVendor]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelVendor];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelVendor]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @Priority int,
    @Status nvarchar(20),
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @MaxInputTokens int,
    @MaxOutputTokens int,
    @SupportedResponseFormats nvarchar(100),
    @SupportsEffortLevel bit,
    @SupportsStreaming bit,
    @TypeID uniqueidentifier,
    @CredentialID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelVendor]
    SET
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [Priority] = @Priority,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [APIName] = @APIName,
        [MaxInputTokens] = @MaxInputTokens,
        [MaxOutputTokens] = @MaxOutputTokens,
        [SupportedResponseFormats] = @SupportedResponseFormats,
        [SupportsEffortLevel] = @SupportsEffortLevel,
        [SupportsStreaming] = @SupportsStreaming,
        [TypeID] = @TypeID,
        [CredentialID] = @CredentialID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIModelVendors] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelVendors]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelVendor] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelVendor table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIModelVendor]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIModelVendor];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelVendor
ON [${flyway:defaultSchema}].[AIModelVendor]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelVendor]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelVendor] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelVendor] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spDeleteAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIModelVendor]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelVendor];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelVendor]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelVendor]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelVendor] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelVendor] TO [cdp_Integration]



/* Base View SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: vwAIPromptModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Models
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPromptModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIPromptModels]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIPromptModels];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptModels]
AS
SELECT
    a.*,
    AIPrompt_PromptID.[Name] AS [Prompt],
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration],
    Credential_CredentialID.[Name] AS [Credential]
FROM
    [${flyway:defaultSchema}].[AIPromptModel] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Credential] AS Credential_CredentialID
  ON
    [a].[CredentialID] = Credential_CredentialID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: Permissions for vwAIPromptModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: spCreateAIPromptModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPromptModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptModel]
    @ID uniqueidentifier = NULL,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @Priority int = NULL,
    @ExecutionGroup int = NULL,
    @ModelParameters nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @ParallelizationMode nvarchar(20) = NULL,
    @ParallelCount int = NULL,
    @ParallelConfigParam nvarchar(100),
    @EffortLevel int,
    @CredentialID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIPromptModel]
            (
                [ID],
                [PromptID],
                [ModelID],
                [VendorID],
                [ConfigurationID],
                [Priority],
                [ExecutionGroup],
                [ModelParameters],
                [Status],
                [ParallelizationMode],
                [ParallelCount],
                [ParallelConfigParam],
                [EffortLevel],
                [CredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PromptID,
                @ModelID,
                @VendorID,
                @ConfigurationID,
                ISNULL(@Priority, 0),
                ISNULL(@ExecutionGroup, 0),
                @ModelParameters,
                ISNULL(@Status, 'Active'),
                ISNULL(@ParallelizationMode, 'None'),
                ISNULL(@ParallelCount, 1),
                @ParallelConfigParam,
                @EffortLevel,
                @CredentialID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPromptModel]
            (
                [PromptID],
                [ModelID],
                [VendorID],
                [ConfigurationID],
                [Priority],
                [ExecutionGroup],
                [ModelParameters],
                [Status],
                [ParallelizationMode],
                [ParallelCount],
                [ParallelConfigParam],
                [EffortLevel],
                [CredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PromptID,
                @ModelID,
                @VendorID,
                @ConfigurationID,
                ISNULL(@Priority, 0),
                ISNULL(@ExecutionGroup, 0),
                @ModelParameters,
                ISNULL(@Status, 'Active'),
                ISNULL(@ParallelizationMode, 'None'),
                ISNULL(@ParallelCount, 1),
                @ParallelConfigParam,
                @EffortLevel,
                @CredentialID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptModel] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Prompt Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptModel] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: spUpdateAIPromptModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPromptModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptModel]
    @ID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @Priority int,
    @ExecutionGroup int,
    @ModelParameters nvarchar(MAX),
    @Status nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100),
    @EffortLevel int,
    @CredentialID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptModel]
    SET
        [PromptID] = @PromptID,
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [ConfigurationID] = @ConfigurationID,
        [Priority] = @Priority,
        [ExecutionGroup] = @ExecutionGroup,
        [ModelParameters] = @ModelParameters,
        [Status] = @Status,
        [ParallelizationMode] = @ParallelizationMode,
        [ParallelCount] = @ParallelCount,
        [ParallelConfigParam] = @ParallelConfigParam,
        [EffortLevel] = @EffortLevel,
        [CredentialID] = @CredentialID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIPromptModels] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPromptModels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptModel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptModel table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPromptModel]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPromptModel];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptModel
ON [${flyway:defaultSchema}].[AIPromptModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptModel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptModel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Prompt Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptModel] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: spDeleteAIPromptModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptModel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptModel]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptModel] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptModel] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for AIVendor */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialID in table AIVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIVendor_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIVendor_CredentialID ON [${flyway:defaultSchema}].[AIVendor] ([CredentialID]);

/* SQL text to update entity field related entity name field map for entity field ID BBB5A364-233A-418B-B1DE-4E8FC57D40FF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BBB5A364-233A-418B-B1DE-4E8FC57D40FF',
         @RelatedEntityNameFieldMap='Credential'

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
    Credential_CredentialID.[Name] AS [Credential]
FROM
    [${flyway:defaultSchema}].[AIVendor] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Credential] AS Credential_CredentialID
  ON
    [a].[CredentialID] = Credential_CredentialID.[ID]
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
    @CredentialID uniqueidentifier
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
                [CredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @CredentialID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIVendor]
            (
                [Name],
                [Description],
                [CredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @CredentialID
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
    @CredentialID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIVendor]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [CredentialID] = @CredentialID
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

 

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'af3c2241-3fbd-4ee3-b91d-5294976189b7'  OR 
               (EntityID = 'D95A17EE-5750-4218-86AD-10F06E4DFBCA' AND Name = 'Credential')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'af3c2241-3fbd-4ee3-b91d-5294976189b7',
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA', -- Entity: MJ: AI Vendors
            100013,
            'Credential',
            'Credential',
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
         WHERE ID = '93cf06ec-3324-46b8-aad1-ce68cb26f75b'  OR 
               (EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'Credential')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '93cf06ec-3324-46b8-aad1-ce68cb26f75b',
            'AD4D32AE-6848-41A0-A966-2A1F8B751251', -- Entity: MJ: AI Prompt Models
            100041,
            'Credential',
            'Credential',
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
         WHERE ID = 'cc46a8d9-0875-41d3-b4f6-0b7ab7f75195'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'Credential')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cc46a8d9-0875-41d3-b4f6-0b7ab7f75195',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            100041,
            'Credential',
            'Credential',
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
            WHERE ID = 'C6428612-640B-4573-B3FF-5B242E616B7E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4B8E1299-E3BF-4838-9D0F-A01F6883C063'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '70E7FF76-A99F-4886-AE7C-3DE0C620B4A5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C6428612-640B-4573-B3FF-5B242E616B7E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D2395FD4-050C-44A6-BC12-768B200C82E0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3D9CDA2C-FDCC-4DB3-B7AA-E989D6348654'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '35EC6612-1C62-4401-B4B5-FD4E1F67B4D3'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '70E7FF76-A99F-4886-AE7C-3DE0C620B4A5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C6428612-640B-4573-B3FF-5B242E616B7E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D2395FD4-050C-44A6-BC12-768B200C82E0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3D9CDA2C-FDCC-4DB3-B7AA-E989D6348654'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '35EC6612-1C62-4401-B4B5-FD4E1F67B4D3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '93CF06EC-3324-46B8-AAD1-CE68CB26F75B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'EA94D7B8-080D-4525-B0E9-6E620B3E901E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '37BFE134-5935-4863-8B22-29EFE58B2150'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EA94D7B8-080D-4525-B0E9-6E620B3E901E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FBD754C7-2336-494C-9E4F-F3A6EADDB575'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0A17D759-76BD-4954-8851-86F14EAEB203'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BF1B7891-03FE-4B11-ABE7-4BDF4C832A56'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D57079F0-0DE2-45D8-8ECB-4DC006888664'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FBEE7EC7-7AD6-45D1-874B-CAAE97C51B22'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1099A0DE-EEE4-4D04-B0F6-AC9ED896690D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EA94D7B8-080D-4525-B0E9-6E620B3E901E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FBD754C7-2336-494C-9E4F-F3A6EADDB575'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0A17D759-76BD-4954-8851-86F14EAEB203'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CC46A8D9-0875-41D3-B4F6-0B7AB7F75195'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '332576C8-11ED-4B64-89F8-69FD99004712'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '332576C8-11ED-4B64-89F8-69FD99004712'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0E0A4B47-0994-4B52-9DAC-E1D8494D353E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AF3C2241-3FBD-4EE3-B91D-5294976189B7'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '332576C8-11ED-4B64-89F8-69FD99004712'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AF3C2241-3FBD-4EE3-B91D-5294976189B7'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'F58ADBF6-97C4-4089-88B6-7527B3B2DB88'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F58ADBF6-97C4-4089-88B6-7527B3B2DB88'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D910C070-7005-456E-8499-661471F5912A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5E9D9146-8650-4564-8D12-A532C8A45C05'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F58ADBF6-97C4-4089-88B6-7527B3B2DB88'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D910C070-7005-456E-8499-661471F5912A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0E93CA46-F8B0-47F2-9323-22D786E6209C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5E9D9146-8650-4564-8D12-A532C8A45C05'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '61614107-0E81-476E-8B31-28FE9FB69A10'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '15B68AF6-EA7F-424B-BD0B-A4B9CCEC5AEE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ECD4B59B-E668-48FB-990B-2CA1F19D667B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vendor Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '332576C8-11ED-4B64-89F8-69FD99004712'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vendor Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0E0A4B47-0994-4B52-9DAC-E1D8494D353E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vendor Credentials',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BBB5A364-233A-418B-B1DE-4E8FC57D40FF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vendor Credentials',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF3C2241-3FBD-4EE3-B91D-5294976189B7'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ccb6db7f-adb3-488e-9aa7-8bc187e2b7de', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', 'FieldCategoryInfo', '{"Vendor Credentials":{"icon":"fa fa-key","description":"Authentication details for the vendor, including credential reference and token"},"Vendor Details":{"icon":"fa fa-building","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Vendor Credentials":"fa fa-key","Vendor Details":"fa fa-building","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'D95A17EE-5750-4218-86AD-10F06E4DFBCA' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B74F553-7D17-46F4-B43A-CC25B1EFF850'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F58ADBF6-97C4-4089-88B6-7527B3B2DB88'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D910C070-7005-456E-8499-661471F5912A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Sensitive Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Server Only Encrypted',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '330D3218-89AD-45FE-8BF1-BA734E821D2D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Sensitive Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Client Viewable Encrypted',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0E93CA46-F8B0-47F2-9323-22D786E6209C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E9D9146-8650-4564-8D12-A532C8A45C05'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B17E3EE-C97B-4ED6-A6AE-10DE45FD41E8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DAFF238A-AD3C-4E72-8E27-E760C21AB839'
   AND AutoUpdateCategory = 1
 
         

/* Set categories for 21 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model-Vendor Linkage',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4536A71E-5AD6-4F8C-A663-21F3CEF4831A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model-Vendor Linkage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C7583B81-0BC4-4302-98ED-BE6E5DD22D50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model-Vendor Linkage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B30005CE-FA92-4DEE-8F56-BEFC7D5E2AAE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model-Vendor Linkage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '37BFE134-5935-4863-8B22-29EFE58B2150'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model-Vendor Linkage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model-Vendor Linkage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1A83EAF3-4F88-48BA-8B4B-BA7E0A4AB513'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model-Vendor Linkage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EA94D7B8-080D-4525-B0E9-6E620B3E901E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model-Vendor Linkage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FBD754C7-2336-494C-9E4F-F3A6EADDB575'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model-Vendor Linkage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0A17D759-76BD-4954-8851-86F14EAEB203'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Implementation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BF1B7891-03FE-4B11-ABE7-4BDF4C832A56'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Implementation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Import Path',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D57079F0-0DE2-45D8-8ECB-4DC006888664'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Implementation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FBEE7EC7-7AD6-45D1-874B-CAAE97C51B22'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Implementation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Input Tokens',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '20E5AFFE-1F52-478D-AD83-C5A0A90A2C4E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Implementation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Output Tokens',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C5799595-5330-4762-BD3C-12F9CD02E933'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Implementation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Supported Response Formats',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1099A0DE-EEE4-4D04-B0F6-AC9ED896690D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Implementation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Supports Effort Level',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B36B3620-899F-4851-AD2A-ED14F2D22A4C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Implementation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Supports Streaming',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2E9DA543-3A02-4695-A96C-3017025842CE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Implementation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4BD221FC-0CAE-4E2A-BF1E-1C62FB03FDD3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Implementation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CC46A8D9-0875-41D3-B4F6-0B7AB7F75195'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C8EA3975-296E-4432-A2CF-78BA773F7CD0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0199799B-8D89-4306-AA33-67D7A326165A'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('be507bf5-fae4-4a32-8a57-76695f223650', 'F386546E-EC07-46E6-B780-6B1FEA5892E6', 'FieldCategoryInfo', '{"Model-Vendor Linkage":{"icon":"fa fa-link","description":""},"Implementation Configuration":{"icon":"fa fa-cogs","description":""},"System Metadata":{"icon":"fa fa-database","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Model-Vendor Linkage":"fa fa-link","Implementation Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 21 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA463BBA-B763-48CB-A6F8-F0A3B5AFA35D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4A75D65E-D43B-4879-95A9-72AB39BCD88E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FFFBADAF-D742-4866-8103-6615DBC43FE0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Model Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B2CC3BF9-108B-4703-97A1-6E477ED9D8A9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Model Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '10370467-1CCD-4A86-AF3F-39BE67B19B99'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Model Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C6428612-640B-4573-B3FF-5B242E616B7E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt & Model Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2395FD4-050C-44A6-BC12-768B200C82E0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vendor & Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D7CD881D-840D-4A68-BCDA-2203E74E62A5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vendor & Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EE922F4A-D61D-4222-8C7F-7FEA211ADDC9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vendor & Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3D9CDA2C-FDCC-4DB3-B7AA-E989D6348654'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Vendor & Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '35EC6612-1C62-4401-B4B5-FD4E1F67B4D3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution & Parallel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B8E1299-E3BF-4838-9D0F-A01F6883C063'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution & Parallel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Execution Group',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '29F49B56-B2F7-4D8B-9F4E-10713D61819C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution & Parallel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model Parameters',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B64439F2-B243-4B96-BB4C-C09C5DBD760F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution & Parallel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '70E7FF76-A99F-4886-AE7C-3DE0C620B4A5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution & Parallel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parallelization Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FEC78D56-641A-4866-9049-2F3684DF4592'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution & Parallel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parallel Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CCCEFDB1-E3B9-4A2F-821F-E2CB010BB237'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution & Parallel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parallel Config Param',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C856BFAC-6211-4573-8A75-861DAC5E37E1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Effort & Credential Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Effort Level',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D5AD02E-FEAE-4B1A-A5FC-68A198A73B27'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Effort & Credential Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DCF0AB5D-5700-4518-9AB7-058766229E06'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Effort & Credential Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '93CF06EC-3324-46B8-AAD1-CE68CB26F75B'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('01749dc3-fc2c-4322-accf-4b84266f5eff', 'AD4D32AE-6848-41A0-A966-2A1F8B751251', 'FieldCategoryInfo', '{"Effort & Credential Settings":{"icon":"fa fa-key","description":"Settings that control model effort overrides and credential specifications"},"Prompt & Model Mapping":{"icon":"fa fa-link","description":""},"Vendor & Configuration":{"icon":"fa fa-sliders-h","description":""},"Execution & Parallel Settings":{"icon":"fa fa-tachometer-alt","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Effort & Credential Settings":"fa fa-key","Prompt & Model Mapping":"fa fa-link","Vendor & Configuration":"fa fa-sliders-h","Execution & Parallel Settings":"fa fa-tachometer-alt","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND Name = 'FieldCategoryIcons'
            






















-- SECOND CODE GEN RUN

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8ab60100-bbc5-4634-a351-e9d5d74372ab'  OR 
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
            '8ab60100-bbc5-4634-a351-e9d5d74372ab',
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
         WHERE ID = '7643d3c7-61d9-4588-9a9b-53bf6775bc37'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TestRun')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7643d3c7-61d9-4588-9a9b-53bf6775bc37',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100105,
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
         WHERE ID = 'fe459699-2c25-4afa-b8af-865c64739c31'  OR 
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
            'fe459699-2c25-4afa-b8af-865c64739c31',
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
         WHERE ID = '8a1c42a5-cbf3-4dbd-a06e-fd2130b3aa22'  OR 
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
            '8a1c42a5-cbf3-4dbd-a06e-fd2130b3aa22',
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
         WHERE ID = 'a43c1456-6da3-41a4-8e66-217da242ad10'  OR 
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
            'a43c1456-6da3-41a4-8e66-217da242ad10',
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
         WHERE ID = 'a7054f76-0ab2-460f-9f39-f1ffa2b8828f'  OR 
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
            'a7054f76-0ab2-460f-9f39-f1ffa2b8828f',
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

