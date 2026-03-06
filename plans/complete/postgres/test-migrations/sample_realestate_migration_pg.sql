-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_realestate;
SET search_path TO sample_realestate, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER → BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER→bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

-- ============================================================================
-- TABLES
-- ============================================================================

-- PropertyType lookup table
CREATE TABLE sample_re."PropertyType" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "Description" VARCHAR(500) NULL,
 CONSTRAINT "PK_PropertyType" PRIMARY KEY ("ID")
);

-- Agent table
CREATE TABLE sample_re."Agent" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "LicenseNumber" VARCHAR(30) NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "HireDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "CommissionRate" DECIMAL(5,2) NOT NULL DEFAULT 3.00,
 CONSTRAINT "PK_Agent" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Agent_Email" UNIQUE ("Email"),
 CONSTRAINT "UQ_Agent_License" UNIQUE ("LicenseNumber")
);

-- Property table
CREATE TABLE sample_re."Property" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Address" VARCHAR(300) NOT NULL,
 "City" VARCHAR(100) NOT NULL,
 "State" VARCHAR(2) NOT NULL,
 "ZipCode" VARCHAR(10) NOT NULL,
 "PropertyTypeID" UUID NOT NULL,
 "Bedrooms" SMALLINT NOT NULL,
 "Bathrooms" DECIMAL(3,1) NOT NULL,
 "SquareFeet" INTEGER NOT NULL,
 "LotSizeAcres" DECIMAL(8,3) NULL,
 "YearBuilt" SMALLINT NULL,
 "ListPrice" DECIMAL(12,2) NOT NULL,
 "Description" TEXT NULL,
 "AgentID" UUID NOT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 "ListedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "IsForSale" BOOLEAN NOT NULL DEFAULT TRUE,
 "IsForRent" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT "PK_Property" PRIMARY KEY ("ID"),
 CONSTRAINT "CK_Property_Status" CHECK ("Status" IN ('Active', 'Pending', 'Sold', 'Withdrawn', 'Rented')),
 CONSTRAINT "CK_Property_Bedrooms" CHECK ("Bedrooms" >= 0),
 CONSTRAINT "CK_Property_ListPrice" CHECK ("ListPrice" > 0)
);

-- Client table
CREATE TABLE sample_re."Client" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "PreferredContactMethod" VARCHAR(10) NOT NULL DEFAULT 'Email',
 "Budget" DECIMAL(12,2) NULL,
 "Notes" TEXT NULL,
 "AgentID" UUID NOT NULL,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_Client" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Client_Email" UNIQUE ("Email"),
 CONSTRAINT "CK_Client_ContactMethod" CHECK ("PreferredContactMethod" IN ('Email', 'Phone', 'Text'))
);

-- Showing table
CREATE TABLE sample_re."Showing" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PropertyID" UUID NOT NULL,
 "ClientID" UUID NOT NULL,
 "AgentID" UUID NOT NULL,
 "ScheduledAt" TIMESTAMPTZ NOT NULL,
 "DurationMinutes" INTEGER NOT NULL DEFAULT 30,
 "Feedback" TEXT NULL,
 "Rating" SMALLINT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
 CONSTRAINT "PK_Showing" PRIMARY KEY ("ID"),
 CONSTRAINT "CK_Showing_Status" CHECK ("Status" IN ('Scheduled', 'Completed', 'Cancelled', 'NoShow')),
 CONSTRAINT "CK_Showing_Rating" CHECK ("Rating" BETWEEN 1 AND 5)
);

-- Offer table
CREATE TABLE sample_re."Offer" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PropertyID" UUID NOT NULL,
 "ClientID" UUID NOT NULL,
 "OfferAmount" DECIMAL(12,2) NOT NULL,
 "OfferDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "ExpirationDate" TIMESTAMPTZ NOT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
 "CounterOfferAmount" DECIMAL(12,2) NULL,
 "Notes" TEXT NULL,
 "IsAccepted" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT "PK_Offer" PRIMARY KEY ("ID"),
 CONSTRAINT "CK_Offer_Status" CHECK ("Status" IN ('Pending', 'Accepted', 'Rejected', 'Countered', 'Expired'))
);

