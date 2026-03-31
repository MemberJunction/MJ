-- Add metadata columns to VectorIndex for provider sync and configuration

ALTER TABLE ${flyway:defaultSchema}.VectorIndex ADD
    ExternalID NVARCHAR(500) NULL,
    Dimensions INT NULL,
    Metric NVARCHAR(50) NULL,
    ProviderConfig NVARCHAR(MAX) NULL;

-- Extended properties for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The provider''s native identifier for this index. For Pinecone this is the index name; for other providers it may be a separate UUID or identifier. Used for syncing operations between MJ metadata and the remote vector database.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'VectorIndex',
    @level2type = N'COLUMN', @level2name = N'ExternalID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The number of dimensions for vectors stored in this index. Determined by the embedding model (e.g., 1536 for text-embedding-3-small, 768 for all-mpnet-base-v2). Set automatically when the index is created via the vector database provider.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'VectorIndex',
    @level2type = N'COLUMN', @level2name = N'Dimensions';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The distance metric used for similarity calculations in this index. Common values: cosine (default, measures angular similarity), euclidean (L2 distance), dotproduct (inner product). Must match what the vector database provider was configured with.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'VectorIndex',
    @level2type = N'COLUMN', @level2name = N'Metric';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing provider-specific configuration for this index. For Pinecone serverless: {"cloud":"aws","region":"us-east-1"}. For pod-based: {"environment":"us-east1-gcp","podType":"p1.x1","replicas":1}. Stored as a flexible JSON bag to support any provider without schema changes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'VectorIndex',
    @level2type = N'COLUMN', @level2name = N'ProviderConfig';































































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cbee8b17-bdc3-4241-8645-e8169953405f' OR (EntityID = '1D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ExternalID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cbee8b17-bdc3-4241-8645-e8169953405f',
            '1D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Vector Indexes
            100017,
            'ExternalID',
            'External ID',
            'The provider''s native identifier for this index. For Pinecone this is the index name; for other providers it may be a separate UUID or identifier. Used for syncing operations between MJ metadata and the remote vector database.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '43e02f2e-0137-47ee-9f37-526e9f3025d9' OR (EntityID = '1D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Dimensions')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '43e02f2e-0137-47ee-9f37-526e9f3025d9',
            '1D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Vector Indexes
            100018,
            'Dimensions',
            'Dimensions',
            'The number of dimensions for vectors stored in this index. Determined by the embedding model (e.g., 1536 for text-embedding-3-small, 768 for all-mpnet-base-v2). Set automatically when the index is created via the vector database provider.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '54faa5b0-a7ee-4242-8039-8808e63a3f49' OR (EntityID = '1D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Metric')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '54faa5b0-a7ee-4242-8039-8808e63a3f49',
            '1D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Vector Indexes
            100019,
            'Metric',
            'Metric',
            'The distance metric used for similarity calculations in this index. Common values: cosine (default, measures angular similarity), euclidean (L2 distance), dotproduct (inner product). Must match what the vector database provider was configured with.',
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f91e3615-c22f-4bcd-a81f-49e7f2e46a64' OR (EntityID = '1D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ProviderConfig')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f91e3615-c22f-4bcd-a81f-49e7f2e46a64',
            '1D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Vector Indexes
            100020,
            'ProviderConfig',
            'Provider Config',
            'JSON object containing provider-specific configuration for this index. For Pinecone serverless: {"cloud":"aws","region":"us-east-1"}. For pod-based: {"environment":"us-east1-gcp","podType":"p1.x1","replicas":1}. Stored as a flexible JSON bag to support any provider without schema changes.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* Index for Foreign Keys for VectorIndex */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Indexes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key VectorDatabaseID in table VectorIndex
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VectorIndex_VectorDatabaseID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VectorIndex]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VectorIndex_VectorDatabaseID ON [${flyway:defaultSchema}].[VectorIndex] ([VectorDatabaseID]);

-- Index for foreign key EmbeddingModelID in table VectorIndex
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VectorIndex_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VectorIndex]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VectorIndex_EmbeddingModelID ON [${flyway:defaultSchema}].[VectorIndex] ([EmbeddingModelID]);

