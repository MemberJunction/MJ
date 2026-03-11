-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_property;
SET search_path TO sample_property, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER → BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER→bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

-- Table 1: PropertyType
CREATE TABLE sample_property."PropertyType" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(50) NOT NULL,
 "Description" TEXT NULL,
 "IsResidential" BOOLEAN NOT NULL DEFAULT TRUE,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_PropertyType PRIMARY KEY ("ID"),
 CONSTRAINT UQ_PropertyType_Name UNIQUE ("Name")
);

-- Table 2: Owner
CREATE TABLE sample_property."Owner" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(50) NOT NULL,
 "LastName" VARCHAR(50) NOT NULL,
 "Email" VARCHAR(200) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "Address" VARCHAR(300) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Owner PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Owner_Email UNIQUE ("Email")
);

-- Table 3: Property
CREATE TABLE sample_property."Property" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Address" VARCHAR(300) NOT NULL,
 "City" VARCHAR(100) NOT NULL,
 "State" VARCHAR(2) NOT NULL,
 "ZipCode" VARCHAR(10) NOT NULL,
 "PropertyTypeID" UUID NOT NULL,
 "OwnerID" UUID NOT NULL,
 "SquareFootage" INTEGER NOT NULL,
 "Bedrooms" SMALLINT NULL,
 "Bathrooms" DECIMAL(3,1) NULL,
 "YearBuilt" SMALLINT NOT NULL,
 "PurchasePrice" DECIMAL(12,2) NOT NULL,
 "CurrentValue" DECIMAL(12,2) NULL,
 "IsAvailable" BOOLEAN NOT NULL DEFAULT TRUE,
 "Description" TEXT NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Property PRIMARY KEY ("ID"),
 CONSTRAINT FK_Property_Type FOREIGN KEY ("PropertyTypeID") REFERENCES sample_property."PropertyType"("ID"),
 CONSTRAINT FK_Property_Owner FOREIGN KEY ("OwnerID") REFERENCES sample_property."Owner"("ID"),
 CONSTRAINT CK_Property_SqFt CHECK ("SquareFootage" > 0),
 CONSTRAINT CK_Property_Year CHECK ("YearBuilt" BETWEEN 1800 AND 2030),
 CONSTRAINT CK_Property_Price CHECK ("PurchasePrice" > 0)
);

-- Table 4: Tenant
CREATE TABLE sample_property."Tenant" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(50) NOT NULL,
 "LastName" VARCHAR(50) NOT NULL,
 "Email" VARCHAR(200) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "DateOfBirth" DATE NULL,
 "CreditScore" SMALLINT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "EmergencyContact" VARCHAR(100) NULL,
 "EmergencyPhone" VARCHAR(20) NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Tenant PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Tenant_Email UNIQUE ("Email"),
 CONSTRAINT CK_Tenant_Credit CHECK ("CreditScore" IS NULL OR "CreditScore" BETWEEN 300 AND 850)
);

-- Table 5: Lease
CREATE TABLE sample_property."Lease" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PropertyID" UUID NOT NULL,
 "TenantID" UUID NOT NULL,
 "StartDate" DATE NOT NULL,
 "EndDate" DATE NOT NULL,
 "MonthlyRent" DECIMAL(10,2) NOT NULL,
 "SecurityDeposit" DECIMAL(10,2) NOT NULL DEFAULT 0,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Lease PRIMARY KEY ("ID"),
 CONSTRAINT FK_Lease_Property FOREIGN KEY ("PropertyID") REFERENCES sample_property."Property"("ID"),
 CONSTRAINT FK_Lease_Tenant FOREIGN KEY ("TenantID") REFERENCES sample_property."Tenant"("ID"),
 CONSTRAINT CK_Lease_Rent CHECK ("MonthlyRent" > 0),
 CONSTRAINT CK_Lease_Deposit CHECK ("SecurityDeposit" >= 0),
 CONSTRAINT CK_Lease_Status CHECK ("Status" IN ('Active', 'Expired', 'Terminated', 'Pending')),
 CONSTRAINT CK_Lease_Dates CHECK ("EndDate" > "StartDate")
);

