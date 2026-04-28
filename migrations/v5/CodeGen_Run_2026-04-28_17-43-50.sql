/* SQL generated to create new entity MJ: Search Scope Test Queries */

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
         '839b8511-0b9f-44b0-a687-2d9cedc81301',
         'MJ: Search Scope Test Queries',
         'Search Scope Test Queries',
         'Canonical test queries owned by a SearchScope. Used by scope authors to validate tuning changes — re-run a saved query after swapping the reranker or adjusting fusion weights and compare results to the prior run.',
         NULL,
         'SearchScopeTestQuery',
         'vwSearchScopeTestQueries',
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
   

/* SQL generated to add new entity MJ: Search Scope Test Queries to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '839b8511-0b9f-44b0-a687-2d9cedc81301', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Search Scope Test Queries for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('839b8511-0b9f-44b0-a687-2d9cedc81301', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Search Scope Test Queries for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('839b8511-0b9f-44b0-a687-2d9cedc81301', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Search Scope Test Queries for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('839b8511-0b9f-44b0-a687-2d9cedc81301', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
UPDATE [${flyway:defaultSchema}].[SearchScopeTestQuery] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ADD CONSTRAINT [DF___mj_SearchScopeTestQuery___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
UPDATE [${flyway:defaultSchema}].[SearchScopeTestQuery] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ADD CONSTRAINT [DF___mj_SearchScopeTestQuery___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f6f9d12-560a-43b3-af9d-7f3639a15d69' OR (EntityID = '839B8511-0B9F-44B0-A687-2D9CEDC81301' AND Name = 'ID')) BEGIN
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
            '5f6f9d12-560a-43b3-af9d-7f3639a15d69',
            '839B8511-0B9F-44B0-A687-2D9CEDC81301', -- Entity: MJ: Search Scope Test Queries
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b614f0a2-9f7c-4103-95b6-14e42778ff7e' OR (EntityID = '839B8511-0B9F-44B0-A687-2D9CEDC81301' AND Name = 'SearchScopeID')) BEGIN
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
            'b614f0a2-9f7c-4103-95b6-14e42778ff7e',
            '839B8511-0B9F-44B0-A687-2D9CEDC81301', -- Entity: MJ: Search Scope Test Queries
            100002,
            'SearchScopeID',
            'Search Scope ID',
            'The SearchScope this test query belongs to. Cascade-restricted via FK so accidental scope deletion preserves test history.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '73A3EDE8-070F-4CC8-BD5D-C6B654FAE2F6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41d39e10-6f65-405a-9f3c-b0627f88e7d4' OR (EntityID = '839B8511-0B9F-44B0-A687-2D9CEDC81301' AND Name = 'Label')) BEGIN
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
            '41d39e10-6f65-405a-9f3c-b0627f88e7d4',
            '839B8511-0B9F-44B0-A687-2D9CEDC81301', -- Entity: MJ: Search Scope Test Queries
            100003,
            'Label',
            'Label',
            'Short human-readable label for the test query, shown in the form''s test-query grid (e.g. "VIP customer escalation", "expense reimbursement policy").',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31c33ece-73cb-4656-8676-27ee2c86d573' OR (EntityID = '839B8511-0B9F-44B0-A687-2D9CEDC81301' AND Name = 'Query')) BEGIN
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
            '31c33ece-73cb-4656-8676-27ee2c86d573',
            '839B8511-0B9F-44B0-A687-2D9CEDC81301', -- Entity: MJ: Search Scope Test Queries
            100004,
            'Query',
            'Query',
            'The query text itself. NVARCHAR(MAX) because canonical queries can be full sentences or chunks of natural-language context.',
            'nvarchar',
            -1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'efde95c3-785d-412b-ac26-275d8f99c121' OR (EntityID = '839B8511-0B9F-44B0-A687-2D9CEDC81301' AND Name = 'ExpectedTopResultEntity')) BEGIN
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
            'efde95c3-785d-412b-ac26-275d8f99c121',
            '839B8511-0B9F-44B0-A687-2D9CEDC81301', -- Entity: MJ: Search Scope Test Queries
            100005,
            'ExpectedTopResultEntity',
            'Expected Top Result Entity',
            'Optional MJ entity name (e.g. "Contacts", "Documents") of the expected top result. When set together with ExpectedTopResultRecordID, lets the test runner assert that the tuned scope returns the right record at rank #1 — a regression tripwire for fusion / reranker changes.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '48f6f725-df4e-4441-be19-2fc416d35a8c' OR (EntityID = '839B8511-0B9F-44B0-A687-2D9CEDC81301' AND Name = 'ExpectedTopResultRecordID')) BEGIN
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
            '48f6f725-df4e-4441-be19-2fc416d35a8c',
            '839B8511-0B9F-44B0-A687-2D9CEDC81301', -- Entity: MJ: Search Scope Test Queries
            100006,
            'ExpectedTopResultRecordID',
            'Expected Top Result Record ID',
            'Optional record ID of the expected top result, paired with ExpectedTopResultEntity. NULL = no assertion (the query is exploratory).',
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4c8dd20d-8547-4c6b-9d5f-14d8770a1315' OR (EntityID = '839B8511-0B9F-44B0-A687-2D9CEDC81301' AND Name = 'Notes')) BEGIN
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
            '4c8dd20d-8547-4c6b-9d5f-14d8770a1315',
            '839B8511-0B9F-44B0-A687-2D9CEDC81301', -- Entity: MJ: Search Scope Test Queries
            100007,
            'Notes',
            'Notes',
            'Free-form notes explaining why this query is canonical or what edge case it represents.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3446808c-f10b-40ee-afcd-e80c04cb9c34' OR (EntityID = '839B8511-0B9F-44B0-A687-2D9CEDC81301' AND Name = '__mj_CreatedAt')) BEGIN
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
            '3446808c-f10b-40ee-afcd-e80c04cb9c34',
            '839B8511-0B9F-44B0-A687-2D9CEDC81301', -- Entity: MJ: Search Scope Test Queries
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9699c598-1eff-4ead-bf83-03463e09ece5' OR (EntityID = '839B8511-0B9F-44B0-A687-2D9CEDC81301' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '9699c598-1eff-4ead-bf83-03463e09ece5',
            '839B8511-0B9F-44B0-A687-2D9CEDC81301', -- Entity: MJ: Search Scope Test Queries
            100009,
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


/* Create Entity Relationship: MJ: Search Scopes -> MJ: Search Scope Test Queries (One To Many via SearchScopeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ea5dd428-30c9-4de6-b11a-f1c3f53da84c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ea5dd428-30c9-4de6-b11a-f1c3f53da84c', '73A3EDE8-070F-4CC8-BD5D-C6B654FAE2F6', '839B8511-0B9F-44B0-A687-2D9CEDC81301', 'SearchScopeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for SearchScopeTestQuery */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchScopeTestQuery
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopeTestQuery_SearchScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopeTestQuery]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopeTestQuery_SearchScopeID ON [${flyway:defaultSchema}].[SearchScopeTestQuery] ([SearchScopeID]);