/* Base View SQL for MJ: Vector Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Indexes
-- Item: vwVectorIndexes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Vector Indexes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  VectorIndex
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwVectorIndexes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwVectorIndexes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwVectorIndexes]
AS
SELECT
    v.*,
    MJVectorDatabase_VectorDatabaseID.[Name] AS [VectorDatabase],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel]
FROM
    [${flyway:defaultSchema}].[VectorIndex] AS v
INNER JOIN
    [${flyway:defaultSchema}].[VectorDatabase] AS MJVectorDatabase_VectorDatabaseID
  ON
    [v].[VectorDatabaseID] = MJVectorDatabase_VectorDatabaseID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [v].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwVectorIndexes] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* Base View Permissions SQL for MJ: Vector Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Indexes
-- Item: Permissions for vwVectorIndexes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwVectorIndexes] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for MJ: Vector Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Indexes
-- Item: spCreateVectorIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VectorIndex
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateVectorIndex]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateVectorIndex];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateVectorIndex]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @VectorDatabaseID uniqueidentifier,
    @EmbeddingModelID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Dimensions int,
    @Metric nvarchar(50),
    @ProviderConfig nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[VectorIndex]
            (
                [ID],
                [Name],
                [Description],
                [VectorDatabaseID],
                [EmbeddingModelID],
                [ExternalID],
                [Dimensions],
                [Metric],
                [ProviderConfig]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @VectorDatabaseID,
                @EmbeddingModelID,
                @ExternalID,
                @Dimensions,
                @Metric,
                @ProviderConfig
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[VectorIndex]
            (
                [Name],
                [Description],
                [VectorDatabaseID],
                [EmbeddingModelID],
                [ExternalID],
                [Dimensions],
                [Metric],
                [ProviderConfig]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @VectorDatabaseID,
                @EmbeddingModelID,
                @ExternalID,
                @Dimensions,
                @Metric,
                @ProviderConfig
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwVectorIndexes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVectorIndex] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Vector Indexes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVectorIndex] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Vector Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Indexes
-- Item: spUpdateVectorIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VectorIndex
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateVectorIndex]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateVectorIndex];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateVectorIndex]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @VectorDatabaseID uniqueidentifier,
    @EmbeddingModelID uniqueidentifier,
    @ExternalID nvarchar(500),
    @Dimensions int,
    @Metric nvarchar(50),
    @ProviderConfig nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VectorIndex]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [VectorDatabaseID] = @VectorDatabaseID,
        [EmbeddingModelID] = @EmbeddingModelID,
        [ExternalID] = @ExternalID,
        [Dimensions] = @Dimensions,
        [Metric] = @Metric,
        [ProviderConfig] = @ProviderConfig
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwVectorIndexes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwVectorIndexes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVectorIndex] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the VectorIndex table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateVectorIndex]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateVectorIndex];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateVectorIndex
ON [${flyway:defaultSchema}].[VectorIndex]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VectorIndex]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[VectorIndex] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Vector Indexes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVectorIndex] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for MJ: Vector Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Indexes
-- Item: spDeleteVectorIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VectorIndex
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteVectorIndex]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteVectorIndex];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteVectorIndex]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[VectorIndex]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVectorIndex] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Vector Indexes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVectorIndex] TO [cdp_Integration]



/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CBEE8B17-BDC3-4241-8645-E8169953405F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '43E02F2E-0137-47EE-9F37-526E9F3025D9'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '54FAA5B0-A7EE-4242-8039-8808E63A3F49'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'CBEE8B17-BDC3-4241-8645-E8169953405F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '54FAA5B0-A7EE-4242-8039-8808E63A3F49'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E74E17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E84E17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: Vector Indexes.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.ExternalID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Index Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CBEE8B17-BDC3-4241-8645-E8169953405F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.VectorDatabaseID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Vector Database',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DE4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.VectorDatabase 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Vector Database Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E74E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E84E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.Dimensions 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Index Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '43E02F2E-0137-47EE-9F37-526E9F3025D9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.Metric 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Index Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Distance Metric',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '54FAA5B0-A7EE-4242-8039-8808E63A3F49' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.ProviderConfig 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Index Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Provider Configuration',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'F91E3615-C22F-4BCD-A81F-49E7F2E46A64' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C65817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Indexes.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C75817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('66c42dcd-5931-4155-ba52-a1b9d1515c18', '1D248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Index Configuration":{"icon":"fa fa-sliders-h","description":"Technical settings including vector dimensions, distance metrics, and provider-specific configurations"}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Index Configuration":"fa fa-sliders-h"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '1D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

