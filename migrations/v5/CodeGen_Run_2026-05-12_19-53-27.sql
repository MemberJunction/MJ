/* SQL generated to create new entity Content Items */

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
         '1447e26b-23d9-443c-b729-992655f5c237',
         'Content Items',
         NULL,
         'Betty-specific extension of MJ: Content Items. Shares its primary key with the parent ${flyway:defaultSchema}.ContentItem row (TPT inheritance) — a betty.ContentItem.ID is always the same UUID as its corresponding ${flyway:defaultSchema}.ContentItem.ID. Adds the tenant scope (OrganizationID), retrieval-context fields (Decorator, SourceIdentifier, UserLink), and chunk hierarchy (ParentID) used by the BLA / BettyNext agents.',
         NULL,
         'ContentItem',
         'vwContentItems',
         'betty',
         1,
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
      );

/* SQL generated to add new entity Content Items to application ID: '09A9F8AB-5F81-4839-BA5F-76BD2750D22E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('09A9F8AB-5F81-4839-BA5F-76BD2750D22E', '1447e26b-23d9-443c-b729-992655f5c237', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '09A9F8AB-5F81-4839-BA5F-76BD2750D22E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Content Items for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1447e26b-23d9-443c-b729-992655f5c237', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Content Items for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1447e26b-23d9-443c-b729-992655f5c237', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Content Items for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1447e26b-23d9-443c-b729-992655f5c237', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity betty.ContentItem */
ALTER TABLE [betty].[ContentItem] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity betty.ContentItem */
UPDATE [betty].[ContentItem] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity betty.ContentItem */
ALTER TABLE [betty].[ContentItem] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity betty.ContentItem */
ALTER TABLE [betty].[ContentItem] ADD CONSTRAINT [DF_betty_ContentItem___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity betty.ContentItem */
ALTER TABLE [betty].[ContentItem] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity betty.ContentItem */
UPDATE [betty].[ContentItem] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity betty.ContentItem */
ALTER TABLE [betty].[ContentItem] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity betty.ContentItem */
ALTER TABLE [betty].[ContentItem] ADD CONSTRAINT [DF_betty_ContentItem___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6363d243-6df5-4e90-a9e4-b4e9a0ddd8b5' OR (EntityID = '1447E26B-23D9-443C-B729-992655F5C237' AND Name = 'ID')) BEGIN
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
            '6363d243-6df5-4e90-a9e4-b4e9a0ddd8b5',
            '1447E26B-23D9-443C-B729-992655F5C237', -- Entity: Content Items
            100001,
            'ID',
            'ID',
            'Shared primary key with the parent ${flyway:defaultSchema}.ContentItem row. Same UUID, enforced by FK_BettyContentItem_Inherits. Generate the UUID once when creating the ${flyway:defaultSchema}.ContentItem row, then propagate it here.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            0,
            0,
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
            'ID',
            0,
            1,
            1,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7e7eef60-8ec8-4206-a79a-3a4f96351e0f' OR (EntityID = '1447E26B-23D9-443C-B729-992655F5C237' AND Name = 'OrganizationID')) BEGIN
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
            '7e7eef60-8ec8-4206-a79a-3a4f96351e0f',
            '1447E26B-23D9-443C-B729-992655F5C237', -- Entity: Content Items
            100002,
            'OrganizationID',
            'Organization ID',
            'FK to betty.Organization. Required — every Betty content item belongs to exactly one organization, and the BLA search path filters by this column at runtime via the Search Scope''s Nunjucks-rendered MetadataFilter.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '33429562-09AD-468A-A42D-72FC1885A1D4',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a343839-c1a6-42df-bfeb-152cc7fd9f7a' OR (EntityID = '1447E26B-23D9-443C-B729-992655F5C237' AND Name = 'Decorator')) BEGIN
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
            '4a343839-c1a6-42df-bfeb-152cc7fd9f7a',
            '1447E26B-23D9-443C-B729-992655F5C237', -- Entity: Content Items
            100003,
            'Decorator',
            'Decorator',
            'Optional free-text context that helps the LLM (and human reviewers) understand what this content item is and when it''s relevant. Indexed into Azure AI Search alongside Name/Description/Text so retrieval can hit author-supplied hints in addition to the raw body text.',
            'nvarchar',
            4000,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73601733-677d-4142-b9df-4e5e4c036683' OR (EntityID = '1447E26B-23D9-443C-B729-992655F5C237' AND Name = 'SourceIdentifier')) BEGIN
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
            '73601733-677d-4142-b9df-4e5e4c036683',
            '1447E26B-23D9-443C-B729-992655F5C237', -- Entity: Content Items
            100004,
            'SourceIdentifier',
            'Source Identifier',
            'Stable identifier of the original source (URL, file path, or other globally-unique string). Used by ingest code to detect and skip duplicates when re-ingesting from the same source. Required.',
            'nvarchar',
            4000,
            0,
            0,
            0,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '720f69f8-24fd-4cfd-8e5f-f56f44a4b491' OR (EntityID = '1447E26B-23D9-443C-B729-992655F5C237' AND Name = 'UserLink')) BEGIN
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
            '720f69f8-24fd-4cfd-8e5f-f56f44a4b491',
            '1447E26B-23D9-443C-B729-992655F5C237', -- Entity: Content Items
            100005,
            'UserLink',
            'User Link',
            'Optional URL the end user follows to view the source in its original context (e.g. a public web page, an authenticated CMS deep-link, or a doc viewer). Separate from SourceIdentifier — SourceIdentifier is for dedup; UserLink is for human navigation.',
            'nvarchar',
            4000,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd232e6da-c852-4d46-8867-53b48f670e55' OR (EntityID = '1447E26B-23D9-443C-B729-992655F5C237' AND Name = 'ParentID')) BEGIN
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
            'd232e6da-c852-4d46-8867-53b48f670e55',
            '1447E26B-23D9-443C-B729-992655F5C237', -- Entity: Content Items
            100006,
            'ParentID',
            'Parent ID',
            'Optional self-reference. When the source content is large enough to be split into chunks for embedding/indexing, each chunk''s ParentID points at the top-level betty.ContentItem.ID (which is identical to the top-level ${flyway:defaultSchema}.ContentItem.ID, by TPT). NULL on the top-level item itself.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '1447E26B-23D9-443C-B729-992655F5C237',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ccf017bf-6c00-4bab-8abf-6f35ee064019' OR (EntityID = '1447E26B-23D9-443C-B729-992655F5C237' AND Name = '__mj_CreatedAt')) BEGIN
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
            'ccf017bf-6c00-4bab-8abf-6f35ee064019',
            '1447E26B-23D9-443C-B729-992655F5C237', -- Entity: Content Items
            100007,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3136d3f2-15c7-4d5b-852d-027bf62d0f57' OR (EntityID = '1447E26B-23D9-443C-B729-992655F5C237' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '3136d3f2-15c7-4d5b-852d-027bf62d0f57',
            '1447E26B-23D9-443C-B729-992655F5C237', -- Entity: Content Items
            100008,
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
      END;


