-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_crm;
SET search_path TO sample_crm, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER → BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER→bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

-- Table 1: Account
CREATE TABLE sample_crm."Account" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Industry" VARCHAR(100) NULL,
 "Website" VARCHAR(300) NULL,
 "Phone" VARCHAR(20) NULL,
 "AnnualRevenue" DECIMAL(15,2) NULL,
 "EmployeeCount" INTEGER NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "Notes" TEXT NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Account PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Account_Name UNIQUE ("Name"),
 CONSTRAINT CK_Account_Revenue CHECK ("AnnualRevenue" IS NULL OR "AnnualRevenue" >= 0),
 CONSTRAINT CK_Account_Employees CHECK ("EmployeeCount" IS NULL OR "EmployeeCount" >= 0)
);

-- Table 2: Contact
CREATE TABLE sample_crm."Contact" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(50) NOT NULL,
 "LastName" VARCHAR(50) NOT NULL,
 "Email" VARCHAR(200) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "Title" VARCHAR(100) NULL,
 "AccountID" UUID NOT NULL,
 "IsPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
 "DateOfBirth" DATE NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Contact PRIMARY KEY ("ID"),
 CONSTRAINT FK_Contact_Account FOREIGN KEY ("AccountID") REFERENCES sample_crm."Account"("ID"),
 CONSTRAINT UQ_Contact_Email UNIQUE ("Email")
);

-- Table 3: SalesRep
CREATE TABLE sample_crm."SalesRep" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(50) NOT NULL,
 "LastName" VARCHAR(50) NOT NULL,
 "Email" VARCHAR(200) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "HireDate" DATE NOT NULL,
 "CommissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0500,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "ManagerID" UUID NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_SalesRep PRIMARY KEY ("ID"),
 CONSTRAINT FK_SalesRep_Manager FOREIGN KEY ("ManagerID") REFERENCES sample_crm."SalesRep"("ID"),
 CONSTRAINT UQ_SalesRep_Email UNIQUE ("Email"),
 CONSTRAINT CK_SalesRep_Commission CHECK ("CommissionRate" BETWEEN 0.0000 AND 0.5000)
);

-- Table 4: Opportunity
CREATE TABLE sample_crm."Opportunity" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "AccountID" UUID NOT NULL,
 "ContactID" UUID NULL,
 "SalesRepID" UUID NOT NULL,
 "Amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
 "Stage" VARCHAR(30) NOT NULL DEFAULT 'Prospecting',
 "Probability" SMALLINT NOT NULL DEFAULT 10,
 "CloseDate" DATE NOT NULL,
 "Description" TEXT NULL,
 "IsWon" BOOLEAN NOT NULL DEFAULT FALSE,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Opportunity PRIMARY KEY ("ID"),
 CONSTRAINT FK_Opportunity_Account FOREIGN KEY ("AccountID") REFERENCES sample_crm."Account"("ID"),
 CONSTRAINT FK_Opportunity_Contact FOREIGN KEY ("ContactID") REFERENCES sample_crm."Contact"("ID"),
 CONSTRAINT FK_Opportunity_SalesRep FOREIGN KEY ("SalesRepID") REFERENCES sample_crm."SalesRep"("ID"),
 CONSTRAINT CK_Opportunity_Amount CHECK ("Amount" >= 0),
 CONSTRAINT CK_Opportunity_Probability CHECK ("Probability" BETWEEN 0 AND 100),
 CONSTRAINT CK_Opportunity_Stage CHECK ("Stage" IN ('Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'ClosedWon', 'ClosedLost'))
);

-- Table 5: Activity
CREATE TABLE sample_crm."Activity" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Subject" VARCHAR(200) NOT NULL,
 "ActivityType" VARCHAR(20) NOT NULL,
 "ActivityDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "DurationMinutes" INTEGER NULL,
 "ContactID" UUID NULL,
 "OpportunityID" UUID NULL,
 "SalesRepID" UUID NOT NULL,
 "Notes" TEXT NULL,
 "IsCompleted" BOOLEAN NOT NULL DEFAULT FALSE,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Activity PRIMARY KEY ("ID"),
 CONSTRAINT FK_Activity_Contact FOREIGN KEY ("ContactID") REFERENCES sample_crm."Contact"("ID"),
 CONSTRAINT FK_Activity_Opportunity FOREIGN KEY ("OpportunityID") REFERENCES sample_crm."Opportunity"("ID"),
 CONSTRAINT FK_Activity_SalesRep FOREIGN KEY ("SalesRepID") REFERENCES sample_crm."SalesRep"("ID"),
 CONSTRAINT CK_Activity_Type CHECK ("ActivityType" IN ('Call', 'Email', 'Meeting', 'Task', 'Note')),
 CONSTRAINT CK_Activity_Duration CHECK ("DurationMinutes" IS NULL OR "DurationMinutes" > 0)
);

