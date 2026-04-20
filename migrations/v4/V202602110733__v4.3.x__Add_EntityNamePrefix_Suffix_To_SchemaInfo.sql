-- Migration: Add EntityNamePrefix and EntityNameSuffix to SchemaInfo
-- Purpose: Allow app designers to declaratively configure entity name prefixes/suffixes
--          per schema via database metadata (e.g., "Committees: Individuals" for a Committees schema).
--          CodeGen will honor these values, with mj.config.cjs overrides taking precedence.

-- Step 1: Add the new nullable columns
PRINT N'Adding EntityNamePrefix and EntityNameSuffix to SchemaInfo'
GO
ALTER TABLE [${flyway:defaultSchema}].[SchemaInfo]
    ADD [EntityNamePrefix] NVARCHAR(25) NULL,
        [EntityNameSuffix] NVARCHAR(25) NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON

-- Step 2: Document the new fields with extended properties
PRINT N'Adding extended properties for new columns'
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional prefix to prepend to entity names generated for this schema. For example, setting this to "Committees: " would result in entity names like "Committees: Individuals". Can be overridden by mj.config.cjs NameRulesBySchema settings.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SchemaInfo',
    @level2type = N'COLUMN', @level2name = N'EntityNamePrefix'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional suffix to append to entity names generated for this schema. Can be overridden by mj.config.cjs NameRulesBySchema settings.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SchemaInfo',
    @level2type = N'COLUMN', @level2name = N'EntityNameSuffix'
GO
IF @@ERROR <> 0 SET NOEXEC ON

-- Step 3: Set the prefix for the core MJ schema to match existing behavior
PRINT N'Setting MJ: prefix on core schema'
GO
UPDATE [${flyway:defaultSchema}].[SchemaInfo]
SET [EntityNamePrefix] = 'MJ: '
WHERE [SchemaName] = '${flyway:defaultSchema}'
GO
IF @@ERROR <> 0 SET NOEXEC ON
























































--CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7fed41bf-9aca-4eb6-9c03-8f833f16dc26'  OR 
               (EntityID = '15248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityNamePrefix')
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
            '7fed41bf-9aca-4eb6-9c03-8f833f16dc26',
            '15248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Schema Info
            100017,
            'EntityNamePrefix',
            'Entity Name Prefix',
            'Optional prefix to prepend to entity names generated for this schema. For example, setting this to "Committees: " would result in entity names like "Committees: Individuals". Can be overridden by mj.config.cjs NameRulesBySchema settings.',
            'nvarchar',
            50,
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6e0d828d-e762-4cb7-a061-681e718b60e3'  OR 
               (EntityID = '15248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityNameSuffix')
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
            '6e0d828d-e762-4cb7-a061-681e718b60e3',
            '15248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Schema Info
            100018,
            'EntityNameSuffix',
            'Entity Name Suffix',
            'Optional suffix to append to entity names generated for this schema. Can be overridden by mj.config.cjs NameRulesBySchema settings.',
            'nvarchar',
            50,
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
            'Dropdown'
         )
      END

/* SQL text to update display name for field SQLName */
UPDATE [${flyway:defaultSchema}].EntityField SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'SQL Name' WHERE ID = 'D94217F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update display name for field URLFormat */
UPDATE [${flyway:defaultSchema}].EntityField SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'URL Format' WHERE ID = '0C5817F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to delete entity field value ID 2B28453E-F36B-1410-8680-007B559E242F */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='2B28453E-F36B-1410-8680-007B559E242F'

/* Index for Foreign Keys for SchemaInfo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Schema Info */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: vwSchemaInfos
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Schema Info
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SchemaInfo
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSchemaInfos]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSchemaInfos];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSchemaInfos]
AS
SELECT
    s.*
FROM
    [${flyway:defaultSchema}].[SchemaInfo] AS s
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSchemaInfos] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Schema Info */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: Permissions for vwSchemaInfos
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSchemaInfos] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Schema Info */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: spCreateSchemaInfo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SchemaInfo
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSchemaInfo]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSchemaInfo];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSchemaInfo]
    @ID uniqueidentifier = NULL,
    @SchemaName nvarchar(50),
    @EntityIDMin int,
    @EntityIDMax int,
    @Comments nvarchar(MAX),
    @Description nvarchar(MAX),
    @EntityNamePrefix nvarchar(25),
    @EntityNameSuffix nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SchemaInfo]
            (
                [ID],
                [SchemaName],
                [EntityIDMin],
                [EntityIDMax],
                [Comments],
                [Description],
                [EntityNamePrefix],
                [EntityNameSuffix]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SchemaName,
                @EntityIDMin,
                @EntityIDMax,
                @Comments,
                @Description,
                @EntityNamePrefix,
                @EntityNameSuffix
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SchemaInfo]
            (
                [SchemaName],
                [EntityIDMin],
                [EntityIDMax],
                [Comments],
                [Description],
                [EntityNamePrefix],
                [EntityNameSuffix]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SchemaName,
                @EntityIDMin,
                @EntityIDMax,
                @Comments,
                @Description,
                @EntityNamePrefix,
                @EntityNameSuffix
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSchemaInfos] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSchemaInfo] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Schema Info */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSchemaInfo] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Schema Info */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: spUpdateSchemaInfo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SchemaInfo
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSchemaInfo]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSchemaInfo];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSchemaInfo]
    @ID uniqueidentifier,
    @SchemaName nvarchar(50),
    @EntityIDMin int,
    @EntityIDMax int,
    @Comments nvarchar(MAX),
    @Description nvarchar(MAX),
    @EntityNamePrefix nvarchar(25),
    @EntityNameSuffix nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SchemaInfo]
    SET
        [SchemaName] = @SchemaName,
        [EntityIDMin] = @EntityIDMin,
        [EntityIDMax] = @EntityIDMax,
        [Comments] = @Comments,
        [Description] = @Description,
        [EntityNamePrefix] = @EntityNamePrefix,
        [EntityNameSuffix] = @EntityNameSuffix
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSchemaInfos] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSchemaInfos]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSchemaInfo] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SchemaInfo table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSchemaInfo]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSchemaInfo];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSchemaInfo
ON [${flyway:defaultSchema}].[SchemaInfo]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SchemaInfo]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SchemaInfo] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Schema Info */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSchemaInfo] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Schema Info */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: spDeleteSchemaInfo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SchemaInfo
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSchemaInfo]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSchemaInfo];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSchemaInfo]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SchemaInfo]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSchemaInfo] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Schema Info */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSchemaInfo] TO [cdp_Developer], [cdp_Integration]



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '384E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '384E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '424317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '434317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '28CB0081-5381-4538-806C-A3382FD0BDE1'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '384E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '28CB0081-5381-4538-806C-A3382FD0BDE1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7FED41BF-9ACA-4EB6-9C03-8F833F16DC26'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6E0D828D-E762-4CB7-A061-681E718B60E3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Range',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '374E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Range',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity ID Minimum',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '424317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Range',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity ID Maximum',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '434317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schema Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Schema Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '384E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schema Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '444317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schema Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '28CB0081-5381-4538-806C-A3382FD0BDE1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schema Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Name Prefix',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7FED41BF-9ACA-4EB6-9C03-8F833F16DC26'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schema Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Name Suffix',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E0D828D-E762-4CB7-A061-681E718B60E3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '705817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