-- Table 6: Payment
CREATE TABLE sample_property."Payment" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "LeaseID" UUID NOT NULL,
 "PaymentDate" DATE NOT NULL,
 "Amount" DECIMAL(10,2) NOT NULL,
 "PaymentMethod" VARCHAR(20) NOT NULL DEFAULT 'Check',
 "IsLatePayment" BOOLEAN NOT NULL DEFAULT FALSE,
 "LateFee" DECIMAL(8,2) NOT NULL DEFAULT 0,
 "Notes" VARCHAR(500) NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Payment PRIMARY KEY ("ID"),
 CONSTRAINT FK_Payment_Lease FOREIGN KEY ("LeaseID") REFERENCES sample_property."Lease"("ID"),
 CONSTRAINT CK_Payment_Amount CHECK ("Amount" > 0),
 CONSTRAINT CK_Payment_LateFee CHECK ("LateFee" >= 0),
 CONSTRAINT CK_Payment_Method CHECK ("PaymentMethod" IN ('Check', 'ACH', 'CreditCard', 'Cash', 'Wire'))
);

-- Table 7: MaintenanceRequest
CREATE TABLE sample_property."MaintenanceRequest" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PropertyID" UUID NOT NULL,
 "TenantID" UUID NULL,
 "Title" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "Priority" VARCHAR(10) NOT NULL DEFAULT 'Medium',
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Open',
 "RequestDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "CompletedDate" TIMESTAMPTZ NULL,
 "EstimatedCost" DECIMAL(10,2) NULL,
 "ActualCost" DECIMAL(10,2) NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_MaintenanceRequest PRIMARY KEY ("ID"),
 CONSTRAINT FK_Maintenance_Property FOREIGN KEY ("PropertyID") REFERENCES sample_property."Property"("ID"),
 CONSTRAINT FK_Maintenance_Tenant FOREIGN KEY ("TenantID") REFERENCES sample_property."Tenant"("ID"),
 CONSTRAINT CK_Maintenance_Priority CHECK ("Priority" IN ('Low', 'Medium', 'High', 'Emergency')),
 CONSTRAINT CK_Maintenance_Status CHECK ("Status" IN ('Open', 'InProgress', 'Completed', 'Cancelled')),
 CONSTRAINT CK_Maintenance_Cost CHECK ("EstimatedCost" IS NULL OR "EstimatedCost" >= 0)
);

-- Table 8: Inspection
CREATE TABLE sample_property."Inspection" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PropertyID" UUID NOT NULL,
 "InspectionDate" DATE NOT NULL,
 "InspectionTime" TIME NULL,
 "InspectorName" VARCHAR(100) NOT NULL,
 "OverallRating" SMALLINT NOT NULL,
 "Notes" TEXT NULL,
 "FollowUpRequired" BOOLEAN NOT NULL DEFAULT FALSE,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Inspection PRIMARY KEY ("ID"),
 CONSTRAINT FK_Inspection_Property FOREIGN KEY ("PropertyID") REFERENCES sample_property."Property"("ID"),
 CONSTRAINT CK_Inspection_Rating CHECK ("OverallRating" BETWEEN 1 AND 10)
);

-- Filtered indexes
CREATE INDEX IF NOT EXISTS IX_Property_Available ON sample_property."Property"("PropertyTypeID") WHERE "IsAvailable" = 1;