-- Transaction table (multi-FK: BuyerID->Client, SellerAgentID->Agent, BuyerAgentID->Agent)
CREATE TABLE sample_re."Transaction" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PropertyID" UUID NOT NULL,
 "BuyerID" UUID NOT NULL,
 "SellerAgentID" UUID NOT NULL,
 "BuyerAgentID" UUID NOT NULL,
 "SalePrice" DECIMAL(12,2) NOT NULL,
 "ClosingDate" DATE NOT NULL,
 "CommissionTotal" DECIMAL(10,2) NOT NULL,
 "EscrowCompany" VARCHAR(200) NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'InProgress',
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_Transaction" PRIMARY KEY ("ID"),
 CONSTRAINT "CK_Transaction_Status" CHECK ("Status" IN ('InProgress', 'Closed', 'Cancelled'))
);

-- PropertyImage table
CREATE TABLE sample_re."PropertyImage" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PropertyID" UUID NOT NULL,
 "ImageURL" VARCHAR(500) NOT NULL,
 "Caption" VARCHAR(200) NULL,
 "SortOrder" INTEGER NOT NULL DEFAULT 0,
 "IsPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
 "UploadedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_PropertyImage" PRIMARY KEY ("ID")
);

-- OpenHouse table
CREATE TABLE sample_re."OpenHouse" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PropertyID" UUID NOT NULL,
 "AgentID" UUID NOT NULL,
 "StartTime" TIMESTAMPTZ NOT NULL,
 "EndTime" TIMESTAMPTZ NOT NULL,
 "Description" VARCHAR(500) NULL,
 "MaxAttendees" INTEGER NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "PK_OpenHouse" PRIMARY KEY ("ID")
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sample_re_reader') THEN
        CREATE ROLE sample_re_reader;
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_re."vwActiveListings"
AS SELECT
    p."ID",
    p."Address",
    p."City",
    p."State",
    p."ZipCode",
    pt."Name" AS "PropertyTypeName",
    p."Bedrooms",
    p."Bathrooms",
    p."SquareFeet",
    p."LotSizeAcres",
    p."YearBuilt",
    p."ListPrice",
    p."Status",
    p."IsForSale",
    p."IsForRent",
    p."ListedAt",
    a."FirstName" || ' ' || a."LastName" AS "AgentName",
    a."Email" AS "AgentEmail",
    a."Phone" AS "AgentPhone",
    (SELECT COUNT(*) FROM sample_re."PropertyImage" pi WHERE pi."PropertyID" = p."ID") AS "ImageCount"
FROM sample_re."Property" p
INNER JOIN sample_re."PropertyType" pt ON p."PropertyTypeID" = pt."ID"
INNER JOIN sample_re."Agent" a ON p."AgentID" = a."ID"
WHERE p."Status" = 'Active';

CREATE OR REPLACE VIEW sample_re."vwAgentPerformance"
AS SELECT
    a."ID",
    a."FirstName",
    a."LastName",
    a."Email",
    a."CommissionRate",
    a."HireDate",
    (SELECT COUNT(*) FROM sample_re."Property" p WHERE p."AgentID" = a."ID") AS "ListingCount",
    (SELECT COUNT(*) FROM sample_re."Transaction" t WHERE t."SellerAgentID" = a."ID" OR t."BuyerAgentID" = a."ID") AS "TransactionCount",
    (SELECT COALESCE(SUM(t."CommissionTotal"), 0) FROM sample_re."Transaction" t WHERE t."SellerAgentID" = a."ID" OR t."BuyerAgentID" = a."ID") AS "TotalCommissions",
    (SELECT COUNT(*) FROM sample_re."Showing" s WHERE s."AgentID" = a."ID") AS "ShowingCount"
FROM sample_re."Agent" a;

CREATE OR REPLACE VIEW sample_re."vwPropertyShowings"
AS SELECT
    p."ID",
    p."Address",
    p."City",
    p."State",
    p."ListPrice",
    p."Status",
    pt."Name" AS "PropertyTypeName",
    (SELECT COUNT(*) FROM sample_re."Showing" s WHERE s."PropertyID" = p."ID") AS "ShowingCount",
    (SELECT AVG(CAST(s."Rating" AS DECIMAL(3,1))) FROM sample_re."Showing" s WHERE s."PropertyID" = p."ID" AND s."Rating" IS NOT NULL) AS "AvgRating",
    (SELECT COUNT(*) FROM sample_re."Offer" o WHERE o."PropertyID" = p."ID") AS "OfferCount"
FROM sample_re."Property" p
INNER JOIN sample_re."PropertyType" pt ON p."PropertyTypeID" = pt."ID";

