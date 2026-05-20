-- Phase 1 — Lists ↔ Views Bridge.
--
-- Adds lineage columns to ${flyway:defaultSchema}.List so a List can remember
-- the User View (or filter snapshot) it was materialized from, support
-- additive vs sync refresh modes, and record who refreshed it last.
--
-- Single consolidated ALTER TABLE per CLAUDE.md (one statement, multiple ADDs).
-- No __mj timestamp columns (CodeGen handles those on every table). No FK
-- indexes here (CodeGen emits IDX_AUTO_MJ_FKEY_* automatically).

-- Columns + their defaults + the discriminator CHECK constraint inlined.
-- Inlining the CHECK is required because SQL Server validates constraints
-- referencing newly added columns against existing rows in the same batch,
-- and the column isn't yet visible to a separate ADD CONSTRAINT statement
-- in the same migration file.
ALTER TABLE ${flyway:defaultSchema}.List ADD
    SourceViewID UNIQUEIDENTIFIER NULL,
    SourceFilterSnapshot NVARCHAR(MAX) NULL,
    LastRefreshedAt DATETIMEOFFSET NULL,
    LastRefreshedByUserID UNIQUEIDENTIFIER NULL,
    RefreshMode NVARCHAR(20) NOT NULL
        CONSTRAINT DF_List_RefreshMode DEFAULT ('Additive')
        CONSTRAINT CK_List_RefreshMode CHECK (RefreshMode IN ('Additive', 'Sync')),
    UseSnapshot BIT NOT NULL
        CONSTRAINT DF_List_UseSnapshot DEFAULT (0);
GO

-- Foreign keys (separate batch so the FK can see the column).
ALTER TABLE ${flyway:defaultSchema}.List
    ADD CONSTRAINT FK_List_SourceView
        FOREIGN KEY (SourceViewID)
        REFERENCES ${flyway:defaultSchema}.UserView(ID);
GO

ALTER TABLE ${flyway:defaultSchema}.List
    ADD CONSTRAINT FK_List_LastRefreshedBy
        FOREIGN KEY (LastRefreshedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID);
GO

-- Column descriptions. CodeGen reads these into EntityField metadata on next run.
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional ID of the User View this list was materialized from. NULL for hand-built lists. When set, the list can be refreshed against this view via ListOperations.RefreshFromSource.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'SourceViewID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON snapshot of the source filter at materialization time. When UseSnapshot=1, refreshes re-apply this snapshot rather than re-reading the live source view. Null when no snapshot was captured.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'SourceFilterSnapshot';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp (UTC) of the most recent successful RefreshFromSource. Null when the list has never been refreshed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'LastRefreshedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User who triggered the most recent successful RefreshFromSource. Null when the list has never been refreshed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'LastRefreshedByUserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default refresh mode for this list. Additive only adds new members; Sync reconciles in both directions (may remove members no longer in the source — requires explicit drop-confirmation).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'RefreshMode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, RefreshFromSource uses SourceFilterSnapshot as the source. When 0 (default), it re-reads the live SourceView.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'UseSnapshot';

































































































-- ============================================================================
-- CODEGEN RUN 


