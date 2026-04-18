/* SQL generated to create new entity MJ: MCP Tool Favorites */

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
         [AllowUserSearchAPI],
         [AllowCaching]
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
         '34933ddc-52f2-4807-9bfa-c050fe33f13e',
         'MJ: MCP Tool Favorites',
         'MCP Tool Favorites',
         'Per-user favorite marker for an MCP Server Tool. Lets users star tools for quick access in the MCP Dashboard and Test dialog.',
         NULL,
         'MCPToolFavorite',
         'vwMCPToolFavorites',
         '${flyway:defaultSchema}',
         1,
         1,
         1
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
   

/* SQL generated to add new entity MJ: MCP Tool Favorites to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '34933ddc-52f2-4807-9bfa-c050fe33f13e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: MCP Tool Favorites for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('34933ddc-52f2-4807-9bfa-c050fe33f13e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: MCP Tool Favorites for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('34933ddc-52f2-4807-9bfa-c050fe33f13e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: MCP Tool Favorites for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('34933ddc-52f2-4807-9bfa-c050fe33f13e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MCPToolFavorite */
ALTER TABLE [${flyway:defaultSchema}].[MCPToolFavorite] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MCPToolFavorite */
UPDATE [${flyway:defaultSchema}].[MCPToolFavorite] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MCPToolFavorite */
ALTER TABLE [${flyway:defaultSchema}].[MCPToolFavorite] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MCPToolFavorite */
ALTER TABLE [${flyway:defaultSchema}].[MCPToolFavorite] ADD CONSTRAINT [DF___mj_MCPToolFavorite___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MCPToolFavorite */
ALTER TABLE [${flyway:defaultSchema}].[MCPToolFavorite] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MCPToolFavorite */
UPDATE [${flyway:defaultSchema}].[MCPToolFavorite] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MCPToolFavorite */
ALTER TABLE [${flyway:defaultSchema}].[MCPToolFavorite] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MCPToolFavorite */
ALTER TABLE [${flyway:defaultSchema}].[MCPToolFavorite] ADD CONSTRAINT [DF___mj_MCPToolFavorite___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca99e954-4128-4007-82ac-911482d6ea1f' OR (EntityID = '34933DDC-52F2-4807-9BFA-C050FE33F13E' AND Name = 'ID')) BEGIN
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
            'ca99e954-4128-4007-82ac-911482d6ea1f',
            '34933DDC-52F2-4807-9BFA-C050FE33F13E', -- Entity: MJ: MCP Tool Favorites
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '085a20da-629c-4eda-8a6c-758f4166c1d8' OR (EntityID = '34933DDC-52F2-4807-9BFA-C050FE33F13E' AND Name = 'UserID')) BEGIN
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
            '085a20da-629c-4eda-8a6c-758f4166c1d8',
            '34933DDC-52F2-4807-9BFA-C050FE33F13E', -- Entity: MJ: MCP Tool Favorites
            100002,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f17a3f92-6696-4e02-bd15-9ebc24cbd343' OR (EntityID = '34933DDC-52F2-4807-9BFA-C050FE33F13E' AND Name = 'MCPServerToolID')) BEGIN
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
            'f17a3f92-6696-4e02-bd15-9ebc24cbd343',
            '34933DDC-52F2-4807-9BFA-C050FE33F13E', -- Entity: MJ: MCP Tool Favorites
            100003,
            'MCPServerToolID',
            'MCP Server Tool ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '01fee5a1-f0ff-4e56-91d4-6f6cec692704' OR (EntityID = '34933DDC-52F2-4807-9BFA-C050FE33F13E' AND Name = '__mj_CreatedAt')) BEGIN
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
            '01fee5a1-f0ff-4e56-91d4-6f6cec692704',
            '34933DDC-52F2-4807-9BFA-C050FE33F13E', -- Entity: MJ: MCP Tool Favorites
            100004,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '00321c0a-1ed5-4697-b7f1-faaf1682e609' OR (EntityID = '34933DDC-52F2-4807-9BFA-C050FE33F13E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '00321c0a-1ed5-4697-b7f1-faaf1682e609',
            '34933DDC-52F2-4807-9BFA-C050FE33F13E', -- Entity: MJ: MCP Tool Favorites
            100005,
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


/* Create Entity Relationship: MJ: Users -> MJ: MCP Tool Favorites (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4b83fe79-115b-4ca1-b85a-90a2282bec95'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4b83fe79-115b-4ca1-b85a-90a2282bec95', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '34933DDC-52F2-4807-9BFA-C050FE33F13E', 'UserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: MCP Server Tools -> MJ: MCP Tool Favorites (One To Many via MCPServerToolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '62458fdc-735c-4a30-bbe1-8cb7e5eac297'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('62458fdc-735c-4a30-bbe1-8cb7e5eac297', '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', '34933DDC-52F2-4807-9BFA-C050FE33F13E', 'MCPServerToolID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for MCPToolFavorite */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Favorites
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table MCPToolFavorite
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPToolFavorite_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPToolFavorite]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPToolFavorite_UserID ON [${flyway:defaultSchema}].[MCPToolFavorite] ([UserID]);

-- Index for foreign key MCPServerToolID in table MCPToolFavorite
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPToolFavorite_MCPServerToolID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPToolFavorite]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPToolFavorite_MCPServerToolID ON [${flyway:defaultSchema}].[MCPToolFavorite] ([MCPServerToolID]);

