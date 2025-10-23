/*
 * Migration: Add User Avatar Support
 * Version: v2.110.x
 * Date: 2025-10-23
 *
 * Description:
 * Adds UserImageURL and UserImageIconClass fields to User table to support
 * user-configurable avatars. Images can be Base64 encoded or URLs pointing to
 * external/internal storage. Falls back to Font Awesome icon classes if no image.
 *
 * Changes:
 * - Add UserImageURL field (supports Base64 or URL)
 * - Add UserImageIconClass field (Font Awesome CSS classes)
 * - Rendering preference: UserImageURL first, then UserImageIconClass, then default
 * - Update extended properties for documentation
 */

-- =============================================
-- Add Avatar Fields to User Table
-- =============================================

-- Add UserImageURL field
-- Supports both Base64 encoded images (e.g., "data:image/png;base64,iVBORw0KG...")
-- and regular URLs (e.g., "https://cdn.example.com/avatars/user123.jpg")
ALTER TABLE [${flyway:defaultSchema}].[User]
ADD UserImageURL NVARCHAR(MAX) NULL;

-- Add UserImageIconClass field
-- Supports Font Awesome class names (e.g., "fa-solid fa-user-astronaut")
ALTER TABLE [${flyway:defaultSchema}].[User]
ADD UserImageIconClass NVARCHAR(100) NULL;

GO

-- =============================================
-- Add Extended Properties for Documentation
-- =============================================

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User avatar image. Can be a Base64 encoded data URI (e.g., "data:image/png;base64,...") or a URL to an image file. Preferred over UserImageIconClass when present. Recommended for small thumbnail images only to maintain performance.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'User',
    @level2type = N'COLUMN', @level2name = N'UserImageURL';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Font Awesome icon class for user avatar (e.g., "fa-solid fa-user-astronaut"). Used as fallback when UserImageURL is not provided. Example classes: "fa-solid fa-user", "fa-regular fa-circle-user", "fa-solid fa-user-tie".',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'User',
    @level2type = N'COLUMN', @level2name = N'UserImageIconClass';

GO

















































































-- CodeGen Run
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6ae7e629-5a0f-4308-9a78-72a3e63dc282'  OR 
               (EntityID = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'UserImageURL')
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
            '6ae7e629-5a0f-4308-9a78-72a3e63dc282',
            'E1238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Users
            100035,
            'UserImageURL',
            'User Image URL',
            'User avatar image. Can be a Base64 encoded data URI (e.g., "data:image/png;base64,...") or a URL to an image file. Preferred over UserImageIconClass when present. Recommended for small thumbnail images only to maintain performance.',
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
         WHERE ID = '9a263417-b004-4729-bdc4-4a960adc7983'  OR 
               (EntityID = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'UserImageIconClass')
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
            '9a263417-b004-4729-bdc4-4a960adc7983',
            'E1238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Users
            100036,
            'UserImageIconClass',
            'User Image Icon Class',
            'Font Awesome icon class for user avatar (e.g., "fa-solid fa-user-astronaut"). Used as fallback when UserImageURL is not provided. Example classes: "fa-solid fa-user", "fa-regular fa-circle-user", "fa-solid fa-user-tie".',
            'nvarchar',
            200,
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

/* Index for Foreign Keys for User */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key LinkedEntityID in table User
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_User_LinkedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[User]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_User_LinkedEntityID ON [${flyway:defaultSchema}].[User] ([LinkedEntityID]);

-- Index for foreign key EmployeeID in table User
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_User_EmployeeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[User]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_User_EmployeeID ON [${flyway:defaultSchema}].[User] ([EmployeeID]);

/* Base View Permissions SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: Permissions for vwUsers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUsers] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: spCreateUser
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR User
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUser]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUser];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUser]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @FirstName nvarchar(50),
    @LastName nvarchar(50),
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Type nchar(15),
    @IsActive bit = NULL,
    @LinkedRecordType nchar(10) = NULL,
    @LinkedEntityID uniqueidentifier,
    @LinkedEntityRecordID nvarchar(450),
    @EmployeeID uniqueidentifier,
    @UserImageURL nvarchar(MAX),
    @UserImageIconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[User]
            (
                [ID],
                [Name],
                [FirstName],
                [LastName],
                [Title],
                [Email],
                [Type],
                [IsActive],
                [LinkedRecordType],
                [LinkedEntityID],
                [LinkedEntityRecordID],
                [EmployeeID],
                [UserImageURL],
                [UserImageIconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @FirstName,
                @LastName,
                @Title,
                @Email,
                @Type,
                ISNULL(@IsActive, 0),
                ISNULL(@LinkedRecordType, 'None'),
                @LinkedEntityID,
                @LinkedEntityRecordID,
                @EmployeeID,
                @UserImageURL,
                @UserImageIconClass
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[User]
            (
                [Name],
                [FirstName],
                [LastName],
                [Title],
                [Email],
                [Type],
                [IsActive],
                [LinkedRecordType],
                [LinkedEntityID],
                [LinkedEntityRecordID],
                [EmployeeID],
                [UserImageURL],
                [UserImageIconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @FirstName,
                @LastName,
                @Title,
                @Email,
                @Type,
                ISNULL(@IsActive, 0),
                ISNULL(@LinkedRecordType, 'None'),
                @LinkedEntityID,
                @LinkedEntityRecordID,
                @EmployeeID,
                @UserImageURL,
                @UserImageIconClass
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUsers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUser] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Users */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUser] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: spUpdateUser
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR User
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUser]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUser];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUser]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @FirstName nvarchar(50),
    @LastName nvarchar(50),
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Type nchar(15),
    @IsActive bit,
    @LinkedRecordType nchar(10),
    @LinkedEntityID uniqueidentifier,
    @LinkedEntityRecordID nvarchar(450),
    @EmployeeID uniqueidentifier,
    @UserImageURL nvarchar(MAX),
    @UserImageIconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[User]
    SET
        [Name] = @Name,
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Title] = @Title,
        [Email] = @Email,
        [Type] = @Type,
        [IsActive] = @IsActive,
        [LinkedRecordType] = @LinkedRecordType,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedEntityRecordID] = @LinkedEntityRecordID,
        [EmployeeID] = @EmployeeID,
        [UserImageURL] = @UserImageURL,
        [UserImageIconClass] = @UserImageIconClass
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUsers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUsers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUser] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the User table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUser]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUser];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUser
ON [${flyway:defaultSchema}].[User]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[User]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[User] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Users */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUser] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: spDeleteUser
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR User
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUser]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUser];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUser]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[User]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUser] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Users */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUser] TO [cdp_Integration], [cdp_Developer]



