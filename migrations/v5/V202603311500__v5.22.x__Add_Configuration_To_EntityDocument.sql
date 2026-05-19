-- Add Configuration columns to EntityDocument and VectorDatabase for extensible JSON settings.

-- EntityDocument: controls vector metadata field inclusion, large field truncation,
-- sync scheduling, thresholds, pipeline options, etc.
ALTER TABLE ${flyway:defaultSchema}.EntityDocument ADD
    Configuration NVARCHAR(MAX) NULL;

-- VectorDatabase: provider-specific connection settings like custom host URLs,
-- authentication config, timeouts, retry policies, batch size limits, etc.
ALTER TABLE ${flyway:defaultSchema}.VectorDatabase ADD
    Configuration NVARCHAR(MAX) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration settings for this entity document. Controls vector metadata field inclusion (which fields get stored in the vector index for search result display), large field truncation limits, and future settings like sync scheduling and threshold overrides. NULL means use system defaults.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityDocument',
    @level2type = N'COLUMN', @level2name = N'Configuration';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration settings for this vector database provider. Stores provider-specific connection settings like custom host URLs, authentication configuration, timeouts, retry policies, and batch size limits. NULL means use defaults from environment variables or provider defaults.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'VectorDatabase',
    @level2type = N'COLUMN', @level2name = N'Configuration';










































































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c4f4b15-7a37-49fa-87d5-6ef9d5b66699' OR (EntityID = '20248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Configuration')) BEGIN
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
            '2c4f4b15-7a37-49fa-87d5-6ef9d5b66699',
            '20248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Vector Databases
            100015,
            'Configuration',
            'Configuration',
            'JSON configuration settings for this vector database provider. Stores provider-specific connection settings like custom host URLs, authentication configuration, timeouts, retry policies, and batch size limits. NULL means use defaults from environment variables or provider defaults.',
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
            'Dropdown',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5997b3e4-6b33-49e1-9c6f-88b8e5bd4c03' OR (EntityID = '22248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Configuration')) BEGIN
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
            '5997b3e4-6b33-49e1-9c6f-88b8e5bd4c03',
            '22248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Documents
            100033,
            'Configuration',
            'Configuration',
            'JSON configuration settings for this entity document. Controls vector metadata field inclusion (which fields get stored in the vector index for search result display), large field truncation limits, and future settings like sync scheduling and threshold overrides. NULL means use system defaults.',
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

/* Index for Foreign Keys for EntityDocument */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TypeID in table EntityDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocument_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocument_TypeID ON [${flyway:defaultSchema}].[EntityDocument] ([TypeID]);

-- Index for foreign key EntityID in table EntityDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocument_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocument_EntityID ON [${flyway:defaultSchema}].[EntityDocument] ([EntityID]);

-- Index for foreign key VectorDatabaseID in table EntityDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocument_VectorDatabaseID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocument_VectorDatabaseID ON [${flyway:defaultSchema}].[EntityDocument] ([VectorDatabaseID]);

-- Index for foreign key TemplateID in table EntityDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocument_TemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocument_TemplateID ON [${flyway:defaultSchema}].[EntityDocument] ([TemplateID]);

-- Index for foreign key AIModelID in table EntityDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocument_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocument_AIModelID ON [${flyway:defaultSchema}].[EntityDocument] ([AIModelID]);

-- Index for foreign key VectorIndexID in table EntityDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocument_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocument_VectorIndexID ON [${flyway:defaultSchema}].[EntityDocument] ([VectorIndexID]);

