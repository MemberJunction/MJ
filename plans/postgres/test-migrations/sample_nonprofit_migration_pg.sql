-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_nonprofit;
SET search_path TO sample_nonprofit, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER → BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER→bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

-- TODO: Review conditional DDL
-- -- Create the schema for Nonprofit operations
-- IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sample_npo')
--     EXEC('CREATE SCHEMA sample_npo');


/* ============================================================
 Table: Campaign
 Fundraising campaigns with goals and timelines
 ============================================================ */
CREATE TABLE sample_npo."Campaign" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Description" TEXT NOT NULL,
 "GoalAmount" DECIMAL(12,2) NOT NULL,
 "StartDate" DATE NOT NULL,
 "EndDate" DATE NOT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Planning',
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Campaign PRIMARY KEY ("ID"),
 CONSTRAINT CK_Campaign_Status CHECK ("Status" IN ('Planning', 'Active', 'Completed', 'Cancelled')),
 CONSTRAINT CK_Campaign_GoalAmount CHECK ("GoalAmount" > 0)
);

/* ============================================================
 Table: Donor
 Individual, Corporate, and Foundation donors
 ============================================================ */
CREATE TABLE sample_npo."Donor" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "Address" VARCHAR(300) NULL,
 "City" VARCHAR(100) NULL,
 "State" VARCHAR(2) NULL,
 "ZipCode" VARCHAR(10) NULL,
 "DonorType" VARCHAR(20) NOT NULL DEFAULT 'Individual',
 "IsAnonymous" BOOLEAN NOT NULL DEFAULT FALSE,
 "FirstDonationDate" TIMESTAMPTZ NULL,
 "Notes" TEXT NULL,
 "RegisteredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Donor PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Donor_Email UNIQUE ("Email"),
 CONSTRAINT CK_Donor_DonorType CHECK ("DonorType" IN ('Individual', 'Corporate', 'Foundation'))
);

-- Table: Donation - Financial contributions from donors
CREATE TABLE sample_npo."Donation" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "DonorID" UUID NOT NULL,
 "CampaignID" UUID NULL,
 "Amount" DECIMAL(10,2) NOT NULL,
 "DonationDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "PaymentMethod" VARCHAR(20) NOT NULL,
 "IsRecurring" BOOLEAN NOT NULL DEFAULT FALSE,
 "ReceiptNumber" VARCHAR(30) NOT NULL,
 "TaxDeductible" BOOLEAN NOT NULL DEFAULT TRUE,
 "Notes" TEXT NULL,
 CONSTRAINT PK_Donation PRIMARY KEY ("ID"),
 CONSTRAINT FK_Donation_Donor FOREIGN KEY ("DonorID") REFERENCES sample_npo."Donor"("ID"),
 CONSTRAINT FK_Donation_Campaign FOREIGN KEY ("CampaignID") REFERENCES sample_npo."Campaign"("ID"),
 CONSTRAINT UQ_Donation_Receipt UNIQUE ("ReceiptNumber"),
 CONSTRAINT CK_Donation_Amount CHECK ("Amount" > 0),
 CONSTRAINT CK_Donation_PaymentMethod CHECK ("PaymentMethod" IN ('Credit', 'Check', 'Cash', 'Wire', 'ACH', 'Stock'))
);

/* Table: Volunteer - People who donate their time */
CREATE TABLE sample_npo."Volunteer" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NOT NULL,
 "Phone" VARCHAR(20) NOT NULL,
 "Skills" TEXT NULL,
 "AvailableDays" VARCHAR(50) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "JoinDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "TotalHours" DECIMAL(8,1) NOT NULL DEFAULT 0,
 CONSTRAINT PK_Volunteer PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Volunteer_Email UNIQUE ("Email")
);

-- Table: Event - Fundraising and community events
CREATE TABLE sample_npo."Event" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "CampaignID" UUID NULL,
 "EventDate" DATE NOT NULL,
 "StartTime" TIME NOT NULL,
 "EndTime" TIME NOT NULL,
 "Location" VARCHAR(300) NOT NULL,
 "MaxAttendees" INTEGER NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Upcoming',
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Event PRIMARY KEY ("ID"),
 CONSTRAINT FK_Event_Campaign FOREIGN KEY ("CampaignID") REFERENCES sample_npo."Campaign"("ID"),
 CONSTRAINT CK_Event_Status CHECK ("Status" IN ('Upcoming', 'InProgress', 'Completed', 'Cancelled'))
);

/* ============================================================
 Table: EventAttendee
 Links donors and volunteers to events with composite unique constraints
 ============================================================ */
CREATE TABLE sample_npo."EventAttendee" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EventID" UUID NOT NULL,
 "DonorID" UUID NULL,
 "VolunteerID" UUID NULL,
 "AttendeeType" VARCHAR(20) NOT NULL,
 "CheckedIn" BOOLEAN NOT NULL DEFAULT FALSE,
 "RegisteredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_EventAttendee PRIMARY KEY ("ID"),
 CONSTRAINT FK_EventAttendee_Event FOREIGN KEY ("EventID") REFERENCES sample_npo."Event"("ID"),
 CONSTRAINT FK_EventAttendee_Donor FOREIGN KEY ("DonorID") REFERENCES sample_npo."Donor"("ID"),
 CONSTRAINT FK_EventAttendee_Volunteer FOREIGN KEY ("VolunteerID") REFERENCES sample_npo."Volunteer"("ID"),
 -- Note: filtered unique indexes used below for nullable columns
 CONSTRAINT CK_EventAttendee_Type CHECK ("AttendeeType" IN ('Donor', 'Volunteer', 'Guest'))
);

