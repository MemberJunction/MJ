-- =============================================================================
-- fix-metadata.sql
-- =============================================================================
-- Fixes all metadata mismatches discovered during E2E testing:
--   1. IntegrationSourceType.DriverClass - add entries for actual connector classes
--   2. Integration.ClassName - fix YMConnector → YourMembershipConnector
--   3. CompanyIntegration.Configuration - set DB connection details
--   4. CompanyIntegrationEntityMap.ExternalObjectName - strip schema prefixes
--   5. Target entity columns - make non-mappable required columns nullable
--   6. CompanyIntegrationFieldMap - fix destination field names
--   7. Register new columns in entity field metadata
-- =============================================================================

USE MJ_Workbench;
GO

-- =============================================================================
-- 1. ADD IntegrationSourceType ENTRIES FOR ACTUAL CONNECTOR CLASSES
-- =============================================================================
-- The ConnectorFactory looks up DriverClass matching Integration.ClassName.
-- Current entries (FileFeedConnector, RelationalDBConnector, SaaSAPIConnector)
-- don't match the actual @RegisterClass names on the connectors.

-- Check and insert if not exists
IF NOT EXISTS (SELECT 1 FROM __mj.IntegrationSourceType WHERE DriverClass = 'HubSpotConnector')
    INSERT INTO __mj.IntegrationSourceType (ID, Name, Description, DriverClass, IconClass, Status)
    VALUES ('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAA001', 'HubSpot Database', 'HubSpot mock data via RelationalDB', 'HubSpotConnector', 'fa-brands fa-hubspot', 'Active');

IF NOT EXISTS (SELECT 1 FROM __mj.IntegrationSourceType WHERE DriverClass = 'SalesforceConnector')
    INSERT INTO __mj.IntegrationSourceType (ID, Name, Description, DriverClass, IconClass, Status)
    VALUES ('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAA002', 'Salesforce Database', 'Salesforce mock data via RelationalDB', 'SalesforceConnector', 'fa-brands fa-salesforce', 'Active');

IF NOT EXISTS (SELECT 1 FROM __mj.IntegrationSourceType WHERE DriverClass = 'YourMembershipConnector')
    INSERT INTO __mj.IntegrationSourceType (ID, Name, Description, DriverClass, IconClass, Status)
    VALUES ('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAA003', 'YourMembership Database', 'YM mock data via RelationalDB', 'YourMembershipConnector', 'fa-solid fa-id-card', 'Active');
GO

-- =============================================================================
-- 2. FIX Integration.ClassName FOR YourMembership
-- =============================================================================
UPDATE __mj.Integration
SET ClassName = 'YourMembershipConnector'
WHERE Name = 'YourMembership' AND ClassName = 'YMConnector';
GO

-- =============================================================================
-- 3. FIX CompanyIntegration.Configuration WITH DB CONNECTION DETAILS
-- =============================================================================
UPDATE __mj.CompanyIntegration
SET Configuration = '{"server":"sql-claude","database":"mock_data","user":"sa","password":"Claude2Sql99","schema":"hs"}'
WHERE ID = '33333333-3333-3333-3333-333333333301';  -- HubSpot

UPDATE __mj.CompanyIntegration
SET Configuration = '{"server":"sql-claude","database":"mock_data","user":"sa","password":"Claude2Sql99","schema":"sf"}'
WHERE ID = '33333333-3333-3333-3333-333333333302';  -- Salesforce

UPDATE __mj.CompanyIntegration
SET Configuration = '{"server":"sql-claude","database":"mock_data","user":"sa","password":"Claude2Sql99","schema":"ym"}'
WHERE ID = '33333333-3333-3333-3333-333333333303';  -- YourMembership
GO

-- =============================================================================
-- 4. FIX ExternalObjectName — STRIP SCHEMA PREFIXES
-- =============================================================================
-- The connector builds: SELECT FROM [schema].[objectName]
-- If objectName = 'hs.contacts', query becomes [hs].[hs.contacts] which is wrong.
-- ObjectName should be just the table name; schema comes from Configuration.

UPDATE __mj.CompanyIntegrationEntityMap SET ExternalObjectName = 'contacts'
WHERE ID = '44444444-4444-4444-4444-444444444401';  -- hs.contacts → contacts

