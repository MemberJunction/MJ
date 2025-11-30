-- Migration: Add Application navigation and status fields
-- Version: 2.123.x
-- Description: Adds DefaultSequence, Status, NavigationStyle, and TopNavLocation fields to Application table
--              to support enhanced navigation behaviors and application lifecycle management

-- ============================================================================
-- SCHEMA CHANGES
-- ============================================================================

-- Add new columns to Application table
ALTER TABLE ${flyway:defaultSchema}.Application
ADD
    DefaultSequence INT NOT NULL DEFAULT 100,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    NavigationStyle NVARCHAR(20) NOT NULL DEFAULT 'App Switcher',
    TopNavLocation NVARCHAR(30) NULL;

GO

-- Add CHECK constraint for Status field
ALTER TABLE ${flyway:defaultSchema}.Application
ADD CONSTRAINT CK_Application_Status
    CHECK (Status IN ('Pending', 'Active', 'Disabled', 'Deprecated'));

-- Add CHECK constraint for NavigationStyle field
ALTER TABLE ${flyway:defaultSchema}.Application
ADD CONSTRAINT CK_Application_NavigationStyle
    CHECK (NavigationStyle IN ('App Switcher', 'Nav Bar', 'Both'));

-- Add CHECK constraint for TopNavLocation field (only used when NavigationStyle is 'Nav Bar' or 'Both')
ALTER TABLE ${flyway:defaultSchema}.Application
ADD CONSTRAINT CK_Application_TopNavLocation
    CHECK (TopNavLocation IN ('Left of App Switcher', 'Left of User Menu') OR TopNavLocation IS NULL);

-- ============================================================================
-- EXTENDED PROPERTIES (Column Descriptions)
-- ============================================================================

-- DefaultSequence
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default sequence position when adding this application to a new user''s User Applications. Lower values appear first. Used when DefaultForNewUser is true.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Application',
    @level2type = N'COLUMN', @level2name = 'DefaultSequence';

-- Status
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Application lifecycle status. Pending = not yet ready, Active = available for use, Disabled = temporarily unavailable, Deprecated = being phased out. Only Active applications are shown to users.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Application',
    @level2type = N'COLUMN', @level2name = 'Status';

-- NavigationStyle
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How the application appears in navigation. App Switcher = only in dropdown menu, Nav Bar = permanent icon in top nav, Both = shown in both locations.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Application',
    @level2type = N'COLUMN', @level2name = 'NavigationStyle';

-- TopNavLocation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Position of the permanent nav icon when NavigationStyle is Nav Bar or Both. Left of App Switcher = appears before the app switcher, Left of User Menu = appears near the user avatar. Ignored when NavigationStyle is App Switcher.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Application',
    @level2type = N'COLUMN', @level2name = 'TopNavLocation';






--- REFRESH before CodeGen Run as we've had other changes to Application table in this version

/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to sync schema info from database schemas */
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to recompile all stored procedures in dependency order */
EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1













