-- Table: VolunteerLog - Tracks volunteer hours and tasks
CREATE TABLE sample_npo."VolunteerLog" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "VolunteerID" UUID NOT NULL,
 "EventID" UUID NULL,
 "LogDate" DATE NOT NULL,
 "HoursWorked" DECIMAL(4,1) NOT NULL,
 "TaskDescription" VARCHAR(500) NOT NULL,
 "ApprovedBy" VARCHAR(200) NULL,
 "IsApproved" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT PK_VolunteerLog PRIMARY KEY ("ID"),
 CONSTRAINT FK_VolunteerLog_Volunteer FOREIGN KEY ("VolunteerID") REFERENCES sample_npo."Volunteer"("ID"),
 CONSTRAINT FK_VolunteerLog_Event FOREIGN KEY ("EventID") REFERENCES sample_npo."Event"("ID"),
 CONSTRAINT CK_VolunteerLog_Hours CHECK ("HoursWorked" > 0)
);

/* Table: Grant_ - Grants applied for and received */
CREATE TABLE sample_npo."Grant_" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "GrantorName" VARCHAR(200) NOT NULL,
 "Title" VARCHAR(300) NOT NULL,
 "Description" TEXT NULL,
 "Amount" DECIMAL(12,2) NOT NULL,
 "ApplicationDate" DATE NOT NULL,
 "AwardDate" DATE NULL,
 "ExpirationDate" DATE NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Applied',
 "RequirementsNotes" TEXT NULL,
 "CampaignID" UUID NULL,
 CONSTRAINT PK_Grant PRIMARY KEY ("ID"),
 CONSTRAINT FK_Grant_Campaign FOREIGN KEY ("CampaignID") REFERENCES sample_npo."Campaign"("ID"),
 CONSTRAINT CK_Grant_Status CHECK ("Status" IN ('Applied', 'Awarded', 'Rejected', 'Completed'))
);

/* ============================================================
   Filtered Unique Indexes for Nullable Composite Keys
   ============================================================ */
CREATE UNIQUE INDEX IF NOT EXISTS UQ_EventAttendee ON sample_npo."EventAttendee" ("EventID", "DonorID") WHERE "DonorID" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS UQ_EventVolunteer ON sample_npo."EventAttendee" ("EventID", "VolunteerID") WHERE "VolunteerID" IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'NpoReader') THEN
        CREATE ROLE "NpoReader";
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_npo.vwCampaignProgress AS SELECT
    c."ID" AS "CampaignID",
    c."Name" AS "CampaignName",
    c."GoalAmount",
    c."StartDate",
    c."EndDate",
    c."Status",
    COALESCE(SUM(d."Amount"), 0) AS "TotalRaised",
    COUNT(DISTINCT d."DonorID") AS "UniqueDonors",
    COUNT(d."ID") AS "DonationCount",
    /* Calculate percentage of goal reached using ROUND and CASE WHEN */
    CASE WHEN c."GoalAmount" > 0
        THEN ROUND((COALESCE(SUM(d."Amount"), 0) / c."GoalAmount") * 100, 2)
        ELSE 0
    END AS "PercentOfGoal",
    -- Calculate days remaining using DATEDIFF
    CASE WHEN c."EndDate" >= CAST(NOW() AS DATE) THEN EXTRACT(DAY FROM (c."EndDate"::TIMESTAMPTZ - CAST(NOW() AS DATE)::TIMESTAMPTZ)) ELSE 0 END AS "DaysRemaining",
    c."IsActive"
FROM sample_npo."Campaign" c
LEFT JOIN sample_npo."Donation" d ON d."CampaignID" = c."ID"
GROUP BY c."ID", c."Name", c."GoalAmount", c."StartDate", c."EndDate", c."Status", c."IsActive";

CREATE OR REPLACE VIEW sample_npo.vwDonorSummary AS SELECT
    dn."ID" AS "DonorID",
    dn."FirstName",
    dn."LastName",
    dn."Email",
    dn."DonorType",
    dn."IsAnonymous",
    COALESCE(SUM(d."Amount"), 0) AS "TotalDonated",
    COUNT(d."ID") AS "DonationCount",
    -- Average donation using ISNULL for safety
    COALESCE(AVG(d."Amount"), 0) AS "AverageDonation",
    MAX(d."DonationDate") AS "LastDonationDate",
    EXTRACT(YEAR FROM dn."RegisteredAt") AS "RegistrationYear",
    /* Sum of tax-deductible amounts using numeric + */
    COALESCE(SUM(CASE WHEN d."TaxDeductible" = 1 THEN d."Amount" ELSE 0 END), 0) AS "TotalTaxDeductible",
    COALESCE(SUM(CASE WHEN d."IsRecurring" = 1 THEN d."Amount" ELSE 0 END), 0) AS "RecurringTotal"
FROM sample_npo."Donor" dn
LEFT JOIN sample_npo."Donation" d ON d."DonorID" = dn."ID"
GROUP BY dn."ID", dn."FirstName", dn."LastName", dn."Email", dn."DonorType", dn."IsAnonymous", dn."RegisteredAt";