/* SQL text to update entity field related entity name field map for entity field ID B614F0A2-9F7C-4103-95B6-14E42778FF7E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B614F0A2-9F7C-4103-95B6-14E42778FF7E', @RelatedEntityNameFieldMap='SearchScope'

/* Base View SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: vwSearchScopeTestQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Scope Test Queries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SearchScopeTestQuery
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSearchScopeTestQueries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSearchScopeTestQueries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSearchScopeTestQueries]
AS
SELECT
    s.*,
    MJSearchScope_SearchScopeID.[Name] AS [SearchScope]
FROM
    [${flyway:defaultSchema}].[SearchScopeTestQuery] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SearchScope] AS MJSearchScope_SearchScopeID
  ON
    [s].[SearchScopeID] = MJSearchScope_SearchScopeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeTestQueries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: Permissions for vwSearchScopeTestQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeTestQueries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: spCreateSearchScopeTestQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopeTestQuery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchScopeTestQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeTestQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeTestQuery]
    @ID uniqueidentifier = NULL,
    @SearchScopeID uniqueidentifier,
    @Label nvarchar(200),
    @Query nvarchar(MAX),
    @ExpectedTopResultEntity nvarchar(255),
    @ExpectedTopResultRecordID uniqueidentifier,
    @Notes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeTestQuery]
            (
                [ID],
                [SearchScopeID],
                [Label],
                [Query],
                [ExpectedTopResultEntity],
                [ExpectedTopResultRecordID],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SearchScopeID,
                @Label,
                @Query,
                @ExpectedTopResultEntity,
                @ExpectedTopResultRecordID,
                @Notes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeTestQuery]
            (
                [SearchScopeID],
                [Label],
                [Query],
                [ExpectedTopResultEntity],
                [ExpectedTopResultRecordID],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SearchScopeID,
                @Label,
                @Query,
                @ExpectedTopResultEntity,
                @ExpectedTopResultRecordID,
                @Notes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSearchScopeTestQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeTestQuery] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Search Scope Test Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeTestQuery] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: spUpdateSearchScopeTestQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopeTestQuery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchScopeTestQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeTestQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeTestQuery]
    @ID uniqueidentifier,
    @SearchScopeID uniqueidentifier,
    @Label nvarchar(200),
    @Query nvarchar(MAX),
    @ExpectedTopResultEntity nvarchar(255),
    @ExpectedTopResultRecordID uniqueidentifier,
    @Notes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeTestQuery]
    SET
        [SearchScopeID] = @SearchScopeID,
        [Label] = @Label,
        [Query] = @Query,
        [ExpectedTopResultEntity] = @ExpectedTopResultEntity,
        [ExpectedTopResultRecordID] = @ExpectedTopResultRecordID,
        [Notes] = @Notes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSearchScopeTestQueries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSearchScopeTestQueries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeTestQuery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchScopeTestQuery table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchScopeTestQuery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchScopeTestQuery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchScopeTestQuery
ON [${flyway:defaultSchema}].[SearchScopeTestQuery]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeTestQuery]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchScopeTestQuery] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Search Scope Test Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeTestQuery] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: spDeleteSearchScopeTestQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopeTestQuery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSearchScopeTestQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeTestQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeTestQuery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SearchScopeTestQuery]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeTestQuery] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Search Scope Test Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeTestQuery] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7f10218-85ad-47a5-893d-aa6194144a31' OR (EntityID = '839B8511-0B9F-44B0-A687-2D9CEDC81301' AND Name = 'SearchScope')) BEGIN
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
            'f7f10218-85ad-47a5-893d-aa6194144a31',
            '839B8511-0B9F-44B0-A687-2D9CEDC81301', -- Entity: MJ: Search Scope Test Queries
            100019,
            'SearchScope',
            'Search Scope',
            NULL,
            'nvarchar',
            400,
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