CREATE INDEX IF NOT EXISTS IX_Maintenance_Open ON sample_property."MaintenanceRequest"("PropertyID") WHERE "Status" IN (N'Open', N'InProgress');

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'PropertyReader') THEN
        CREATE ROLE "PropertyReader";
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_property."vwPropertyPortfolio" AS SELECT
    p."ID" AS "PropertyID",
    p."Name" AS "PropertyName",
    p."City",
    p."State",
    pt."Name" AS "PropertyType",
    o."FirstName" || ' ' || o."LastName" AS "OwnerName",
    p."SquareFootage",
    COALESCE(p."Bedrooms", 0) AS "Bedrooms",
    COALESCE(p."Bathrooms", 0) AS "Bathrooms",
    p."PurchasePrice",
    COALESCE(p."CurrentValue", p."PurchasePrice") AS "CurrentValue",
    ROUND(COALESCE(p."CurrentValue", p."PurchasePrice") - p."PurchasePrice", 2) AS "Appreciation",
    CASE WHEN p."IsAvailable" = 1 THEN 'Available' ELSE 'Occupied' END AS "AvailabilityStatus",
    p."YearBuilt",
    EXTRACT(YEAR FROM NOW()) - p."YearBuilt" AS "PropertyAge"
FROM sample_property."Property" p
LEFT JOIN sample_property."PropertyType" pt ON p."PropertyTypeID" = pt."ID"
LEFT JOIN sample_property."Owner" o ON p."OwnerID" = o."ID";

CREATE OR REPLACE VIEW sample_property."vwLeaseSummary" AS SELECT
    l."ID" AS "LeaseID",
    p."Name" AS "PropertyName",
    t."FirstName" || ' ' || t."LastName" AS "TenantName",
    l."StartDate",
    l."EndDate",
    l."MonthlyRent",
    l."SecurityDeposit",
    l."Status",
    EXTRACT(DAY FROM (l."EndDate"::TIMESTAMPTZ - l."StartDate"::TIMESTAMPTZ)) AS "LeaseDurationDays",
    EXTRACT(DAY FROM (l."EndDate"::TIMESTAMPTZ - NOW()::TIMESTAMPTZ)) AS "DaysRemaining",
    ROUND(l."MonthlyRent" * 12, 2) AS "AnnualRent",
    CASE
        WHEN l."Status" = 'Active' AND EXTRACT(DAY FROM (l."EndDate"::TIMESTAMPTZ - NOW()::TIMESTAMPTZ)) <= 30 THEN 'Expiring Soon'
        WHEN l."Status" = 'Active' THEN 'Current'
        ELSE l."Status"
    END AS "LeaseStatus"
FROM sample_property."Lease" l
LEFT JOIN sample_property."Property" p ON l."PropertyID" = p."ID"
LEFT JOIN sample_property."Tenant" t ON l."TenantID" = t."ID";

CREATE OR REPLACE VIEW sample_property."vwRevenueReport" AS SELECT
    p."Name" AS "PropertyName",
    o."FirstName" || ' ' || o."LastName" AS "OwnerName",
    COUNT(pay."ID") AS "PaymentCount",
    COALESCE(SUM(pay."Amount"), 0) AS "TotalPayments",
    COALESCE(SUM(pay."LateFee"), 0) AS "TotalLateFees",
    COALESCE(SUM(pay."Amount" + pay."LateFee"), 0) AS "GrossRevenue",
    ROUND(AVG(CAST(pay."Amount" AS DECIMAL(10,2))), 2) AS "AvgPaymentAmount",
    SUM(CASE WHEN pay."IsLatePayment" = 1 THEN 1 ELSE 0 END) AS "LatePaymentCount",
    ROUND(
        CAST(SUM(CASE WHEN pay."IsLatePayment" = 1 THEN 1 ELSE 0 END) AS DECIMAL(5,2)) /
        CASE WHEN COUNT(pay."ID") = 0 THEN 1 ELSE COUNT(pay."ID") END * 100,
    2) AS "LatePaymentRate",
    EXTRACT(YEAR FROM NOW()) AS "ReportYear",
    EXTRACT(MONTH FROM NOW()) AS "ReportMonth"
FROM sample_property."Property" p
LEFT JOIN sample_property."Owner" o ON p."OwnerID" = o."ID"
LEFT JOIN sample_property."Lease" l ON p."ID" = l."PropertyID"
LEFT JOIN sample_property."Payment" pay ON l."ID" = pay."LeaseID"
GROUP BY p."Name", o."FirstName", o."LastName"
HAVING COUNT(pay."ID") > 0;

