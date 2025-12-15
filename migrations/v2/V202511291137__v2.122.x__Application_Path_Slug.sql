-- Migration: Add Path column to Application entity for URL-friendly slugs
-- Version: 2.123.x
-- Description: Adds Path and AutoUpdatePath fields to Application table.
--              Path provides a URL-friendly slug (e.g., "data-explorer" instead of "Data Explorer").
--              AutoUpdatePath controls whether Path is auto-generated from Name on save.

-- ============================================================================
-- SCHEMA CHANGES
-- ============================================================================

-- Add new columns to Application table (Path nullable initially so we can populate existing records)
ALTER TABLE ${flyway:defaultSchema}.Application
ADD
    Path NVARCHAR(100) NULL,
    AutoUpdatePath BIT NOT NULL DEFAULT 1;

GO

-- ============================================================================
-- POPULATE PATH FOR EXISTING RECORDS
-- ============================================================================

-- Generate Path from Name for all existing applications using slug conversion:
-- 1. Convert to lowercase
-- 2. Replace spaces with hyphens
-- 3. Remove special characters (keep only alphanumeric and hyphens)
-- 4. Handle duplicates by appending numbers

-- First pass: Set initial Path values
UPDATE ${flyway:defaultSchema}.Application
SET Path = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    Name,
    ' ', '-'),      -- spaces to hyphens
    ':', ''),       -- remove colons
    '''', ''),      -- remove apostrophes
    '(', ''),       -- remove opening parens
    ')', ''),       -- remove closing parens
    '--', '-'));    -- collapse double hyphens

GO

-- Handle duplicates by appending sequence numbers
-- This uses a CTE to identify duplicates and update them
;WITH DuplicatePaths AS (
    SELECT
        ID,
        Path,
        ROW_NUMBER() OVER (PARTITION BY Path ORDER BY __mj_CreatedAt) AS RowNum
    FROM ${flyway:defaultSchema}.Application
)
UPDATE a
SET Path = a.Path + '-' + CAST(dp.RowNum AS NVARCHAR(10))
FROM ${flyway:defaultSchema}.Application a
INNER JOIN DuplicatePaths dp ON a.ID = dp.ID
WHERE dp.RowNum > 1;

GO

-- ============================================================================
-- ADD CONSTRAINTS
-- ============================================================================

-- Now make Path NOT NULL and add UNIQUE constraint
ALTER TABLE ${flyway:defaultSchema}.Application
ALTER COLUMN Path NVARCHAR(100) NOT NULL;

GO

-- Add unique constraint for Path
ALTER TABLE ${flyway:defaultSchema}.Application
ADD CONSTRAINT UQ_Application_Path UNIQUE (Path);

GO

-- ============================================================================
-- EXTENDED PROPERTIES (Column Descriptions)
-- ============================================================================

-- Path
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL-friendly slug for the application (e.g., "data-explorer" for "Data Explorer"). Used in URLs instead of the full Name. Auto-generated from Name when AutoUpdatePath is true. Must be unique across all applications.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Application',
    @level2type = N'COLUMN', @level2name = 'Path';

GO

-- AutoUpdatePath
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, Path is automatically generated from Name on save. Set to false to manually control the Path value. Defaults to true for new applications.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Application',
    @level2type = N'COLUMN', @level2name = 'AutoUpdatePath';

GO

-- ============================================================================
-- REFRESH METADATA AND REGENERATE DB OBJECTS
-- ============================================================================

-- Recompile views
EXEC [${flyway:defaultSchema}].spRecompileAllViews

-- Update entity metadata from schema
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

-- Sync schema info
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

-- Delete unneeded entity fields
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

-- Update existing entity fields from schema
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

-- Set default column widths
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

-- Recompile stored procedures
EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1

GO









-- ============================================================================
-- CODEGEN OUTPUT - Entity Field Metadata
-- ============================================================================
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '799cc5fb-663d-413b-ad76-8de5f8c373ee'  OR 
               (EntityID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Path')
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
            '799cc5fb-663d-413b-ad76-8de5f8c373ee',
            'E8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Applications
            100033,
            'Path',
            'Path',
            'URL-friendly slug for the application (e.g., "data-explorer" for "Data Explorer"). Used in URLs instead of the full Name. Auto-generated from Name when AutoUpdatePath is true. Must be unique across all applications.',
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
            0,
            0,
            0,
            0,
            0,
            1,
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bd572c5c-1276-4495-8061-2c52bf71b437'  OR 
               (EntityID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdatePath')
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
            'bd572c5c-1276-4495-8061-2c52bf71b437',
            'E8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Applications
            100034,
            'AutoUpdatePath',
            'Auto Update Path',
            'When true, Path is automatically generated from Name on save. Set to false to manually control the Path value. Defaults to true for new applications.',
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
            'Dropdown'
         )
      END

/* Index for Foreign Keys for Application */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: vwApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Applications
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Application
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwApplications]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwApplications];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwApplications]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[Application] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwApplications] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: Permissions for vwApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwApplications] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: spCreateApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Application
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateApplication]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Icon nvarchar(500),
    @DefaultForNewUser bit = NULL,
    @SchemaAutoAddNewEntities nvarchar(MAX),
    @Color nvarchar(20),
    @DefaultNavItems nvarchar(MAX),
    @ClassName nvarchar(255),
    @DefaultSequence int = NULL,
    @Status nvarchar(20) = NULL,
    @NavigationStyle nvarchar(20) = NULL,
    @TopNavLocation nvarchar(30),
    @HideNavBarIconWhenActive bit = NULL,
    @Path nvarchar(100),
    @AutoUpdatePath bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Application]
            (
                [ID],
                [Name],
                [Description],
                [Icon],
                [DefaultForNewUser],
                [SchemaAutoAddNewEntities],
                [Color],
                [DefaultNavItems],
                [ClassName],
                [DefaultSequence],
                [Status],
                [NavigationStyle],
                [TopNavLocation],
                [HideNavBarIconWhenActive],
                [Path],
                [AutoUpdatePath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @Icon,
                ISNULL(@DefaultForNewUser, 1),
                @SchemaAutoAddNewEntities,
                @Color,
                @DefaultNavItems,
                @ClassName,
                ISNULL(@DefaultSequence, 100),
                ISNULL(@Status, 'Active'),
                ISNULL(@NavigationStyle, 'App Switcher'),
                @TopNavLocation,
                ISNULL(@HideNavBarIconWhenActive, 0),
                @Path,
                ISNULL(@AutoUpdatePath, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Application]
            (
                [Name],
                [Description],
                [Icon],
                [DefaultForNewUser],
                [SchemaAutoAddNewEntities],
                [Color],
                [DefaultNavItems],
                [ClassName],
                [DefaultSequence],
                [Status],
                [NavigationStyle],
                [TopNavLocation],
                [HideNavBarIconWhenActive],
                [Path],
                [AutoUpdatePath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @Icon,
                ISNULL(@DefaultForNewUser, 1),
                @SchemaAutoAddNewEntities,
                @Color,
                @DefaultNavItems,
                @ClassName,
                ISNULL(@DefaultSequence, 100),
                ISNULL(@Status, 'Active'),
                ISNULL(@NavigationStyle, 'App Switcher'),
                @TopNavLocation,
                ISNULL(@HideNavBarIconWhenActive, 0),
                @Path,
                ISNULL(@AutoUpdatePath, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwApplications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplication] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplication] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: spUpdateApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Application
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateApplication]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Icon nvarchar(500),
    @DefaultForNewUser bit,
    @SchemaAutoAddNewEntities nvarchar(MAX),
    @Color nvarchar(20),
    @DefaultNavItems nvarchar(MAX),
    @ClassName nvarchar(255),
    @DefaultSequence int,
    @Status nvarchar(20),
    @NavigationStyle nvarchar(20),
    @TopNavLocation nvarchar(30),
    @HideNavBarIconWhenActive bit,
    @Path nvarchar(100),
    @AutoUpdatePath bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Application]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Icon] = @Icon,
        [DefaultForNewUser] = @DefaultForNewUser,
        [SchemaAutoAddNewEntities] = @SchemaAutoAddNewEntities,
        [Color] = @Color,
        [DefaultNavItems] = @DefaultNavItems,
        [ClassName] = @ClassName,
        [DefaultSequence] = @DefaultSequence,
        [Status] = @Status,
        [NavigationStyle] = @NavigationStyle,
        [TopNavLocation] = @TopNavLocation,
        [HideNavBarIconWhenActive] = @HideNavBarIconWhenActive,
        [Path] = @Path,
        [AutoUpdatePath] = @AutoUpdatePath
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwApplications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwApplications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplication] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Application table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateApplication]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateApplication];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateApplication
ON [${flyway:defaultSchema}].[Application]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Application]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Application] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplication] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Applications
-- Item: spDeleteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Application
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteApplication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Application]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration]



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '464F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '464F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B35717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B80AC534-6341-4F99-AA26-B119BAD3DE45'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A584A155-01F7-4D79-BF72-47513BFFD6E7'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '09A7FABC-07CF-48E3-9985-DC92F3AF6F81'
            AND AutoUpdateDefaultInView = 1
         

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '454F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default For New User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B35717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Schema Auto Add New Entities',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FCFF872D-0B33-4C53-BB9F-15910F91AD83'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Class Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A21A856-C791-4363-9B29-2DE6BC6AFB29'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B80AC534-6341-4F99-AA26-B119BAD3DE45'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A584A155-01F7-4D79-BF72-47513BFFD6E7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Path',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '799CC5FB-663D-413B-AD76-8DE5F8C373EE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Path',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BD572C5C-1276-4495-8061-2C52BF71B437'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '464F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '474F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B25717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Color',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A6D6C48-40DC-45ED-A524-D82B7B2F9EC6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '054D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '064D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Navigation Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Nav Items',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6A46A06E-7B1C-466D-9447-1924D9EF2FA0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Navigation Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Navigation Style',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '09A7FABC-07CF-48E3-9985-DC92F3AF6F81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Navigation Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Top Nav Location',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '866E22FF-8E97-4436-9186-276076961988'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Navigation Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Hide Nav Bar Icon When Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1E997F79-B97C-47D4-8A84-1936227F577A'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('19ec7558-46ac-468c-80dc-1ba56f9a8c92', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Application Configuration":{"icon":"fa fa-cog","description":""},"General Information":{"icon":"fa fa-info-circle","description":""},"System Metadata":{"icon":"fa fa-database","description":""},"Navigation Settings":{"icon":"fa fa-sliders-h","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Application Configuration":"fa fa-cog","General Information":"fa fa-info-circle","System Metadata":"fa fa-database","Navigation Settings":"fa fa-sliders-h"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

 