-- Table 6: Product
CREATE TABLE sample_crm."Product" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "ProductCode" VARCHAR(20) NOT NULL,
 "UnitPrice" DECIMAL(12,2) NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "Description" TEXT NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Product PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Product_Code UNIQUE ("ProductCode"),
 CONSTRAINT CK_Product_Price CHECK ("UnitPrice" > 0)
);

-- Table 7: OpportunityProduct
CREATE TABLE sample_crm."OpportunityProduct" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "OpportunityID" UUID NOT NULL,
 "ProductID" UUID NOT NULL,
 "Quantity" INTEGER NOT NULL DEFAULT 1,
 "UnitPrice" DECIMAL(12,2) NOT NULL,
 "Discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_OpportunityProduct PRIMARY KEY ("ID"),
 CONSTRAINT FK_OppProduct_Opportunity FOREIGN KEY ("OpportunityID") REFERENCES sample_crm."Opportunity"("ID"),
 CONSTRAINT FK_OppProduct_Product FOREIGN KEY ("ProductID") REFERENCES sample_crm."Product"("ID"),
 CONSTRAINT CK_OppProduct_Quantity CHECK ("Quantity" > 0),
 CONSTRAINT CK_OppProduct_Price CHECK ("UnitPrice" > 0),
 CONSTRAINT CK_OppProduct_Discount CHECK ("Discount" BETWEEN 0 AND 100)
);

-- Table 8: Campaign
CREATE TABLE sample_crm."Campaign" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "StartDate" DATE NOT NULL,
 "EndDate" DATE NULL,
 "Budget" DECIMAL(12,2) NOT NULL DEFAULT 0,
 "ActualCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Planned',
 "Description" TEXT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Campaign PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Campaign_Name UNIQUE ("Name"),
 CONSTRAINT CK_Campaign_Budget CHECK ("Budget" >= 0),
 CONSTRAINT CK_Campaign_Cost CHECK ("ActualCost" >= 0),
 CONSTRAINT CK_Campaign_Status CHECK ("Status" IN ('Planned', 'Active', 'Completed', 'Cancelled'))
);

-- Filtered indexes
CREATE INDEX IF NOT EXISTS IX_Opportunity_Open ON sample_crm."Opportunity"("SalesRepID") WHERE "Stage" NOT IN (N'ClosedWon', N'ClosedLost');

