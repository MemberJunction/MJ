-- Migration: Add Query Audit Logging and Result Caching Support
-- Description: Adds audit logging capability and TTL-based caching configuration for queries
-- Author: Claude Code
-- Date: 2025-08-03

-- ========================================
-- PART 1: QUERY AUDIT LOGGING
-- ========================================

-- Add the AuditQueryRuns column to the Query table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = '${flyway:defaultSchema}' 
               AND TABLE_NAME = 'Query' 
               AND COLUMN_NAME = 'AuditQueryRuns')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[Query]
    ADD [AuditQueryRuns] bit NOT NULL DEFAULT 0;
    
    EXEC sp_addextendedproperty 
        @name = N'MS_Description',
        @value = N'When true, all executions of this query will be logged to the Audit Log system for tracking and compliance',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'Query',
        @level2type = N'COLUMN', @level2name = 'AuditQueryRuns';
END
GO

-- Create the 'Run Query' audit log type if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[vwAuditLogTypes] WHERE [Name] = 'Run Query')
BEGIN
    -- Generate a deterministic UUID for 'Run Query' audit log type
    DECLARE @RunQueryAuditLogTypeID UNIQUEIDENTIFIER = '8F7A4321-0E9B-4D28-9C3E-A1B2C3D4E5F6';
    
    INSERT INTO [${flyway:defaultSchema}].[AuditLogType] ([ID], [Name], [Description])
    VALUES (
        @RunQueryAuditLogTypeID,
        'Run Query',
        'Tracks execution of saved queries for security and usage analysis'
    );
END
GO

-- ========================================
-- PART 2: QUERY RESULT CACHING
-- ========================================

-- Add cache configuration columns to Query table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = '${flyway:defaultSchema}' 
               AND TABLE_NAME = 'Query' 
               AND COLUMN_NAME = 'CacheEnabled')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[Query]
    ADD [CacheEnabled] bit NOT NULL DEFAULT 0;
    
    EXEC sp_addextendedproperty 
        @name = N'MS_Description',
        @value = N'When true, query results will be cached in memory with TTL expiration',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'Query',
        @level2type = N'COLUMN', @level2name = 'CacheEnabled';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = '${flyway:defaultSchema}' 
               AND TABLE_NAME = 'Query' 
               AND COLUMN_NAME = 'CacheTTLMinutes')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[Query]
    ADD [CacheTTLMinutes] int NULL;
    
    EXEC sp_addextendedproperty 
        @name = N'MS_Description',
        @value = N'Time-to-live in minutes for cached query results. NULL uses default TTL.',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'Query',
        @level2type = N'COLUMN', @level2name = 'CacheTTLMinutes';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = '${flyway:defaultSchema}' 
               AND TABLE_NAME = 'Query' 
               AND COLUMN_NAME = 'CacheMaxSize')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[Query]
    ADD [CacheMaxSize] int NULL;
    
    EXEC sp_addextendedproperty 
        @name = N'MS_Description',
        @value = N'Maximum number of cached result sets for this query. NULL uses default size limit.',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'Query',
        @level2type = N'COLUMN', @level2name = 'CacheMaxSize';
END
GO

-- Add cache configuration columns to QueryCategory table for inheritance
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = '${flyway:defaultSchema}' 
               AND TABLE_NAME = 'QueryCategory' 
               AND COLUMN_NAME = 'DefaultCacheEnabled')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[QueryCategory]
    ADD [DefaultCacheEnabled] bit NOT NULL DEFAULT 0;
    
    EXEC sp_addextendedproperty 
        @name = N'MS_Description',
        @value = N'Default cache setting for queries in this category',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'QueryCategory',
        @level2type = N'COLUMN', @level2name = 'DefaultCacheEnabled';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = '${flyway:defaultSchema}' 
               AND TABLE_NAME = 'QueryCategory' 
               AND COLUMN_NAME = 'DefaultCacheTTLMinutes')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[QueryCategory]
    ADD [DefaultCacheTTLMinutes] int NULL;
    
    EXEC sp_addextendedproperty 
        @name = N'MS_Description',
        @value = N'Default TTL in minutes for cached results of queries in this category',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'QueryCategory',
        @level2type = N'COLUMN', @level2name = 'DefaultCacheTTLMinutes';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = '${flyway:defaultSchema}' 
               AND TABLE_NAME = 'QueryCategory' 
               AND COLUMN_NAME = 'DefaultCacheMaxSize')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[QueryCategory]
    ADD [DefaultCacheMaxSize] int NULL;
    
    EXEC sp_addextendedproperty 
        @name = N'MS_Description',
        @value = N'Default maximum cache size for queries in this category',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'QueryCategory',
        @level2type = N'COLUMN', @level2name = 'DefaultCacheMaxSize';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = '${flyway:defaultSchema}' 
               AND TABLE_NAME = 'QueryCategory' 
               AND COLUMN_NAME = 'CacheInheritanceEnabled')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[QueryCategory]
    ADD [CacheInheritanceEnabled] bit NOT NULL DEFAULT 1;
    
    EXEC sp_addextendedproperty 
        @name = N'MS_Description',
        @value = N'When true, queries without cache config will inherit from this category',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'QueryCategory',
        @level2type = N'COLUMN', @level2name = 'CacheInheritanceEnabled';