CREATE OR REPLACE VIEW sample_re."vwRecentTransactions"
AS SELECT
    t."ID",
    t."SalePrice",
    t."ClosingDate",
    t."CommissionTotal",
    t."EscrowCompany",
    t."Status",
    t."CreatedAt",
    p."Address" AS "PropertyAddress",
    p."City" AS "PropertyCity",
    p."State" AS "PropertyState",
    c."FirstName" || ' ' || c."LastName" AS "BuyerName",
    c."Email" AS "BuyerEmail",
    sa."FirstName" || ' ' || sa."LastName" AS "SellerAgentName",
    ba."FirstName" || ' ' || ba."LastName" AS "BuyerAgentName"
FROM sample_re."Transaction" t
INNER JOIN sample_re."Property" p ON t."PropertyID" = p."ID"
INNER JOIN sample_re."Client" c ON t."BuyerID" = c."ID"
INNER JOIN sample_re."Agent" sa ON t."SellerAgentID" = sa."ID"
INNER JOIN sample_re."Agent" ba ON t."BuyerAgentID" = ba."ID";


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Property Types (5)
INSERT INTO sample_re."PropertyType" ("ID", "Name", "Description") VALUES
    ('A0000001-0001-0001-0001-000000000001', 'Single Family Home', 'Detached single-family residence'),
    ('A0000001-0001-0001-0001-000000000002', 'Condominium', 'Unit in a multi-unit building with shared amenities'),
    ('A0000001-0001-0001-0001-000000000003', 'Townhouse', 'Multi-story attached dwelling sharing walls'),
    ('A0000001-0001-0001-0001-000000000004', 'Multi-Family', 'Property with multiple separate living units'),
    ('A0000001-0001-0001-0001-000000000005', 'Land', 'Vacant land or buildable lot');

-- Agents (6)
INSERT INTO sample_re."Agent" ("ID", "FirstName", "LastName", "Email", "Phone", "LicenseNumber", "IsActive", "HireDate", "CommissionRate") VALUES
    ('B0000001-0001-0001-0001-000000000001', 'Sarah', 'Mitchell', 'sarah.mitchell@realty.com', '555-0101', 'RE-2019-4412', 1, '2019-03-15', 3.50),
    ('B0000001-0001-0001-0001-000000000002', 'James', 'Rodriguez', 'james.rodriguez@realty.com', '555-0102', 'RE-2020-5523', 1, '2020-06-01', 3.00),
    ('B0000001-0001-0001-0001-000000000003', 'Emily', 'Chen', 'emily.chen@realty.com', '555-0103', 'RE-2018-3301', 1, '2018-01-10', 4.00),
    ('B0000001-0001-0001-0001-000000000004', 'Marcus', 'Williams', 'marcus.williams@realty.com', '555-0104', 'RE-2021-6634', 1, '2021-09-01', 2.75),
    ('B0000001-0001-0001-0001-000000000005', 'Lisa', 'Patel', 'lisa.patel@realty.com', '555-0105', 'RE-2017-2290', 1, '2017-05-20', 3.25),
    ('B0000001-0001-0001-0001-000000000006', 'David', 'Kim', 'david.kim@realty.com', '555-0106', 'RE-2022-7745', 0, '2022-02-14', 3.00);