CREATE OR REPLACE VIEW sample_property."vwMaintenanceDashboard" AS SELECT
    p."Name" AS "PropertyName",
    mr."Priority",
    COUNT(mr."ID") AS "RequestCount",
    SUM(CASE WHEN mr."Status" = 'Open' THEN 1 ELSE 0 END) AS "OpenCount",
    SUM(CASE WHEN mr."Status" = 'InProgress' THEN 1 ELSE 0 END) AS "InProgressCount",
    SUM(CASE WHEN mr."Status" = 'Completed' THEN 1 ELSE 0 END) AS "CompletedCount",
    COALESCE(SUM(mr."ActualCost"), 0) AS "TotalCost",
    ROUND(AVG(CAST(COALESCE(mr."ActualCost", 0) AS DECIMAL(10,2))), 2) AS "AvgCost",
    COALESCE(AVG(
        CASE WHEN mr."CompletedDate" IS NOT NULL
        THEN EXTRACT(DAY FROM (mr."CompletedDate"::TIMESTAMPTZ - mr."RequestDate"::TIMESTAMPTZ))
        ELSE NULL END
    ), 0) AS "AvgResolutionDays"
FROM sample_property."MaintenanceRequest" mr
LEFT JOIN sample_property."Property" p ON mr."PropertyID" = p."ID"
GROUP BY p."Name", mr."Priority";


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Seed data
-- Property Types
INSERT INTO sample_property."PropertyType" ("ID", "Name", "Description", "IsResidential") VALUES
(gen_random_uuid(), 'Apartment', 'Multi-unit residential apartment', 1),
(gen_random_uuid(), 'Single Family', 'Standalone single family home', 1),
(gen_random_uuid(), 'Condo', 'Condominium unit', 1),
(gen_random_uuid(), 'Commercial', 'Commercial office or retail space', 0),
(gen_random_uuid(), 'Duplex', 'Two-unit residential building', 1);

-- Owners
INSERT INTO sample_property."Owner" ("ID", "FirstName", "LastName", "Email", "Phone", "Address", "IsActive") VALUES
(gen_random_uuid(), 'Robert', 'Sterling', 'robert.s@realty.com', '555-7001', '100 Investment Blvd, Suite 200', 1),
(gen_random_uuid(), 'Patricia', 'Wong', 'patricia.w@realty.com', '555-7002', '200 Capital Drive', 1),
(gen_random_uuid(), 'James', 'O''Brien', 'james.ob@realty.com', '555-7003', '300 Estate Lane', 1),
(gen_random_uuid(), 'Susan', 'Nakamura', 'susan.n@realty.com', '555-7004', '400 Realty Court', 1);