/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66ec3850-e591-451e-aa71-d0a7461c7363' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceViewID')) BEGIN
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
            [IsComputed],
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
            '66ec3850-e591-451e-aa71-d0a7461c7363',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100031,
            'SourceViewID',
            'Source View ID',
            'Optional ID of the User View this list was materialized from. NULL for hand-built lists. When set, the list can be refreshed against this view via ListOperations.RefreshFromSource.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E4238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81bd8f03-4b1d-47d5-a79c-2b5063eaac44' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceFilterSnapshot')) BEGIN
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
            [IsComputed],
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
            '81bd8f03-4b1d-47d5-a79c-2b5063eaac44',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100032,
            'SourceFilterSnapshot',
            'Source Filter Snapshot',
            'JSON snapshot of the source filter at materialization time. When UseSnapshot=1, refreshes re-apply this snapshot rather than re-reading the live source view. Null when no snapshot was captured.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42cab5f9-6d23-4450-b986-ec02f8fc283b' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LastRefreshedAt')) BEGIN
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
            [IsComputed],
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
            '42cab5f9-6d23-4450-b986-ec02f8fc283b',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100033,
            'LastRefreshedAt',
            'Last Refreshed At',
            'Timestamp (UTC) of the most recent successful RefreshFromSource. Null when the list has never been refreshed.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e04dd1e6-30b6-4e79-aff3-8c1c927028b6' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LastRefreshedByUserID')) BEGIN
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
            [IsComputed],
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
            'e04dd1e6-30b6-4e79-aff3-8c1c927028b6',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100034,
            'LastRefreshedByUserID',
            'Last Refreshed By User ID',
            'User who triggered the most recent successful RefreshFromSource. Null when the list has never been refreshed.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '769de810-5328-4903-8dcd-728760666436' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RefreshMode')) BEGIN
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
            [IsComputed],
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
            '769de810-5328-4903-8dcd-728760666436',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100035,
            'RefreshMode',
            'Refresh Mode',
            'Default refresh mode for this list. Additive only adds new members; Sync reconciles in both directions (may remove members no longer in the source — requires explicit drop-confirmation).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Additive',
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f13dce7f-5cda-487d-9b87-5bb59917dd22' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'UseSnapshot')) BEGIN
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
            [IsComputed],
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
            'f13dce7f-5cda-487d-9b87-5bb59917dd22',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100036,
            'UseSnapshot',
            'Use Snapshot',
            'When 1, RefreshFromSource uses SourceFilterSnapshot as the source. When 0 (default), it re-reads the live SourceView.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
      END;

/* SQL text to insert entity field value with ID ca00ff01-260a-480d-a7ea-d7f62f8eb81f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ca00ff01-260a-480d-a7ea-d7f62f8eb81f', '769DE810-5328-4903-8DCD-728760666436', 1, 'Additive', 'Additive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7ebfdea6-c66d-4bbb-9ff7-448b0992c596 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7ebfdea6-c66d-4bbb-9ff7-448b0992c596', '769DE810-5328-4903-8DCD-728760666436', 2, 'Sync', 'Sync', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 769DE810-5328-4903-8DCD-728760666436 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='769DE810-5328-4903-8DCD-728760666436';


/* Create Entity Relationship: MJ: Users -> MJ: Lists (One To Many via LastRefreshedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4aa3ed02-387a-4d94-9f73-ba26403921b5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4aa3ed02-387a-4d94-9f73-ba26403921b5', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'LastRefreshedByUserID', 'One To Many', 1, 1, 97, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: User Views -> MJ: Lists (One To Many via SourceViewID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'de75313e-1b31-47fd-bf04-4126fcbc3698'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('de75313e-1b31-47fd-bf04-4126fcbc3698', 'E4238F34-2837-EF11-86D4-6045BDEE16E6', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'SourceViewID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for List */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_EntityID ON [${flyway:defaultSchema}].[List] ([EntityID]);

-- Index for foreign key UserID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_UserID ON [${flyway:defaultSchema}].[List] ([UserID]);

-- Index for foreign key CategoryID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_CategoryID ON [${flyway:defaultSchema}].[List] ([CategoryID]);

-- Index for foreign key CompanyIntegrationID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_CompanyIntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_CompanyIntegrationID ON [${flyway:defaultSchema}].[List] ([CompanyIntegrationID]);

-- Index for foreign key SourceViewID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_SourceViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_SourceViewID ON [${flyway:defaultSchema}].[List] ([SourceViewID]);

