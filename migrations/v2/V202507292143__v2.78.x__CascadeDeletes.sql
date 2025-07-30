-- Queries
UPDATE ${flyway:defaultSchema}.Entity SET CascadeDeletes=1 WHERE ID='1B248F34-2837-EF11-86D4-6045BDEE16E6' 


--- CODE GEN RUN FROM ABOVE
/* SQL text to delete entity field value ID 5B54443E-F36B-1410-8DBA-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='5B54443E-F36B-1410-8DBA-00021F8B792E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='E354443E-F36B-1410-8DBA-00021F8B792E'

/* SQL text to delete entity field value ID 6054443E-F36B-1410-8DBA-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='6054443E-F36B-1410-8DBA-00021F8B792E'

/* SQL text to update entity field related entity name field map for entity field ID 824F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='824F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID A14F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A14F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID A54F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A54F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 864F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='864F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 874F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='874F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 0C4F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0C4F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 154F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='154F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 1C4F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1C4F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 164F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='164F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 174F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='174F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 314F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='314F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 434F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='434F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 4F4F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4F4F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 554F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='554F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 464F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='464F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 474F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='474F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 484F443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='484F443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'



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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteQuery]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
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
        EXEC [${flyway:defaultSchema}].[spDeleteQueryField] @QueryFieldsID
        
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
        EXEC [${flyway:defaultSchema}].[spDeleteQueryPermission] @QueryPermissionsID
        
        FETCH NEXT FROM cascade_delete_QueryPermissions_cursor INTO @QueryPermissionsID
    END
    
    CLOSE cascade_delete_QueryPermissions_cursor
    DEALLOCATE cascade_delete_QueryPermissions_cursor
    
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
    DECLARE @DataContextItems_LastRefreshedAt datetime
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
        EXEC [${flyway:defaultSchema}].[spUpdateDataContextItem] @DataContextItemsID, @DataContextItems_DataContextID, @DataContextItems_Type, @DataContextItems_ViewID, @DataContextItems_QueryID, @DataContextItems_EntityID, @DataContextItems_RecordID, @DataContextItems_SQL, @DataContextItems_DataJSON, @DataContextItems_LastRefreshedAt, @DataContextItems_Description, @DataContextItems_CodeName
        
        FETCH NEXT FROM cascade_update_DataContextItems_cursor INTO @DataContextItemsID, @DataContextItems_DataContextID, @DataContextItems_Type, @DataContextItems_ViewID, @DataContextItems_QueryID, @DataContextItems_EntityID, @DataContextItems_RecordID, @DataContextItems_SQL, @DataContextItems_DataJSON, @DataContextItems_LastRefreshedAt, @DataContextItems_Description, @DataContextItems_CodeName
    END
    
    CLOSE cascade_update_DataContextItems_cursor
    DEALLOCATE cascade_update_DataContextItems_cursor
    
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
        EXEC [${flyway:defaultSchema}].[spDeleteQueryEntity] @QueryEntitiesID
        
        FETCH NEXT FROM cascade_delete_QueryEntities_cursor INTO @QueryEntitiesID
    END
    
    CLOSE cascade_delete_QueryEntities_cursor
    DEALLOCATE cascade_delete_QueryEntities_cursor
    
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
        EXEC [${flyway:defaultSchema}].[spDeleteQueryParameter] @MJ_QueryParametersID
        
        FETCH NEXT FROM cascade_delete_MJ_QueryParameters_cursor INTO @MJ_QueryParametersID
    END
    
    CLOSE cascade_delete_MJ_QueryParameters_cursor
    DEALLOCATE cascade_delete_MJ_QueryParameters_cursor
    

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