-- Properties
INSERT INTO sample_property."Property" ("ID", "Name", "Address", "City", "State", "ZipCode", "PropertyTypeID", "OwnerID", "SquareFootage", "Bedrooms", "Bathrooms", "YearBuilt", "PurchasePrice", "CurrentValue", "IsAvailable", "Description") VALUES
(gen_random_uuid(), 'Sunset Apartments', '100 Sunset Blvd', 'Austin', 'TX', '78701', (SELECT "ID" FROM sample_property."PropertyType" WHERE "Name" = 'Apartment'
LIMIT 1), (SELECT "ID" FROM sample_property."Owner" WHERE "Email" = 'robert.s@realty.com'
LIMIT 1), 12000, NULL, NULL, 2005, 800000.00, 1200000.00, 0, '24-unit apartment complex'),
(gen_random_uuid(), 'Oak Street House', '200 Oak Street', 'Portland', 'OR', '97201', (SELECT "ID" FROM sample_property."PropertyType" WHERE "Name" = 'Single Family'
LIMIT 1), (SELECT "ID" FROM sample_property."Owner" WHERE "Email" = 'patricia.w@realty.com'
LIMIT 1), 2200, 4, 2.5, 1998, 350000.00, 520000.00, 0, 'Well-maintained family home'),
(gen_random_uuid(), 'Downtown Condo 5A', '300 Main St, Unit 5A', 'Denver', 'CO', '80202', (SELECT "ID" FROM sample_property."PropertyType" WHERE "Name" = 'Condo'
LIMIT 1), (SELECT "ID" FROM sample_property."Owner" WHERE "Email" = 'robert.s@realty.com'
LIMIT 1), 1100, 2, 2.0, 2015, 280000.00, 310000.00, 0, 'Modern downtown condo'),
(gen_random_uuid(), 'Commerce Plaza', '400 Business Park', 'Seattle', 'WA', '98101', (SELECT "ID" FROM sample_property."PropertyType" WHERE "Name" = 'Commercial'
LIMIT 1), (SELECT "ID" FROM sample_property."Owner" WHERE "Email" = 'james.ob@realty.com'
LIMIT 1), 5000, NULL, NULL, 2010, 950000.00, 1100000.00, 1, 'Office space with parking'),
(gen_random_uuid(), 'Maple Duplex', '500 Maple Ave', 'Nashville', 'TN', '37201', (SELECT "ID" FROM sample_property."PropertyType" WHERE "Name" = 'Duplex'
LIMIT 1), (SELECT "ID" FROM sample_property."Owner" WHERE "Email" = 'susan.n@realty.com'
LIMIT 1), 2800, 6, 4.0, 2000, 400000.00, 550000.00, 0, 'Side-by-side duplex'),
(gen_random_uuid(), 'River View Apt', '600 River Road', 'Austin', 'TX', '78702', (SELECT "ID" FROM sample_property."PropertyType" WHERE "Name" = 'Apartment'
LIMIT 1), (SELECT "ID" FROM sample_property."Owner" WHERE "Email" = 'patricia.w@realty.com'
LIMIT 1), 8000, NULL, NULL, 2018, 1200000.00, NULL, 1, '16-unit riverside apartments'),
(gen_random_uuid(), 'Pine Street House', '700 Pine Street', 'Portland', 'OR', '97202', (SELECT "ID" FROM sample_property."PropertyType" WHERE "Name" = 'Single Family'
LIMIT 1), (SELECT "ID" FROM sample_property."Owner" WHERE "Email" = 'james.ob@realty.com'
LIMIT 1), 1800, 3, 2.0, 1985, 250000.00, 420000.00, 0, 'Charming craftsman home'),
(gen_random_uuid(), 'Tech Hub Office', '800 Innovation Way', 'Seattle', 'WA', '98102', (SELECT "ID" FROM sample_property."PropertyType" WHERE "Name" = 'Commercial'
LIMIT 1), (SELECT "ID" FROM sample_property."Owner" WHERE "Email" = 'susan.n@realty.com'
LIMIT 1), 3500, NULL, NULL, 2020, 750000.00, 780000.00, 1, 'Modern tech office space');

-- Tenants
INSERT INTO sample_property."Tenant" ("ID", "FirstName", "LastName", "Email", "Phone", "DateOfBirth", "CreditScore", "IsActive", "EmergencyContact", "EmergencyPhone") VALUES
(gen_random_uuid(), 'Mike', 'Thompson', 'mike.t@email.com', '555-8001', '1990-04-12', 720, 1, 'Karen Thompson', '555-9001'),
(gen_random_uuid(), 'Sarah', 'Garcia', 'sarah.g@email.com', '555-8002', '1988-09-25', 680, 1, 'Luis Garcia', '555-9002'),
(gen_random_uuid(), 'David', 'Park', 'david.p@email.com', '555-8003', '1992-01-15', 750, 1, 'Jin Park', '555-9003'),
(gen_random_uuid(), 'Emily', 'Chen', 'emily.c@email.com', '555-8004', '1995-06-30', 700, 1, 'Wei Chen', '555-9004'),
(gen_random_uuid(), 'Jason', 'Miller', 'jason.m@email.com', '555-8005', '1985-11-08', 650, 1, 'Linda Miller', '555-9005'),
(gen_random_uuid(), 'Anna', 'Kowalski', 'anna.k@email.com', '555-8006', '1993-03-20', 780, 1, 'Peter Kowalski', '555-9006'),
(gen_random_uuid(), 'Brian', 'Davis', 'brian.d@email.com', '555-8007', '1987-07-14', NULL, 0, NULL, NULL),
(gen_random_uuid(), 'Rachel', 'Kim', 'rachel.k@email.com', '555-8008', '1991-12-05', 710, 1, 'Tom Kim', '555-9008');

