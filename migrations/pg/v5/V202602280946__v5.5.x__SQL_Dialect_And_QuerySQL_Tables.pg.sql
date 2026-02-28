/**************************************************************************************************
 * Migration: SQL Dialect and Query SQL Tables
 *
 * Purpose: Add multi-dialect SQL support for the Query system. Queries can now store
 * dialect-specific SQL variants (e.g., T-SQL, PostgreSQL) so the correct SQL is executed
 * at runtime based on the active database platform.
 *
 * Entities created:
 *   1. MJ: SQL Dialects - Lookup table for SQL language dialects
 *   2. MJ: Query SQLs - Dialect-specific SQL for each query
 *
 * Entity modified:
 *   1. MJ: Queries - Added SQLDialectID column (defaults to T-SQL dialect)
 *
 * Version: 5.5.x
 **************************************************************************************************/

-- ============================================================================
-- 1. SQLDialect (MJ: SQL Dialects)
-- ============================================================================
CREATE TABLE __mj."SQLDialect" (
    "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "Name" VARCHAR(100) NOT NULL,
    "PlatformKey" VARCHAR(50) NOT NULL,
    "DatabaseName" VARCHAR(100) NOT NULL,
    "LanguageName" VARCHAR(100) NOT NULL,
    "VendorName" VARCHAR(200) NULL,
    "WebURL" VARCHAR(500) NULL,
    "Icon" VARCHAR(500) NULL,
    "Description" TEXT NULL,
    CONSTRAINT "PK_SQLDialect" PRIMARY KEY ("ID"),
    CONSTRAINT "UQ_SQLDialect_Name" UNIQUE ("Name"),
    CONSTRAINT "UQ_SQLDialect_PlatformKey" UNIQUE ("PlatformKey")
);

COMMENT ON COLUMN __mj."SQLDialect"."Name" IS 'Unique display name for the SQL dialect (e.g., T-SQL, PostgreSQL)';
COMMENT ON COLUMN __mj."SQLDialect"."PlatformKey" IS 'Lowercase identifier matching DatabasePlatform type in code (e.g., sqlserver, postgresql). Used by providers to find their dialect at runtime.';
COMMENT ON COLUMN __mj."SQLDialect"."DatabaseName" IS 'Name of the database engine (e.g., SQL Server, PostgreSQL, MySQL)';
COMMENT ON COLUMN __mj."SQLDialect"."LanguageName" IS 'Name of the SQL language variant (e.g., T-SQL, PL/pgSQL, SQL/PSM)';
COMMENT ON COLUMN __mj."SQLDialect"."VendorName" IS 'Primary vendor or organization behind this database (e.g., Microsoft, PostgreSQL Global Development Group)';
COMMENT ON COLUMN __mj."SQLDialect"."WebURL" IS 'URL to the database vendor or documentation website';
COMMENT ON COLUMN __mj."SQLDialect"."Icon" IS 'CSS class or icon reference for UI display';
COMMENT ON COLUMN __mj."SQLDialect"."Description" IS 'Detailed description of this SQL dialect and its characteristics';

-- ============================================================================
-- 2. Seed SQLDialect rows
-- ============================================================================
INSERT INTO __mj."SQLDialect" ("ID", "Name", "PlatformKey", "DatabaseName", "LanguageName", "VendorName", "WebURL", "Icon", "Description")
VALUES
    ('1F203987-A37B-4BC1-85B3-BA50DC33C3E0', 'T-SQL', 'sqlserver', 'SQL Server', 'T-SQL', 'Microsoft', 'https://learn.microsoft.com/en-us/sql/', 'fa-brands fa-microsoft', 'Transact-SQL dialect used by Microsoft SQL Server and Azure SQL Database'),
    ('426915F2-D4FE-4AB9-97A8-39063561DE9F', 'PostgreSQL', 'postgresql', 'PostgreSQL', 'PL/pgSQL', 'PostgreSQL Global Development Group', 'https://www.postgresql.org/', 'fa-solid fa-database', 'PostgreSQL SQL dialect with PL/pgSQL procedural extensions');

-- ============================================================================
-- 3. QuerySQL (MJ: Query SQLs)
-- ============================================================================
CREATE TABLE __mj."QuerySQL" (
    "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "QueryID" UUID NOT NULL,
    "SQLDialectID" UUID NOT NULL,
    "SQL" TEXT NOT NULL,
    CONSTRAINT "PK_QuerySQL" PRIMARY KEY ("ID"),
    CONSTRAINT "FK_QuerySQL_Query" FOREIGN KEY ("QueryID")
        REFERENCES __mj."Query"("ID"),
    CONSTRAINT "FK_QuerySQL_SQLDialect" FOREIGN KEY ("SQLDialectID")
        REFERENCES __mj."SQLDialect"("ID"),
    CONSTRAINT "UQ_QuerySQL_Query_Dialect" UNIQUE ("QueryID", "SQLDialectID")
);

COMMENT ON COLUMN __mj."QuerySQL"."QueryID" IS 'Foreign key to the query this SQL variant belongs to';
COMMENT ON COLUMN __mj."QuerySQL"."SQLDialectID" IS 'Foreign key to the SQL dialect this SQL is written in';
COMMENT ON COLUMN __mj."QuerySQL"."SQL" IS 'The SQL query text in the specified dialect. May include Nunjucks template parameters.';

-- ============================================================================
-- 4. Add SQLDialectID to Query table (defaults to T-SQL)
-- ============================================================================
ALTER TABLE __mj."Query"
ADD COLUMN "SQLDialectID" UUID NULL
    CONSTRAINT "FK_Query_SQLDialect" REFERENCES __mj."SQLDialect"("ID");

-- Set existing queries to T-SQL dialect
UPDATE __mj."Query"
SET "SQLDialectID" = '1F203987-A37B-4BC1-85B3-BA50DC33C3E0';

-- Now make it NOT NULL with a default
ALTER TABLE __mj."Query"
ALTER COLUMN "SQLDialectID" SET NOT NULL;

ALTER TABLE __mj."Query"
ALTER COLUMN "SQLDialectID" SET DEFAULT '1F203987-A37B-4BC1-85B3-BA50DC33C3E0';

COMMENT ON COLUMN __mj."Query"."SQLDialectID" IS 'The SQL dialect that the SQL column is written in. Defaults to T-SQL for backward compatibility.';