-- Properties (15)
INSERT INTO sample_re."Property" ("ID", "Address", "City", "State", "ZipCode", "PropertyTypeID", "Bedrooms", "Bathrooms", "SquareFeet", "LotSizeAcres", "YearBuilt", "ListPrice", "Description", "AgentID", "Status", "IsForSale", "IsForRent") VALUES
    ('C0000001-0001-0001-0001-000000000001', '123 Oak Street', 'Austin', 'TX', '78701', 'A0000001-0001-0001-0001-000000000001', 4, 3.0, 2800, 0.350, 2005, 525000.00, 'Beautiful craftsman home with updated kitchen and large backyard.', 'B0000001-0001-0001-0001-000000000001', 'Active', 1, 0),
    ('C0000001-0001-0001-0001-000000000002', '456 Elm Avenue #204', 'Austin', 'TX', '78702', 'A0000001-0001-0001-0001-000000000002', 2, 2.0, 1200, NULL, 2018, 310000.00, 'Modern condo with skyline views and rooftop pool access.', 'B0000001-0001-0001-0001-000000000001', 'Active', 1, 0),
    ('C0000001-0001-0001-0001-000000000003', '789 Pine Road', 'Round Rock', 'TX', '78664', 'A0000001-0001-0001-0001-000000000001', 3, 2.5, 2200, 0.250, 2012, 415000.00, 'Open floor plan with granite counters and hardwood floors.', 'B0000001-0001-0001-0001-000000000002', 'Active', 1, 0),
    ('C0000001-0001-0001-0001-000000000004', '321 Maple Lane', 'Cedar Park', 'TX', '78613', 'A0000001-0001-0001-0001-000000000003', 3, 2.5, 1800, 0.100, 2020, 375000.00, 'New construction townhouse with smart home features.', 'B0000001-0001-0001-0001-000000000002', 'Pending', 1, 0),
    ('C0000001-0001-0001-0001-000000000005', '555 Birch Court', 'Austin', 'TX', '78704', 'A0000001-0001-0001-0001-000000000001', 5, 4.0, 3800, 0.500, 1998, 750000.00, 'Spacious estate with pool, guest house, and mature landscaping.', 'B0000001-0001-0001-0001-000000000003', 'Active', 1, 0),
    ('C0000001-0001-0001-0001-000000000006', '100 River Walk #502', 'Austin', 'TX', '78701', 'A0000001-0001-0001-0001-000000000002', 1, 1.0, 750, NULL, 2022, 285000.00, 'Luxury high-rise unit with concierge service.', 'B0000001-0001-0001-0001-000000000003', 'Active', 1, 1),
    ('C0000001-0001-0001-0001-000000000007', '200 Sunset Drive', 'Lakeway', 'TX', '78734', 'A0000001-0001-0001-0001-000000000001', 4, 3.5, 3200, 1.200, 2008, 680000.00, 'Lake view property with boat dock access.', 'B0000001-0001-0001-0001-000000000004', 'Active', 1, 0),
    ('C0000001-0001-0001-0001-000000000008', '350 Commerce Street', 'Austin', 'TX', '78703', 'A0000001-0001-0001-0001-000000000004', 6, 4.0, 4200, 0.250, 1985, 890000.00, 'Six-unit apartment building in prime downtown location.', 'B0000001-0001-0001-0001-000000000004', 'Active', 1, 0),
    ('C0000001-0001-0001-0001-000000000009', '425 Valley Road', 'Pflugerville', 'TX', '78660', 'A0000001-0001-0001-0001-000000000001', 3, 2.0, 1650, 0.180, 2015, 345000.00, 'Well-maintained family home near top-rated schools.', 'B0000001-0001-0001-0001-000000000005', 'Sold', 1, 0),
    ('C0000001-0001-0001-0001-000000000010', '600 Hill Country Blvd', 'Bee Cave', 'TX', '78738', 'A0000001-0001-0001-0001-000000000001', 5, 4.5, 4500, 2.000, 2019, 1250000.00, 'Custom hill country estate with infinity pool and outdoor kitchen.', 'B0000001-0001-0001-0001-000000000005', 'Active', 1, 0),
    ('C0000001-0001-0001-0001-000000000011', '15 Park Place #101', 'Austin', 'TX', '78702', 'A0000001-0001-0001-0001-000000000002', 2, 1.0, 950, NULL, 2016, 265000.00, 'Ground floor condo with patio and assigned parking.', 'B0000001-0001-0001-0001-000000000001', 'Rented', 0, 1),
    ('C0000001-0001-0001-0001-000000000012', '800 Ranch Road 620', 'Austin', 'TX', '78736', 'A0000001-0001-0001-0001-000000000005', 0, 0.0, 0, 5.500, NULL, 195000.00, '5.5 acre lot with hill country views, utilities at the road.', 'B0000001-0001-0001-0001-000000000003', 'Active', 1, 0),
    ('C0000001-0001-0001-0001-000000000013', '240 Magnolia Street', 'Georgetown', 'TX', '78626', 'A0000001-0001-0001-0001-000000000003', 2, 2.0, 1400, 0.080, 2021, 335000.00, 'End-unit townhouse backing to greenbelt.', 'B0000001-0001-0001-0001-000000000002', 'Withdrawn', 1, 0),
    ('C0000001-0001-0001-0001-000000000014', '710 Congress Avenue #801', 'Austin', 'TX', '78701', 'A0000001-0001-0001-0001-000000000002', 3, 2.0, 1600, NULL, 2023, 550000.00, 'Penthouse-level condo with wraparound terrace and city views.', 'B0000001-0001-0001-0001-000000000005', 'Active', 1, 0),
    ('C0000001-0001-0001-0001-000000000015', '950 Westlake Drive', 'Austin', 'TX', '78746', 'A0000001-0001-0001-0001-000000000001', 4, 3.0, 2900, 0.400, 2010, 625000.00, 'Updated home with pool, near Westlake schools.', 'B0000001-0001-0001-0001-000000000004', 'Active', 1, 0);