CREATE OR REPLACE VIEW sample_npo.vwUpcomingEvents AS SELECT
    e."ID" AS "EventID",
    e."Name" AS "EventName",
    e."EventDate",
    e."StartTime",
    e."EndTime",
    e."Location",
    e."Status",
    e."MaxAttendees",
    COALESCE(c."Name", 'No Campaign') AS "CampaignName",
    /* Count attendees by type */
    COUNT(CASE WHEN ea."AttendeeType" = 'Donor' THEN 1 END) AS "DonorAttendees",
    COUNT(CASE WHEN ea."AttendeeType" = 'Volunteer' THEN 1 END) AS "VolunteerAttendees",
    COUNT(ea."ID") AS "TotalAttendees",
    -- Days until event using DATEDIFF with current date
    EXTRACT(DAY FROM (e."EventDate"::TIMESTAMPTZ - CAST(NOW() AS DATE)::TIMESTAMPTZ)) AS "DaysUntilEvent",
    /* Calculate hours between StartTime and EndTime using DATEDIFF with TIME */
    EXTRACT(EPOCH FROM (e."EndTime" - e."StartTime")) / 60 / 60.0 AS "EventDurationHours"
FROM sample_npo."Event" e
LEFT JOIN sample_npo."Campaign" c ON c."ID" = e."CampaignID"
LEFT JOIN sample_npo."EventAttendee" ea ON ea."EventID" = e."ID"
GROUP BY e."ID", e."Name", e."EventDate", e."StartTime", e."EndTime", e."Location", e."Status", e."MaxAttendees", c."Name";

CREATE OR REPLACE VIEW sample_npo.vwVolunteerLeaderboard AS SELECT
    v."ID" AS "VolunteerID",
    v."FirstName",
    v."LastName",
    v."Email",
    v."IsActive",
    SUM(vl."HoursWorked") AS "TotalApprovedHours",
    COUNT(DISTINCT vl."ID") AS "TotalLogEntries",
    COUNT(DISTINCT ea."EventID") AS "EventsAttended",
    -- Month of joining using MONTH()
    EXTRACT(MONTH FROM v."JoinDate") AS "JoinMonth",
    EXTRACT(YEAR FROM v."JoinDate") AS "JoinYear",
    /* Calculate average hours per log entry */
    ROUND(SUM(vl."HoursWorked") / NULLIF(COUNT(vl."ID"), 0), 1) AS "AvgHoursPerEntry"
FROM sample_npo."Volunteer" v
LEFT JOIN sample_npo."VolunteerLog" vl ON vl."VolunteerID" = v."ID" AND vl."IsApproved" = 1
LEFT JOIN sample_npo."EventAttendee" ea ON ea."VolunteerID" = v."ID"
GROUP BY v."ID", v."FirstName", v."LastName", v."Email", v."IsActive", v."JoinDate"
HAVING SUM(vl."HoursWorked") > 0 OR COUNT(ea."EventID") > 0;


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

/* ============================================================
   Sample Data: Campaigns
   ============================================================ */
INSERT INTO sample_npo."Campaign" ("ID", "Name", "Description", "GoalAmount", "StartDate", "EndDate", "Status", "IsActive")
VALUES
    ('A0000001-0001-0001-0001-000000000001', 'Annual Fund Drive 2025', 'Our primary annual fundraising campaign to support general operations and community programs.', 500000.00, '2025-01-15', '2025-12-31', 'Active', 1),
    ('A0000001-0001-0001-0001-000000000002', 'Youth Education Initiative', 'Fundraising for after-school tutoring, scholarships, and STEM programs for local youth.', 150000.00, '2025-03-01', '2025-09-30', 'Active', 1),
    ('A0000001-0001-0001-0001-000000000003', 'Emergency Relief Fund', 'Rapid-response fund for natural disaster relief and community emergencies.', 75000.00, '2025-02-01', '2025-06-30', 'Active', 1),
    ('A0000001-0001-0001-0001-000000000004', 'Community Garden Project', 'Building sustainable community gardens in three underserved neighborhoods.', 25000.00, '2024-06-01', '2024-12-31', 'Completed', 0),
    ('A0000001-0001-0001-0001-000000000005', 'Holiday Giving Campaign', 'Seasonal campaign for holiday meals, gifts, and winter necessities for families in need.', 100000.00, '2025-10-01', '2025-12-25', 'Planning', 1);

/* ============================================================
   Sample Data: Donors (15)
   ============================================================ */