/* Base View SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: vwEntityDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Documents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityDocument
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityDocuments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityDocuments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityDocuments]
AS
SELECT
    e.*,
    MJEntityDocumentType_TypeID.[Name] AS [Type],
    MJEntity_EntityID.[Name] AS [Entity],
    MJVectorDatabase_VectorDatabaseID.[Name] AS [VectorDatabase],
    MJTemplate_TemplateID.[Name] AS [Template],
    MJAIModel_AIModelID.[Name] AS [AIModel],
    MJVectorIndex_VectorIndexID.[Name] AS [VectorIndex]
FROM
    [${flyway:defaultSchema}].[EntityDocument] AS e
INNER JOIN
    [${flyway:defaultSchema}].[EntityDocumentType] AS MJEntityDocumentType_TypeID
  ON
    [e].[TypeID] = MJEntityDocumentType_TypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [e].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[VectorDatabase] AS MJVectorDatabase_VectorDatabaseID
  ON
    [e].[VectorDatabaseID] = MJVectorDatabase_VectorDatabaseID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Template] AS MJTemplate_TemplateID
  ON
    [e].[TemplateID] = MJTemplate_TemplateID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_AIModelID
  ON
    [e].[AIModelID] = MJAIModel_AIModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS MJVectorIndex_VectorIndexID
  ON
    [e].[VectorIndexID] = MJVectorIndex_VectorIndexID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityDocuments] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* Base View Permissions SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: Permissions for vwEntityDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityDocuments] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spCreateEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityDocument]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(250),
    @TypeID uniqueidentifier,
    @EntityID uniqueidentifier,
    @VectorDatabaseID uniqueidentifier,
    @Status nvarchar(15) = NULL,
    @TemplateID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @PotentialMatchThreshold numeric(12, 11) = NULL,
    @AbsoluteMatchThreshold numeric(12, 11) = NULL,
    @VectorIndexID uniqueidentifier,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityDocument]
            (
                [ID],
                [Name],
                [TypeID],
                [EntityID],
                [VectorDatabaseID],
                [Status],
                [TemplateID],
                [AIModelID],
                [PotentialMatchThreshold],
                [AbsoluteMatchThreshold],
                [VectorIndexID],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @TypeID,
                @EntityID,
                @VectorDatabaseID,
                ISNULL(@Status, 'Active'),
                @TemplateID,
                @AIModelID,
                ISNULL(@PotentialMatchThreshold, 1),
                ISNULL(@AbsoluteMatchThreshold, 1),
                @VectorIndexID,
                @Configuration
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityDocument]
            (
                [Name],
                [TypeID],
                [EntityID],
                [VectorDatabaseID],
                [Status],
                [TemplateID],
                [AIModelID],
                [PotentialMatchThreshold],
                [AbsoluteMatchThreshold],
                [VectorIndexID],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @TypeID,
                @EntityID,
                @VectorDatabaseID,
                ISNULL(@Status, 'Active'),
                @TemplateID,
                @AIModelID,
                ISNULL(@PotentialMatchThreshold, 1),
                ISNULL(@AbsoluteMatchThreshold, 1),
                @VectorIndexID,
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityDocuments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityDocument] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Entity Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityDocument] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spUpdateEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityDocument]
    @ID uniqueidentifier,
    @Name nvarchar(250),
    @TypeID uniqueidentifier,
    @EntityID uniqueidentifier,
    @VectorDatabaseID uniqueidentifier,
    @Status nvarchar(15),
    @TemplateID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @PotentialMatchThreshold numeric(12, 11),
    @AbsoluteMatchThreshold numeric(12, 11),
    @VectorIndexID uniqueidentifier,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityDocument]
    SET
        [Name] = @Name,
        [TypeID] = @TypeID,
        [EntityID] = @EntityID,
        [VectorDatabaseID] = @VectorDatabaseID,
        [Status] = @Status,
        [TemplateID] = @TemplateID,
        [AIModelID] = @AIModelID,
        [PotentialMatchThreshold] = @PotentialMatchThreshold,
        [AbsoluteMatchThreshold] = @AbsoluteMatchThreshold,
        [VectorIndexID] = @VectorIndexID,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityDocuments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityDocuments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityDocument] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityDocument table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityDocument]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityDocument];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityDocument
ON [${flyway:defaultSchema}].[EntityDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityDocument]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityDocument] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entity Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityDocument] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spDeleteEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityDocument]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityDocument]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Entity Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] TO [cdp_Integration]



/* Index for Foreign Keys for VectorDatabase */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: vwVectorDatabases
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Vector Databases
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  VectorDatabase
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwVectorDatabases]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwVectorDatabases];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwVectorDatabases]
AS
SELECT
    v.*
FROM
    [${flyway:defaultSchema}].[VectorDatabase] AS v
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwVectorDatabases] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* Base View Permissions SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: Permissions for vwVectorDatabases
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwVectorDatabases] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: spCreateVectorDatabase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VectorDatabase
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateVectorDatabase]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateVectorDatabase];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateVectorDatabase]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DefaultURL nvarchar(255),
    @ClassKey nvarchar(100),
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[VectorDatabase]
            (
                [ID],
                [Name],
                [Description],
                [DefaultURL],
                [ClassKey],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @DefaultURL,
                @ClassKey,
                @Configuration
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[VectorDatabase]
            (
                [Name],
                [Description],
                [DefaultURL],
                [ClassKey],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @DefaultURL,
                @ClassKey,
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwVectorDatabases] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVectorDatabase] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Vector Databases */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVectorDatabase] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: spUpdateVectorDatabase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VectorDatabase
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateVectorDatabase]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateVectorDatabase];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateVectorDatabase]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DefaultURL nvarchar(255),
    @ClassKey nvarchar(100),
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VectorDatabase]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DefaultURL] = @DefaultURL,
        [ClassKey] = @ClassKey,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwVectorDatabases] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwVectorDatabases]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVectorDatabase] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the VectorDatabase table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateVectorDatabase]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateVectorDatabase];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateVectorDatabase
ON [${flyway:defaultSchema}].[VectorDatabase]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VectorDatabase]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[VectorDatabase] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Vector Databases */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVectorDatabase] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: spDeleteVectorDatabase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VectorDatabase
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteVectorDatabase]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteVectorDatabase];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteVectorDatabase]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[VectorDatabase]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVectorDatabase] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Vector Databases */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVectorDatabase] TO [cdp_Integration]



/* Set field properties for entity */

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E84317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E94317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'EA4317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Vector Databases.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E64317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Databases.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E74317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Databases.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E84317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Databases.DefaultURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'E94317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Databases.ClassKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EA4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Databases.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Vector Database Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '2C4F4B15-7A37-49FA-87D5-6EF9D5B66699' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Databases.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C85817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Vector Databases.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C95817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info MJ: Entity Documents.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F34317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F44317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EA4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.TypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F64317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F54317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.VectorDatabaseID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2A4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.TemplateID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0EB26E0-3E3B-EF11-86D4-0022481D1B23' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.AIModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.VectorIndexID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7EC088B4-C4AA-4E8F-841B-1650720C4FD7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '024F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.VectorDatabase 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CCADD97E-8E07-4B42-A16F-ADCFF9F9B385' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.Template 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AF9D284C-DA9C-409B-ABB0-4BB4AA1F778F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.AIModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EAE4FA06-2E28-4959-9179-7C6420F7FE60' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.VectorIndex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BAC4C88D-29FE-46E9-9BC4-37B473206A08' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F74317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.PotentialMatchThreshold 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '264417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.AbsoluteMatchThreshold 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '274417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '5997B3E4-6B33-49E1-9C6F-88B8E5BD4C03' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '144D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Documents.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '154D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