-- Clients (10)
INSERT INTO sample_re."Client" ("ID", "FirstName", "LastName", "Email", "Phone", "PreferredContactMethod", "Budget", "Notes", "AgentID") VALUES
    ('D0000001-0001-0001-0001-000000000001', 'Robert', 'Johnson', 'rjohnson@email.com', '555-0201', 'Email', 600000.00, 'Looking for single family home with large yard.', 'B0000001-0001-0001-0001-000000000001'),
    ('D0000001-0001-0001-0001-000000000002', 'Amanda', 'Torres', 'atorres@email.com', '555-0202', 'Phone', 350000.00, 'First-time buyer, needs condo or townhouse.', 'B0000001-0001-0001-0001-000000000001'),
    ('D0000001-0001-0001-0001-000000000003', 'Kevin', 'Smith', 'ksmith@email.com', '555-0203', 'Text', 450000.00, NULL, 'B0000001-0001-0001-0001-000000000002'),
    ('D0000001-0001-0001-0001-000000000004', 'Jennifer', 'Lee', 'jlee@email.com', '555-0204', 'Email', 800000.00, 'Relocating from California, needs move-in ready.', 'B0000001-0001-0001-0001-000000000003'),
    ('D0000001-0001-0001-0001-000000000005', 'Michael', 'Brown', 'mbrown@email.com', '555-0205', 'Email', 1500000.00, 'Investment buyer looking for luxury properties.', 'B0000001-0001-0001-0001-000000000003'),
    ('D0000001-0001-0001-0001-000000000006', 'Stephanie', 'Garcia', 'sgarcia@email.com', '555-0206', 'Phone', 400000.00, 'Prefers north Austin area, good schools important.', 'B0000001-0001-0001-0001-000000000004'),
    ('D0000001-0001-0001-0001-000000000007', 'Daniel', 'White', 'dwhite@email.com', '555-0207', 'Text', 300000.00, 'Looking for rental property investment.', 'B0000001-0001-0001-0001-000000000004'),
    ('D0000001-0001-0001-0001-000000000008', 'Rachel', 'Martinez', 'rmartinez@email.com', '555-0208', 'Email', 550000.00, NULL, 'B0000001-0001-0001-0001-000000000005'),
    ('D0000001-0001-0001-0001-000000000009', 'Thomas', 'Davis', 'tdavis@email.com', '555-0209', 'Phone', 700000.00, 'Needs home office space, prefers hill country.', 'B0000001-0001-0001-0001-000000000005'),
    ('D0000001-0001-0001-0001-000000000010', 'Nicole', 'Wilson', 'nwilson@email.com', '555-0210', 'Email', 250000.00, 'Downsizing, wants a small condo.', 'B0000001-0001-0001-0001-000000000002');

