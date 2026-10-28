-- =====================================================================================
-- Query extraction metadata
--
-- Records what the database server reports about a query's output, and the state of the
-- last extraction run, so stored Query Fields can be checked for staleness and re-bound
-- after schema changes.
--
-- 1. QueryField
--    - SourceEntityFieldID: the MJ Entity Field an output column passes through, as
--      resolved from the server's describe result. ON DELETE SET NULL, so a CodeGen
--      column drop clears the link instead of blocking the delete.
--    - IsNullable: nullability reported by the server (NULL = unknown).
--    - SourceObjectName: schema.object.column for sources that back no MJ entity.
--    - DetectionMethod: adds 'Database' and 'Parser' to the existing 'AI' / 'Manual'.
-- 2. Query
--    - ExtractedSQLHash: hash of the SQL the child rows were last extracted from.
--    - ExtractionStatus / ExtractionMessage: outcome and diagnostics of that run.
--
-- Conventions (migrations/CLAUDE.md):
--   - Plain DDL + extended properties only (no existence guards).
--   - FK indexes are omitted; CodeGen generates them.
--   - PostgreSQL counterpart is deferred to the release build engineer.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. QueryField
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[QueryField]
    ADD [SourceEntityFieldID] UNIQUEIDENTIFIER NULL
            CONSTRAINT [FK_QueryField_SourceEntityField] FOREIGN KEY
            REFERENCES [${flyway:defaultSchema}].[EntityField]([ID])
            ON DELETE SET NULL,
        [IsNullable] BIT NULL,
        [SourceObjectName] NVARCHAR(500) NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[QueryField]
    DROP CONSTRAINT [CK_QueryField_DetectionMethod];
GO

ALTER TABLE [${flyway:defaultSchema}].[QueryField]
    ADD CONSTRAINT [CK_QueryField_DetectionMethod]
        CHECK ([DetectionMethod] IN (N'AI', N'Manual', N'Database', N'Parser'));
GO

-- -------------------------------------------------------------------------------------
-- 2. Query
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[Query]
    ADD [ExtractedSQLHash] NVARCHAR(64) NULL,
        [ExtractionStatus] NVARCHAR(20) NULL
            CONSTRAINT [CK_Query_ExtractionStatus]
            CHECK ([ExtractionStatus] IN (N'OK', N'Warning', N'Error', N'Skipped')),
        [ExtractionMessage] NVARCHAR(MAX) NULL;
GO

-- -------------------------------------------------------------------------------------
-- 3. Extended properties (column descriptions)
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The MJ Entity Field this output column passes through unchanged, resolved by extraction from the source the database server reports for the column (schema, view, column) mapped through entity metadata. NULL when the column is computed, comes from an object that backs no entity, or the link was cleared because the entity field was deleted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'QueryField',
    @level2type = N'COLUMN', @level2name = N'SourceEntityFieldID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether the database server reports that this output column can be NULL. NULL means unknown, for example on platforms whose describe result does not report nullability.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'QueryField',
    @level2type = N'COLUMN', @level2name = N'IsNullable';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The source of this output column as the database server reported it (schema.object.column), recorded when the source is a table or view that backs no MJ entity. NULL when the column maps to an entity field (see SourceEntityFieldID) or has no direct source.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'QueryField',
    @level2type = N'COLUMN', @level2name = N'SourceObjectName';

EXEC sp_updateextendedproperty @name = N'MS_Description',
    @value = N'Who wrote this field row. "Database" means its facts (name, order, types, nullability, source) came from the database server describing the query output. "Parser" means they came from MJ''s analysis of the query template and structure. "Manual" means a user authored the row. "AI" means an LLM wrote its description; an LLM never sets types or sources.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'QueryField',
    @level2type = N'COLUMN', @level2name = N'DetectionMethod';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Hash of the platform SQL and dialect the query''s child rows (fields, parameters, entities, dependencies) were last extracted from. NULL means the query has never been extracted by the current extraction service. A value that differs from the current SQL''s hash means the rows may be stale.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Query',
    @level2type = N'COLUMN', @level2name = N'ExtractedSQLHash';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Outcome of the last extraction run. "OK" means all facts were extracted. "Warning" means extraction succeeded with findings (see ExtractionMessage). "Error" means the database server could not describe the query, so existing rows were kept. "Skipped" means the facts could not be checked, for example for queries on an external data source. NULL means never extracted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Query',
    @level2type = N'COLUMN', @level2name = N'ExtractionStatus';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Diagnostics from the last extraction run: validation findings, authored parameters no longer present in the SQL, describe errors, and output drift on queries with role-based permissions.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Query',
    @level2type = N'COLUMN', @level2name = N'ExtractionMessage';
GO























































