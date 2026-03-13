/* SQL generated to create new entity RSU_ Test Gadgets */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'a4eece84-b9f2-4920-a48a-8169d99ae4ce',
         'RSU_ Test Gadgets',
         NULL,
         NULL,
         NULL,
         'RSU_TestGadget',
         'vwRSU_TestGadgets',
         'dbo',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity RSU_ Test Gadgets to application ID: '51139696-85C5-4258-8ED2-7BC6E1CAEDCB' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('51139696-85C5-4258-8ED2-7BC6E1CAEDCB', 'a4eece84-b9f2-4920-a48a-8169d99ae4ce', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '51139696-85C5-4258-8ED2-7BC6E1CAEDCB'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity RSU_ Test Gadgets for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a4eece84-b9f2-4920-a48a-8169d99ae4ce', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity RSU_ Test Gadgets for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a4eece84-b9f2-4920-a48a-8169d99ae4ce', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity RSU_ Test Gadgets for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a4eece84-b9f2-4920-a48a-8169d99ae4ce', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to remove entity RSU_ Test Widgets */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='1F6D9147-EE06-4821-B0C6-94FA1B9DA2A6'

/* SQL text to remove view dbo.vwRSU_TestWidgets */
IF OBJECT_ID('[dbo].[vwRSU_TestWidgets]', 'V') IS NOT NULL
    DROP VIEW [dbo].[vwRSU_TestWidgets]

/* SQL text to remove procedure dbo.spCreateRSU_TestWidget */
IF OBJECT_ID('[dbo].[spCreateRSU_TestWidget]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spCreateRSU_TestWidget]

/* SQL text to remove procedure dbo.spDeleteRSU_TestWidget */
IF OBJECT_ID('[dbo].[spDeleteRSU_TestWidget]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spDeleteRSU_TestWidget]

/* SQL text to remove procedure dbo.spUpdateRSU_TestWidget */
IF OBJECT_ID('[dbo].[spUpdateRSU_TestWidget]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spUpdateRSU_TestWidget]

/* SQL text to add special date field __mj_CreatedAt to entity dbo.RSU_TestGadget */
ALTER TABLE [dbo].[RSU_TestGadget] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.RSU_TestGadget */
ALTER TABLE [dbo].[RSU_TestGadget] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca38fe01-af94-4228-ba74-683165ce779f' OR (EntityID = 'A4EECE84-B9F2-4920-A48A-8169D99AE4CE' AND Name = 'ID')) BEGIN
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
            'ca38fe01-af94-4228-ba74-683165ce779f',
            'A4EECE84-B9F2-4920-A48A-8169D99AE4CE', -- Entity: RSU_ Test Gadgets
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90cedc5c-c45a-45ac-88b6-2fb85cbfd07c' OR (EntityID = 'A4EECE84-B9F2-4920-A48A-8169D99AE4CE' AND Name = 'Name')) BEGIN
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
            '90cedc5c-c45a-45ac-88b6-2fb85cbfd07c',
            'A4EECE84-B9F2-4920-A48A-8169D99AE4CE', -- Entity: RSU_ Test Gadgets
            100002,
            'Name',
            'Name',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '54dee870-257c-4912-ad5a-f2f18886450d' OR (EntityID = 'A4EECE84-B9F2-4920-A48A-8169D99AE4CE' AND Name = 'Description')) BEGIN
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
            '54dee870-257c-4912-ad5a-f2f18886450d',
            'A4EECE84-B9F2-4920-A48A-8169D99AE4CE', -- Entity: RSU_ Test Gadgets
            100003,
            'Description',
            'Description',
            NULL,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4881a680-cf8b-4282-8099-037a481e6f23' OR (EntityID = 'A4EECE84-B9F2-4920-A48A-8169D99AE4CE' AND Name = 'Status')) BEGIN
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
            '4881a680-cf8b-4282-8099-037a481e6f23',
            'A4EECE84-B9F2-4920-A48A-8169D99AE4CE', -- Entity: RSU_ Test Gadgets
            100004,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            100,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb321763-3bb2-4c24-9618-156f944bb7af' OR (EntityID = 'A4EECE84-B9F2-4920-A48A-8169D99AE4CE' AND Name = 'CreatedBy')) BEGIN
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
            'cb321763-3bb2-4c24-9618-156f944bb7af',
            'A4EECE84-B9F2-4920-A48A-8169D99AE4CE', -- Entity: RSU_ Test Gadgets
            100005,
            'CreatedBy',
            'Created By',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            'RSU Pipeline',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd0863bc3-1649-48eb-a95d-54205821fc7e' OR (EntityID = 'A4EECE84-B9F2-4920-A48A-8169D99AE4CE' AND Name = '__mj_CreatedAt')) BEGIN
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
            'd0863bc3-1649-48eb-a95d-54205821fc7e',
            'A4EECE84-B9F2-4920-A48A-8169D99AE4CE', -- Entity: RSU_ Test Gadgets
            100006,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '411dccec-1d43-4c6c-9f28-060daaed6867' OR (EntityID = 'A4EECE84-B9F2-4920-A48A-8169D99AE4CE' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '411dccec-1d43-4c6c-9f28-060daaed6867',
            'A4EECE84-B9F2-4920-A48A-8169D99AE4CE', -- Entity: RSU_ Test Gadgets
            100007,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

/* Index for Foreign Keys for RSU_TestGadget */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: RSU_ Test Gadgets
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for RSU_ Test Gadgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: RSU_ Test Gadgets
-- Item: vwRSU_TestGadgets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      RSU_ Test Gadgets
-----               SCHEMA:      dbo
-----               BASE TABLE:  RSU_TestGadget
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[dbo].[vwRSU_TestGadgets]', 'V') IS NOT NULL
    DROP VIEW [dbo].[vwRSU_TestGadgets];
GO

CREATE VIEW [dbo].[vwRSU_TestGadgets]
AS
SELECT
    r.*
FROM
    [dbo].[RSU_TestGadget] AS r
GO
GRANT SELECT ON [dbo].[vwRSU_TestGadgets] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for RSU_ Test Gadgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: RSU_ Test Gadgets
-- Item: Permissions for vwRSU_TestGadgets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [dbo].[vwRSU_TestGadgets] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for RSU_ Test Gadgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: RSU_ Test Gadgets
-- Item: spCreateRSU_TestGadget
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RSU_TestGadget
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spCreateRSU_TestGadget]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spCreateRSU_TestGadget];
GO

CREATE PROCEDURE [dbo].[spCreateRSU_TestGadget]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @Status nvarchar(50) = NULL,
    @CreatedBy nvarchar(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [dbo].[RSU_TestGadget]
            (
                [ID],
                [Name],
                [Description],
                [Status],
                [CreatedBy]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@Status, 'Active'),
                ISNULL(@CreatedBy, 'RSU Pipeline')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [dbo].[RSU_TestGadget]
            (
                [Name],
                [Description],
                [Status],
                [CreatedBy]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@Status, 'Active'),
                ISNULL(@CreatedBy, 'RSU Pipeline')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [dbo].[vwRSU_TestGadgets] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [dbo].[spCreateRSU_TestGadget] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for RSU_ Test Gadgets */

GRANT EXECUTE ON [dbo].[spCreateRSU_TestGadget] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for RSU_ Test Gadgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: RSU_ Test Gadgets
-- Item: spUpdateRSU_TestGadget
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RSU_TestGadget
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spUpdateRSU_TestGadget]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spUpdateRSU_TestGadget];
GO

CREATE PROCEDURE [dbo].[spUpdateRSU_TestGadget]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @Status nvarchar(50),
    @CreatedBy nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[RSU_TestGadget]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status,
        [CreatedBy] = @CreatedBy
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [dbo].[vwRSU_TestGadgets] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [dbo].[vwRSU_TestGadgets]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [dbo].[spUpdateRSU_TestGadget] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RSU_TestGadget table
------------------------------------------------------------
IF OBJECT_ID('[dbo].[trgUpdateRSU_TestGadget]', 'TR') IS NOT NULL
    DROP TRIGGER [dbo].[trgUpdateRSU_TestGadget];
GO
CREATE TRIGGER [dbo].trgUpdateRSU_TestGadget
ON [dbo].[RSU_TestGadget]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[RSU_TestGadget]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [dbo].[RSU_TestGadget] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for RSU_ Test Gadgets */

GRANT EXECUTE ON [dbo].[spUpdateRSU_TestGadget] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for RSU_ Test Gadgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: RSU_ Test Gadgets
-- Item: spDeleteRSU_TestGadget
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RSU_TestGadget
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spDeleteRSU_TestGadget]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spDeleteRSU_TestGadget];
GO

CREATE PROCEDURE [dbo].[spDeleteRSU_TestGadget]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [dbo].[RSU_TestGadget]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [dbo].[spDeleteRSU_TestGadget] TO [cdp_Integration]
    

/* spDelete Permissions for RSU_ Test Gadgets */

GRANT EXECUTE ON [dbo].[spDeleteRSU_TestGadget] TO [cdp_Integration]