-- Showings (12)
INSERT INTO sample_re."Showing" ("ID", "PropertyID", "ClientID", "AgentID", "ScheduledAt", "DurationMinutes", "Feedback", "Rating", "Status") VALUES
    ('E0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', '2025-01-10 10:00:00', 45, 'Loved the backyard, kitchen needs minor updates.', 4, 'Completed'),
    ('E0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000001', '2025-01-11 14:00:00', 30, 'Great view but too small for long term.', 3, 'Completed'),
    ('E0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000003', '2025-01-12 11:00:00', 60, 'Perfect for the family, very interested.', 5, 'Completed'),
    ('E0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000002', '2025-01-13 09:00:00', 30, 'Good layout but wanted more outdoor space.', 3, 'Completed'),
    ('E0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000007', 'D0000001-0001-0001-0001-000000000009', 'B0000001-0001-0001-0001-000000000004', '2025-01-14 15:00:00', 45, 'Amazing lake views, discussing with spouse.', 5, 'Completed'),
    ('E0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000010', 'D0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000003', '2025-01-15 10:00:00', 60, 'Excellent investment property, premium location.', 5, 'Completed'),
    ('E0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000009', 'D0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000004', '2025-01-16 13:00:00', 30, 'Nice neighborhood, close to school.', 4, 'Completed'),
    ('E0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000001', '2025-01-17 10:00:00', 45, NULL, NULL, 'Scheduled'),
    ('E0000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000014', 'D0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000005', '2025-01-18 14:00:00', 30, NULL, NULL, 'Scheduled'),
    ('E0000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000002', '2025-01-12 16:00:00', 30, NULL, NULL, 'Cancelled'),
    ('E0000001-0001-0001-0001-000000000011', 'C0000001-0001-0001-0001-000000000006', 'D0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000003', '2025-01-19 11:00:00', 30, 'Nice unit, considering for downsizing.', 4, 'Completed'),
    ('E0000001-0001-0001-0001-000000000012', 'C0000001-0001-0001-0001-000000000015', 'D0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000004', '2025-01-20 09:30:00', 45, NULL, NULL, 'NoShow');

-- Offers (8)
INSERT INTO sample_re."Offer" ("ID", "PropertyID", "ClientID", "OfferAmount", "OfferDate", "ExpirationDate", "Status", "CounterOfferAmount", "Notes", "IsAccepted") VALUES
    ('F0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', 500000.00, '2025-01-11', '2025-01-18', 'Countered', 515000.00, 'Seller willing to negotiate on closing costs.', 0),
    ('F0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000004', 720000.00, '2025-01-13', '2025-01-20', 'Accepted', NULL, 'Full price offer with quick close requested.', 1),
    ('F0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000003', 395000.00, '2025-01-14', '2025-01-21', 'Rejected', NULL, 'Below asking, seller not motivated.', 0),
    ('F0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000009', 'D0000001-0001-0001-0001-000000000006', 340000.00, '2025-01-17', '2025-01-24', 'Accepted', NULL, 'Accepted at asking price.', 1),
    ('F0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000010', 'D0000001-0001-0001-0001-000000000005', 1200000.00, '2025-01-16', '2025-01-23', 'Pending', NULL, 'Cash offer, no contingencies.', 0),
    ('F0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000002', 360000.00, '2025-01-13', '2025-01-20', 'Accepted', NULL, 'Townhouse pending acceptance.', 1),
    ('F0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000007', 'D0000001-0001-0001-0001-000000000009', 660000.00, '2025-01-15', '2025-01-22', 'Expired', NULL, 'Offer expired, client reconsidering.', 0),
    ('F0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', 515000.00, '2025-01-19', '2025-01-26', 'Pending', NULL, 'Revised offer matching counter.', 0);

-- Transactions (3)
INSERT INTO sample_re."Transaction" ("ID", "PropertyID", "BuyerID", "SellerAgentID", "BuyerAgentID", "SalePrice", "ClosingDate", "CommissionTotal", "EscrowCompany", "Status") VALUES
    ('AA000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000009', 'D0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000004', 340000.00, '2025-02-15', 20400.00, 'Lone Star Title Company', 'Closed'),
    ('AA000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000001', 375000.00, '2025-03-01', 21375.00, 'Capitol City Escrow', 'InProgress'),
    ('AA000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000003', 720000.00, '2025-03-15', 57600.00, 'Austin Premier Title', 'InProgress');

