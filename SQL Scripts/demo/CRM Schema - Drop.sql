-- =============================================
-- CRM Schema - Drop All Tables
-- Drops all CRM schema tables in reverse dependency order
-- Run this before re-running CRM Schema 1 and 2
-- =============================================

PRINT 'Dropping all CRM Schema tables in dependency order...';
PRINT '';

-- =============================================
-- Drop tables from CRM Schema 2 first (they depend on Schema 1)
-- =============================================
PRINT 'Dropping CRM Schema Part 2 tables...';

-- Drop Payment table (depends on Invoice)
IF OBJECT_ID('CRM.Payment', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.Payment;
    PRINT '  - Dropped CRM.Payment';
END

-- Drop InvoiceLineItem table (depends on Invoice and Product)
IF OBJECT_ID('CRM.InvoiceLineItem', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.InvoiceLineItem;
    PRINT '  - Dropped CRM.InvoiceLineItem';
END

-- Drop Invoice table (depends on Account and Deal)
IF OBJECT_ID('CRM.Invoice', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.Invoice;
    PRINT '  - Dropped CRM.Invoice';
END

-- Drop DealProduct table (depends on Deal and Product)
IF OBJECT_ID('CRM.DealProduct', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.DealProduct;
    PRINT '  - Dropped CRM.DealProduct';
END

-- Drop Deal table (depends on Account and Contact)
IF OBJECT_ID('CRM.Deal', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.Deal;
    PRINT '  - Dropped CRM.Deal';
END

-- Drop Product table (no dependencies)
IF OBJECT_ID('CRM.Product', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.Product;
    PRINT '  - Dropped CRM.Product';
END

PRINT 'CRM Schema Part 2 tables dropped.';
PRINT '';

-- =============================================
-- Drop tables from CRM Schema 1
-- =============================================
PRINT 'Dropping CRM Schema Part 1 tables...';

-- Drop ContactRelationship table (depends on Contact and RelationshipType)
IF OBJECT_ID('CRM.ContactRelationship', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.ContactRelationship;
    PRINT '  - Dropped CRM.ContactRelationship';
END

-- Drop Activity table (depends on Account, Contact, and ActivityType)
IF OBJECT_ID('CRM.Activity', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.Activity;
    PRINT '  - Dropped CRM.Activity';
END

-- Drop Contact table (depends on Account)
IF OBJECT_ID('CRM.Contact', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.Contact;
    PRINT '  - Dropped CRM.Contact';
END

-- Drop Account table (depends on AccountType and AccountStatus)
IF OBJECT_ID('CRM.Account', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.Account;
    PRINT '  - Dropped CRM.Account';
END

-- Drop lookup/reference tables (no dependencies)
IF OBJECT_ID('CRM.RelationshipType', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.RelationshipType;
    PRINT '  - Dropped CRM.RelationshipType';
END

IF OBJECT_ID('CRM.ActivityType', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.ActivityType;
    PRINT '  - Dropped CRM.ActivityType';
END

IF OBJECT_ID('CRM.AccountStatus', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.AccountStatus;
    PRINT '  - Dropped CRM.AccountStatus';
END

IF OBJECT_ID('CRM.AccountType', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.AccountType;
    PRINT '  - Dropped CRM.AccountType';
END

IF OBJECT_ID('CRM.Industry', 'U') IS NOT NULL
BEGIN
    DROP TABLE CRM.Industry;
    PRINT '  - Dropped CRM.Industry';
END

PRINT 'CRM Schema Part 1 tables dropped.';
PRINT '';

-- =============================================
-- Optionally drop the CRM schema if empty
-- =============================================
BEGIN TRY
    IF EXISTS (SELECT * FROM sys.schemas WHERE name = 'CRM')
    BEGIN
        -- Check if there are any remaining objects in the schema
        IF NOT EXISTS (
            SELECT * FROM sys.objects 
            WHERE schema_id = SCHEMA_ID('CRM')
        )
        BEGIN
            EXEC('DROP SCHEMA CRM');
            PRINT 'CRM Schema dropped.';
        END
        ELSE
        BEGIN
            PRINT 'CRM Schema not dropped - other objects still exist in schema.';
            PRINT 'Remaining objects:';
            SELECT 
                o.type_desc AS ObjectType,
                o.name AS ObjectName
            FROM sys.objects o
            WHERE o.schema_id = SCHEMA_ID('CRM')
            ORDER BY o.type_desc, o.name;
        END
    END
END TRY
BEGIN CATCH
    PRINT 'Could not drop CRM schema: ' + ERROR_MESSAGE();
END CATCH

PRINT '';
PRINT '=============================================';
PRINT 'CRM Schema cleanup complete.';
PRINT '';
PRINT 'You can now run in order:';
PRINT '  1. CRM Schema 1.sql';
PRINT '  2. CRM Schema 2 - Products - Deals - Invoices.sql';
PRINT '=============================================';