CREATE INDEX IF NOT EXISTS IX_Activity_Pending ON sample_crm."Activity"("SalesRepID") WHERE "IsCompleted" = 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'CRMReader') THEN
        CREATE ROLE "CRMReader";
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_crm."vwSalesPipeline" AS SELECT
    o."ID" AS "OpportunityID",
    o."Name" AS "OpportunityName",
    a."Name" AS "AccountName",
    sr."FirstName" || ' ' || sr."LastName" AS "SalesRepName",
    o."Amount",
    o."Stage",
    o."Probability",
    ROUND(o."Amount" * CAST(o."Probability" AS DECIMAL(5,2)) / 100, 2) AS "WeightedAmount",
    o."CloseDate",
    EXTRACT(DAY FROM (o."CloseDate"::TIMESTAMPTZ - NOW()::TIMESTAMPTZ)) AS "DaysToClose",
    CASE WHEN o."IsWon" = 1 THEN 'Won' ELSE CASE WHEN o."Stage" = 'ClosedLost' THEN 'Lost' ELSE 'Open' END END AS "DealStatus",
    COALESCE(c."FirstName" || ' ' || c."LastName", 'No Contact') AS "ContactName"
FROM sample_crm."Opportunity" o
LEFT JOIN sample_crm."Account" a ON o."AccountID" = a."ID"
LEFT JOIN sample_crm."SalesRep" sr ON o."SalesRepID" = sr."ID"
LEFT JOIN sample_crm."Contact" c ON o."ContactID" = c."ID";

CREATE OR REPLACE VIEW sample_crm."vwRepPerformance" AS SELECT
    sr."ID" AS "SalesRepID",
    sr."FirstName" || ' ' || sr."LastName" AS "RepName",
    COUNT(o."ID") AS "TotalOpportunities",
    SUM(CASE WHEN o."IsWon" = 1 THEN 1 ELSE 0 END) AS "WonDeals",
    SUM(CASE WHEN o."Stage" = 'ClosedLost' THEN 1 ELSE 0 END) AS "LostDeals",
    COALESCE(SUM(CASE WHEN o."IsWon" = 1 THEN o."Amount" ELSE 0 END), 0) AS "TotalRevenue",
    ROUND(AVG(CAST(o."Amount" AS DECIMAL(15,2))), 2) AS "AvgDealSize",
    ROUND(
        CAST(SUM(CASE WHEN o."IsWon" = 1 THEN 1 ELSE 0 END) AS DECIMAL(5,2)) /
        CASE WHEN COUNT(o."ID") = 0 THEN 1 ELSE COUNT(o."ID") END * 100,
    2) AS "WinRate",
    sr."CommissionRate",
    EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - sr."HireDate"::TIMESTAMPTZ)) AS "DaysSinceHire",
    EXTRACT(YEAR FROM NOW()) AS "ReportYear"
FROM sample_crm."SalesRep" sr
LEFT JOIN sample_crm."Opportunity" o ON sr."ID" = o."SalesRepID"
GROUP BY sr."ID", sr."FirstName", sr."LastName", sr."CommissionRate", sr."HireDate";

CREATE OR REPLACE VIEW sample_crm."vwAccountSummary" AS SELECT
    a."ID" AS "AccountID",
    a."Name" AS "AccountName",
    a."Industry",
    COALESCE(a."AnnualRevenue", 0) AS "AnnualRevenue",
    COUNT(DISTINCT c."ID") AS "ContactCount",
    COUNT(DISTINCT o."ID") AS "OpportunityCount",
    COALESCE(SUM(CASE WHEN o."IsWon" = 1 THEN o."Amount" ELSE 0 END), 0) AS "TotalWonAmount",
    COALESCE(SUM(o."Amount"), 0) AS "TotalPipelineAmount",
    COALESCE(a."EmployeeCount", 0) AS "EmployeeCount",
    CASE WHEN a."IsActive" = 1 THEN 'Active' ELSE 'Inactive' END AS "AccountStatus"
FROM sample_crm."Account" a
LEFT JOIN sample_crm."Contact" c ON a."ID" = c."AccountID"
LEFT JOIN sample_crm."Opportunity" o ON a."ID" = o."AccountID"
GROUP BY a."ID", a."Name", a."Industry", a."AnnualRevenue", a."EmployeeCount", a."IsActive";