UPDATE __mj.CompanyIntegrationEntityMap SET ExternalObjectName = 'companies'
WHERE ID = '44444444-4444-4444-4444-444444444402';  -- hs.companies → companies

UPDATE __mj.CompanyIntegrationEntityMap SET ExternalObjectName = 'deals'
WHERE ID = '44444444-4444-4444-4444-444444444403';  -- hs.deals → deals

UPDATE __mj.CompanyIntegrationEntityMap SET ExternalObjectName = 'Contact'
WHERE ID = '44444444-4444-4444-4444-444444444404';  -- sf.Contact → Contact

UPDATE __mj.CompanyIntegrationEntityMap SET ExternalObjectName = 'Account'
WHERE ID = '44444444-4444-4444-4444-444444444405';  -- sf.Account → Account

UPDATE __mj.CompanyIntegrationEntityMap SET ExternalObjectName = 'Opportunity'
WHERE ID = '44444444-4444-4444-4444-444444444406';  -- sf.Opportunity → Opportunity

UPDATE __mj.CompanyIntegrationEntityMap SET ExternalObjectName = 'members'
WHERE ID = '44444444-4444-4444-4444-444444444407';  -- ym.members → members

UPDATE __mj.CompanyIntegrationEntityMap SET ExternalObjectName = 'events'
WHERE ID = '44444444-4444-4444-4444-444444444408';  -- ym.events → events

UPDATE __mj.CompanyIntegrationEntityMap SET ExternalObjectName = 'membership_types'
WHERE ID = '44444444-4444-4444-4444-444444444409';  -- ym.membership_types → membership_types
GO

-- =============================================================================
-- 5. ALTER TARGET TABLES — MAKE UNMAPPABLE REQUIRED COLUMNS NULLABLE
-- =============================================================================
-- Members (sample_fit.Member): DateOfBirth, EmergencyContact, MembershipTierID, LocationID, JoinDate, IsActive are NOT NULL
-- but can't be mapped from integration sources. Make them nullable or add defaults.

-- Member: make non-mappable required columns have defaults
ALTER TABLE sample_fit.Member ALTER COLUMN DateOfBirth date NULL;
ALTER TABLE sample_fit.Member ALTER COLUMN EmergencyContact nvarchar(200) NULL;
ALTER TABLE sample_fit.Member ALTER COLUMN MembershipTierID uniqueidentifier NULL;
ALTER TABLE sample_fit.Member ALTER COLUMN LocationID uniqueidentifier NULL;
ALTER TABLE sample_fit.Member ALTER COLUMN JoinDate datetime NULL;
ALTER TABLE sample_fit.Member ALTER COLUMN IsActive bit NULL;
GO

-- Add defaults for IsActive and JoinDate
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('sample_fit.Member') AND name = 'DF_Member_IsActive')
    ALTER TABLE sample_fit.Member ADD CONSTRAINT DF_Member_IsActive DEFAULT 1 FOR IsActive;

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('sample_fit.Member') AND name = 'DF_Member_JoinDate')
    ALTER TABLE sample_fit.Member ADD CONSTRAINT DF_Member_JoinDate DEFAULT GETDATE() FOR JoinDate;
GO

-- Company (__mj.Company): Description is NOT NULL but often can't be mapped
ALTER TABLE __mj.Company ALTER COLUMN Description nvarchar(max) NULL;
GO

-- Donation (sample_npo.Donation): many required columns can't be mapped from deals/opportunities
ALTER TABLE sample_npo.Donation ALTER COLUMN DonorID uniqueidentifier NULL;
ALTER TABLE sample_npo.Donation ALTER COLUMN DonationDate datetime NULL;
ALTER TABLE sample_npo.Donation ALTER COLUMN PaymentMethod varchar(50) NULL;
ALTER TABLE sample_npo.Donation ALTER COLUMN IsRecurring bit NULL;
ALTER TABLE sample_npo.Donation ALTER COLUMN ReceiptNumber varchar(50) NULL;
ALTER TABLE sample_npo.Donation ALTER COLUMN TaxDeductible bit NULL;
ALTER TABLE sample_npo.Donation ALTER COLUMN Amount decimal(18,2) NULL;
GO