-- =============================================================================
-- =============================================================================
-- =============================================================================
--
--                    ⚙️  CODEGEN OUTPUT BELOW THIS LINE  ⚙️
--
-- Everything below this block was generated by the MemberJunction CodeGen tool
-- after the hand-written DDL above was applied to the development database.
-- It contains the framework plumbing for the new columns: EntityField metadata
-- inserts, EntityFieldValue rows for the value lists, the new EntityRelationship,
-- FK indexes, regenerated base views, stored procedures (spCreate/spUpdate/
-- spDelete), and permission grants.
--
-- DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen
-- and replace this entire section with the fresh output.
--
-- =============================================================================
-- =============================================================================
-- =============================================================================

/* SQL text to insert 6 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e037f65c-2e56-4daa-aed3-7593f03d0258' OR (EntityID = '19248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceEntityFieldID')) BEGIN
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
            'e037f65c-2e56-4daa-aed3-7593f03d0258',
            '19248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Query Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '19248F34-2837-EF11-86D4-6045BDEE16E6'),
            'SourceEntityFieldID',
            'Source Entity Field ID',
            'The MJ Entity Field this output column passes through unchanged, resolved by extraction from the source the database server reports for the column (schema, view, column) mapped through entity metadata. NULL when the column is computed, comes from an object that backs no entity, or the link was cleared because the entity field was deleted.',
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
            'DF238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a3537290-74de-4efb-b5ac-399e18ea0e9e' OR (EntityID = '19248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsNullable')) BEGIN
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
            'a3537290-74de-4efb-b5ac-399e18ea0e9e',
            '19248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Query Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '19248F34-2837-EF11-86D4-6045BDEE16E6'),
            'IsNullable',
            'Is Nullable',
            'Whether the database server reports that this output column can be NULL. NULL means unknown, for example on platforms whose describe result does not report nullability.',
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d747e91-26d9-4f26-b8cd-42af54eaeb90' OR (EntityID = '19248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceObjectName')) BEGIN
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
            '2d747e91-26d9-4f26-b8cd-42af54eaeb90',
            '19248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Query Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '19248F34-2837-EF11-86D4-6045BDEE16E6'),
            'SourceObjectName',
            'Source Object Name',
            'The source of this output column as the database server reported it (schema.object.column), recorded when the source is a table or view that backs no MJ entity. NULL when the column maps to an entity field (see SourceEntityFieldID) or has no direct source.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c7bb26cf-5a35-41cd-949d-7a119b8fdbc2' OR (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ExtractedSQLHash')) BEGIN
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
            'c7bb26cf-5a35-41cd-949d-7a119b8fdbc2',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Queries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1B248F34-2837-EF11-86D4-6045BDEE16E6'),
            'ExtractedSQLHash',
            'Extracted SQL Hash',
            'Hash of the platform SQL and dialect the query''s child rows (fields, parameters, entities, dependencies) were last extracted from. NULL means the query has never been extracted by the current extraction service. A value that differs from the current SQL''s hash means the rows may be stale.',
            'nvarchar',
            128,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a97bb493-7b84-482a-97f0-f1adfb743fda' OR (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ExtractionStatus')) BEGIN
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
            'a97bb493-7b84-482a-97f0-f1adfb743fda',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Queries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1B248F34-2837-EF11-86D4-6045BDEE16E6'),
            'ExtractionStatus',
            'Extraction Status',
            'Outcome of the last extraction run. "OK" means all facts were extracted. "Warning" means extraction succeeded with findings (see ExtractionMessage). "Error" means the database server could not describe the query, so existing rows were kept. "Skipped" means the facts could not be checked, for example for queries on an external data source. NULL means never extracted.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58647807-90b8-4e45-b2c2-61496f73be71' OR (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ExtractionMessage')) BEGIN
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
            '58647807-90b8-4e45-b2c2-61496f73be71',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Queries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1B248F34-2837-EF11-86D4-6045BDEE16E6'),
            'ExtractionMessage',
            'Extraction Message',
            'Diagnostics from the last extraction run: validation findings, authored parameters no longer present in the SQL, describe errors, and output drift on queries with role-based permissions.',
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

/* SQL text to insert entity field value with ID 052c2db0-dfcc-44d0-b72f-ff6af99d3e9a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('052c2db0-dfcc-44d0-b72f-ff6af99d3e9a', '5C15F0A2-70D3-47CC-90BF-E22491999802', 2, 'Database', 'Database', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b3a22c71-50a4-4104-acb8-e9d077bcfa90 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b3a22c71-50a4-4104-acb8-e9d077bcfa90', '5C15F0A2-70D3-47CC-90BF-E22491999802', 4, 'Parser', 'Parser', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='CF09B9DA-0573-4B8C-868A-933B261DBBE1';

/* SQL text to insert entity field value with ID 3420e825-2694-44a6-9a56-1a5b13422f56 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3420e825-2694-44a6-9a56-1a5b13422f56', 'A97BB493-7B84-482A-97F0-F1ADFB743FDA', 1, 'Error', 'Error', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 14a0e4cb-97eb-482b-97a4-dc23e1b3bde6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('14a0e4cb-97eb-482b-97a4-dc23e1b3bde6', 'A97BB493-7B84-482A-97F0-F1ADFB743FDA', 2, 'OK', 'OK', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0df8d14a-5afe-42f5-9f94-40de97c8f068 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0df8d14a-5afe-42f5-9f94-40de97c8f068', 'A97BB493-7B84-482A-97F0-F1ADFB743FDA', 3, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9dedcf34-ca5c-44c5-bd80-40a5eab247c6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9dedcf34-ca5c-44c5-bd80-40a5eab247c6', 'A97BB493-7B84-482A-97F0-F1ADFB743FDA', 4, 'Warning', 'Warning', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A97BB493-7B84-482A-97F0-F1ADFB743FDA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A97BB493-7B84-482A-97F0-F1ADFB743FDA';


/* Create Entity Relationship: MJ: Entity Fields -> MJ: Query Fields (One To Many via SourceEntityFieldID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c3fbaf2f-43af-4a8f-81f3-a16ae43c24dd'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c3fbaf2f-43af-4a8f-81f3-a16ae43c24dd', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '19248F34-2837-EF11-86D4-6045BDEE16E6', 'SourceEntityFieldID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for QueryField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueryID in table QueryField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryField_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryField_QueryID ON [${flyway:defaultSchema}].[QueryField] ([QueryID]);

-- Index for foreign key SourceEntityID in table QueryField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryField_SourceEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryField_SourceEntityID ON [${flyway:defaultSchema}].[QueryField] ([SourceEntityID]);

-- Index for foreign key SourceEntityFieldID in table QueryField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryField_SourceEntityFieldID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryField_SourceEntityFieldID ON [${flyway:defaultSchema}].[QueryField] ([SourceEntityFieldID]);

/* SQL text to update entity field related entity name field map for entity field ID E037F65C-2E56-4DAA-AED3-7593F03D0258 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E037F65C-2E56-4DAA-AED3-7593F03D0258', @RelatedEntityNameFieldMap='SourceEntityField';

/* Base View SQL for MJ: Query Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Fields
-- Item: vwQueryFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Query Fields
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueryField
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueryFields]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueryFields];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueryFields]
AS
SELECT
    q.*,
    MJQuery_QueryID.[Name] AS [Query],
    MJEntity_SourceEntityID.[Name] AS [SourceEntity],
    MJEntityField_SourceEntityFieldID.[Name] AS [SourceEntityField]
FROM
    [${flyway:defaultSchema}].[QueryField] AS q
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS MJQuery_QueryID
  ON
    [q].[QueryID] = MJQuery_QueryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_SourceEntityID
  ON
    [q].[SourceEntityID] = MJEntity_SourceEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityField] AS MJEntityField_SourceEntityFieldID
  ON
    [q].[SourceEntityFieldID] = MJEntityField_SourceEntityFieldID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryFields] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryFields] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryFields] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Query Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Fields
-- Item: Permissions for vwQueryFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryFields] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryFields] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryFields] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Query Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Fields
-- Item: spCreateQueryField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQueryField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQueryField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueryField]
    @ID uniqueidentifier = NULL,
    @QueryID uniqueidentifier,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Sequence int,
    @SQLBaseType nvarchar(50),
    @SQLFullType nvarchar(100),
    @SourceEntityID_Clear bit = 0,
    @SourceEntityID uniqueidentifier = NULL,
    @SourceFieldName_Clear bit = 0,
    @SourceFieldName nvarchar(255) = NULL,
    @IsComputed bit = NULL,
    @ComputationDescription_Clear bit = 0,
    @ComputationDescription nvarchar(MAX) = NULL,
    @IsSummary bit = NULL,
    @SummaryDescription_Clear bit = 0,
    @SummaryDescription nvarchar(MAX) = NULL,
    @DetectionMethod nvarchar(50) = NULL,
    @AutoDetectConfidenceScore_Clear bit = 0,
    @AutoDetectConfidenceScore decimal(3, 2) = NULL,
    @SourceEntityFieldID_Clear bit = 0,
    @SourceEntityFieldID uniqueidentifier = NULL,
    @IsNullable_Clear bit = 0,
    @IsNullable bit = NULL,
    @SourceObjectName_Clear bit = 0,
    @SourceObjectName nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueryField]
            (
                [ID],
                [QueryID],
                [Name],
                [Description],
                [Sequence],
                [SQLBaseType],
                [SQLFullType],
                [SourceEntityID],
                [SourceFieldName],
                [IsComputed],
                [ComputationDescription],
                [IsSummary],
                [SummaryDescription],
                [DetectionMethod],
                [AutoDetectConfidenceScore],
                [SourceEntityFieldID],
                [IsNullable],
                [SourceObjectName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QueryID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Sequence,
                @SQLBaseType,
                @SQLFullType,
                CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, NULL) END,
                CASE WHEN @SourceFieldName_Clear = 1 THEN NULL ELSE ISNULL(@SourceFieldName, NULL) END,
                ISNULL(@IsComputed, 0),
                CASE WHEN @ComputationDescription_Clear = 1 THEN NULL ELSE ISNULL(@ComputationDescription, NULL) END,
                ISNULL(@IsSummary, 0),
                CASE WHEN @SummaryDescription_Clear = 1 THEN NULL ELSE ISNULL(@SummaryDescription, NULL) END,
                ISNULL(@DetectionMethod, 'Manual'),
                CASE WHEN @AutoDetectConfidenceScore_Clear = 1 THEN NULL ELSE ISNULL(@AutoDetectConfidenceScore, NULL) END,
                CASE WHEN @SourceEntityFieldID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityFieldID, NULL) END,
                CASE WHEN @IsNullable_Clear = 1 THEN NULL ELSE ISNULL(@IsNullable, NULL) END,
                CASE WHEN @SourceObjectName_Clear = 1 THEN NULL ELSE ISNULL(@SourceObjectName, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueryField]
            (
                [QueryID],
                [Name],
                [Description],
                [Sequence],
                [SQLBaseType],
                [SQLFullType],
                [SourceEntityID],
                [SourceFieldName],
                [IsComputed],
                [ComputationDescription],
                [IsSummary],
                [SummaryDescription],
                [DetectionMethod],
                [AutoDetectConfidenceScore],
                [SourceEntityFieldID],
                [IsNullable],
                [SourceObjectName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QueryID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Sequence,
                @SQLBaseType,
                @SQLFullType,
                CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, NULL) END,
                CASE WHEN @SourceFieldName_Clear = 1 THEN NULL ELSE ISNULL(@SourceFieldName, NULL) END,
                ISNULL(@IsComputed, 0),
                CASE WHEN @ComputationDescription_Clear = 1 THEN NULL ELSE ISNULL(@ComputationDescription, NULL) END,
                ISNULL(@IsSummary, 0),
                CASE WHEN @SummaryDescription_Clear = 1 THEN NULL ELSE ISNULL(@SummaryDescription, NULL) END,
                ISNULL(@DetectionMethod, 'Manual'),
                CASE WHEN @AutoDetectConfidenceScore_Clear = 1 THEN NULL ELSE ISNULL(@AutoDetectConfidenceScore, NULL) END,
                CASE WHEN @SourceEntityFieldID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityFieldID, NULL) END,
                CASE WHEN @IsNullable_Clear = 1 THEN NULL ELSE ISNULL(@IsNullable, NULL) END,
                CASE WHEN @SourceObjectName_Clear = 1 THEN NULL ELSE ISNULL(@SourceObjectName, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueryFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryField] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Query Fields */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryField] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Query Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Fields
