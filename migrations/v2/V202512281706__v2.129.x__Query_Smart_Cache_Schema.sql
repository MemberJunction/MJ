-- ======================================================================
-- Migration: Query Smart Cache Schema
-- Version: 2.129.x
-- Description: Add CacheValidationSQL field to enable smart cache
--              validation for queries. Extends existing cache fields
--              (CacheEnabled, CacheTTLMinutes) with validation capability.
--              Also updates CacheEnabled extended property to document
--              the complete caching behavior.
-- ======================================================================

-- ===========================
-- 1. Add CacheValidationSQL Column
-- ===========================

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = '${flyway:defaultSchema}'
      AND TABLE_NAME = 'Query'
      AND COLUMN_NAME = 'CacheValidationSQL'
)
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.Query
    ADD CacheValidationSQL NVARCHAR(MAX) NULL;
END
GO

-- Add extended property description for CacheValidationSQL
IF NOT EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE ep.name = 'MS_Description'
      AND c.name = 'CacheValidationSQL'
      AND c.object_id = OBJECT_ID('${flyway:defaultSchema}.Query')
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'SQL query used to validate cache freshness for smart caching. When set (and CacheEnabled=true), enables smart cache validation instead of simple TTL expiration. This query MUST return exactly two columns: MaxUpdatedAt (datetime/datetimeoffset) and TotalRows (int). The query has access to the same Nunjucks parameters as the main query SQL. When NULL, caching uses TTL-only behavior based on CacheTTLMinutes. Example: SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt, COUNT(*) AS TotalRows FROM Orders WHERE Status = ''{{ status }}''',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = 'Query',
        @level2type = N'COLUMN', @level2name = 'CacheValidationSQL';
END
GO

-- ===========================
-- 2. Update CacheEnabled Extended Property
-- ===========================
-- Drop existing description if present and add updated one

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE ep.name = 'MS_Description'
      AND c.name = 'CacheEnabled'
      AND c.object_id = OBJECT_ID('${flyway:defaultSchema}.Query')
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = 'Query',
        @level2type = N'COLUMN', @level2name = 'CacheEnabled';
END
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, enables query result caching. Caching behavior depends on CacheValidationSQL: (1) If CacheValidationSQL is NULL, uses simple server-side TTL caching based on CacheTTLMinutes - results are cached on the server and expire after the TTL period. (2) If CacheValidationSQL is set, enables smart client-side caching with freshness validation - client sends cache fingerprint (maxUpdatedAt + rowCount) to server, server validates using CacheValidationSQL and returns ''current'' (use cached) or ''stale'' (with fresh data). Smart caching provides real-time accuracy while minimizing data transfer.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Query',
    @level2type = N'COLUMN', @level2name = 'CacheEnabled';
GO

PRINT 'Query Smart Cache Schema migration completed successfully.';
GO


















