INSERT INTO sample_npo."Donor" ("ID", "FirstName", "LastName", "Email", "Phone", "Address", "City", "State", "ZipCode", "DonorType", "IsAnonymous", "FirstDonationDate", "Notes")
VALUES
    ('B0000001-0001-0001-0001-000000000001', 'Margaret', 'Thompson', 'margaret.thompson@email.com', '555-0101', '123 Oak Lane', 'Portland', 'OR', '97201', 'Individual', 0, '2023-03-15', 'Long-time supporter since 2023'),
    ('B0000001-0001-0001-0001-000000000002', 'Robert', 'Chen', 'robert.chen@email.com', '555-0102', '456 Maple Ave', 'Seattle', 'WA', '98101', 'Individual', 0, '2024-01-10', NULL),
    ('B0000001-0001-0001-0001-000000000003', 'Acme Industries', 'Corp', 'giving@acmeindustries.com', '555-0103', '789 Business Blvd', 'San Francisco', 'CA', '94102', 'Corporate', 0, '2024-06-01', 'Corporate matching program active'),
    ('B0000001-0001-0001-0001-000000000004', 'Sarah', 'Williams', 'sarah.w@email.com', '555-0104', '321 Birch St', 'Denver', 'CO', '80201', 'Individual', 1, '2024-08-20', 'Prefers anonymous donations'),
    ('B0000001-0001-0001-0001-000000000005', 'Johnson Family', 'Foundation', 'grants@johnsonfoundation.org', '555-0105', '100 Foundation Way', 'Chicago', 'IL', '60601', 'Foundation', 0, '2023-01-05', 'Annual grant partner'),
    ('B0000001-0001-0001-0001-000000000006', 'David', 'Martinez', 'david.m@email.com', '555-0106', '555 Pine Rd', 'Austin', 'TX', '73301', 'Individual', 0, '2025-01-20', NULL),
    ('B0000001-0001-0001-0001-000000000007', 'Emily', 'Nakamura', 'emily.n@email.com', '555-0107', '777 Cedar Ct', 'Portland', 'OR', '97202', 'Individual', 0, '2024-11-15', 'Interested in youth programs'),
    ('B0000001-0001-0001-0001-000000000008', 'TechForGood', 'Inc', 'csr@techforgood.com', '555-0108', '200 Innovation Dr', 'San Jose', 'CA', '95101', 'Corporate', 0, '2024-03-01', 'Technology company CSR program'),
    ('B0000001-0001-0001-0001-000000000009', 'Patricia', 'O''Brien', 'patricia.ob@email.com', '555-0109', '888 Elm Way', 'Boston', 'MA', '02101', 'Individual', 0, '2023-07-22', NULL),
    ('B0000001-0001-0001-0001-000000000010', 'Green Earth', 'Foundation', 'info@greenearthfdn.org', '555-0110', '50 Nature Lane', 'Eugene', 'OR', '97401', 'Foundation', 0, '2024-04-10', 'Environmental focus grants'),
    ('B0000001-0001-0001-0001-000000000011', 'James', 'Washington', 'james.w@email.com', '555-0111', NULL, NULL, NULL, NULL, 'Individual', 1, '2025-02-01', 'Anonymous donor'),
    ('B0000001-0001-0001-0001-000000000012', 'Lisa', 'Patel', 'lisa.patel@email.com', '555-0112', '432 Walnut Blvd', 'Phoenix', 'AZ', '85001', 'Individual', 0, '2024-09-05', NULL),
    ('B0000001-0001-0001-0001-000000000013', 'Community Builders', 'LLC', 'donate@communitybuilders.com', '555-0113', '600 Main St', 'Portland', 'OR', '97203', 'Corporate', 0, '2023-11-20', 'Local business supporter'),
    ('B0000001-0001-0001-0001-000000000014', 'Michael', 'Kim', 'michael.kim@email.com', '555-0114', '175 Spruce Ave', 'Seattle', 'WA', '98102', 'Individual', 0, '2025-03-10', 'New donor, referred by Margaret'),
    ('B0000001-0001-0001-0001-000000000015', 'Anna', 'Rosenberg', 'anna.r@email.com', NULL, '290 Oak Park Dr', 'Minneapolis', 'MN', '55401', 'Individual', 0, '2024-05-18', 'Monthly recurring donor');

/* ============================================================
   Sample Data: Donations (30)
   ============================================================ */