-- Item: spUpdateQueryField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQueryField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryField]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Sequence int = NULL,
    @SQLBaseType nvarchar(50) = NULL,
    @SQLFullType nvarchar(100) = NULL,
    @SourceEntityID_Clear bit = 0,
    @SourceEntityID uniqueidentifier = NULL,
    @SourceFieldName_Clear bit = 0,
    @SourceFieldName nvarchar(255) = NULL,
    @IsComputed bit = NULL,
    @ComputationDescription_Clear bit = 0,
    @ComputationDescription nvarchar(MAX) = NULL,
    @IsSummary bit = NULL,
    @SummaryDescription_Clear bit = 0,
    @SummaryDescription nvarchar(MAX) = NULL,
    @DetectionMethod nvarchar(50) = NULL,
    @AutoDetectConfidenceScore_Clear bit = 0,
    @AutoDetectConfidenceScore decimal(3, 2) = NULL,
    @SourceEntityFieldID_Clear bit = 0,
    @SourceEntityFieldID uniqueidentifier = NULL,
    @IsNullable_Clear bit = 0,
    @IsNullable bit = NULL,
    @SourceObjectName_Clear bit = 0,
    @SourceObjectName nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryField]
    SET
        [QueryID] = ISNULL(@QueryID, [QueryID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [SQLBaseType] = ISNULL(@SQLBaseType, [SQLBaseType]),
        [SQLFullType] = ISNULL(@SQLFullType, [SQLFullType]),
        [SourceEntityID] = CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, [SourceEntityID]) END,
        [SourceFieldName] = CASE WHEN @SourceFieldName_Clear = 1 THEN NULL ELSE ISNULL(@SourceFieldName, [SourceFieldName]) END,
        [IsComputed] = ISNULL(@IsComputed, [IsComputed]),
        [ComputationDescription] = CASE WHEN @ComputationDescription_Clear = 1 THEN NULL ELSE ISNULL(@ComputationDescription, [ComputationDescription]) END,
        [IsSummary] = ISNULL(@IsSummary, [IsSummary]),
        [SummaryDescription] = CASE WHEN @SummaryDescription_Clear = 1 THEN NULL ELSE ISNULL(@SummaryDescription, [SummaryDescription]) END,
        [DetectionMethod] = ISNULL(@DetectionMethod, [DetectionMethod]),
        [AutoDetectConfidenceScore] = CASE WHEN @AutoDetectConfidenceScore_Clear = 1 THEN NULL ELSE ISNULL(@AutoDetectConfidenceScore, [AutoDetectConfidenceScore]) END,
        [SourceEntityFieldID] = CASE WHEN @SourceEntityFieldID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityFieldID, [SourceEntityFieldID]) END,
        [IsNullable] = CASE WHEN @IsNullable_Clear = 1 THEN NULL ELSE ISNULL(@IsNullable, [IsNullable]) END,
        [SourceObjectName] = CASE WHEN @SourceObjectName_Clear = 1 THEN NULL ELSE ISNULL(@SourceObjectName, [SourceObjectName]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueryFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueryFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryField] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQueryField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQueryField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueryField
ON [${flyway:defaultSchema}].[QueryField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueryField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Query Fields */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryField] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Query Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Fields
-- Item: spDeleteQueryField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQueryField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QueryField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryField] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Query Fields */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryField] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Query */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_CategoryID ON [${flyway:defaultSchema}].[Query] ([CategoryID]);

-- Index for foreign key EmbeddingModelID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID ON [${flyway:defaultSchema}].[Query] ([EmbeddingModelID]);

-- Index for foreign key SQLDialectID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_SQLDialectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_SQLDialectID ON [${flyway:defaultSchema}].[Query] ([SQLDialectID]);

-- Index for foreign key ExternalDataSourceID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_ExternalDataSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_ExternalDataSourceID ON [${flyway:defaultSchema}].[Query] ([ExternalDataSourceID]);

-- Index for foreign key ApprovedByUserID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_ApprovedByUserID ON [${flyway:defaultSchema}].[Query] ([ApprovedByUserID]);

/* Base View SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Queries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueries]
AS
SELECT
    q.*,
    MJQueryCategory_CategoryID.[Name] AS [Category],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJSQLDialect_SQLDialectID.[Name] AS [SQLDialect],
    MJExternalDataSource_ExternalDataSourceID.[Name] AS [ExternalDataSource],
    MJUser_ApprovedByUserID.[Name] AS [ApprovedByUser]
FROM
    [${flyway:defaultSchema}].[Query] AS q
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[QueryCategory] AS MJQueryCategory_CategoryID
  ON
    [q].[CategoryID] = MJQueryCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [q].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[SQLDialect] AS MJSQLDialect_SQLDialectID
  ON
    [q].[SQLDialectID] = MJSQLDialect_SQLDialectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ExternalDataSource] AS MJExternalDataSource_ExternalDataSourceID
  ON
    [q].[ExternalDataSourceID] = MJExternalDataSource_ExternalDataSourceID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ApprovedByUserID
  ON
    [q].[ApprovedByUserID] = MJUser_ApprovedByUserID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* Base View Permissions SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Permissions for vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spCreateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQuery]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @UserQuestion_Clear bit = 0,
    @UserQuestion nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SQL_Clear bit = 0,
    @SQL nvarchar(MAX) = NULL,
    @TechnicalDescription_Clear bit = 0,
    @TechnicalDescription nvarchar(MAX) = NULL,
    @OriginalSQL_Clear bit = 0,
    @OriginalSQL nvarchar(MAX) = NULL,
    @Feedback_Clear bit = 0,
    @Feedback nvarchar(MAX) = NULL,
    @Status nvarchar(15) = NULL,
    @QualityRank_Clear bit = 0,
    @QualityRank int = NULL,
    @ExecutionCostRank_Clear bit = 0,
    @ExecutionCostRank int = NULL,
    @UsesTemplate_Clear bit = 0,
    @UsesTemplate bit = NULL,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes_Clear bit = 0,
    @CacheTTLMinutes int = NULL,
    @CacheMaxSize_Clear bit = 0,
    @CacheMaxSize int = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @CacheValidationSQL_Clear bit = 0,
    @CacheValidationSQL nvarchar(MAX) = NULL,
    @SQLDialectID uniqueidentifier = NULL,
    @Reusable bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @IsMaterialized bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL,
    @ApprovalComments_Clear bit = 0,
    @ApprovalComments nvarchar(MAX) = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL,
    @ApprovedFingerprint_Clear bit = 0,
    @ApprovedFingerprint nvarchar(100) = NULL,
    @ExtractedSQLHash_Clear bit = 0,
    @ExtractedSQLHash nvarchar(64) = NULL,
    @ExtractionStatus_Clear bit = 0,
    @ExtractionStatus nvarchar(20) = NULL,
    @ExtractionMessage_Clear bit = 0,
    @ExtractionMessage nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [ID],
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate],
                [AuditQueryRuns],
                [CacheEnabled],
                [CacheTTLMinutes],
                [CacheMaxSize],
                [EmbeddingVector],
                [EmbeddingModelID],
                [CacheValidationSQL],
                [SQLDialectID],
                [Reusable],
                [ExternalDataSourceID],
                [IsMaterialized],
                [Configuration],
                [EmbeddingVectorBinary],
                [ApprovalComments],
                [ApprovedByUserID],
                [ApprovedAt],
                [ApprovedFingerprint],
                [ExtractedSQLHash],
                [ExtractionStatus],
                [ExtractionMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, NULL) END,
                CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, NULL) END,
                CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, NULL) END,
                CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, 0) END,
                CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, NULL) END,
                CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, 0) END,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, NULL) END,
                CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, NULL) END,
                CASE WHEN @SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                ISNULL(@IsMaterialized, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END,
                CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END,
                CASE WHEN @ApprovedFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedFingerprint, NULL) END,
                CASE WHEN @ExtractedSQLHash_Clear = 1 THEN NULL ELSE ISNULL(@ExtractedSQLHash, NULL) END,
                CASE WHEN @ExtractionStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionStatus, NULL) END,
                CASE WHEN @ExtractionMessage_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionMessage, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate],
                [AuditQueryRuns],
                [CacheEnabled],
                [CacheTTLMinutes],
                [CacheMaxSize],
                [EmbeddingVector],
                [EmbeddingModelID],
                [CacheValidationSQL],
                [SQLDialectID],
                [Reusable],
                [ExternalDataSourceID],
                [IsMaterialized],
                [Configuration],
                [EmbeddingVectorBinary],
                [ApprovalComments],
                [ApprovedByUserID],
                [ApprovedAt],
                [ApprovedFingerprint],
                [ExtractedSQLHash],
                [ExtractionStatus],
                [ExtractionMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, NULL) END,
                CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, NULL) END,
                CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, NULL) END,
                CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, 0) END,
                CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, NULL) END,
                CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, 0) END,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, NULL) END,
                CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, NULL) END,
                CASE WHEN @SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                ISNULL(@IsMaterialized, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END,
                CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END,
                CASE WHEN @ApprovedFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedFingerprint, NULL) END,
                CASE WHEN @ExtractedSQLHash_Clear = 1 THEN NULL ELSE ISNULL(@ExtractedSQLHash, NULL) END,
                CASE WHEN @ExtractionStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionStatus, NULL) END,
                CASE WHEN @ExtractionMessage_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionMessage, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Queries */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spUpdateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @UserQuestion_Clear bit = 0,
    @UserQuestion nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SQL_Clear bit = 0,
    @SQL nvarchar(MAX) = NULL,
    @TechnicalDescription_Clear bit = 0,
    @TechnicalDescription nvarchar(MAX) = NULL,
    @OriginalSQL_Clear bit = 0,
    @OriginalSQL nvarchar(MAX) = NULL,
    @Feedback_Clear bit = 0,
    @Feedback nvarchar(MAX) = NULL,
    @Status nvarchar(15) = NULL,
    @QualityRank_Clear bit = 0,
    @QualityRank int = NULL,
    @ExecutionCostRank_Clear bit = 0,
    @ExecutionCostRank int = NULL,
    @UsesTemplate_Clear bit = 0,
    @UsesTemplate bit = NULL,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes_Clear bit = 0,
    @CacheTTLMinutes int = NULL,
    @CacheMaxSize_Clear bit = 0,
    @CacheMaxSize int = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @CacheValidationSQL_Clear bit = 0,
    @CacheValidationSQL nvarchar(MAX) = NULL,
    @SQLDialectID uniqueidentifier = NULL,
    @Reusable bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @IsMaterialized bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL,
    @ApprovalComments_Clear bit = 0,
    @ApprovalComments nvarchar(MAX) = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL,
    @ApprovedFingerprint_Clear bit = 0,
    @ApprovedFingerprint nvarchar(100) = NULL,
    @ExtractedSQLHash_Clear bit = 0,
    @ExtractedSQLHash nvarchar(64) = NULL,
    @ExtractionStatus_Clear bit = 0,
    @ExtractionStatus nvarchar(20) = NULL,
    @ExtractionMessage_Clear bit = 0,
    @ExtractionMessage nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [UserQuestion] = CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, [UserQuestion]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [SQL] = CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, [SQL]) END,
        [TechnicalDescription] = CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, [TechnicalDescription]) END,
        [OriginalSQL] = CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, [OriginalSQL]) END,
        [Feedback] = CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, [Feedback]) END,
        [Status] = ISNULL(@Status, [Status]),
        [QualityRank] = CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, [QualityRank]) END,
        [ExecutionCostRank] = CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, [ExecutionCostRank]) END,
        [UsesTemplate] = CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, [UsesTemplate]) END,
        [AuditQueryRuns] = ISNULL(@AuditQueryRuns, [AuditQueryRuns]),
        [CacheEnabled] = ISNULL(@CacheEnabled, [CacheEnabled]),
        [CacheTTLMinutes] = CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, [CacheTTLMinutes]) END,
        [CacheMaxSize] = CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, [CacheMaxSize]) END,
        [EmbeddingVector] = CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, [EmbeddingVector]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [CacheValidationSQL] = CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, [CacheValidationSQL]) END,
        [SQLDialectID] = ISNULL(@SQLDialectID, [SQLDialectID]),
        [Reusable] = ISNULL(@Reusable, [Reusable]),
        [ExternalDataSourceID] = CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, [ExternalDataSourceID]) END,
        [IsMaterialized] = ISNULL(@IsMaterialized, [IsMaterialized]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [EmbeddingVectorBinary] = CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, [EmbeddingVectorBinary]) END,
        [ApprovalComments] = CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, [ApprovalComments]) END,
        [ApprovedByUserID] = CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, [ApprovedByUserID]) END,
        [ApprovedAt] = CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, [ApprovedAt]) END,
        [ApprovedFingerprint] = CASE WHEN @ApprovedFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedFingerprint, [ApprovedFingerprint]) END,
        [ExtractedSQLHash] = CASE WHEN @ExtractedSQLHash_Clear = 1 THEN NULL ELSE ISNULL(@ExtractedSQLHash, [ExtractedSQLHash]) END,
        [ExtractionStatus] = CASE WHEN @ExtractionStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionStatus, [ExtractionStatus]) END,
        [ExtractionMessage] = CASE WHEN @ExtractionMessage_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionMessage, [ExtractionMessage]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQuery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQuery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQuery
ON [${flyway:defaultSchema}].[Query]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Query] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Queries */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spDeleteQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on DataContextItem using cursor to call spUpdateDataContextItem
    DECLARE @MJDataContextItems_QueryIDID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_DataContextID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_Type nvarchar(50)
    DECLARE @MJDataContextItems_QueryID_ViewID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_QueryID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_EntityID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_RecordID nvarchar(450)
    DECLARE @MJDataContextItems_QueryID_SQL nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_DataJSON nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_LastRefreshedAt datetimeoffset
    DECLARE @MJDataContextItems_QueryID_Description nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_CodeName nvarchar(255)
    DECLARE cascade_update_MJDataContextItems_QueryID_cursor CURSOR FOR
        SELECT [ID], [DataContextID], [Type], [ViewID], [QueryID], [EntityID], [RecordID], [SQL], [DataJSON], [LastRefreshedAt], [Description], [CodeName]
        FROM [${flyway:defaultSchema}].[DataContextItem]
        WHERE [QueryID] = @ID

    OPEN cascade_update_MJDataContextItems_QueryID_cursor
    FETCH NEXT FROM cascade_update_MJDataContextItems_QueryID_cursor INTO @MJDataContextItems_QueryIDID, @MJDataContextItems_QueryID_DataContextID, @MJDataContextItems_QueryID_Type, @MJDataContextItems_QueryID_ViewID, @MJDataContextItems_QueryID_QueryID, @MJDataContextItems_QueryID_EntityID, @MJDataContextItems_QueryID_RecordID, @MJDataContextItems_QueryID_SQL, @MJDataContextItems_QueryID_DataJSON, @MJDataContextItems_QueryID_LastRefreshedAt, @MJDataContextItems_QueryID_Description, @MJDataContextItems_QueryID_CodeName

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDataContextItems_QueryID_QueryID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDataContextItem] @ID = @MJDataContextItems_QueryIDID, @DataContextID = @MJDataContextItems_QueryID_DataContextID, @Type = @MJDataContextItems_QueryID_Type, @ViewID = @MJDataContextItems_QueryID_ViewID, @QueryID_Clear = 1, @QueryID = @MJDataContextItems_QueryID_QueryID, @EntityID = @MJDataContextItems_QueryID_EntityID, @RecordID = @MJDataContextItems_QueryID_RecordID, @SQL = @MJDataContextItems_QueryID_SQL, @DataJSON = @MJDataContextItems_QueryID_DataJSON, @LastRefreshedAt = @MJDataContextItems_QueryID_LastRefreshedAt, @Description = @MJDataContextItems_QueryID_Description, @CodeName = @MJDataContextItems_QueryID_CodeName

        FETCH NEXT FROM cascade_update_MJDataContextItems_QueryID_cursor INTO @MJDataContextItems_QueryIDID, @MJDataContextItems_QueryID_DataContextID, @MJDataContextItems_QueryID_Type, @MJDataContextItems_QueryID_ViewID, @MJDataContextItems_QueryID_QueryID, @MJDataContextItems_QueryID_EntityID, @MJDataContextItems_QueryID_RecordID, @MJDataContextItems_QueryID_SQL, @MJDataContextItems_QueryID_DataJSON, @MJDataContextItems_QueryID_LastRefreshedAt, @MJDataContextItems_QueryID_Description, @MJDataContextItems_QueryID_CodeName
    END

    CLOSE cascade_update_MJDataContextItems_QueryID_cursor
    DEALLOCATE cascade_update_MJDataContextItems_QueryID_cursor
    
    -- Cascade delete from MaterializedResultQuery using cursor to call spDeleteMaterializedResultQuery
    DECLARE @MJMaterializedResultQueries_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJMaterializedResultQueries_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[MaterializedResultQuery]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJMaterializedResultQueries_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJMaterializedResultQueries_QueryID_cursor INTO @MJMaterializedResultQueries_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteMaterializedResultQuery] @ID = @MJMaterializedResultQueries_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJMaterializedResultQueries_QueryID_cursor INTO @MJMaterializedResultQueries_QueryIDID
    END
    
    CLOSE cascade_delete_MJMaterializedResultQueries_QueryID_cursor
    DEALLOCATE cascade_delete_MJMaterializedResultQueries_QueryID_cursor
    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency
    DECLARE @MJQueryDependencies_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryDependencies_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryDependency]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryDependencies_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryDependencies_QueryID_cursor INTO @MJQueryDependencies_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryDependency] @ID = @MJQueryDependencies_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryDependencies_QueryID_cursor INTO @MJQueryDependencies_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryDependencies_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryDependencies_QueryID_cursor
    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency
    DECLARE @MJQueryDependencies_DependsOnQueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryDependency]
        WHERE [DependsOnQueryID] = @ID
    
    OPEN cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor INTO @MJQueryDependencies_DependsOnQueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryDependency] @ID = @MJQueryDependencies_DependsOnQueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor INTO @MJQueryDependencies_DependsOnQueryIDID
    END
    
    CLOSE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    DEALLOCATE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    
    -- Cascade delete from QueryEntity using cursor to call spDeleteQueryEntity
    DECLARE @MJQueryEntities_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryEntities_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryEntity]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryEntities_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryEntities_QueryID_cursor INTO @MJQueryEntities_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryEntity] @ID = @MJQueryEntities_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryEntities_QueryID_cursor INTO @MJQueryEntities_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryEntities_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryEntities_QueryID_cursor
    
    -- Cascade delete from QueryField using cursor to call spDeleteQueryField
    DECLARE @MJQueryFields_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryFields_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryField]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryFields_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryFields_QueryID_cursor INTO @MJQueryFields_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryField] @ID = @MJQueryFields_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryFields_QueryID_cursor INTO @MJQueryFields_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryFields_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryFields_QueryID_cursor
    
    -- Cascade delete from QueryParameter using cursor to call spDeleteQueryParameter
    DECLARE @MJQueryParameters_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryParameters_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryParameter]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryParameters_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryParameters_QueryID_cursor INTO @MJQueryParameters_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryParameter] @ID = @MJQueryParameters_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryParameters_QueryID_cursor INTO @MJQueryParameters_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryParameters_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryParameters_QueryID_cursor
    
    -- Cascade delete from QueryPermission using cursor to call spDeleteQueryPermission
    DECLARE @MJQueryPermissions_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryPermissions_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryPermission]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryPermissions_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryPermissions_QueryID_cursor INTO @MJQueryPermissions_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryPermission] @ID = @MJQueryPermissions_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryPermissions_QueryID_cursor INTO @MJQueryPermissions_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryPermissions_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryPermissions_QueryID_cursor
    
    -- Cascade delete from QuerySQL using cursor to call spDeleteQuerySQL
    DECLARE @MJQuerySQLs_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQuerySQLs_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QuerySQL]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQuerySQLs_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQuerySQLs_QueryID_cursor INTO @MJQuerySQLs_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQuerySQL] @ID = @MJQuerySQLs_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQuerySQLs_QueryID_cursor INTO @MJQuerySQLs_QueryIDID
    END
    
    CLOSE cascade_delete_MJQuerySQLs_QueryID_cursor
    DEALLOCATE cascade_delete_MJQuerySQLs_QueryID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Query]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Queries */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fff8713-cbbf-44fd-8e37-5b1bfe79d8e5' OR (EntityID = '19248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceEntityField')) BEGIN
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
            '2fff8713-cbbf-44fd-8e37-5b1bfe79d8e5',
            '19248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Query Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '19248F34-2837-EF11-86D4-6045BDEE16E6'),
            'SourceEntityField',
            'Source Entity Field',
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