-- Property Images (20)
INSERT INTO sample_re."PropertyImage" ("ID", "PropertyID", "ImageURL", "Caption", "SortOrder", "IsPrimary") VALUES
    ('BB000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', 'https://images.realty.com/prop1-front.jpg', 'Front exterior', 1, 1),
    ('BB000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000001', 'https://images.realty.com/prop1-kitchen.jpg', 'Updated kitchen', 2, 0),
    ('BB000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000001', 'https://images.realty.com/prop1-yard.jpg', 'Large backyard', 3, 0),
    ('BB000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000002', 'https://images.realty.com/prop2-living.jpg', 'Living area with view', 1, 1),
    ('BB000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000002', 'https://images.realty.com/prop2-balcony.jpg', 'Skyline balcony', 2, 0),
    ('BB000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000003', 'https://images.realty.com/prop3-front.jpg', 'Curb appeal', 1, 1),
    ('BB000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000003', 'https://images.realty.com/prop3-interior.jpg', 'Open floor plan', 2, 0),
    ('BB000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000005', 'https://images.realty.com/prop5-aerial.jpg', 'Aerial view of estate', 1, 1),
    ('BB000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000005', 'https://images.realty.com/prop5-pool.jpg', 'Pool and patio', 2, 0),
    ('BB000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000005', 'https://images.realty.com/prop5-guest.jpg', 'Guest house exterior', 3, 0),
    ('BB000001-0001-0001-0001-000000000011', 'C0000001-0001-0001-0001-000000000007', 'https://images.realty.com/prop7-lake.jpg', 'Lake view from deck', 1, 1),
    ('BB000001-0001-0001-0001-000000000012', 'C0000001-0001-0001-0001-000000000007', 'https://images.realty.com/prop7-dock.jpg', 'Private boat dock', 2, 0),
    ('BB000001-0001-0001-0001-000000000013', 'C0000001-0001-0001-0001-000000000010', 'https://images.realty.com/prop10-front.jpg', 'Hill country estate entrance', 1, 1),
    ('BB000001-0001-0001-0001-000000000014', 'C0000001-0001-0001-0001-000000000010', 'https://images.realty.com/prop10-pool.jpg', 'Infinity pool', 2, 0),
    ('BB000001-0001-0001-0001-000000000015', 'C0000001-0001-0001-0001-000000000010', 'https://images.realty.com/prop10-kitchen.jpg', 'Outdoor kitchen', 3, 0),
    ('BB000001-0001-0001-0001-000000000016', 'C0000001-0001-0001-0001-000000000014', 'https://images.realty.com/prop14-terrace.jpg', 'Wraparound terrace', 1, 1),
    ('BB000001-0001-0001-0001-000000000017', 'C0000001-0001-0001-0001-000000000014', 'https://images.realty.com/prop14-interior.jpg', 'Modern interior', 2, 0),
    ('BB000001-0001-0001-0001-000000000018', 'C0000001-0001-0001-0001-000000000015', 'https://images.realty.com/prop15-front.jpg', 'Street view', 1, 1),
    ('BB000001-0001-0001-0001-000000000019', 'C0000001-0001-0001-0001-000000000015', 'https://images.realty.com/prop15-pool.jpg', 'Backyard pool', 2, 0),
    ('BB000001-0001-0001-0001-000000000020', 'C0000001-0001-0001-0001-000000000012', 'https://images.realty.com/prop12-land.jpg', 'Hill country lot', 1, 1);

-- Open Houses (5)
INSERT INTO sample_re."OpenHouse" ("ID", "PropertyID", "AgentID", "StartTime", "EndTime", "Description", "MaxAttendees", "IsActive") VALUES
    ('CC000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', '2025-01-25 13:00:00', '2025-01-25 16:00:00', 'Weekend open house - refreshments provided.', 30, 1),
    ('CC000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000003', '2025-01-26 11:00:00', '2025-01-26 14:00:00', 'Private estate tour by appointment.', 10, 1),
    ('CC000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000005', '2025-01-27 10:00:00', '2025-01-27 13:00:00', 'Luxury home showcase event.', 20, 1),
    ('CC000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000001', '2025-02-01 12:00:00', '2025-02-01 15:00:00', 'Condo building open house.', NULL, 1),
    ('CC000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000015', 'B0000001-0001-0001-0001-000000000004', '2025-02-02 13:00:00', '2025-02-02 16:00:00', 'Westlake neighborhood open house.', 25, 0);


-- ===================== FK & CHECK Constraints =====================

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