INSERT INTO sample_npo."Donation" ("ID", "DonorID", "CampaignID", "Amount", "DonationDate", "PaymentMethod", "IsRecurring", "ReceiptNumber", "TaxDeductible", "Notes")
VALUES
    ('C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000001', 5000.00, '2025-01-20', 'Credit', 0, 'RCP-2025-00001', 1, 'Annual gift'),
    ('C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000002', 'A0000001-0001-0001-0001-000000000001', 250.00, '2025-01-25', 'Credit', 1, 'RCP-2025-00002', 1, NULL),
    ('C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000003', 'A0000001-0001-0001-0001-000000000001', 25000.00, '2025-02-01', 'Wire', 0, 'RCP-2025-00003', 1, 'Corporate matching donation'),
    ('C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000004', 'A0000001-0001-0001-0001-000000000002', 1000.00, '2025-02-15', 'Check', 0, 'RCP-2025-00004', 1, 'Anonymous gift for youth programs'),
    ('C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000002', 50000.00, '2025-03-05', 'Wire', 0, 'RCP-2025-00005', 1, 'Foundation annual grant'),
    ('C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000003', 2500.00, '2025-02-10', 'Credit', 0, 'RCP-2025-00006', 1, 'Emergency relief contribution'),
    ('C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000006', 'A0000001-0001-0001-0001-000000000001', 100.00, '2025-02-20', 'Cash', 0, 'RCP-2025-00007', 1, NULL),
    ('C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000007', 'A0000001-0001-0001-0001-000000000002', 500.00, '2025-03-01', 'Credit', 1, 'RCP-2025-00008', 1, 'Monthly for youth education'),
    ('C0000001-0001-0001-0001-000000000009', 'B0000001-0001-0001-0001-000000000008', 'A0000001-0001-0001-0001-000000000001', 10000.00, '2025-03-10', 'ACH', 0, 'RCP-2025-00009', 1, 'CSR quarterly donation'),
    ('C0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000009', NULL, 750.00, '2025-03-15', 'Check', 0, 'RCP-2025-00010', 1, 'General fund'),
    ('C0000001-0001-0001-0001-000000000011', 'B0000001-0001-0001-0001-000000000010', 'A0000001-0001-0001-0001-000000000004', 15000.00, '2024-07-01', 'Wire', 0, 'RCP-2024-00011', 1, 'Garden project grant'),
    ('C0000001-0001-0001-0001-000000000012', 'B0000001-0001-0001-0001-000000000011', 'A0000001-0001-0001-0001-000000000003', 500.00, '2025-02-28', 'Cash', 0, 'RCP-2025-00012', 0, 'Anonymous cash donation'),
    ('C0000001-0001-0001-0001-000000000013', 'B0000001-0001-0001-0001-000000000012', 'A0000001-0001-0001-0001-000000000001', 200.00, '2025-03-20', 'Credit', 1, 'RCP-2025-00013', 1, NULL),
    ('C0000001-0001-0001-0001-000000000014', 'B0000001-0001-0001-0001-000000000013', 'A0000001-0001-0001-0001-000000000001', 5000.00, '2025-01-30', 'Check', 0, 'RCP-2025-00014', 1, 'Community builders annual gift'),
    ('C0000001-0001-0001-0001-000000000015', 'B0000001-0001-0001-0001-000000000002', 'A0000001-0001-0001-0001-000000000001', 250.00, '2025-02-25', 'Credit', 1, 'RCP-2025-00015', 1, 'Monthly recurring'),
    ('C0000001-0001-0001-0001-000000000016', 'B0000001-0001-0001-0001-000000000014', 'A0000001-0001-0001-0001-000000000002', 300.00, '2025-03-15', 'Credit', 0, 'RCP-2025-00016', 1, 'First donation'),
    ('C0000001-0001-0001-0001-000000000017', 'B0000001-0001-0001-0001-000000000015', 'A0000001-0001-0001-0001-000000000001', 150.00, '2025-01-15', 'ACH', 1, 'RCP-2025-00017', 1, 'Monthly recurring'),
    ('C0000001-0001-0001-0001-000000000018', 'B0000001-0001-0001-0001-000000000015', 'A0000001-0001-0001-0001-000000000001', 150.00, '2025-02-15', 'ACH', 1, 'RCP-2025-00018', 1, 'Monthly recurring'),
    ('C0000001-0001-0001-0001-000000000019', 'B0000001-0001-0001-0001-000000000015', 'A0000001-0001-0001-0001-000000000001', 150.00, '2025-03-15', 'ACH', 1, 'RCP-2025-00019', 1, 'Monthly recurring'),
    ('C0000001-0001-0001-0001-000000000020', 'B0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000002', 3000.00, '2025-03-25', 'Credit', 0, 'RCP-2025-00020', 1, 'Youth education support'),
    ('C0000001-0001-0001-0001-000000000021', 'B0000001-0001-0001-0001-000000000003', 'A0000001-0001-0001-0001-000000000003', 10000.00, '2025-03-01', 'Wire', 0, 'RCP-2025-00021', 1, 'Emergency fund corporate match'),
    ('C0000001-0001-0001-0001-000000000022', 'B0000001-0001-0001-0001-000000000006', 'A0000001-0001-0001-0001-000000000002', 150.00, '2025-03-28', 'Credit', 0, 'RCP-2025-00022', 1, NULL),
    ('C0000001-0001-0001-0001-000000000023', 'B0000001-0001-0001-0001-000000000007', 'A0000001-0001-0001-0001-000000000002', 500.00, '2025-04-01', 'Credit', 1, 'RCP-2025-00023', 1, 'Monthly for youth education'),
    ('C0000001-0001-0001-0001-000000000024', 'B0000001-0001-0001-0001-000000000009', 'A0000001-0001-0001-0001-000000000001', 1000.00, '2025-04-05', 'Check', 0, 'RCP-2025-00024', 1, NULL),
    ('C0000001-0001-0001-0001-000000000025', 'B0000001-0001-0001-0001-000000000004', NULL, 2000.00, '2025-04-10', 'Wire', 0, 'RCP-2025-00025', 1, 'General unrestricted'),
    ('C0000001-0001-0001-0001-000000000026', 'B0000001-0001-0001-0001-000000000008', 'A0000001-0001-0001-0001-000000000002', 7500.00, '2025-04-15', 'ACH', 0, 'RCP-2025-00026', 1, 'Tech education sponsorship'),
    ('C0000001-0001-0001-0001-000000000027', 'B0000001-0001-0001-0001-000000000012', 'A0000001-0001-0001-0001-000000000003', 100.00, '2025-03-05', 'Credit', 0, 'RCP-2025-00027', 1, NULL),
    ('C0000001-0001-0001-0001-000000000028', 'B0000001-0001-0001-0001-000000000013', 'A0000001-0001-0001-0001-000000000004', 3000.00, '2024-08-15', 'Check', 0, 'RCP-2024-00028', 1, 'Garden project support'),
    ('C0000001-0001-0001-0001-000000000029', 'B0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000001', 25000.00, '2025-04-20', 'Wire', 0, 'RCP-2025-00029', 1, 'Foundation mid-year grant'),
    ('C0000001-0001-0001-0001-000000000030', 'B0000001-0001-0001-0001-000000000014', 'A0000001-0001-0001-0001-000000000003', 500.00, '2025-04-22', 'Stock', 0, 'RCP-2025-00030', 1, 'Stock donation for emergency fund');