-- Leases
INSERT INTO sample_property."Lease" ("ID", "PropertyID", "TenantID", "StartDate", "EndDate", "MonthlyRent", "SecurityDeposit", "Status") VALUES
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Sunset Apartments'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'mike.t@email.com'
LIMIT 1), '2024-01-01', '2025-01-01', 1500.00, 1500.00, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Oak Street House'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'sarah.g@email.com'
LIMIT 1), '2023-06-01', '2024-06-01', 2200.00, 2200.00, 'Expired'),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Downtown Condo 5A'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'david.p@email.com'
LIMIT 1), '2024-03-01', '2025-03-01', 1800.00, 1800.00, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Maple Duplex'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'emily.c@email.com'
LIMIT 1), '2024-05-01', '2025-05-01', 1200.00, 1200.00, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Maple Duplex'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'jason.m@email.com'
LIMIT 1), '2024-05-01', '2025-05-01', 1200.00, 1200.00, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Sunset Apartments'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'anna.k@email.com'
LIMIT 1), '2024-02-01', '2025-02-01', 1600.00, 1600.00, 'Active'),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Pine Street House'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'rachel.k@email.com'
LIMIT 1), '2024-07-01', '2025-07-01', 1900.00, 1900.00, 'Active');

-- Payments
INSERT INTO sample_property."Payment" ("ID", "LeaseID", "PaymentDate", "Amount", "PaymentMethod", "IsLatePayment", "LateFee", "Notes") VALUES
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Lease" WHERE "MonthlyRent" = 1500.00 AND "Status" = 'Active'
LIMIT 1), '2024-10-01', 1500.00, 'ACH', 0, 0, NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Lease" WHERE "MonthlyRent" = 1500.00 AND "Status" = 'Active'
LIMIT 1), '2024-09-01', 1500.00, 'ACH', 0, 0, NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Lease" WHERE "MonthlyRent" = 1500.00 AND "Status" = 'Active'
LIMIT 1), '2024-08-05', 1550.00, 'Check', 1, 50.00, 'Late payment penalty applied'),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Lease" WHERE "MonthlyRent" = 1800.00
LIMIT 1), '2024-10-01', 1800.00, 'CreditCard', 0, 0, NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Lease" WHERE "MonthlyRent" = 1800.00
LIMIT 1), '2024-09-01', 1800.00, 'CreditCard', 0, 0, NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Lease" WHERE "MonthlyRent" = 1200.00 AND "TenantID" = (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'emily.c@email.com'
LIMIT 1)
LIMIT 1), '2024-10-01', 1200.00, 'ACH', 0, 0, NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Lease" WHERE "MonthlyRent" = 1200.00 AND "TenantID" = (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'jason.m@email.com'
LIMIT 1)
LIMIT 1), '2024-10-03', 1250.00, 'Check', 1, 50.00, 'Late rent'),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Lease" WHERE "MonthlyRent" = 1600.00
LIMIT 1), '2024-10-01', 1600.00, 'Wire', 0, 0, NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Lease" WHERE "MonthlyRent" = 1900.00
LIMIT 1), '2024-10-01', 1900.00, 'ACH', 0, 0, NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Lease" WHERE "MonthlyRent" = 1900.00
LIMIT 1), '2024-09-01', 1900.00, 'ACH', 0, 0, NULL);

