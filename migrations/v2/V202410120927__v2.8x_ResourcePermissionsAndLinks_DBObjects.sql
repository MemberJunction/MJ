-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Resource Permissions
-- Item: vwResourcePermissions
-- Generated: 10/12/2024, 9:30:24 AM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Resource Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ResourcePermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwResourcePermissions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwResourcePermissions]
AS
SELECT
    r.*,
    ResourceType_ResourceTypeID.[Name] AS [ResourceType],
    Role_RoleID.[Name] AS [Role],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[ResourcePermission] AS r
INNER JOIN
    [${flyway:defaultSchema}].[ResourceType] AS ResourceType_ResourceTypeID
  ON
    [r].[ResourceTypeID] = ResourceType_ResourceTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Role] AS Role_RoleID
  ON
    [r].[RoleID] = Role_RoleID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwResourcePermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Resource Permissions
-- Item: spCreateResourcePermission
-- Generated: 10/12/2024, 9:30:24 AM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ResourcePermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateResourcePermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateResourcePermission]
    @ResourceTypeID uniqueidentifier,
    @ResourceRecordID nvarchar(255),
    @Type nvarchar(10),
    @StartSharingAt datetimeoffset,
    @EndSharingAt datetimeoffset,
    @RoleID uniqueidentifier,
    @UserID uniqueidentifier,
    @PermissionLevel nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ResourcePermission]
        (
            [ResourceTypeID],
            [ResourceRecordID],
            [Type],
            [StartSharingAt],
            [EndSharingAt],
            [RoleID],
            [UserID],
            [PermissionLevel]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ResourceTypeID,
            @ResourceRecordID,
            @Type,
            @StartSharingAt,
            @EndSharingAt,
            @RoleID,
            @UserID,
            @PermissionLevel
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwResourcePermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateResourcePermission] TO [cdp_Developer], [cdp_Integration]



-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Resource Permissions
-- Item: spUpdateResourcePermission
-- Generated: 10/12/2024, 9:30:24 AM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ResourcePermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateResourcePermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateResourcePermission]
    @ID uniqueidentifier,
    @ResourceTypeID uniqueidentifier,
    @ResourceRecordID nvarchar(255),
    @Type nvarchar(10),
    @StartSharingAt datetimeoffset,
    @EndSharingAt datetimeoffset,
    @RoleID uniqueidentifier,
    @UserID uniqueidentifier,
    @PermissionLevel nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ResourcePermission]
    SET
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceRecordID] = @ResourceRecordID,
        [Type] = @Type,
        [StartSharingAt] = @StartSharingAt,
        [EndSharingAt] = @EndSharingAt,
        [RoleID] = @RoleID,
        [UserID] = @UserID,
        [PermissionLevel] = @PermissionLevel
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwResourcePermissions]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateResourcePermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ResourcePermission table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateResourcePermission
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateResourcePermission
ON [${flyway:defaultSchema}].[ResourcePermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ResourcePermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ResourcePermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO



-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Resource Permissions
-- Item: spDeleteResourcePermission
-- Generated: 10/12/2024, 9:30:24 AM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ResourcePermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteResourcePermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteResourcePermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ResourcePermission]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteResourcePermission] TO [cdp_Integration]


-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Resource Links
-- Item: vwResourceLinks
-- Generated: 10/12/2024, 9:30:24 AM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Resource Links
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ResourceLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwResourceLinks]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwResourceLinks]
AS
SELECT
    r.*,
    User_UserID.[Name] AS [User],
    ResourceType_ResourceTypeID.[Name] AS [ResourceType]
FROM
    [${flyway:defaultSchema}].[ResourceLink] AS r
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ResourceType] AS ResourceType_ResourceTypeID
  ON
    [r].[ResourceTypeID] = ResourceType_ResourceTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwResourceLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Resource Links
-- Item: spCreateResourceLink
-- Generated: 10/12/2024, 9:30:24 AM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ResourceLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateResourceLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateResourceLink]
    @UserID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @ResourceTypeID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @ResourceRecordID nvarchar(255),
    @FolderID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ResourceLink]
        (
            [UserID],
            [ResourceTypeID],
            [ResourceRecordID],
            [FolderID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            CASE @UserID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @UserID END,
            CASE @ResourceTypeID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @ResourceTypeID END,
            @ResourceRecordID,
            @FolderID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwResourceLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateResourceLink] TO [cdp_Developer], [cdp_Integration]

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Resource Links
-- Item: spUpdateResourceLink
-- Generated: 10/12/2024, 9:30:24 AM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ResourceLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateResourceLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateResourceLink]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @ResourceTypeID uniqueidentifier,
    @ResourceRecordID nvarchar(255),
    @FolderID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ResourceLink]
    SET
        [UserID] = @UserID,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceRecordID] = @ResourceRecordID,
        [FolderID] = @FolderID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwResourceLinks]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateResourceLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ResourceLink table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateResourceLink
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateResourceLink
ON [${flyway:defaultSchema}].[ResourceLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ResourceLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ResourceLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Resource Links
-- Item: spDeleteResourceLink
-- Generated: 10/12/2024, 9:30:24 AM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ResourceLink
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteResourceLink]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteResourceLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ResourceLink]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteResourceLink] TO [cdp_Integration]