END
GO

/******* CODEGEN OUTPUT *********/

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5b951665-6860-4991-a09d-7c5f453876d7'  OR 
               (EntityID = '1A248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultCacheEnabled')
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
            '5b951665-6860-4991-a09d-7c5f453876d7',
            '1A248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Query Categories
            100008,
            'DefaultCacheEnabled',
            'Default Cache Enabled',
            'Default cache setting for queries in this category',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
         WHERE ID = '9d8fba63-0684-457f-b882-3aa2cd7d2a9a'  OR 
               (EntityID = '1A248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultCacheTTLMinutes')
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
            '9d8fba63-0684-457f-b882-3aa2cd7d2a9a',
            '1A248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Query Categories
            100009,
            'DefaultCacheTTLMinutes',
            'Default Cache TTL Minutes',
            'Default TTL in minutes for cached results of queries in this category',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7496bb09-2fd5-41d8-97c9-5eb3d28771d7'  OR 
               (EntityID = '1A248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultCacheMaxSize')
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
            '7496bb09-2fd5-41d8-97c9-5eb3d28771d7',
            '1A248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Query Categories
            100010,
            'DefaultCacheMaxSize',
            'Default Cache Max Size',
            'Default maximum cache size for queries in this category',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4abe9866-f7e4-45aa-889b-5f7e6ceb263d'  OR 
               (EntityID = '1A248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CacheInheritanceEnabled')
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
            '4abe9866-f7e4-45aa-889b-5f7e6ceb263d',
            '1A248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Query Categories
            100011,
            'CacheInheritanceEnabled',
            'Cache Inheritance Enabled',
            'When true, queries without cache config will inherit from this category',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
         WHERE ID = '1ca275f3-757f-4d4d-8ee3-2443393cd676'  OR 
               (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AuditQueryRuns')
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
            '1ca275f3-757f-4d4d-8ee3-2443393cd676',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Queries
            100016,
            'AuditQueryRuns',
            'Audit Query Runs',
            'When true, all executions of this query will be logged to the Audit Log system for tracking and compliance',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
         WHERE ID = 'f075db33-92e3-45d9-86bb-08711205829d'  OR 
               (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CacheEnabled')
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
            'f075db33-92e3-45d9-86bb-08711205829d',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Queries
            100017,
            'CacheEnabled',
            'Cache Enabled',
            'When true, query results will be cached in memory with TTL expiration',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
         WHERE ID = '0420ac10-6902-484b-b976-1c51573edf4c'  OR 
               (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CacheTTLMinutes')
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
            '0420ac10-6902-484b-b976-1c51573edf4c',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Queries
            100018,
            'CacheTTLMinutes',
            'Cache TTL Minutes',
            'Time-to-live in minutes for cached query results. NULL uses default TTL.',
            'int',
            4,
            10,
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
         WHERE ID = '89288495-3472-436f-860d-aee7f746cff9'  OR 
               (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CacheMaxSize')
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
            '89288495-3472-436f-860d-aee7f746cff9',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Queries
            100019,
            'CacheMaxSize',
            'Cache Max Size',
            'Maximum number of cached result sets for this query. NULL uses default size limit.',
            'int',
            4,
            10,
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

/* SQL text to delete entity field value ID F0B1433E-F36B-1410-8D7E-00A3FCABC804 */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='F0B1433E-F36B-1410-8D7E-00A3FCABC804'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='3AB3433E-F36B-1410-8D7E-00A3FCABC804'

/* SQL text to delete entity field value ID FAB1433E-F36B-1410-8D7E-00A3FCABC804 */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='FAB1433E-F36B-1410-8D7E-00A3FCABC804'

/* Index for Foreign Keys for QueryCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table QueryCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryCategory_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryCategory_ParentID ON [${flyway:defaultSchema}].[QueryCategory] ([ParentID]);

-- Index for foreign key UserID in table QueryCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryCategory_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryCategory_UserID ON [${flyway:defaultSchema}].[QueryCategory] ([UserID]);

/* Index for Foreign Keys for Query */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
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

/* Base View SQL for Query Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Categories
-- Item: vwQueryCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Query Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueryCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwQueryCategories]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueryCategories]
AS
SELECT
    q.*,
    QueryCategory_ParentID.[Name] AS [Parent],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[QueryCategory] AS q
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[QueryCategory] AS QueryCategory_ParentID
  ON
    [q].[ParentID] = QueryCategory_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [q].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryCategories] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for Query Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Categories
-- Item: Permissions for vwQueryCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryCategories] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Query Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Categories
-- Item: spCreateQueryCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateQueryCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueryCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @DefaultCacheEnabled bit,
    @DefaultCacheTTLMinutes int,
    @DefaultCacheMaxSize int,
    @CacheInheritanceEnabled bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueryCategory]
            (
                [ID],
                [Name],
                [ParentID],
                [Description],
                [UserID],
                [DefaultCacheEnabled],
                [DefaultCacheTTLMinutes],
                [DefaultCacheMaxSize],
                [CacheInheritanceEnabled]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ParentID,
                @Description,
                @UserID,
                @DefaultCacheEnabled,
                @DefaultCacheTTLMinutes,
                @DefaultCacheMaxSize,
                @CacheInheritanceEnabled
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueryCategory]
            (
                [Name],
                [ParentID],
                [Description],
                [UserID],
                [DefaultCacheEnabled],
                [DefaultCacheTTLMinutes],
                [DefaultCacheMaxSize],
                [CacheInheritanceEnabled]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ParentID,
                @Description,
                @UserID,
                @DefaultCacheEnabled,
                @DefaultCacheTTLMinutes,
                @DefaultCacheMaxSize,
                @CacheInheritanceEnabled
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueryCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryCategory] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Query Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryCategory] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Query Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Categories
-- Item: spUpdateQueryCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateQueryCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryCategory]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @DefaultCacheEnabled bit,
    @DefaultCacheTTLMinutes int,
    @DefaultCacheMaxSize int,
    @CacheInheritanceEnabled bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryCategory]
    SET
        [Name] = @Name,
        [ParentID] = @ParentID,
        [Description] = @Description,
        [UserID] = @UserID,
        [DefaultCacheEnabled] = @DefaultCacheEnabled,
        [DefaultCacheTTLMinutes] = @DefaultCacheTTLMinutes,
        [DefaultCacheMaxSize] = @DefaultCacheMaxSize,
        [CacheInheritanceEnabled] = @CacheInheritanceEnabled
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueryCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueryCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryCategory] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryCategory table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateQueryCategory
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueryCategory
ON [${flyway:defaultSchema}].[QueryCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueryCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Query Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryCategory] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete Permissions for Query Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryCategory] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* Base View SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Queries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwQueries]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueries]
AS
SELECT
    q.*,
    QueryCategory_CategoryID.[Name] AS [Category]
FROM
    [${flyway:defaultSchema}].[Query] AS q
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[QueryCategory] AS QueryCategory_CategoryID
  ON
    [q].[CategoryID] = QueryCategory_CategoryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: Permissions for vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: spCreateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Query
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateQuery]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQuery]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int,
    @ExecutionCostRank int,
    @UsesTemplate bit,
    @AuditQueryRuns bit,
    @CacheEnabled bit,
    @CacheTTLMinutes int,
    @CacheMaxSize int
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
                [CacheMaxSize]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @CategoryID,
                @UserQuestion,
                @Description,
                @SQL,
                @TechnicalDescription,
                @OriginalSQL,
                @Feedback,
                @Status,
                @QualityRank,
                @ExecutionCostRank,
                @UsesTemplate,
                @AuditQueryRuns,
                @CacheEnabled,
                @CacheTTLMinutes,
                @CacheMaxSize
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
                [CacheMaxSize]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @CategoryID,
                @UserQuestion,
                @Description,
                @SQL,
                @TechnicalDescription,
                @OriginalSQL,
                @Feedback,
                @Status,
                @QualityRank,
                @ExecutionCostRank,
                @UsesTemplate,
                @AuditQueryRuns,
                @CacheEnabled,
                @CacheTTLMinutes,
                @CacheMaxSize
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Queries
-- Item: spUpdateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Query
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateQuery]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int,
    @ExecutionCostRank int,
    @UsesTemplate bit,
    @AuditQueryRuns bit,
    @CacheEnabled bit,
    @CacheTTLMinutes int,
    @CacheMaxSize int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        [Name] = @Name,
        [CategoryID] = @CategoryID,
        [UserQuestion] = @UserQuestion,
        [Description] = @Description,
        [SQL] = @SQL,
        [TechnicalDescription] = @TechnicalDescription,
        [OriginalSQL] = @OriginalSQL,
        [Feedback] = @Feedback,
        [Status] = @Status,
        [QualityRank] = @QualityRank,
        [ExecutionCostRank] = @ExecutionCostRank,
        [UsesTemplate] = @UsesTemplate,
        [AuditQueryRuns] = @AuditQueryRuns,
        [CacheEnabled] = @CacheEnabled,
        [CacheTTLMinutes] = @CacheTTLMinutes,
        [CacheMaxSize] = @CacheMaxSize
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateQuery
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
        

/* spUpdate Permissions for Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]



/* spDelete Permissions for Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 4CAD433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4CAD433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID A2AD433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A2AD433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 5CAD433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5CAD433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID A3AD433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A3AD433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 60AD433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='60AD433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID F0AA433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F0AA433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 2FAB433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2FAB433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 60AB433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='60AB433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 36AB433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='36AB433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 3DAB433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3DAB433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID F3AB433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F3AB433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 71AC433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='71AC433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID C5AC433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C5AC433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID EFAC433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EFAC433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 86AC433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='86AC433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 8DAC433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8DAC433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 94AC433E-F36B-1410-8D7E-00A3FCABC804 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='94AC433E-F36B-1410-8D7E-00A3FCABC804',
         @RelatedEntityNameFieldMap='ContentFileType'
