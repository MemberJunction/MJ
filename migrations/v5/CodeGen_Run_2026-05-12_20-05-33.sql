/* Create IS-A parent field ContentSourceID on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '39ef1199-1972-4b8f-8267-759446ebd3ac', '1447E26B-23D9-443C-B729-992655F5C237', 'ContentSourceID',
                  'uniqueidentifier', 0,
                  16, 0, 0,
                  100000, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field Name on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  'bdde2432-8155-4040-868c-53792db83cf9', '1447E26B-23D9-443C-B729-992655F5C237', 'Name',
                  'nvarchar', 1,
                  500, 0, 0,
                  100001, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field Description on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '2704fa02-aac2-4e0c-8c17-6de1b6677d3c', '1447E26B-23D9-443C-B729-992655F5C237', 'Description',
                  'nvarchar', 1,
                  -1, 0, 0,
                  100002, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field ContentTypeID on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '60fad68f-6a9c-4581-96f6-b976029530bc', '1447E26B-23D9-443C-B729-992655F5C237', 'ContentTypeID',
                  'uniqueidentifier', 0,
                  16, 0, 0,
                  100003, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field ContentSourceTypeID on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '7612f84b-f589-4ad3-b1fa-8d7ada0326f9', '1447E26B-23D9-443C-B729-992655F5C237', 'ContentSourceTypeID',
                  'uniqueidentifier', 0,
                  16, 0, 0,
                  100004, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field ContentFileTypeID on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '7559f0b9-638a-48d0-ba22-da32dede6c6e', '1447E26B-23D9-443C-B729-992655F5C237', 'ContentFileTypeID',
                  'uniqueidentifier', 0,
                  16, 0, 0,
                  100005, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field Checksum on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  'd38a3b12-8008-496b-9b80-edaea00058d0', '1447E26B-23D9-443C-B729-992655F5C237', 'Checksum',
                  'nvarchar', 1,
                  200, 0, 0,
                  100006, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field URL on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '2cb02d5a-a5ec-48f7-9083-746605961ad3', '1447E26B-23D9-443C-B729-992655F5C237', 'URL',
                  'nvarchar', 0,
                  4000, 0, 0,
                  100007, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field Text on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '58ac1a38-634e-43d2-8e24-6741d09fad99', '1447E26B-23D9-443C-B729-992655F5C237', 'Text',
                  'nvarchar', 1,
                  -1, 0, 0,
                  100008, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field EntityRecordDocumentID on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '4bd0bd29-605d-483f-966c-e56a78526d78', '1447E26B-23D9-443C-B729-992655F5C237', 'EntityRecordDocumentID',
                  'uniqueidentifier', 1,
                  16, 0, 0,
                  100009, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field EmbeddingStatus on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  'a06ad51d-1005-4fea-a9d2-0f4030c9b948', '1447E26B-23D9-443C-B729-992655F5C237', 'EmbeddingStatus',
                  'nvarchar', 0,
                  40, 0, 0,
                  100010, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field LastEmbeddedAt on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  'a349b98d-3c0a-4cf0-8bc6-fc575df59e97', '1447E26B-23D9-443C-B729-992655F5C237', 'LastEmbeddedAt',
                  'datetimeoffset', 1,
                  10, 34, 7,
                  100011, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field EmbeddingModelID on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  'f7462440-4d62-4db0-9782-8058a0ce8067', '1447E26B-23D9-443C-B729-992655F5C237', 'EmbeddingModelID',
                  'uniqueidentifier', 1,
                  16, 0, 0,
                  100012, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field TaggingStatus on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  'd694976e-0b59-4b72-b246-0ccccd03241d', '1447E26B-23D9-443C-B729-992655F5C237', 'TaggingStatus',
                  'nvarchar', 0,
                  40, 0, 0,
                  100013, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Create IS-A parent field LastTaggedAt on Content Items */