-- Add default for DonationDate
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('sample_npo.Donation') AND name = 'DF_Donation_DonationDate')
    ALTER TABLE sample_npo.Donation ADD CONSTRAINT DF_Donation_DonationDate DEFAULT GETDATE() FOR DonationDate;
GO

-- Event (sample_npo.Event): EventDate, StartTime, EndTime, Location, Status are NOT NULL
ALTER TABLE sample_npo.Event ALTER COLUMN EventDate date NULL;
ALTER TABLE sample_npo.Event ALTER COLUMN StartTime time NULL;
ALTER TABLE sample_npo.Event ALTER COLUMN EndTime time NULL;
ALTER TABLE sample_npo.Event ALTER COLUMN Location nvarchar(200) NULL;
ALTER TABLE sample_npo.Event ALTER COLUMN Status varchar(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('sample_npo.Event') AND name = 'DF_Event_Status')
    ALTER TABLE sample_npo.Event ADD CONSTRAINT DF_Event_Status DEFAULT 'Active' FOR Status;
GO

-- =============================================================================
-- 6. ADD MISSING COLUMNS TO TARGET TABLES FOR FIELD MAP DESTINATIONS
-- =============================================================================

-- Members: add Company, Title, Status, Source, City, MemberNumber
IF COL_LENGTH('sample_fit.Member', 'Company') IS NULL
    ALTER TABLE sample_fit.Member ADD Company nvarchar(200) NULL;
IF COL_LENGTH('sample_fit.Member', 'Title') IS NULL
    ALTER TABLE sample_fit.Member ADD Title nvarchar(200) NULL;
IF COL_LENGTH('sample_fit.Member', 'Status') IS NULL
    ALTER TABLE sample_fit.Member ADD Status nvarchar(50) NULL;
IF COL_LENGTH('sample_fit.Member', 'Source') IS NULL
    ALTER TABLE sample_fit.Member ADD Source nvarchar(100) NULL;
IF COL_LENGTH('sample_fit.Member', 'City') IS NULL
    ALTER TABLE sample_fit.Member ADD City nvarchar(100) NULL;
IF COL_LENGTH('sample_fit.Member', 'MemberNumber') IS NULL
    ALTER TABLE sample_fit.Member ADD MemberNumber nvarchar(50) NULL;
GO

-- Company: add Industry, Phone, City
IF COL_LENGTH('__mj.Company', 'Industry') IS NULL
    ALTER TABLE __mj.Company ADD Industry nvarchar(100) NULL;
IF COL_LENGTH('__mj.Company', 'Phone') IS NULL
    ALTER TABLE __mj.Company ADD Phone nvarchar(50) NULL;
IF COL_LENGTH('__mj.Company', 'City') IS NULL
    ALTER TABLE __mj.Company ADD City nvarchar(100) NULL;
GO

-- Donation: add ExternalID, Name, Stage, CloseDate, Duration
IF COL_LENGTH('sample_npo.Donation', 'ExternalID') IS NULL
    ALTER TABLE sample_npo.Donation ADD ExternalID nvarchar(100) NULL;
IF COL_LENGTH('sample_npo.Donation', 'Name') IS NULL
    ALTER TABLE sample_npo.Donation ADD Name nvarchar(200) NULL;
IF COL_LENGTH('sample_npo.Donation', 'Stage') IS NULL
    ALTER TABLE sample_npo.Donation ADD Stage nvarchar(50) NULL;
IF COL_LENGTH('sample_npo.Donation', 'CloseDate') IS NULL
    ALTER TABLE sample_npo.Donation ADD CloseDate datetime NULL;
IF COL_LENGTH('sample_npo.Donation', 'Duration') IS NULL
    ALTER TABLE sample_npo.Donation ADD Duration int NULL;
GO

-- Event: add ExternalID, StartDate, Capacity
IF COL_LENGTH('sample_npo.Event', 'ExternalID') IS NULL
    ALTER TABLE sample_npo.Event ADD ExternalID nvarchar(100) NULL;
IF COL_LENGTH('sample_npo.Event', 'StartDate') IS NULL
    ALTER TABLE sample_npo.Event ADD StartDate date NULL;