/* ============================================================
   Sample Data: Volunteers (10)
   ============================================================ */
INSERT INTO sample_npo."Volunteer" ("ID", "FirstName", "LastName", "Email", "Phone", "Skills", "AvailableDays", "IsActive", "TotalHours")
VALUES
    ('D0000001-0001-0001-0001-000000000001', 'Carlos', 'Rivera', 'carlos.r@email.com', '555-0201', 'Event planning, Photography', 'Mon,Wed,Fri', 1, 45.5),
    ('D0000001-0001-0001-0001-000000000002', 'Jessica', 'Liu', 'jessica.liu@email.com', '555-0202', 'Teaching, Mentoring, Tutoring', 'Tue,Thu,Sat', 1, 120.0),
    ('D0000001-0001-0001-0001-000000000003', 'Ahmed', 'Hassan', 'ahmed.h@email.com', '555-0203', 'Construction, Landscaping', 'Sat,Sun', 1, 80.0),
    ('D0000001-0001-0001-0001-000000000004', 'Rachel', 'Green', 'rachel.g@email.com', '555-0204', 'Cooking, Food service', 'Wed,Sat', 1, 35.0),
    ('D0000001-0001-0001-0001-000000000005', 'Thomas', 'Wright', 'thomas.w@email.com', '555-0205', 'IT support, Web development', 'Mon,Tue,Wed', 1, 60.5),
    ('D0000001-0001-0001-0001-000000000006', 'Maria', 'Gonzalez', 'maria.g@email.com', '555-0206', 'Translation, Community outreach', 'Mon,Thu,Fri', 1, 95.0),
    ('D0000001-0001-0001-0001-000000000007', 'Kevin', 'Park', 'kevin.p@email.com', '555-0207', 'Graphic design, Social media', 'Fri,Sat,Sun', 1, 25.0),
    ('D0000001-0001-0001-0001-000000000008', 'Susan', 'Baker', 'susan.b@email.com', '555-0208', 'Accounting, Data entry', 'Mon,Wed', 0, 15.0),
    ('D0000001-0001-0001-0001-000000000009', 'Daniel', 'Foster', 'daniel.f@email.com', '555-0209', 'First aid, CPR certified', 'Sat,Sun', 1, 40.0),
    ('D0000001-0001-0001-0001-000000000010', 'Sophie', 'Anderson', 'sophie.a@email.com', '555-0210', 'Music, Entertainment', 'Fri,Sat', 1, 18.0);

-- Sample Data: Events (8)
INSERT INTO sample_npo."Event" ("ID", "Name", "Description", "CampaignID", "EventDate", "StartTime", "EndTime", "Location", "MaxAttendees", "Status")
VALUES
    ('E0000001-0001-0001-0001-000000000001', 'Spring Gala Fundraiser', 'Annual black-tie gala dinner with silent auction and live entertainment.', 'A0000001-0001-0001-0001-000000000001', '2025-04-15', '18:00:00', '23:00:00', 'Grand Ballroom, Portland Convention Center', 300, 'Completed'),
    ('E0000001-0001-0001-0001-000000000002', 'Youth STEM Workshop', 'Hands-on science and technology workshop for kids ages 8-14.', 'A0000001-0001-0001-0001-000000000002', '2025-05-10', '09:00:00', '15:00:00', 'Community Center, 500 Learning Way', 50, 'Upcoming'),
    ('E0000001-0001-0001-0001-000000000003', 'Emergency Supply Drive', 'Collection event for emergency supplies, blankets, and food items.', 'A0000001-0001-0001-0001-000000000003', '2025-03-22', '08:00:00', '16:00:00', 'Warehouse District, 100 Storage Blvd', NULL, 'Completed'),
    ('E0000001-0001-0001-0001-000000000004', 'Community Garden Planting Day', 'Volunteers plant seedlings and install irrigation in the new community garden.', 'A0000001-0001-0001-0001-000000000004', '2024-09-15', '07:00:00', '14:00:00', 'Riverside Park Community Garden', 40, 'Completed'),
    ('E0000001-0001-0001-0001-000000000005', 'Summer 5K Charity Run', 'Annual charity run through downtown with prizes and post-race celebration.', 'A0000001-0001-0001-0001-000000000001', '2025-07-04', '06:30:00', '11:00:00', 'Pioneer Courthouse Square, Portland', 500, 'Upcoming'),
    ('E0000001-0001-0001-0001-000000000006', 'Donor Appreciation Dinner', 'Thank-you dinner for top donors and long-term supporters.', 'A0000001-0001-0001-0001-000000000001', '2025-06-20', '19:00:00', '22:00:00', 'The Garden Restaurant, 250 Fine Dining Ave', 75, 'Upcoming'),
    ('E0000001-0001-0001-0001-000000000007', 'Back-to-School Supply Giveaway', 'Free school supplies for children in underserved communities.', 'A0000001-0001-0001-0001-000000000002', '2025-08-20', '10:00:00', '14:00:00', 'Lincoln Elementary School Gymnasium', 200, 'Upcoming'),
    ('E0000001-0001-0001-0001-000000000008', 'Holiday Toy Collection Kickoff', 'Launch event for the holiday giving campaign toy collection drive.', 'A0000001-0001-0001-0001-000000000005', '2025-10-15', '11:00:00', '17:00:00', 'Central Mall Atrium', 150, 'Upcoming');