-- Index for foreign key LastRefreshedByUserID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_LastRefreshedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_LastRefreshedByUserID ON [${flyway:defaultSchema}].[List] ([LastRefreshedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 66EC3850-E591-451E-AA71-D0A7461C7363 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='66EC3850-E591-451E-AA71-D0A7461C7363', @RelatedEntityNameFieldMap='SourceView';

/* SQL text to update entity field related entity name field map for entity field ID E04DD1E6-30B6-4E79-AFF3-8C1C927028B6 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E04DD1E6-30B6-4E79-AFF3-8C1C927028B6', @RelatedEntityNameFieldMap='LastRefreshedByUser';

/* Base View SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: vwLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Lists
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  List
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwLists]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwLists];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwLists]
AS
SELECT
    l.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJUser_UserID.[Name] AS [User],
    MJListCategory_CategoryID.[Name] AS [Category],
    MJCompanyIntegration_CompanyIntegrationID.[Name] AS [CompanyIntegration],
    MJUserView_SourceViewID.[Name] AS [SourceView],
    MJUser_LastRefreshedByUserID.[Name] AS [LastRefreshedByUser]
FROM
    [${flyway:defaultSchema}].[List] AS l
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [l].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [l].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ListCategory] AS MJListCategory_CategoryID
  ON
    [l].[CategoryID] = MJListCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CompanyIntegration] AS MJCompanyIntegration_CompanyIntegrationID
  ON
    [l].[CompanyIntegrationID] = MJCompanyIntegration_CompanyIntegrationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserView] AS MJUserView_SourceViewID
  ON
    [l].[SourceViewID] = MJUserView_SourceViewID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_LastRefreshedByUserID
  ON
    [l].[LastRefreshedByUserID] = MJUser_LastRefreshedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwLists] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* Base View Permissions SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: Permissions for vwLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwLists] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spCreate SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spCreateList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR List
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateList]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateList];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateList]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @ExternalSystemRecordID_Clear bit = 0,
    @ExternalSystemRecordID nvarchar(100) = NULL,
    @CompanyIntegrationID_Clear bit = 0,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @SourceViewID_Clear bit = 0,
    @SourceViewID uniqueidentifier = NULL,
    @SourceFilterSnapshot_Clear bit = 0,
    @SourceFilterSnapshot nvarchar(MAX) = NULL,
    @LastRefreshedAt_Clear bit = 0,
    @LastRefreshedAt datetimeoffset = NULL,
    @LastRefreshedByUserID_Clear bit = 0,
    @LastRefreshedByUserID uniqueidentifier = NULL,
    @RefreshMode nvarchar(20) = NULL,
    @UseSnapshot bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[List]
            (
                [ID],
                [Name],
                [Description],
                [EntityID],
                [UserID],
                [CategoryID],
                [ExternalSystemRecordID],
                [CompanyIntegrationID],
                [SourceViewID],
                [SourceFilterSnapshot],
                [LastRefreshedAt],
                [LastRefreshedByUserID],
                [RefreshMode],
                [UseSnapshot]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @EntityID,
                @UserID,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @ExternalSystemRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystemRecordID, NULL) END,
                CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, NULL) END,
                CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, NULL) END,
                CASE WHEN @SourceFilterSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilterSnapshot, NULL) END,
                CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, NULL) END,
                CASE WHEN @LastRefreshedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedByUserID, NULL) END,
                ISNULL(@RefreshMode, 'Additive'),
                ISNULL(@UseSnapshot, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[List]
            (
                [Name],
                [Description],
                [EntityID],
                [UserID],
                [CategoryID],
                [ExternalSystemRecordID],
                [CompanyIntegrationID],
                [SourceViewID],
                [SourceFilterSnapshot],
                [LastRefreshedAt],
                [LastRefreshedByUserID],
                [RefreshMode],
                [UseSnapshot]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @EntityID,
                @UserID,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @ExternalSystemRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystemRecordID, NULL) END,
                CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, NULL) END,
                CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, NULL) END,
                CASE WHEN @SourceFilterSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilterSnapshot, NULL) END,
                CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, NULL) END,
                CASE WHEN @LastRefreshedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedByUserID, NULL) END,
                ISNULL(@RefreshMode, 'Additive'),
                ISNULL(@UseSnapshot, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwLists] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateList] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Lists */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateList] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spUpdateList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR List
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateList]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateList];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateList]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @EntityID uniqueidentifier = NULL,
    @UserID uniqueidentifier = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @ExternalSystemRecordID_Clear bit = 0,
    @ExternalSystemRecordID nvarchar(100) = NULL,
    @CompanyIntegrationID_Clear bit = 0,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @SourceViewID_Clear bit = 0,
    @SourceViewID uniqueidentifier = NULL,
    @SourceFilterSnapshot_Clear bit = 0,
    @SourceFilterSnapshot nvarchar(MAX) = NULL,
    @LastRefreshedAt_Clear bit = 0,
    @LastRefreshedAt datetimeoffset = NULL,
    @LastRefreshedByUserID_Clear bit = 0,
    @LastRefreshedByUserID uniqueidentifier = NULL,
    @RefreshMode nvarchar(20) = NULL,
    @UseSnapshot bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[List]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [UserID] = ISNULL(@UserID, [UserID]),
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [ExternalSystemRecordID] = CASE WHEN @ExternalSystemRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystemRecordID, [ExternalSystemRecordID]) END,
        [CompanyIntegrationID] = CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, [CompanyIntegrationID]) END,
        [SourceViewID] = CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, [SourceViewID]) END,
        [SourceFilterSnapshot] = CASE WHEN @SourceFilterSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilterSnapshot, [SourceFilterSnapshot]) END,
        [LastRefreshedAt] = CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, [LastRefreshedAt]) END,
        [LastRefreshedByUserID] = CASE WHEN @LastRefreshedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedByUserID, [LastRefreshedByUserID]) END,
        [RefreshMode] = ISNULL(@RefreshMode, [RefreshMode]),
        [UseSnapshot] = ISNULL(@UseSnapshot, [UseSnapshot])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwLists] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwLists]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the List table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateList]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateList];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateList
ON [${flyway:defaultSchema}].[List]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[List]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[List] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Lists */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spDeleteList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR List
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteList]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteList];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteList]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[List]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Lists */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] TO [cdp_Integration], [cdp_Developer];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad63e72a-fd24-4309-a334-82deafabda58' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceView')) BEGIN
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
            [IsComputed],
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
            'ad63e72a-fd24-4309-a334-82deafabda58',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100041,
            'SourceView',
            'Source View',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f78f7eb-c34e-4c36-8b22-7c5a76ff7c5b' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LastRefreshedByUser')) BEGIN
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
            [IsComputed],
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
            '5f78f7eb-c34e-4c36-8b22-7c5a76ff7c5b',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100042,
            'LastRefreshedByUser',
            'Last Refreshed By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
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
      END;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '42CAB5F9-6D23-4450-B986-EC02F8FC283B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '769DE810-5328-4903-8DCD-728760666436'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1C4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '154417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'A14D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '154417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '1C4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Lists.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C94217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A14D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Description',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A24D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.ExternalSystemRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.CategoryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AE4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.CompanyIntegrationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Company Integration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1D4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '154417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Category Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7CB4656E-44E7-450B-9E8E-97737DEDC32D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.CompanyIntegration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Integration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE34E0B1-EA4C-4BF2-8A9A-64A96F1DE8DD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.SourceViewID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source View',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '66EC3850-E591-451E-AA71-D0A7461C7363' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.SourceView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source View Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AD63E72A-FD24-4309-A334-82DEAFABDA58' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.SourceFilterSnapshot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '81BD8F03-4B1D-47D5-A79C-2B5063EAAC44' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.UseSnapshot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F13DCE7F-5CDA-487D-9B87-5BB59917DD22' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.RefreshMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '769DE810-5328-4903-8DCD-728760666436' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.LastRefreshedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '42CAB5F9-6D23-4450-B986-EC02F8FC283B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.LastRefreshedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh History',
   GeneratedFormSection = 'Category',
   DisplayName = 'Last Refreshed By',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E04DD1E6-30B6-4E79-AFF3-8C1C927028B6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.LastRefreshedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F78F7EB-C34E-4C36-8B22-7C5A76FF7C5B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '535817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '545817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b899f3db-28f8-4eb9-9f9c-1413ef606aa9', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Refresh Settings":{"icon":"fa fa-sync-alt","description":"Configuration for how the list synchronizes with source views"},"Refresh History":{"icon":"fa fa-history","description":"Audit trail of the most recent refresh operations"}}', GETUTCDATE(), GETUTCDATE());

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"Refresh Settings":"fa fa-sync-alt","Refresh History":"fa fa-history"}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND [Name] = 'FieldCategoryIcons';

