-- Migration to add TypeID column to mj.AIModelVendor table
-- This allows tracking of vendor roles (model developer, inference provider, etc.)

-- Add the TypeID column and foreign key constraint
ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor]
ADD [TypeID] uniqueidentifier NULL
    CONSTRAINT [FK_AIModelVendor_AIVendorTypeDefinition]
    FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[AIVendorTypeDefinition] ([ID]);

-- Add extended property documentation for the new column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References the type/role of the vendor for this model (e.g., model developer, inference provider)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIModelVendor',
    @level2type = N'COLUMN', @level2name = N'TypeID';

-- Remove existing UQ constraint as we need to add TypeID to it
ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] DROP CONSTRAINT [UQ_AIModelVendor_ModelID_VendorID]
GO

/****** Object:  Index [UQ_AIModelVendor_ModelID_VendorID]    Script Date: 5/30/2025 2:02:35 PM ******/
ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD  CONSTRAINT [UQ_AIModelVendor_ModelID_VendorID_TypeID] UNIQUE NONCLUSTERED 
(
	[ModelID] ASC,
	[VendorID] ASC,
	[TypeID] ASC
) 


-- Update all existing rows to be Inference Provider type
UPDATE [${flyway:defaultSchema}].[AIModelVendor] 
SET [TypeID] = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3'
WHERE [TypeID] IS NULL;

-- Duplicate all rows as Model Developer type - EXCEPT Groq as they are inference only
INSERT INTO [${flyway:defaultSchema}].[AIModelVendor] (
    [ID],
    [ModelID], 
    [VendorID], 
    [TypeID]
)
SELECT 
    NEWID(),
    [ModelID],
    [VendorID],
    '10DB468E-F2CE-475D-9F39-2DF2DE75D257' -- Model Developer type ID
FROM [${flyway:defaultSchema}].[AIModelVendor]
WHERE 
	[TypeID] = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3' AND 
	VendorID NOT IN (SELECT ID FROM ${flyway:defaultSchema}.AIVendor WHERE Name='Groq');
 


/************************************************************************
************************************************************************
************************************************************************
************************************************************************
                            CODE GEN RUN
************************************************************************
************************************************************************
************************************************************************
************************************************************************/

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1a83eaf3-4f88-48ba-8b4b-ba7e0a4ab513'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'TypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1a83eaf3-4f88-48ba-8b4b-ba7e0a4ab513',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            16,
            'TypeID',
            'Type ID',
            'References the type/role of the vendor for this model (e.g., model developer, inference provider)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1',
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a929a670-ba8b-463a-a63c-65eaea5f44b3'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a929a670-ba8b-463a-a63c-65eaea5f44b3', 'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1', 'F386546E-EC07-46E6-B780-6B1FEA5892E6', 'TypeID', 'One To Many', 1, 1, 'MJ: AI Model Vendors', 1);
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

/* SQL text to update entity field related entity name field map for entity field ID 1A83EAF3-4F88-48BA-8B4B-BA7E0A4AB513 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1A83EAF3-4F88-48BA-8B4B-BA7E0A4AB513',
         @RelatedEntityNameFieldMap='Type'

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
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIModelVendors]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelVendors]
AS
SELECT
    a.*,
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIVendorTypeDefinition_TypeID.[Name] AS [Type]
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendorTypeDefinition] AS AIVendorTypeDefinition_TypeID
  ON
    [a].[TypeID] = AIVendorTypeDefinition_TypeID.[ID]
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIModelVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelVendor]
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
    @TypeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIModelVendor]
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
            [TypeID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ModelID,
            @VendorID,
            @Priority,
            @Status,
            @DriverClass,
            @DriverImportPath,
            @APIName,
            @MaxInputTokens,
            @MaxOutputTokens,
            @SupportedResponseFormats,
            @SupportsEffortLevel,
            @SupportsStreaming,
            @TypeID
        )
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIModelVendor]
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
    @TypeID uniqueidentifier
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
        [TypeID] = @TypeID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
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
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIModelVendor
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIModelVendor]
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


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelVendor] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelVendor] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0a17d759-76bd-4954-8851-86f14eaeb203'  OR 
               (EntityID = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND Name = 'Type')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0a17d759-76bd-4954-8851-86f14eaeb203',
            'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- Entity: MJ: AI Model Vendors
            19,
            'Type',
            'Type',
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