CREATE OR REPLACE VIEW sample_crm."vwActivityDashboard" AS SELECT
    sr."FirstName" || ' ' || sr."LastName" AS "RepName",
    act."ActivityType",
    COUNT(act."ID") AS "ActivityCount",
    SUM(COALESCE(act."DurationMinutes", 0)) AS "TotalMinutes",
    SUM(CASE WHEN act."IsCompleted" = 1 THEN 1 ELSE 0 END) AS "CompletedCount",
    ROUND(
        CAST(SUM(CASE WHEN act."IsCompleted" = 1 THEN 1 ELSE 0 END) AS DECIMAL(5,2)) /
        CASE WHEN COUNT(act."ID") = 0 THEN 1 ELSE COUNT(act."ID") END * 100,
    2) AS "CompletionRate",
    EXTRACT(MONTH FROM NOW()) AS "ReportMonth",
    EXTRACT(YEAR FROM NOW()) AS "ReportYear"
FROM sample_crm."Activity" act
LEFT JOIN sample_crm."SalesRep" sr ON act."SalesRepID" = sr."ID"
GROUP BY sr."FirstName", sr."LastName", act."ActivityType"
HAVING COUNT(act."ID") > 0;


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Seed data
-- Accounts
INSERT INTO sample_crm."Account" ("ID", "Name", "Industry", "Website", "Phone", "AnnualRevenue", "EmployeeCount", "IsActive", "Notes") VALUES
(gen_random_uuid(), 'Acme Corporation', 'Technology', 'https://acme.com', '555-4001', 5000000.00, 250, 1, 'Key enterprise account'),
(gen_random_uuid(), 'Global Industries', 'Manufacturing', 'https://globalind.com', '555-4002', 12000000.00, 800, 1, 'Large manufacturing client'),
(gen_random_uuid(), 'Bright Solutions', 'Consulting', 'https://brightsol.com', '555-4003', 2000000.00, 50, 1, NULL),
(gen_random_uuid(), 'Metro Healthcare', 'Healthcare', 'https://metrohc.com', '555-4004', 8000000.00, 400, 1, 'Healthcare vertical target'),
(gen_random_uuid(), 'Summit Financial', 'Finance', 'https://summitfin.com', '555-4005', 15000000.00, 600, 1, NULL),
(gen_random_uuid(), 'Green Energy Co', 'Energy', 'https://greenenergy.com', '555-4006', 3500000.00, 120, 1, 'Renewable energy focus');

-- Sales Reps
INSERT INTO sample_crm."SalesRep" ("ID", "FirstName", "LastName", "Email", "Phone", "HireDate", "CommissionRate", "IsActive") VALUES
(gen_random_uuid(), 'Alice', 'Morgan', 'alice.morgan@company.com', '555-5001', '2019-03-15', 0.0800, 1),
(gen_random_uuid(), 'Bob', 'Turner', 'bob.turner@company.com', '555-5002', '2020-06-01', 0.0600, 1),
(gen_random_uuid(), 'Carol', 'Hayes', 'carol.hayes@company.com', '555-5003', '2021-01-10', 0.0500, 1),
(gen_random_uuid(), 'Dan', 'Foster', 'dan.foster@company.com', '555-5004', '2018-08-20', 0.1000, 1),
(gen_random_uuid(), 'Eve', 'Mitchell', 'eve.mitchell@company.com', '555-5005', '2023-02-01', 0.0500, 1);

