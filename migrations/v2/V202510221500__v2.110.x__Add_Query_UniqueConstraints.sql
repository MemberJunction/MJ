/*
   Migration: Add unique constraints to Query and QueryCategory tables
   Purpose: Prevent duplicate categories and queries during concurrent creation
   Version: v2.110.x
   Date: 2025-01-22

   This migration will fail if duplicates exist - the DBA must clean them up first.
*/

-- ============================================================================
-- Query Categories: Unique constraint on (Name, ParentID)
-- ============================================================================

-- Unique constraint for categories with non-NULL parents
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_QueryCategory_Name_ParentID'
    AND object_id = OBJECT_ID('${flyway:defaultSchema}.QueryCategory')
)
BEGIN
    CREATE UNIQUE INDEX UX_QueryCategory_Name_ParentID
    ON ${flyway:defaultSchema}.QueryCategory(Name, ParentID)
    WHERE ParentID IS NOT NULL;
END;

-- Unique constraint for root-level categories (NULL parent)
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_QueryCategory_Name_NullParent'
    AND object_id = OBJECT_ID('${flyway:defaultSchema}.QueryCategory')
)
BEGIN
    CREATE UNIQUE INDEX UX_QueryCategory_Name_NullParent
    ON ${flyway:defaultSchema}.QueryCategory(Name)
    WHERE ParentID IS NULL;
END;

-- ============================================================================
-- Queries: Unique constraint on (Name, CategoryID)
-- ============================================================================

-- Unique constraint for queries with non-NULL categories
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_Query_Name_CategoryID'
    AND object_id = OBJECT_ID('${flyway:defaultSchema}.Query')
)
BEGIN
    CREATE UNIQUE INDEX UX_Query_Name_CategoryID
    ON ${flyway:defaultSchema}.Query(Name, CategoryID)
    WHERE CategoryID IS NOT NULL;
END;

-- Unique constraint for queries without a category (NULL CategoryID)
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_Query_Name_NullCategory'
    AND object_id = OBJECT_ID('${flyway:defaultSchema}.Query')
)
BEGIN
    CREATE UNIQUE INDEX UX_Query_Name_NullCategory
    ON ${flyway:defaultSchema}.Query(Name)
    WHERE CategoryID IS NULL;
END;