/* SQL text to update entity field related entity name field map for entity field ID 085A20DA-629C-4EDA-8A6C-758F4166C1D8 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='085A20DA-629C-4EDA-8A6C-758F4166C1D8', @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID F17A3F92-6696-4E02-BD15-9EBC24CBD343 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F17A3F92-6696-4E02-BD15-9EBC24CBD343', @RelatedEntityNameFieldMap='MCPServerTool'

/* Base View SQL for MJ: MCP Tool Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Favorites
-- Item: vwMCPToolFavorites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: MCP Tool Favorites
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MCPToolFavorite
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMCPToolFavorites]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMCPToolFavorites];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMCPToolFavorites]
AS
SELECT
    m.*,
    MJUser_UserID.[Name] AS [User],
    MJMCPServerTool_MCPServerToolID.[ToolTitle] AS [MCPServerTool]
FROM
    [${flyway:defaultSchema}].[MCPToolFavorite] AS m
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [m].[UserID] = MJUser_UserID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MCPServerTool] AS MJMCPServerTool_MCPServerToolID
  ON
    [m].[MCPServerToolID] = MJMCPServerTool_MCPServerToolID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPToolFavorites] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: MCP Tool Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Favorites
-- Item: Permissions for vwMCPToolFavorites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPToolFavorites] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: MCP Tool Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Favorites
-- Item: spCreateMCPToolFavorite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MCPToolFavorite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMCPToolFavorite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMCPToolFavorite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMCPToolFavorite]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @MCPServerToolID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MCPToolFavorite]
            (
                [ID],
                [UserID],
                [MCPServerToolID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @MCPServerToolID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MCPToolFavorite]
            (
                [UserID],
                [MCPServerToolID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @MCPServerToolID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMCPToolFavorites] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPToolFavorite] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: MCP Tool Favorites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPToolFavorite] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: MCP Tool Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Favorites
-- Item: spUpdateMCPToolFavorite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MCPToolFavorite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMCPToolFavorite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPToolFavorite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPToolFavorite]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @MCPServerToolID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPToolFavorite]
    SET
        [UserID] = @UserID,
        [MCPServerToolID] = @MCPServerToolID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMCPToolFavorites] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMCPToolFavorites]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPToolFavorite] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MCPToolFavorite table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMCPToolFavorite]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMCPToolFavorite];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMCPToolFavorite
ON [${flyway:defaultSchema}].[MCPToolFavorite]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPToolFavorite]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MCPToolFavorite] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: MCP Tool Favorites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPToolFavorite] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: MCP Tool Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Favorites
-- Item: spDeleteMCPToolFavorite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPToolFavorite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMCPToolFavorite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPToolFavorite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPToolFavorite]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MCPToolFavorite]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPToolFavorite] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: MCP Tool Favorites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPToolFavorite] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '12e9e5c3-1b96-4c88-b4f4-20a0e4f6d993' OR (EntityID = '34933DDC-52F2-4807-9BFA-C050FE33F13E' AND Name = 'User')) BEGIN
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
            '12e9e5c3-1b96-4c88-b4f4-20a0e4f6d993',
            '34933DDC-52F2-4807-9BFA-C050FE33F13E', -- Entity: MJ: MCP Tool Favorites
            100011,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7414620c-c44d-4581-994a-1bf3b8180aa6' OR (EntityID = '34933DDC-52F2-4807-9BFA-C050FE33F13E' AND Name = 'MCPServerTool')) BEGIN
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
            '7414620c-c44d-4581-994a-1bf3b8180aa6',
            '34933DDC-52F2-4807-9BFA-C050FE33F13E', -- Entity: MJ: MCP Tool Favorites
            100012,
            'MCPServerTool',
            'MCP Server Tool',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '7414620C-C44D-4581-994A-1BF3B8180AA6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '01FEE5A1-F0FF-4E56-91D4-6F6CEC692704'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '12E9E5C3-1B96-4C88-B4F4-20A0E4F6D993'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7414620C-C44D-4581-994A-1BF3B8180AA6'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7414620C-C44D-4581-994A-1BF3B8180AA6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CA99E954-4128-4007-82AC-911482D6EA1F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Favorite Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '085A20DA-629C-4EDA-8A6C-758F4166C1D8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites.MCPServerToolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Favorite Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F17A3F92-6696-4E02-BD15-9EBC24CBD343' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Favorite Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12E9E5C3-1B96-4C88-B4F4-20A0E4F6D993' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites.MCPServerTool 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Favorite Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7414620C-C44D-4581-994A-1BF3B8180AA6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '01FEE5A1-F0FF-4E56-91D4-6F6CEC692704' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: MCP Tool Favorites.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '00321C0A-1ED5-4697-B7F1-FAAF1682E609' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-star */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-star', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '34933DDC-52F2-4807-9BFA-C050FE33F13E'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b0e69d30-e345-409b-a0ba-bd78481a2154', '34933DDC-52F2-4807-9BFA-C050FE33F13E', 'FieldCategoryInfo', '{"Favorite Configuration":{"icon":"fa fa-star","description":"Links between users and their favorited MCP server tools"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8799adbe-e644-4154-b673-9b17cc819d68', '34933DDC-52F2-4807-9BFA-C050FE33F13E', 'FieldCategoryIcons', '{"Favorite Configuration":"fa fa-star","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '34933DDC-52F2-4807-9BFA-C050FE33F13E'
      

