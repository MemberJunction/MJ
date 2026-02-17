-- Add PlatformVariants JSON columns to support multi-database SQL variants.
-- These columns store platform-specific SQL alternatives (e.g., PostgreSQL variants)
-- for entities that contain SQL fragments.
--
-- The JSON structure follows the PlatformVariantsJSON interface:
-- {
--   "SQL": { "postgresql": "..." },
--   "CacheValidationSQL": { "postgresql": "..." },
--   "FilterText": { "postgresql": "..." },
--   "_meta": { "translatedBy": "llm", "sourceDialect": "sqlserver" }
-- }

-- Query entity: stores alternative SQL and CacheValidationSQL for other platforms
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = '${flyway:defaultSchema}'
      AND TABLE_NAME = 'Query'
      AND COLUMN_NAME = 'PlatformVariants'
)
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.[Query]
    ADD PlatformVariants NVARCHAR(MAX) NULL;
END
GO

-- UserView entity: stores alternative WhereClause and OrderBy for other platforms
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = '${flyway:defaultSchema}'
      AND TABLE_NAME = 'UserView'
      AND COLUMN_NAME = 'PlatformVariants'
)
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.[UserView]
    ADD PlatformVariants NVARCHAR(MAX) NULL;
END
GO

-- RowLevelSecurityFilter entity: stores alternative FilterText for other platforms
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = '${flyway:defaultSchema}'
      AND TABLE_NAME = 'RowLevelSecurityFilter'
      AND COLUMN_NAME = 'PlatformVariants'
)
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.[RowLevelSecurityFilter]
    ADD PlatformVariants NVARCHAR(MAX) NULL;
END
GO