INSERT INTO [${flyway:defaultSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '79c0d381-13c1-453f-84f0-bce13b8677e2', '1447E26B-23D9-443C-B729-992655F5C237', 'LastTaggedAt',
                  'datetimeoffset', 1,
                  10, 34, 7,
                  100014, 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Update entity timestamp for Content Items after IS-A field sync */
UPDATE [${flyway:defaultSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='1447E26B-23D9-443C-B729-992655F5C237';

/* SQL text to update display name for field TaggingStatus */
UPDATE [${flyway:defaultSchema}].[EntityField] SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'Tagging Status' WHERE ID = 'D694976E-0B59-4B72-B246-0CCCCD03241D';

/* SQL text to update display name for field EmbeddingStatus */
UPDATE [${flyway:defaultSchema}].[EntityField] SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'Embedding Status' WHERE ID = 'A06AD51D-1005-4FEA-A9D2-0F4030C9B948';

/* SQL text to update display name for field ContentSourceID */
UPDATE [${flyway:defaultSchema}].[EntityField] SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'Content Source' WHERE ID = '39EF1199-1972-4B8F-8267-759446EBD3AC';

/* SQL text to update display name for field EmbeddingModelID */
UPDATE [${flyway:defaultSchema}].[EntityField] SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'Embedding Model' WHERE ID = 'F7462440-4D62-4DB0-9782-8058A0CE8067';

/* SQL text to update display name for field ContentSourceTypeID */
UPDATE [${flyway:defaultSchema}].[EntityField] SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'Content Source Type' WHERE ID = '7612F84B-F589-4AD3-B1FA-8D7ADA0326F9';

/* SQL text to update display name for field ContentTypeID */
UPDATE [${flyway:defaultSchema}].[EntityField] SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'Content Type' WHERE ID = '60FAD68F-6A9C-4581-96F6-B976029530BC';

/* SQL text to update display name for field LastTaggedAt */
UPDATE [${flyway:defaultSchema}].[EntityField] SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'Last Tagged At' WHERE ID = '79C0D381-13C1-453F-84F0-BCE13B8677E2';

/* SQL text to update display name for field ContentFileTypeID */
UPDATE [${flyway:defaultSchema}].[EntityField] SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'Content File Type' WHERE ID = '7559F0B9-638A-48D0-BA22-DA32DEDE6C6E';

/* SQL text to update display name for field EntityRecordDocumentID */
UPDATE [${flyway:defaultSchema}].[EntityField] SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'Entity Record Document' WHERE ID = '4BD0BD29-605D-483F-966C-E56A78526D78';

/* SQL text to update display name for field LastEmbeddedAt */
UPDATE [${flyway:defaultSchema}].[EntityField] SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'Last Embedded At' WHERE ID = 'A349B98D-3C0A-4CF0-8BC6-FC575DF59E97';

/* Root ID Function SQL for Content Items.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: fnContentItemParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ContentItem].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[betty].[fnContentItemParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [betty].[fnContentItemParentID_GetRootID];
GO

CREATE FUNCTION [betty].[fnContentItemParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [betty].[ContentItem]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [betty].[ContentItem] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO;

/* Base View SQL for Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: vwContentItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Content Items
-----               SCHEMA:      betty
-----               BASE TABLE:  ContentItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[betty].[vwContentItems]', 'V') IS NOT NULL
    DROP VIEW [betty].[vwContentItems];
GO

CREATE VIEW [betty].[vwContentItems]
AS
SELECT
    c.*,
    ${flyway:defaultSchema}_isa_p1.[ContentSourceID],
    ${flyway:defaultSchema}_isa_p1.[Name],
    ${flyway:defaultSchema}_isa_p1.[Description],
    ${flyway:defaultSchema}_isa_p1.[ContentTypeID],
    ${flyway:defaultSchema}_isa_p1.[ContentSourceTypeID],
    ${flyway:defaultSchema}_isa_p1.[ContentFileTypeID],
    ${flyway:defaultSchema}_isa_p1.[Checksum],
    ${flyway:defaultSchema}_isa_p1.[URL],
    ${flyway:defaultSchema}_isa_p1.[Text],
    ${flyway:defaultSchema}_isa_p1.[EntityRecordDocumentID],
    ${flyway:defaultSchema}_isa_p1.[EmbeddingStatus],
    ${flyway:defaultSchema}_isa_p1.[LastEmbeddedAt],
    ${flyway:defaultSchema}_isa_p1.[EmbeddingModelID],
    ${flyway:defaultSchema}_isa_p1.[TaggingStatus],
    ${flyway:defaultSchema}_isa_p1.[LastTaggedAt],
    bettyOrganization_OrganizationID.[Name] AS [Organization],
    root_ParentID.RootID AS [RootParentID]
FROM
    [betty].[ContentItem] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS ${flyway:defaultSchema}_isa_p1
  ON
    [c].[ID] = ${flyway:defaultSchema}_isa_p1.[ID]
INNER JOIN
    [betty].[Organization] AS bettyOrganization_OrganizationID
  ON
    [c].[OrganizationID] = bettyOrganization_OrganizationID.[ID]
OUTER APPLY
    [betty].[fnContentItemParentID_GetRootID]([c].[ID], [c].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [betty].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: Permissions for vwContentItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [betty].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: spCreateContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItem
------------------------------------------------------------
IF OBJECT_ID('[betty].[spCreateContentItem]', 'P') IS NOT NULL
    DROP PROCEDURE [betty].[spCreateContentItem];
GO

CREATE PROCEDURE [betty].[spCreateContentItem]
    @ID uniqueidentifier = NULL,
    @OrganizationID uniqueidentifier,
    @Decorator_Clear bit = 0,
    @Decorator nvarchar(2000) = NULL,
    @SourceIdentifier nvarchar(2000),
    @UserLink_Clear bit = 0,
    @UserLink nvarchar(2000) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [betty].[ContentItem]
        (
            [OrganizationID],
                [Decorator],
                [SourceIdentifier],
                [UserLink],
                [ParentID],
                [ID]
        )
    VALUES
        (
            @OrganizationID,
                CASE WHEN @Decorator_Clear = 1 THEN NULL ELSE ISNULL(@Decorator, NULL) END,
                @SourceIdentifier,
                CASE WHEN @UserLink_Clear = 1 THEN NULL ELSE ISNULL(@UserLink, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [betty].[vwContentItems] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [betty].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Content Items */

GRANT EXECUTE ON [betty].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: spUpdateContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItem
------------------------------------------------------------
IF OBJECT_ID('[betty].[spUpdateContentItem]', 'P') IS NOT NULL
    DROP PROCEDURE [betty].[spUpdateContentItem];
GO

CREATE PROCEDURE [betty].[spUpdateContentItem]
    @ID uniqueidentifier,
    @OrganizationID uniqueidentifier = NULL,
    @Decorator_Clear bit = 0,
    @Decorator nvarchar(2000) = NULL,
    @SourceIdentifier nvarchar(2000) = NULL,
    @UserLink_Clear bit = 0,
    @UserLink nvarchar(2000) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [betty].[ContentItem]
    SET
        [OrganizationID] = ISNULL(@OrganizationID, [OrganizationID]),
        [Decorator] = CASE WHEN @Decorator_Clear = 1 THEN NULL ELSE ISNULL(@Decorator, [Decorator]) END,
        [SourceIdentifier] = ISNULL(@SourceIdentifier, [SourceIdentifier]),
        [UserLink] = CASE WHEN @UserLink_Clear = 1 THEN NULL ELSE ISNULL(@UserLink, [UserLink]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [betty].[vwContentItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [betty].[vwContentItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [betty].[spUpdateContentItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItem table
------------------------------------------------------------
IF OBJECT_ID('[betty].[trgUpdateContentItem]', 'TR') IS NOT NULL
    DROP TRIGGER [betty].[trgUpdateContentItem];
GO
CREATE TRIGGER [betty].trgUpdateContentItem
ON [betty].[ContentItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [betty].[ContentItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [betty].[ContentItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO;

/* spUpdate Permissions for Content Items */

GRANT EXECUTE ON [betty].[spUpdateContentItem] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: spDeleteContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItem
------------------------------------------------------------
IF OBJECT_ID('[betty].[spDeleteContentItem]', 'P') IS NOT NULL
    DROP PROCEDURE [betty].[spDeleteContentItem];
GO

CREATE PROCEDURE [betty].[spDeleteContentItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [betty].[ContentItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [betty].[spDeleteContentItem] TO [cdp_Integration];

/* spDelete Permissions for Content Items */

GRANT EXECUTE ON [betty].[spDeleteContentItem] TO [cdp_Integration];