-- Contacts
INSERT INTO sample_crm."Contact" ("ID", "FirstName", "LastName", "Email", "Phone", "Title", "AccountID", "IsPrimary", "DateOfBirth") VALUES
(gen_random_uuid(), 'John', 'Smith', 'john.smith@acme.com', '555-6001', 'CTO', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Acme Corporation'
LIMIT 1), 1, '1980-05-15'),
(gen_random_uuid(), 'Jane', 'Doe', 'jane.doe@acme.com', '555-6002', 'VP Engineering', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Acme Corporation'
LIMIT 1), 0, '1985-11-22'),
(gen_random_uuid(), 'Mark', 'Johnson', 'mark.j@globalind.com', '555-6003', 'Procurement Manager', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Global Industries'
LIMIT 1), 1, '1975-03-08'),
(gen_random_uuid(), 'Sara', 'Williams', 'sara.w@brightsol.com', '555-6004', 'CEO', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Bright Solutions'
LIMIT 1), 1, '1982-07-30'),
(gen_random_uuid(), 'Tom', 'Brown', 'tom.b@metrohc.com', '555-6005', 'IT Director', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Metro Healthcare'
LIMIT 1), 1, NULL),
(gen_random_uuid(), 'Lisa', 'Davis', 'lisa.d@summitfin.com', '555-6006', 'CFO', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Summit Financial'
LIMIT 1), 1, '1978-09-12'),
(gen_random_uuid(), 'Chris', 'Wilson', 'chris.w@greenenergy.com', '555-6007', 'Operations Director', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Green Energy Co'
LIMIT 1), 1, '1990-01-25'),
(gen_random_uuid(), 'Amy', 'Taylor', 'amy.t@globalind.com', '555-6008', 'Plant Manager', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Global Industries'
LIMIT 1), 0, '1988-06-18');

-- Products
INSERT INTO sample_crm."Product" ("ID", "Name", "ProductCode", "UnitPrice", "IsActive", "Description") VALUES
(gen_random_uuid(), 'Enterprise Suite', 'ENT-001', 50000.00, 1, 'Full enterprise software suite'),
(gen_random_uuid(), 'Professional License', 'PRO-001', 15000.00, 1, 'Professional tier license'),
(gen_random_uuid(), 'Basic Package', 'BAS-001', 5000.00, 1, 'Basic starter package'),
(gen_random_uuid(), 'Support Premium', 'SUP-001', 10000.00, 1, 'Premium 24/7 support plan'),
(gen_random_uuid(), 'Training Package', 'TRN-001', 3000.00, 1, 'On-site training for 10 users'),
(gen_random_uuid(), 'API Access', 'API-001', 8000.00, 1, 'Annual API access license');

-- Opportunities
INSERT INTO sample_crm."Opportunity" ("ID", "Name", "AccountID", "ContactID", "SalesRepID", "Amount", "Stage", "Probability", "CloseDate", "Description", "IsWon") VALUES
(gen_random_uuid(), 'Acme Enterprise Deal', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Acme Corporation'
LIMIT 1), (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'john.smith@acme.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'alice.morgan@company.com'
LIMIT 1), 75000.00, 'Negotiation', 70, '2024-12-15', 'Large enterprise deployment', 0),
(gen_random_uuid(), 'Global Ind Expansion', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Global Industries'
LIMIT 1), (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'mark.j@globalind.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'bob.turner@company.com'
LIMIT 1), 120000.00, 'Proposal', 50, '2025-01-30', 'Multi-site expansion project', 0),
(gen_random_uuid(), 'Bright Solutions Starter', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Bright Solutions'
LIMIT 1), (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'sara.w@brightsol.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'carol.hayes@company.com'
LIMIT 1), 8000.00, 'ClosedWon', 100, '2024-09-30', 'Starter package sale', 1),
(gen_random_uuid(), 'Metro HC Integration', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Metro Healthcare'
LIMIT 1), (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'tom.b@metrohc.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'dan.foster@company.com'
LIMIT 1), 95000.00, 'Qualification', 30, '2025-03-31', 'Healthcare integration project', 0),
(gen_random_uuid(), 'Summit Fin Platform', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Summit Financial'
LIMIT 1), (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'lisa.d@summitfin.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'alice.morgan@company.com'
LIMIT 1), 200000.00, 'Prospecting', 10, '2025-06-30', 'Enterprise platform for trading', 0),
(gen_random_uuid(), 'Green Energy Monitoring', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Green Energy Co'
LIMIT 1), (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'chris.w@greenenergy.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'eve.mitchell@company.com'
LIMIT 1), 35000.00, 'ClosedLost', 0, '2024-08-15', 'Lost to competitor', 0),
(gen_random_uuid(), 'Acme Support Renewal', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Acme Corporation'
LIMIT 1), (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'jane.doe@acme.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'alice.morgan@company.com'
LIMIT 1), 10000.00, 'ClosedWon', 100, '2024-10-01', 'Annual support renewal', 1),
(gen_random_uuid(), 'Global Ind Training', (SELECT "ID" FROM sample_crm."Account" WHERE "Name" = 'Global Industries'
LIMIT 1), (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'amy.t@globalind.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'bob.turner@company.com'
LIMIT 1), 6000.00, 'ClosedWon', 100, '2024-09-15', 'Training for plant staff', 1);