-- CODE GEN RUN 
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2df7c600-b13b-4e58-9dcd-173c82f13770'  OR 
               (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CacheValidationSQL')
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
            '2df7c600-b13b-4e58-9dcd-173c82f13770',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Queries
            100045,
            'CacheValidationSQL',
            'Cache Validation SQL',
            'SQL query used to validate cache freshness for smart caching. When set (and CacheEnabled=true), enables smart cache validation instead of simple TTL expiration. This query MUST return exactly two columns: MaxUpdatedAt (datetime/datetimeoffset) and TotalRows (int). The query has access to the same Nunjucks parameters as the main query SQL. When NULL, caching uses TTL-only behavior based on CacheTTLMinutes. Example: SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt, COUNT(*) AS TotalRows FROM Orders WHERE Status = ''{{ status }}''',
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

/* Index for Foreign Keys for Query */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_CategoryID ON [${flyway:defaultSchema}].[Query] ([CategoryID]);

-- Index for foreign key EmbeddingModelID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID ON [${flyway:defaultSchema}].[Query] ([EmbeddingModelID]);

/* Base View SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Queries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueries]
AS
SELECT
    q.*,
    QueryCategory_CategoryID.[Name] AS [Category],
    AIModel_EmbeddingModelID.[Name] AS [EmbeddingModel]
FROM
    [${flyway:defaultSchema}].[Query] AS q
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[QueryCategory] AS QueryCategory_CategoryID
  ON
    [q].[CategoryID] = QueryCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_EmbeddingModelID
  ON
    [q].[EmbeddingModelID] = AIModel_EmbeddingModelID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: Permissions for vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: spCreateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQuery]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15) = NULL,
    @QualityRank int,
    @ExecutionCostRank int,
    @UsesTemplate bit,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes int,
    @CacheMaxSize int,
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier,
    @CacheValidationSQL nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [ID],
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate],
                [AuditQueryRuns],
                [CacheEnabled],
                [CacheTTLMinutes],
                [CacheMaxSize],
                [EmbeddingVector],
                [EmbeddingModelID],
                [CacheValidationSQL]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @CategoryID,
                @UserQuestion,
                @Description,
                @SQL,
                @TechnicalDescription,
                @OriginalSQL,
                @Feedback,
                ISNULL(@Status, 'Pending'),
                @QualityRank,
                @ExecutionCostRank,
                @UsesTemplate,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                @CacheTTLMinutes,
                @CacheMaxSize,
                @EmbeddingVector,
                @EmbeddingModelID,
                @CacheValidationSQL
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate],
                [AuditQueryRuns],
                [CacheEnabled],
                [CacheTTLMinutes],
                [CacheMaxSize],
                [EmbeddingVector],
                [EmbeddingModelID],
                [CacheValidationSQL]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @CategoryID,
                @UserQuestion,
                @Description,
                @SQL,
                @TechnicalDescription,
                @OriginalSQL,
                @Feedback,
                ISNULL(@Status, 'Pending'),
                @QualityRank,
                @ExecutionCostRank,
                @UsesTemplate,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                @CacheTTLMinutes,
                @CacheMaxSize,
                @EmbeddingVector,
                @EmbeddingModelID,
                @CacheValidationSQL
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: spUpdateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int,
    @ExecutionCostRank int,
    @UsesTemplate bit,
    @AuditQueryRuns bit,
    @CacheEnabled bit,
    @CacheTTLMinutes int,
    @CacheMaxSize int,
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier,
    @CacheValidationSQL nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        [Name] = @Name,
        [CategoryID] = @CategoryID,
        [UserQuestion] = @UserQuestion,
        [Description] = @Description,
        [SQL] = @SQL,
        [TechnicalDescription] = @TechnicalDescription,
        [OriginalSQL] = @OriginalSQL,
        [Feedback] = @Feedback,
        [Status] = @Status,
        [QualityRank] = @QualityRank,
        [ExecutionCostRank] = @ExecutionCostRank,
        [UsesTemplate] = @UsesTemplate,
        [AuditQueryRuns] = @AuditQueryRuns,
        [CacheEnabled] = @CacheEnabled,
        [CacheTTLMinutes] = @CacheTTLMinutes,
        [CacheMaxSize] = @CacheMaxSize,
        [EmbeddingVector] = @EmbeddingVector,
        [EmbeddingModelID] = @EmbeddingModelID,
        [CacheValidationSQL] = @CacheValidationSQL
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQuery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQuery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQuery
ON [${flyway:defaultSchema}].[Query]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Query] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]



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



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '884317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '884317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B45717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '734E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '744E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B65717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '774E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '884317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B45717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '894317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '774E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 24 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '874317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '274D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '284D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Query Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '884317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Query Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Query Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Question',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B45717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Query Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '894317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Query Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'SQL',
       ExtendedType = 'Code',
       CodeType = 'SQL'
   WHERE ID = '8B4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Query Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Technical Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B55717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Query Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Original SQL',
       ExtendedType = 'Code',
       CodeType = 'SQL'
   WHERE ID = '8C4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Query Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Uses Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8F2BFC6F-5E7F-4DE7-9A35-66FD6E8731AB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Query Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '774E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Quality',
       GeneratedFormSection = 'Category',
       DisplayName = 'Feedback',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '724E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Quality',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '734E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Quality',
       GeneratedFormSection = 'Category',
       DisplayName = 'Quality Rank',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '744E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Quality',
       GeneratedFormSection = 'Category',
       DisplayName = 'Execution Cost Rank',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B65717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Caching & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Audit Query Runs',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1CA275F3-757F-4D4D-8EE3-2443393CD676'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Caching & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cache Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F075DB33-92E3-45D9-86BB-08711205829D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Caching & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cache TTL Minutes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0420AC10-6902-484B-B976-1C51573EDF4C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Caching & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cache Max Size',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '89288495-3472-436F-860D-AEE7F746CFF9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Caching & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cache Validation SQL',
       ExtendedType = 'Code',
       CodeType = 'SQL'
   WHERE ID = '2DF7C600-B13B-4E58-9DCD-173C82F13770'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI & Embeddings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Embedding Vector',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CDBF7167-76D6-41DE-A50D-01CBFFEDC1E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI & Embeddings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Embedding Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '00136468-3433-4B6C-BCEF-649E76497AFC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI & Embeddings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Embedding Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B241317-2875-4E3C-B80E-952C7270A308'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('2f644191-0fc6-4689-9469-ff9397e1f78a', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Query Definition":{"icon":"fa fa-file-code","description":""},"Performance & Quality":{"icon":"fa fa-chart-line","description":""},"Caching & Execution Settings":{"icon":"fa fa-sliders-h","description":""},"AI & Embeddings":{"icon":"fa fa-brain","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Query Definition":"fa fa-file-code","Performance & Quality":"fa fa-chart-line","Caching & Execution Settings":"fa fa-sliders-h","AI & Embeddings":"fa fa-brain","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