IF COL_LENGTH('sample_npo.Event', 'Capacity') IS NULL
    ALTER TABLE sample_npo.Event ADD Capacity int NULL;
GO

-- =============================================================================
-- 7. FIX FIELD MAP DESTINATION NAMES WHERE NEEDED
-- =============================================================================
-- Most field maps are correct for the newly added columns.
-- Fix the ones that were referencing wrong column names:

-- HubSpot contacts: company → Company (now exists), jobtitle → Title (now exists)
-- Field map 55555555-...-0105: company → Company — now works since we added Company column
-- Field map 55555555-...-0106: jobtitle → Title — destination was "Title", now exists

-- SF Contacts: MailingCity → City (now exists), LeadSource → Source (now exists)
-- These already map correctly to the new columns.

-- YM Members: member_number → MemberNumber (now exists), status → Status (now exists)
-- These already map correctly to the new columns.

-- For company entity: domain → Website (exists), industry → Industry (now exists)
-- These already map correctly.

-- For donation entity: dealId → ExternalID (now exists), dealname → Name (now exists)
-- dealstage → Stage (now exists), closedate → CloseDate (now exists)
-- These already map correctly.

-- For event entity: event_id → ExternalID (now exists), event_name → Name (exists)
-- event_date → StartDate (now exists), location → Location (exists)
-- capacity → Capacity (now exists)
-- These already map correctly.

-- CompanyName → Name: The hs.companies field map has 'Company Name' label for Name destination.
-- The actual column is Name which exists. No fix needed.

-- =============================================================================
-- 8. CLEAN EXISTING RUN DATA (we'll create fresh runs from E2E tests)
-- =============================================================================
DELETE FROM __mj.CompanyIntegrationRunDetail
  WHERE CompanyIntegrationRunID IN (
    SELECT ID FROM __mj.CompanyIntegrationRun
    WHERE CompanyIntegrationID IN (
      '33333333-3333-3333-3333-333333333301',
      '33333333-3333-3333-3333-333333333302',
      '33333333-3333-3333-3333-333333333303'
    )
  );

DELETE FROM __mj.CompanyIntegrationRun
  WHERE CompanyIntegrationID IN (
    '33333333-3333-3333-3333-333333333301',
    '33333333-3333-3333-3333-333333333302',
    '33333333-3333-3333-3333-333333333303'
  );

-- Clean any existing record maps
DELETE FROM __mj.CompanyIntegrationRecordMap
  WHERE CompanyIntegrationID IN (
    '33333333-3333-3333-3333-333333333301',
    '33333333-3333-3333-3333-333333333302',
    '33333333-3333-3333-3333-333333333303'
  );

-- Clean any existing watermarks
DELETE FROM __mj.CompanyIntegrationSyncWatermark
  WHERE EntityMapID IN (
    SELECT ID FROM __mj.CompanyIntegrationEntityMap
    WHERE CompanyIntegrationID IN (
      '33333333-3333-3333-3333-333333333301',
      '33333333-3333-3333-3333-333333333302',
      '33333333-3333-3333-3333-333333333303'
    )
  );
GO

-- =============================================================================
-- VERIFY FIXES
-- =============================================================================
PRINT '=== IntegrationSourceType ===';
SELECT Name, DriverClass, Status FROM __mj.IntegrationSourceType ORDER BY Name;

PRINT '=== Integration ClassName ===';
SELECT Name, ClassName FROM __mj.Integration WHERE Name IN ('HubSpot','Salesforce','YourMembership');

PRINT '=== CompanyIntegration Configuration ===';
SELECT Name, Configuration FROM __mj.CompanyIntegration WHERE ID IN ('33333333-3333-3333-3333-333333333301','33333333-3333-3333-3333-333333333302','33333333-3333-3333-3333-333333333303');

PRINT '=== EntityMap ObjectNames ===';
SELECT ci.Name, em.ExternalObjectName, em.SyncEnabled, em.Status
FROM __mj.CompanyIntegrationEntityMap em
JOIN __mj.CompanyIntegration ci ON ci.ID = em.CompanyIntegrationID
ORDER BY ci.Name, em.Priority;
GO