-- Activities
INSERT INTO sample_crm."Activity" ("ID", "Subject", "ActivityType", "ActivityDate", "DurationMinutes", "ContactID", "OpportunityID", "SalesRepID", "Notes", "IsCompleted") VALUES
(gen_random_uuid(), 'Initial discovery call', 'Call', '2024-09-01', 30, (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'john.smith@acme.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Acme Enterprise Deal'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'alice.morgan@company.com'
LIMIT 1), 'Discussed requirements', 1),
(gen_random_uuid(), 'Follow-up email', 'Email', '2024-09-05', NULL, (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'john.smith@acme.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Acme Enterprise Deal'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'alice.morgan@company.com'
LIMIT 1), 'Sent proposal docs', 1),
(gen_random_uuid(), 'Demo meeting', 'Meeting', '2024-09-15', 60, (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'mark.j@globalind.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Global Ind Expansion'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'bob.turner@company.com'
LIMIT 1), 'Product demonstration', 1),
(gen_random_uuid(), 'Contract review', 'Meeting', '2024-09-20', 45, (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'sara.w@brightsol.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Bright Solutions Starter'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'carol.hayes@company.com'
LIMIT 1), 'Final contract discussion', 1),
(gen_random_uuid(), 'Needs analysis', 'Call', '2024-10-01', 45, (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'tom.b@metrohc.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Metro HC Integration'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'dan.foster@company.com'
LIMIT 1), 'Understanding HC requirements', 1),
(gen_random_uuid(), 'Send pricing proposal', 'Task', '2024-10-10', NULL, NULL, (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Acme Enterprise Deal'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'alice.morgan@company.com'
LIMIT 1), 'Prepare and send formal pricing', 0),
(gen_random_uuid(), 'Schedule site visit', 'Task', '2024-10-12', NULL, (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'mark.j@globalind.com'
LIMIT 1), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Global Ind Expansion'
LIMIT 1), (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'bob.turner@company.com'
LIMIT 1), 'Arrange plant visit', 0),
(gen_random_uuid(), 'Quarterly check-in', 'Call', '2024-10-15', 20, (SELECT "ID" FROM sample_crm."Contact" WHERE "Email" = 'lisa.d@summitfin.com'
LIMIT 1), NULL, (SELECT "ID" FROM sample_crm."SalesRep" WHERE "Email" = 'alice.morgan@company.com'
LIMIT 1), 'Relationship maintenance', 1);

-- Campaigns
INSERT INTO sample_crm."Campaign" ("ID", "Name", "StartDate", "EndDate", "Budget", "ActualCost", "Status", "Description", "IsActive") VALUES
(gen_random_uuid(), 'Q4 Product Launch', '2024-10-01', '2024-12-31', 50000.00, 12000.00, 'Active', 'Fourth quarter product launch campaign', 1),
(gen_random_uuid(), 'Spring Webinar Series', '2024-03-01', '2024-05-31', 15000.00, 14500.00, 'Completed', 'Educational webinar series', 0),
(gen_random_uuid(), 'Partner Referral Program', '2024-01-01', NULL, 30000.00, 8000.00, 'Active', 'Ongoing partner referral incentives', 1),
(gen_random_uuid(), 'Trade Show 2025', '2025-02-15', '2025-02-18', 75000.00, 0, 'Planned', 'Annual industry trade show', 1);