-- CODE GEN RUN HERE
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b80ac534-6341-4f99-aa26-b119bad3de45'  OR 
               (EntityID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultSequence')
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
            'b80ac534-6341-4f99-aa26-b119bad3de45',
            'E8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Applications
            100023,
            'DefaultSequence',
            'Default Sequence',
            'Default sequence position when adding this application to a new user''s User Applications. Lower values appear first. Used when DefaultForNewUser is true.',
            'int',
            4,
            10,
            0,
            0,
            '(100)',
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
         WHERE ID = 'a584a155-01f7-4d79-bf72-47513bffd6e7'  OR 
               (EntityID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Status')
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
            'a584a155-01f7-4d79-bf72-47513bffd6e7',
            'E8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Applications
            100024,
            'Status',
            'Status',
            'Application lifecycle status. Pending = not yet ready, Active = available for use, Disabled = temporarily unavailable, Deprecated = being phased out. Only Active applications are shown to users.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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
         WHERE ID = '09a7fabc-07cf-48e3-9985-dc92f3af6f81'  OR 
               (EntityID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'NavigationStyle')
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
            '09a7fabc-07cf-48e3-9985-dc92f3af6f81',
            'E8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Applications
            100025,
            'NavigationStyle',
            'Navigation Style',
            'How the application appears in navigation. App Switcher = only in dropdown menu, Nav Bar = permanent icon in top nav, Both = shown in both locations.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'App Switcher',
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
         WHERE ID = '866e22ff-8e97-4436-9186-276076961988'  OR 
               (EntityID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TopNavLocation')
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
            '866e22ff-8e97-4436-9186-276076961988',
            'E8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Applications
            100026,
            'TopNavLocation',
            'Top Nav Location',
            'Position of the permanent nav icon when NavigationStyle is Nav Bar or Both. Left of App Switcher = appears before the app switcher, Left of User Menu = appears near the user avatar. Ignored when NavigationStyle is App Switcher.',
            'nvarchar',
            60,
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

/* SQL text to insert entity field value with ID dc8c339c-9324-4610-8640-aac99b3c6d06 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('dc8c339c-9324-4610-8640-aac99b3c6d06', 'A584A155-01F7-4D79-BF72-47513BFFD6E7', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 02679f06-34ff-4a93-a590-8cf88fbe6c03 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('02679f06-34ff-4a93-a590-8cf88fbe6c03', 'A584A155-01F7-4D79-BF72-47513BFFD6E7', 2, 'Deprecated', 'Deprecated')

/* SQL text to insert entity field value with ID 01b91209-37c6-4970-9948-8611455531d7 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('01b91209-37c6-4970-9948-8611455531d7', 'A584A155-01F7-4D79-BF72-47513BFFD6E7', 3, 'Disabled', 'Disabled')

/* SQL text to insert entity field value with ID 2d23c2d4-2b99-4415-95cb-bce197dcd7d3 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2d23c2d4-2b99-4415-95cb-bce197dcd7d3', 'A584A155-01F7-4D79-BF72-47513BFFD6E7', 4, 'Pending', 'Pending')

/* SQL text to update ValueListType for entity field ID A584A155-01F7-4D79-BF72-47513BFFD6E7 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A584A155-01F7-4D79-BF72-47513BFFD6E7'

/* SQL text to insert entity field value with ID 6a171194-14e4-43cf-a455-ee6fd52d176a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6a171194-14e4-43cf-a455-ee6fd52d176a', '09A7FABC-07CF-48E3-9985-DC92F3AF6F81', 1, 'App Switcher', 'App Switcher')

/* SQL text to insert entity field value with ID d190f67f-2fd7-4edb-a11a-31249cf4cb85 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d190f67f-2fd7-4edb-a11a-31249cf4cb85', '09A7FABC-07CF-48E3-9985-DC92F3AF6F81', 2, 'Both', 'Both')

/* SQL text to insert entity field value with ID 3549f96c-e3b5-4a75-9b42-c76e311df794 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3549f96c-e3b5-4a75-9b42-c76e311df794', '09A7FABC-07CF-48E3-9985-DC92F3AF6F81', 3, 'Nav Bar', 'Nav Bar')

/* SQL text to update ValueListType for entity field ID 09A7FABC-07CF-48E3-9985-DC92F3AF6F81 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='09A7FABC-07CF-48E3-9985-DC92F3AF6F81'

/* SQL text to insert entity field value with ID 275f665c-b814-44a5-8edc-030f9ed18653 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('275f665c-b814-44a5-8edc-030f9ed18653', '866E22FF-8E97-4436-9186-276076961988', 1, 'Left of App Switcher', 'Left of App Switcher')

/* SQL text to insert entity field value with ID 5becf725-e20d-4838-83db-68f6e7a866ea */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5becf725-e20d-4838-83db-68f6e7a866ea', '866E22FF-8E97-4436-9186-276076961988', 2, 'Left of User Menu', 'Left of User Menu')

/* SQL text to update ValueListType for entity field ID 866E22FF-8E97-4436-9186-276076961988 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='866E22FF-8E97-4436-9186-276076961988'

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
    @TopNavLocation nvarchar(30)
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
                [TopNavLocation]
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
                @TopNavLocation
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
                [TopNavLocation]
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
                @TopNavLocation
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
    @TopNavLocation nvarchar(30)
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
        [TopNavLocation] = @TopNavLocation
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
         

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '454F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B35717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FCFF872D-0B33-4C53-BB9F-15910F91AD83'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A21A856-C791-4363-9B29-2DE6BC6AFB29'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B80AC534-6341-4F99-AA26-B119BAD3DE45'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Configuration',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A584A155-01F7-4D79-BF72-47513BFFD6E7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '464F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '474F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B25717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A6D6C48-40DC-45ED-A524-D82B7B2F9EC6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Navigation Settings',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '09A7FABC-07CF-48E3-9985-DC92F3AF6F81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Navigation Settings',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '866E22FF-8E97-4436-9186-276076961988'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Navigation Settings',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6A46A06E-7B1C-466D-9447-1924D9EF2FA0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '054D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '064D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryIcons setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Application Configuration":"fa fa-cog","General Information":"fa fa-info-circle","Navigation Settings":"fa fa-compass","System Metadata":"fa fa-database"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set DefaultForNewUser=0 for entity based on AI analysis (category: system, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6'
         