/* ============================================================
   Sample Data: EventAttendees
   ============================================================ */
INSERT INTO sample_npo."EventAttendee" ("ID", "EventID", "DonorID", "VolunteerID", "AttendeeType", "CheckedIn")
VALUES
    -- Spring Gala attendees
    ('F0000001-0001-0001-0001-000000000001', 'E0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', NULL, 'Donor', 1),
    ('F0000001-0001-0001-0001-000000000002', 'E0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000003', NULL, 'Donor', 1),
    ('F0000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000005', NULL, 'Donor', 1),
    ('F0000001-0001-0001-0001-000000000004', 'E0000001-0001-0001-0001-000000000001', NULL, 'D0000001-0001-0001-0001-000000000001', 'Volunteer', 1),
    ('F0000001-0001-0001-0001-000000000005', 'E0000001-0001-0001-0001-000000000001', NULL, 'D0000001-0001-0001-0001-000000000007', 'Volunteer', 1),
    -- STEM Workshop attendees
    ('F0000001-0001-0001-0001-000000000006', 'E0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000007', NULL, 'Donor', 0),
    ('F0000001-0001-0001-0001-000000000007', 'E0000001-0001-0001-0001-000000000002', NULL, 'D0000001-0001-0001-0001-000000000002', 'Volunteer', 0),
    ('F0000001-0001-0001-0001-000000000008', 'E0000001-0001-0001-0001-000000000002', NULL, 'D0000001-0001-0001-0001-000000000005', 'Volunteer', 0),
    -- Emergency Supply Drive
    ('F0000001-0001-0001-0001-000000000009', 'E0000001-0001-0001-0001-000000000003', NULL, 'D0000001-0001-0001-0001-000000000003', 'Volunteer', 1),
    ('F0000001-0001-0001-0001-000000000010', 'E0000001-0001-0001-0001-000000000003', NULL, 'D0000001-0001-0001-0001-000000000006', 'Volunteer', 1),
    ('F0000001-0001-0001-0001-000000000011', 'E0000001-0001-0001-0001-000000000003', NULL, 'D0000001-0001-0001-0001-000000000009', 'Volunteer', 1),
    -- Garden Planting Day
    ('F0000001-0001-0001-0001-000000000012', 'E0000001-0001-0001-0001-000000000004', NULL, 'D0000001-0001-0001-0001-000000000003', 'Volunteer', 1),
    ('F0000001-0001-0001-0001-000000000013', 'E0000001-0001-0001-0001-000000000004', NULL, 'D0000001-0001-0001-0001-000000000004', 'Volunteer', 1),
    ('F0000001-0001-0001-0001-000000000014', 'E0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000010', NULL, 'Donor', 1),
    -- 5K Run
    ('F0000001-0001-0001-0001-000000000015', 'E0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000002', NULL, 'Donor', 0),
    ('F0000001-0001-0001-0001-000000000016', 'E0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000012', NULL, 'Donor', 0),
    ('F0000001-0001-0001-0001-000000000017', 'E0000001-0001-0001-0001-000000000005', NULL, 'D0000001-0001-0001-0001-000000000009', 'Volunteer', 0),
    -- Donor Appreciation Dinner
    ('F0000001-0001-0001-0001-000000000018', 'E0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000001', NULL, 'Donor', 0),
    ('F0000001-0001-0001-0001-000000000019', 'E0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000005', NULL, 'Donor', 0),
    ('F0000001-0001-0001-0001-000000000020', 'E0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000009', NULL, 'Donor', 0);

/* ============================================================
   Sample Data: VolunteerLog
   ============================================================ */
INSERT INTO sample_npo."VolunteerLog" ("ID", "VolunteerID", "EventID", "LogDate", "HoursWorked", "TaskDescription", "ApprovedBy", "IsApproved")
VALUES
    ('A1000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', 'E0000001-0001-0001-0001-000000000001', '2025-04-15', 6.0, 'Event photography and setup coordination', 'Margaret Thompson', 1),
    ('A1000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000002', NULL, '2025-04-18', 3.0, 'After-school tutoring session - math and science', 'Emily Nakamura', 1),
    ('A1000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000003', '2025-03-22', 8.0, 'Loading and organizing emergency supplies', 'Carlos Rivera', 1),
    ('A1000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000004', '2024-09-15', 7.0, 'Digging garden beds and installing drip irrigation', 'Rachel Green', 1),
    ('A1000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000004', 'E0000001-0001-0001-0001-000000000004', '2024-09-15', 5.0, 'Planting seedlings and preparing compost areas', 'Ahmed Hassan', 1),
    ('A1000001-0001-0001-0001-000000000006', 'D0000001-0001-0001-0001-000000000005', NULL, '2025-04-01', 4.0, 'Website maintenance and donor portal updates', 'Thomas Wright', 1),
    ('A1000001-0001-0001-0001-000000000007', 'D0000001-0001-0001-0001-000000000006', 'E0000001-0001-0001-0001-000000000003', '2025-03-22', 8.0, 'Spanish translation and community liaison', 'Carlos Rivera', 1),
    ('A1000001-0001-0001-0001-000000000008', 'D0000001-0001-0001-0001-000000000007', 'E0000001-0001-0001-0001-000000000001', '2025-04-15', 5.0, 'Designed event materials and managed social media coverage', 'Margaret Thompson', 1),
    ('A1000001-0001-0001-0001-000000000009', 'D0000001-0001-0001-0001-000000000009', 'E0000001-0001-0001-0001-000000000003', '2025-03-22', 6.0, 'First aid station management during supply drive', 'Maria Gonzalez', 1),
    ('A1000001-0001-0001-0001-000000000010', 'D0000001-0001-0001-0001-000000000002', NULL, '2025-04-22', 2.5, 'One-on-one mentoring session with high school student', NULL, 0),
    ('A1000001-0001-0001-0001-000000000011', 'D0000001-0001-0001-0001-000000000006', NULL, '2025-04-20', 3.0, 'Community outreach flyer distribution', 'Jessica Liu', 1),
    ('A1000001-0001-0001-0001-000000000012', 'D0000001-0001-0001-0001-000000000010', NULL, '2025-04-12', 2.0, 'Performed at community center open mic night', NULL, 0);