-- Opportunity Products
INSERT INTO sample_crm."OpportunityProduct" ("ID", "OpportunityID", "ProductID", "Quantity", "UnitPrice", "Discount") VALUES
(gen_random_uuid(), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Acme Enterprise Deal'
LIMIT 1), (SELECT "ID" FROM sample_crm."Product" WHERE "ProductCode" = 'ENT-001'
LIMIT 1), 1, 50000.00, 5.00),
(gen_random_uuid(), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Acme Enterprise Deal'
LIMIT 1), (SELECT "ID" FROM sample_crm."Product" WHERE "ProductCode" = 'SUP-001'
LIMIT 1), 1, 10000.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Acme Enterprise Deal'
LIMIT 1), (SELECT "ID" FROM sample_crm."Product" WHERE "ProductCode" = 'TRN-001'
LIMIT 1), 5, 3000.00, 10.00),
(gen_random_uuid(), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Global Ind Expansion'
LIMIT 1), (SELECT "ID" FROM sample_crm."Product" WHERE "ProductCode" = 'ENT-001'
LIMIT 1), 2, 50000.00, 8.00),
(gen_random_uuid(), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Global Ind Expansion'
LIMIT 1), (SELECT "ID" FROM sample_crm."Product" WHERE "ProductCode" = 'API-001'
LIMIT 1), 2, 8000.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Bright Solutions Starter'
LIMIT 1), (SELECT "ID" FROM sample_crm."Product" WHERE "ProductCode" = 'BAS-001'
LIMIT 1), 1, 5000.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Bright Solutions Starter'
LIMIT 1), (SELECT "ID" FROM sample_crm."Product" WHERE "ProductCode" = 'TRN-001'
LIMIT 1), 1, 3000.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_crm."Opportunity" WHERE "Name" = 'Acme Support Renewal'
LIMIT 1), (SELECT "ID" FROM sample_crm."Product" WHERE "ProductCode" = 'SUP-001'
LIMIT 1), 1, 10000.00, 0);


-- ===================== FK & CHECK Constraints =====================

-- ALTER TABLE CHECK constraints
ALTER TABLE sample_crm."Contact" ADD CONSTRAINT CK_Contact_Email_Length CHECK (LENGTH("Email") >= 5) NOT VALID;

ALTER TABLE sample_crm."Campaign" ADD CONSTRAINT CK_Campaign_Dates CHECK ("EndDate" IS NULL OR "EndDate" >= "StartDate") NOT VALID;

ALTER TABLE sample_crm."Opportunity" ADD CONSTRAINT CK_Opportunity_Won CHECK ("IsWon" = 0 OR "Stage" = 'ClosedWon') NOT VALID;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA sample_crm TO "CRMReader";


-- ===================== Comments =====================

COMMENT ON TABLE sample_crm."Account" IS 'Company accounts';

COMMENT ON TABLE sample_crm."Contact" IS 'Contact persons at accounts';

COMMENT ON TABLE sample_crm."SalesRep" IS 'Sales team members';

COMMENT ON TABLE sample_crm."Opportunity" IS 'Sales opportunities';

COMMENT ON TABLE sample_crm."Activity" IS 'Sales activities and tasks';

COMMENT ON TABLE sample_crm."Product" IS 'Product catalog';

COMMENT ON TABLE sample_crm."OpportunityProduct" IS 'Products linked to opportunities';

COMMENT ON TABLE sample_crm."Campaign" IS 'Marketing campaigns';

COMMENT ON COLUMN sample_crm."SalesRep"."ManagerID" IS 'Self-referencing manager hierarchy';

COMMENT ON COLUMN sample_crm."SalesRep"."CommissionRate" IS 'Commission percentage per deal';