-- Maintenance Requests
INSERT INTO sample_property."MaintenanceRequest" ("ID", "PropertyID", "TenantID", "Title", "Description", "Priority", "Status", "RequestDate", "CompletedDate", "EstimatedCost", "ActualCost") VALUES
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Sunset Apartments'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'mike.t@email.com'
LIMIT 1), 'Leaky faucet', 'Kitchen faucet is dripping', 'Medium', 'Completed', '2024-09-15', '2024-09-18', 150.00, 120.00),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Oak Street House'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'sarah.g@email.com'
LIMIT 1), 'Broken window', 'Bedroom window cracked', 'High', 'Completed', '2024-09-20', '2024-09-22', 300.00, 350.00),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Downtown Condo 5A'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'david.p@email.com'
LIMIT 1), 'HVAC not cooling', 'AC unit not producing cold air', 'High', 'InProgress', '2024-10-05', NULL, 500.00, NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Maple Duplex'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'emily.c@email.com'
LIMIT 1), 'Paint peeling', 'Exterior paint peeling on front', 'Low', 'Open', '2024-10-08', NULL, 800.00, NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Pine Street House'
LIMIT 1), (SELECT "ID" FROM sample_property."Tenant" WHERE "Email" = 'rachel.k@email.com'
LIMIT 1), 'Garage door stuck', 'Electric garage door not opening', 'Medium', 'Open', '2024-10-10', NULL, 250.00, NULL),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Sunset Apartments'
LIMIT 1), NULL, 'Parking lot repaving', 'Annual parking lot maintenance', 'Low', 'Completed', '2024-08-01', '2024-08-15', 5000.00, 4800.00);

-- Inspections
INSERT INTO sample_property."Inspection" ("ID", "PropertyID", "InspectionDate", "InspectionTime", "InspectorName", "OverallRating", "Notes", "FollowUpRequired") VALUES
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Sunset Apartments'
LIMIT 1), '2024-09-01', '09:00:00', 'Tom Henderson', 8, 'Good overall condition', 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Oak Street House'
LIMIT 1), '2024-09-05', '10:30:00', 'Tom Henderson', 7, 'Minor repairs needed', 1),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Downtown Condo 5A'
LIMIT 1), '2024-09-10', '14:00:00', 'Lisa Park', 9, 'Excellent condition', 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Commerce Plaza'
LIMIT 1), '2024-09-15', '11:00:00', 'Lisa Park', 6, 'HVAC system needs servicing', 1),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Maple Duplex'
LIMIT 1), '2024-09-20', '09:30:00', 'Tom Henderson', 7, 'Paint exterior needed', 1),
(gen_random_uuid(), (SELECT "ID" FROM sample_property."Property" WHERE "Name" = 'Pine Street House'
LIMIT 1), '2024-10-01', '13:00:00', 'Lisa Park', 8, 'Well maintained by tenant', 0);


-- ===================== FK & CHECK Constraints =====================

-- ALTER TABLE CHECK constraints
ALTER TABLE sample_property."Owner" ADD CONSTRAINT CK_Owner_Email_Length CHECK (LENGTH("Email") >= 5) NOT VALID;

ALTER TABLE sample_property."Property" ADD CONSTRAINT CK_Property_State_Length CHECK (LENGTH("State") = 2) NOT VALID;

ALTER TABLE sample_property."MaintenanceRequest" ADD CONSTRAINT CK_Maintenance_Completed CHECK ("CompletedDate" IS NULL OR "CompletedDate" >= "RequestDate") NOT VALID;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA sample_property TO "PropertyReader";


-- ===================== Comments =====================

COMMENT ON TABLE sample_property."PropertyType" IS 'Property type classifications';

COMMENT ON TABLE sample_property."Owner" IS 'Property owners';

COMMENT ON TABLE sample_property."Property" IS 'Real estate properties';

COMMENT ON TABLE sample_property."Tenant" IS 'Property tenants';

COMMENT ON TABLE sample_property."Lease" IS 'Lease agreements';

COMMENT ON TABLE sample_property."Payment" IS 'Rent payments';

COMMENT ON TABLE sample_property."MaintenanceRequest" IS 'Maintenance work requests';

COMMENT ON TABLE sample_property."Inspection" IS 'Property inspections';

COMMENT ON COLUMN sample_property."Tenant"."CreditScore" IS 'FICO credit score';

COMMENT ON COLUMN sample_property."Property"."Bathrooms" IS 'Number of half-baths counted as 0.5';