-- Sample Data: Grants (3)
INSERT INTO sample_npo."Grant_" ("ID", "GrantorName", "Title", "Description", "Amount", "ApplicationDate", "AwardDate", "ExpirationDate", "Status", "RequirementsNotes", "CampaignID")
VALUES
    ('A2000001-0001-0001-0001-000000000001', 'National Education Foundation', 'Youth STEM Advancement Grant', 'Grant to fund after-school STEM programs, equipment, and instructor stipends for underserved communities.', 75000.00, '2025-01-15', '2025-03-01', '2026-03-01', 'Awarded', 'Quarterly progress reports required. Must serve minimum 100 students per semester.', 'A0000001-0001-0001-0001-000000000002'),
    ('A2000001-0001-0001-0001-000000000002', 'City of Portland Community Fund', 'Neighborhood Resilience Initiative', 'Funding for emergency preparedness programs and community resilience infrastructure.', 30000.00, '2025-02-20', NULL, NULL, 'Applied', 'Must demonstrate community partnerships. Matching funds preferred.', 'A0000001-0001-0001-0001-000000000003'),
    ('A2000001-0001-0001-0001-000000000003', 'Pacific Northwest Environmental Trust', 'Urban Green Spaces Program', 'Support for expanding community garden network and urban agriculture education.', 20000.00, '2024-04-10', '2024-06-15', '2025-06-15', 'Completed', 'Final report submitted. All deliverables met.', 'A0000001-0001-0001-0001-000000000004');


-- ===================== FK & CHECK Constraints =====================

/* ============================================================
   ALTER TABLE CHECK Constraints
   ============================================================ */
ALTER TABLE sample_npo."Donation"
    ADD CONSTRAINT CK_Donation_ReceiptLen CHECK (LENGTH("ReceiptNumber") >= 5) NOT VALID;

ALTER TABLE sample_npo."Volunteer"
    ADD CONSTRAINT CK_Volunteer_TotalHours CHECK ("TotalHours" >= 0) NOT VALID;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA sample_npo TO "NpoReader";


-- ===================== Comments =====================

COMMENT ON TABLE sample_npo."Campaign" IS 'Fundraising campaigns with goals and timelines';

COMMENT ON COLUMN sample_npo."Campaign"."ID" IS 'Unique identifier for the campaign';

COMMENT ON COLUMN sample_npo."Campaign"."GoalAmount" IS 'Target fundraising amount for the campaign';

COMMENT ON COLUMN sample_npo."Campaign"."Status" IS 'Current status: Planning, Active, Completed, or Cancelled';

COMMENT ON TABLE sample_npo."Donor" IS 'Individual, corporate, and foundation donors';

COMMENT ON COLUMN sample_npo."Donor"."ID" IS 'Unique identifier for the donor';

COMMENT ON COLUMN sample_npo."Donor"."DonorType" IS 'Type of donor: Individual, Corporate, or Foundation';

COMMENT ON COLUMN sample_npo."Donor"."IsAnonymous" IS 'Whether the donor prefers to remain anonymous';

COMMENT ON TABLE sample_npo."Donation" IS 'Financial contributions from donors';

COMMENT ON COLUMN sample_npo."Donation"."Amount" IS 'Donation amount in dollars';

COMMENT ON COLUMN sample_npo."Donation"."TaxDeductible" IS 'Whether this is a tax-deductible contribution';

COMMENT ON TABLE sample_npo."Volunteer" IS 'People who donate their time to the organization';

COMMENT ON COLUMN sample_npo."Volunteer"."TotalHours" IS 'Cumulative hours volunteered';

COMMENT ON TABLE sample_npo."Event" IS 'Fundraising and community events';

COMMENT ON COLUMN sample_npo."Event"."StartTime" IS 'Event start time';

COMMENT ON COLUMN sample_npo."Event"."EndTime" IS 'Event end time';

COMMENT ON TABLE sample_npo."EventAttendee" IS 'Links donors and volunteers to events';

COMMENT ON TABLE sample_npo."VolunteerLog" IS 'Tracks volunteer hours and task descriptions';

COMMENT ON COLUMN sample_npo."VolunteerLog"."HoursWorked" IS 'Number of hours worked on this task';

COMMENT ON TABLE sample_npo."Grant_" IS 'Grants applied for and received from external organizations';

COMMENT ON COLUMN sample_npo."Grant_"."Amount" IS 'Grant amount in dollars';