ALTER TABLE sample_re."Property"
    ADD CONSTRAINT "FK_Property_PropertyType" FOREIGN KEY ("PropertyTypeID") REFERENCES sample_re."PropertyType" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."Property"
    ADD CONSTRAINT "FK_Property_Agent" FOREIGN KEY ("AgentID") REFERENCES sample_re."Agent" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."Client"
    ADD CONSTRAINT "FK_Client_Agent" FOREIGN KEY ("AgentID") REFERENCES sample_re."Agent" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."Showing"
    ADD CONSTRAINT "FK_Showing_Property" FOREIGN KEY ("PropertyID") REFERENCES sample_re."Property" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."Showing"
    ADD CONSTRAINT "FK_Showing_Client" FOREIGN KEY ("ClientID") REFERENCES sample_re."Client" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."Showing"
    ADD CONSTRAINT "FK_Showing_Agent" FOREIGN KEY ("AgentID") REFERENCES sample_re."Agent" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."Offer"
    ADD CONSTRAINT "FK_Offer_Property" FOREIGN KEY ("PropertyID") REFERENCES sample_re."Property" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."Offer"
    ADD CONSTRAINT "FK_Offer_Client" FOREIGN KEY ("ClientID") REFERENCES sample_re."Client" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."Transaction"
    ADD CONSTRAINT "FK_Transaction_Property" FOREIGN KEY ("PropertyID") REFERENCES sample_re."Property" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."Transaction"
    ADD CONSTRAINT "FK_Transaction_Buyer" FOREIGN KEY ("BuyerID") REFERENCES sample_re."Client" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."Transaction"
    ADD CONSTRAINT "FK_Transaction_SellerAgent" FOREIGN KEY ("SellerAgentID") REFERENCES sample_re."Agent" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."Transaction"
    ADD CONSTRAINT "FK_Transaction_BuyerAgent" FOREIGN KEY ("BuyerAgentID") REFERENCES sample_re."Agent" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."PropertyImage"
    ADD CONSTRAINT "FK_PropertyImage_Property" FOREIGN KEY ("PropertyID") REFERENCES sample_re."Property" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."OpenHouse"
    ADD CONSTRAINT "FK_OpenHouse_Property" FOREIGN KEY ("PropertyID") REFERENCES sample_re."Property" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_re."OpenHouse"
    ADD CONSTRAINT "FK_OpenHouse_Agent" FOREIGN KEY ("AgentID") REFERENCES sample_re."Agent" ("ID") DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA sample_re TO sample_re_reader;


-- ===================== Comments =====================

COMMENT ON TABLE sample_re."PropertyType" IS 'Lookup table for property classifications';

COMMENT ON TABLE sample_re."Agent" IS 'Real estate agents and brokers';

COMMENT ON TABLE sample_re."Property" IS 'Real estate property listings';

COMMENT ON TABLE sample_re."Client" IS 'Prospective buyers and renters';

COMMENT ON TABLE sample_re."Showing" IS 'Scheduled property viewings';

COMMENT ON TABLE sample_re."Offer" IS 'Purchase offers on properties';

COMMENT ON TABLE sample_re."Transaction" IS 'Completed real estate transactions';

COMMENT ON TABLE sample_re."PropertyImage" IS 'Property listing photographs';

COMMENT ON TABLE sample_re."OpenHouse" IS 'Scheduled open house events';

COMMENT ON COLUMN sample_re."Agent"."LicenseNumber" IS 'State license number for the agent';

COMMENT ON COLUMN sample_re."Agent"."CommissionRate" IS 'Default commission percentage for this agent';

COMMENT ON COLUMN sample_re."Property"."Status" IS 'Current listing status: Active, Pending, Sold, Withdrawn, or Rented';

COMMENT ON COLUMN sample_re."Property"."SquareFeet" IS 'Total livable area in square feet';

COMMENT ON COLUMN sample_re."Property"."LotSizeAcres" IS 'Lot size in acres for the property parcel';

COMMENT ON COLUMN sample_re."Property"."ListPrice" IS 'Asking price for the property';

COMMENT ON COLUMN sample_re."Client"."PreferredContactMethod" IS 'Preferred method of contact: Email, Phone, or Text';

COMMENT ON COLUMN sample_re."Client"."Budget" IS 'Maximum budget for property search';

COMMENT ON COLUMN sample_re."Showing"."Rating" IS 'Client rating of the showing experience (1-5)';

COMMENT ON COLUMN sample_re."Offer"."OfferAmount" IS 'Amount offered by the buyer';

COMMENT ON COLUMN sample_re."Transaction"."SalePrice" IS 'Final sale price at closing';

COMMENT ON COLUMN sample_re."Transaction"."CommissionTotal" IS 'Total commission paid across both agents';

COMMENT ON COLUMN sample_re."PropertyImage"."SortOrder" IS 'Display order for property image gallery';

COMMENT ON COLUMN sample_re."PropertyImage"."IsPrimary" IS 'Whether this is the primary listing photo';

COMMENT ON COLUMN sample_re."OpenHouse"."MaxAttendees" IS 'Maximum allowed attendees for the open house';


-- ===================== Other =====================

-- ============================================================================
-- SECURITY
-- ============================================================================

-- Create role and grant permissions