/* Create Entity Relationship: Organizations -> Content Items (One To Many via OrganizationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e19d3b0d-f298-4b65-ae73-ed5d13f5cae5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e19d3b0d-f298-4b65-ae73-ed5d13f5cae5', '33429562-09AD-468A-A42D-72FC1885A1D4', '1447E26B-23D9-443C-B729-992655F5C237', 'OrganizationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: Content Items -> Content Items (One To Many via ParentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fd2413f1-8c39-4d20-988a-c2ff17e6e576'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fd2413f1-8c39-4d20-988a-c2ff17e6e576', '1447E26B-23D9-443C-B729-992655F5C237', '1447E26B-23D9-443C-B729-992655F5C237', 'ParentID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Content Items -> Content Items (One To Many via ID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '875c1b1a-4892-4bcd-8e71-958872706c9f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('875c1b1a-4892-4bcd-8e71-958872706c9f', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', '1447E26B-23D9-443C-B729-992655F5C237', 'ID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ContentItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ID' 
    AND object_id = OBJECT_ID('[betty].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ID ON [betty].[ContentItem] ([ID]);

-- Index for foreign key OrganizationID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_OrganizationID' 
    AND object_id = OBJECT_ID('[betty].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_OrganizationID ON [betty].[ContentItem] ([OrganizationID]);

-- Index for foreign key ParentID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ParentID' 
    AND object_id = OBJECT_ID('[betty].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ParentID ON [betty].[ContentItem] ([ParentID]);

/* SQL text to update entity field related entity name field map for entity field ID 7E7EEF60-8EC8-4206-A79A-3A4F96351E0F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7E7EEF60-8EC8-4206-A79A-3A4F96351E0F', @RelatedEntityNameFieldMap='Organization';

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
    bettyOrganization_OrganizationID.[Name] AS [Organization],
    root_ParentID.RootID AS [RootParentID]
FROM
    [betty].[ContentItem] AS c
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd857615f-f8e0-4509-86f8-89e820beb710' OR (EntityID = '1447E26B-23D9-443C-B729-992655F5C237' AND Name = 'Organization')) BEGIN
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
            'd857615f-f8e0-4509-86f8-89e820beb710',
            '1447E26B-23D9-443C-B729-992655F5C237', -- Entity: Content Items
            100017,
            'Organization',
            'Organization',
            NULL,
            'nvarchar',
            510,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '316c0e38-9545-4c89-848b-26afb1e2dda8' OR (EntityID = '1447E26B-23D9-443C-B729-992655F5C237' AND Name = 'RootParentID')) BEGIN
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
            '316c0e38-9545-4c89-848b-26afb1e2dda8',
            '1447E26B-23D9-443C-B729-992655F5C237', -- Entity: Content Items
            100018,
            'RootParentID',
            'Root Parent ID',
            NULL,
            'uniqueidentifier',
            16,
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
      END;

