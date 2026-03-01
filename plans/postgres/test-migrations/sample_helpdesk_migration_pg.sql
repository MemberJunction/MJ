-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_hd;
SET search_path TO sample_hd, public;

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

-- Priority lookup table
CREATE TABLE sample_hd."Priority" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(50) NOT NULL,
 "SortOrder" INTEGER NOT NULL DEFAULT 0,
 "ColorHex" VARCHAR(7) NULL,
 "SLAResponseMinutes" INTEGER NULL,
 "SLAResolutionMinutes" INTEGER NULL,
 CONSTRAINT "PK_Priority" PRIMARY KEY ("ID")
);

-- Department table
CREATE TABLE sample_hd."Department" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(150) NOT NULL,
 "ManagerEmail" VARCHAR(255) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "PK_Department" PRIMARY KEY ("ID")
);

-- SupportAgent table (inline CHECK on Tier)
CREATE TABLE sample_hd."SupportAgent" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "DepartmentID" UUID NOT NULL,
 "Tier" SMALLINT NOT NULL DEFAULT 1 CHECK ("Tier" BETWEEN 1 AND 3),
 "IsAvailable" BOOLEAN NOT NULL DEFAULT TRUE,
 "HireDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_SupportAgent" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_SupportAgent_Email" UNIQUE ("Email")
);

-- Category table with self-referencing FK (hierarchical)
CREATE TABLE sample_hd."Category" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(150) NOT NULL,
 "ParentCategoryID" UUID NULL,
 "DepartmentID" UUID NULL,
 "Description" VARCHAR(500) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "PK_Category" PRIMARY KEY ("ID")
);

-- Ticket table (inline CHECK on Status)
CREATE TABLE sample_hd."Ticket" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "TicketNumber" VARCHAR(20) NOT NULL,
 "Subject" VARCHAR(300) NOT NULL,
 "Description" TEXT NOT NULL,
 "RequestorEmail" VARCHAR(255) NOT NULL,
 "RequestorName" VARCHAR(200) NOT NULL,
 "CategoryID" UUID NOT NULL,
 "PriorityID" UUID NOT NULL,
 "AssignedAgentID" UUID NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK ("Status" IN ('Open', 'InProgress', 'Waiting', 'Resolved', 'Closed')),
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "ResolvedAt" TIMESTAMPTZ NULL,
 "ClosedAt" TIMESTAMPTZ NULL,
 "DueDate" TIMESTAMPTZ NULL,
 "IsEscalated" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT "PK_Ticket" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Ticket_TicketNumber" UNIQUE ("TicketNumber")
);

-- TicketComment table
CREATE TABLE sample_hd."TicketComment" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "TicketID" UUID NOT NULL,
 "AuthorEmail" VARCHAR(255) NOT NULL,
 "AuthorName" VARCHAR(200) NOT NULL,
 "Body" TEXT NOT NULL,
 "IsInternal" BOOLEAN NOT NULL DEFAULT FALSE,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_TicketComment" PRIMARY KEY ("ID")
);

-- TicketAttachment table (inline CHECK on FileSize)
CREATE TABLE sample_hd."TicketAttachment" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "TicketID" UUID NOT NULL,
 "FileName" VARCHAR(300) NOT NULL,
 "FileSize" INTEGER NOT NULL CHECK ("FileSize" > 0),
 "MimeType" VARCHAR(100) NOT NULL,
 "StoragePath" VARCHAR(500) NOT NULL,
 "UploadedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "UploadedBy" VARCHAR(255) NOT NULL,
 CONSTRAINT "PK_TicketAttachment" PRIMARY KEY ("ID")
);

-- KnowledgeArticle table (inline CHECK on ViewCount)
CREATE TABLE sample_hd."KnowledgeArticle" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Title" VARCHAR(300) NOT NULL,
 "Slug" VARCHAR(300) NOT NULL,
 "Body" TEXT NOT NULL,
 "CategoryID" UUID NULL,
 "AuthorAgentID" UUID NOT NULL,
 "IsPublished" BOOLEAN NOT NULL DEFAULT FALSE,
 "ViewCount" INTEGER NOT NULL DEFAULT 0 CHECK ("ViewCount" >= 0),
 "HelpfulCount" INTEGER NOT NULL DEFAULT 0,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_KnowledgeArticle" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_KnowledgeArticle_Slug" UNIQUE ("Slug")
);

-- TicketTag table
CREATE TABLE sample_hd."TicketTag" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "TicketID" UUID NOT NULL,
 "TagName" VARCHAR(50) NOT NULL,
 "AddedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_TicketTag" PRIMARY KEY ("ID")
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS "IX_Ticket_Status" ON sample_hd."Ticket" ("Status");

CREATE INDEX IF NOT EXISTS "IX_Ticket_CreatedAt" ON sample_hd."Ticket" ("CreatedAt");

CREATE INDEX IF NOT EXISTS "IX_TicketComment_TicketID" ON sample_hd."TicketComment" ("TicketID");

CREATE INDEX IF NOT EXISTS "IX_TicketTag_TagName" ON sample_hd."TicketTag" ("TagName");

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hd_reader') THEN
        CREATE ROLE hd_reader;
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_hd."vwOpenTickets"
AS SELECT
    t."ID",
    t."TicketNumber",
    t."Subject",
    t."RequestorName",
    t."RequestorEmail",
    t."Status",
    t."CreatedAt",
    t."UpdatedAt",
    t."DueDate",
    t."IsEscalated",
    c."Name" AS "CategoryName",
    p."Name" AS "PriorityName",
    p."ColorHex" AS "PriorityColor",
    p."SLAResponseMinutes",
    COALESCE(sa."FirstName" || ' ' || sa."LastName", 'Unassigned') AS "AssignedAgent",
    COALESCE(sa."Email", '') AS "AgentEmail",
    EXTRACT(EPOCH FROM (NOW()::TIMESTAMPTZ - t."CreatedAt"::TIMESTAMPTZ)) / 3600 AS "AgeHours",
    EXTRACT(EPOCH FROM (NOW()::TIMESTAMPTZ - t."CreatedAt"::TIMESTAMPTZ)) / 60 AS "AgeMinutes",
    CASE
        WHEN p."SLAResponseMinutes" IS NOT NULL
             AND EXTRACT(EPOCH FROM (NOW()::TIMESTAMPTZ - t."CreatedAt"::TIMESTAMPTZ)) / 60 > p."SLAResponseMinutes"
        THEN 1
        ELSE 0
    END AS "IsSLABreached"
FROM sample_hd."Ticket" t
INNER JOIN sample_hd."Category" c ON t."CategoryID" = c."ID"
INNER JOIN sample_hd."Priority" p ON t."PriorityID" = p."ID"
LEFT JOIN sample_hd."SupportAgent" sa ON t."AssignedAgentID" = sa."ID"
WHERE t."Status" NOT IN ('Resolved', 'Closed');

CREATE OR REPLACE VIEW sample_hd."vwAgentWorkload"
AS SELECT
    sa."ID",
    sa."FirstName",
    sa."LastName",
    sa."Email",
    sa."Tier",
    sa."IsAvailable",
    d."Name" AS "DepartmentName",
    COALESCE((SELECT COUNT(*) FROM sample_hd."Ticket" t WHERE t."AssignedAgentID" = sa."ID" AND t."Status" NOT IN ('Resolved', 'Closed')), 0) AS "OpenTicketCount",
    (SELECT COUNT(*) FROM sample_hd."Ticket" t WHERE t."AssignedAgentID" = sa."ID" AND t."Status" IN ('Resolved', 'Closed')) AS "ResolvedTicketCount",
    (SELECT AVG(CAST(EXTRACT(EPOCH FROM (COALESCE(t."ResolvedAt", NOW())::TIMESTAMPTZ - t."CreatedAt"::TIMESTAMPTZ)) / 3600 AS DECIMAL(10,2)))
     FROM sample_hd."Ticket" t
     WHERE t."AssignedAgentID" = sa."ID"
       AND t."Status" IN ('Resolved', 'Closed')
       AND t."ResolvedAt" IS NOT NULL) AS "AvgResolutionHours"
FROM sample_hd."SupportAgent" sa
INNER JOIN sample_hd."Department" d ON sa."DepartmentID" = d."ID";

CREATE OR REPLACE VIEW sample_hd."vwCategorySummary"
AS SELECT
    c."ID",
    c."Name" AS "CategoryName",
    COALESCE(pc."Name", '(Top Level)') AS "ParentCategoryName",
    c."IsActive",
    COALESCE(d."Name", '(No Department)') AS "DepartmentName",
    (SELECT COUNT(*) FROM sample_hd."Ticket" t WHERE t."CategoryID" = c."ID") AS "TotalTickets",
    (SELECT COUNT(*) FROM sample_hd."Ticket" t WHERE t."CategoryID" = c."ID" AND t."Status" NOT IN ('Resolved', 'Closed')) AS "OpenTickets",
    (SELECT AVG(CAST(EXTRACT(EPOCH FROM (t."ResolvedAt"::TIMESTAMPTZ - t."CreatedAt"::TIMESTAMPTZ)) / 3600 AS DECIMAL(10,2)))
     FROM sample_hd."Ticket" t
     WHERE t."CategoryID" = c."ID"
       AND t."ResolvedAt" IS NOT NULL) AS "AvgResolutionHours"
FROM sample_hd."Category" c
LEFT JOIN sample_hd."Category" pc ON c."ParentCategoryID" = pc."ID"
LEFT JOIN sample_hd."Department" d ON c."DepartmentID" = d."ID";

CREATE OR REPLACE VIEW sample_hd."vwKnowledgeBase"
AS SELECT
    ka."ID",
    ka."Title",
    ka."Slug",
    ka."Body",
    ka."ViewCount",
    ka."HelpfulCount",
    ka."CreatedAt",
    ka."UpdatedAt",
    COALESCE(c."Name", 'Uncategorized') AS "CategoryName",
    sa."FirstName" || ' ' || sa."LastName" AS "AuthorName",
    sa."Email" AS "AuthorEmail",
    CASE
        WHEN ka."ViewCount" > 0
        THEN CAST(ka."HelpfulCount" AS DECIMAL(5,2)) / CAST(ka."ViewCount" AS DECIMAL(5,2)) * 100
        ELSE 0
    END AS "HelpfulPercent",
    EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - ka."CreatedAt"::TIMESTAMPTZ)) AS "AgeDays"
FROM sample_hd."KnowledgeArticle" ka
INNER JOIN sample_hd."SupportAgent" sa ON ka."AuthorAgentID" = sa."ID"
LEFT JOIN sample_hd."Category" c ON ka."CategoryID" = c."ID"
WHERE ka."IsPublished" = 1;


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Priorities (4)
INSERT INTO sample_hd."Priority" ("ID", "Name", "SortOrder", "ColorHex", "SLAResponseMinutes", "SLAResolutionMinutes")
VALUES ('D0000001-0000-0000-0000-000000000001', 'Critical', 1, '#FF0000', 15, 120);

INSERT INTO sample_hd."Priority" ("ID", "Name", "SortOrder", "ColorHex", "SLAResponseMinutes", "SLAResolutionMinutes")
VALUES ('D0000001-0000-0000-0000-000000000002', 'High', 2, '#FF8800', 60, 480);

INSERT INTO sample_hd."Priority" ("ID", "Name", "SortOrder", "ColorHex", "SLAResponseMinutes", "SLAResolutionMinutes")
VALUES ('D0000001-0000-0000-0000-000000000003', 'Medium', 3, '#FFCC00', 240, 1440);

INSERT INTO sample_hd."Priority" ("ID", "Name", "SortOrder", "ColorHex", "SLAResponseMinutes", "SLAResolutionMinutes")
VALUES ('D0000001-0000-0000-0000-000000000004', 'Low', 4, '#00CC00', NULL, NULL);

-- Departments (3)
INSERT INTO sample_hd."Department" ("ID", "Name", "ManagerEmail", "IsActive")
VALUES ('D0000002-0000-0000-0000-000000000001', 'IT Infrastructure', 'mgr.infra@example.com', 1);

INSERT INTO sample_hd."Department" ("ID", "Name", "ManagerEmail", "IsActive")
VALUES ('D0000002-0000-0000-0000-000000000002', 'Application Support', 'mgr.apps@example.com', 1);

INSERT INTO sample_hd."Department" ("ID", "Name", "ManagerEmail", "IsActive")
VALUES ('D0000002-0000-0000-0000-000000000003', 'Security Operations', 'mgr.security@example.com', 1);

-- SupportAgents (8)
INSERT INTO sample_hd."SupportAgent" ("ID", "FirstName", "LastName", "Email", "Phone", "DepartmentID", "Tier", "IsAvailable", "HireDate")
VALUES ('D0000003-0000-0000-0000-000000000001', 'Alice', 'Chen', 'alice.chen@helpdesk.com', '555-0101', 'D0000002-0000-0000-0000-000000000001', 3, 1, '2021-03-15');

INSERT INTO sample_hd."SupportAgent" ("ID", "FirstName", "LastName", "Email", "Phone", "DepartmentID", "Tier", "IsAvailable", "HireDate")
VALUES ('D0000003-0000-0000-0000-000000000002', 'Bob', 'Martinez', 'bob.martinez@helpdesk.com', '555-0102', 'D0000002-0000-0000-0000-000000000001', 2, 1, '2022-01-10');

INSERT INTO sample_hd."SupportAgent" ("ID", "FirstName", "LastName", "Email", "Phone", "DepartmentID", "Tier", "IsAvailable", "HireDate")
VALUES ('D0000003-0000-0000-0000-000000000003', 'Carol', 'Okafor', 'carol.okafor@helpdesk.com', '555-0103', 'D0000002-0000-0000-0000-000000000002', 2, 1, '2022-06-20');

INSERT INTO sample_hd."SupportAgent" ("ID", "FirstName", "LastName", "Email", "Phone", "DepartmentID", "Tier", "IsAvailable", "HireDate")
VALUES ('D0000003-0000-0000-0000-000000000004', 'David', 'Singh', 'david.singh@helpdesk.com', '555-0104', 'D0000002-0000-0000-0000-000000000002', 1, 1, '2023-02-14');

INSERT INTO sample_hd."SupportAgent" ("ID", "FirstName", "LastName", "Email", "Phone", "DepartmentID", "Tier", "IsAvailable", "HireDate")
VALUES ('D0000003-0000-0000-0000-000000000005', 'Eva', 'Kowalski', 'eva.kowalski@helpdesk.com', NULL, 'D0000002-0000-0000-0000-000000000003', 3, 1, '2020-09-01');

INSERT INTO sample_hd."SupportAgent" ("ID", "FirstName", "LastName", "Email", "Phone", "DepartmentID", "Tier", "IsAvailable", "HireDate")
VALUES ('D0000003-0000-0000-0000-000000000006', 'Frank', 'Yamamoto', 'frank.yamamoto@helpdesk.com', '555-0106', 'D0000002-0000-0000-0000-000000000003', 2, 0, '2022-11-05');

INSERT INTO sample_hd."SupportAgent" ("ID", "FirstName", "LastName", "Email", "Phone", "DepartmentID", "Tier", "IsAvailable", "HireDate")
VALUES ('D0000003-0000-0000-0000-000000000007', 'Grace', 'Nkemelu', 'grace.nkemelu@helpdesk.com', '555-0107', 'D0000002-0000-0000-0000-000000000001', 1, 1, '2024-01-08');

INSERT INTO sample_hd."SupportAgent" ("ID", "FirstName", "LastName", "Email", "Phone", "DepartmentID", "Tier", "IsAvailable", "HireDate")
VALUES ('D0000003-0000-0000-0000-000000000008', 'Hiro', 'Tanaka', 'hiro.tanaka@helpdesk.com', '555-0108', 'D0000002-0000-0000-0000-000000000002', 1, 1, '2024-06-15');

-- Categories (6 with hierarchy)
INSERT INTO sample_hd."Category" ("ID", "Name", "ParentCategoryID", "DepartmentID", "Description", "IsActive")
VALUES ('D0000004-0000-0000-0000-000000000001', 'Hardware', NULL, 'D0000002-0000-0000-0000-000000000001', 'Physical hardware issues and requests', 1);

INSERT INTO sample_hd."Category" ("ID", "Name", "ParentCategoryID", "DepartmentID", "Description", "IsActive")
VALUES ('D0000004-0000-0000-0000-000000000002', 'Software', NULL, 'D0000002-0000-0000-0000-000000000002', 'Software installation, licensing, and bugs', 1);

INSERT INTO sample_hd."Category" ("ID", "Name", "ParentCategoryID", "DepartmentID", "Description", "IsActive")
VALUES ('D0000004-0000-0000-0000-000000000003', 'Network', NULL, 'D0000002-0000-0000-0000-000000000001', 'Network connectivity and VPN issues', 1);

INSERT INTO sample_hd."Category" ("ID", "Name", "ParentCategoryID", "DepartmentID", "Description", "IsActive")
VALUES ('D0000004-0000-0000-0000-000000000004', 'Laptop Issues', 'D0000004-0000-0000-0000-000000000001', 'D0000002-0000-0000-0000-000000000001', 'Laptop-specific hardware problems', 1);

INSERT INTO sample_hd."Category" ("ID", "Name", "ParentCategoryID", "DepartmentID", "Description", "IsActive")
VALUES ('D0000004-0000-0000-0000-000000000005', 'Email & Calendar', 'D0000004-0000-0000-0000-000000000002', 'D0000002-0000-0000-0000-000000000002', 'Email client and calendar sync issues', 1);

INSERT INTO sample_hd."Category" ("ID", "Name", "ParentCategoryID", "DepartmentID", "Description", "IsActive")
VALUES ('D0000004-0000-0000-0000-000000000006', 'Security Incidents', NULL, 'D0000002-0000-0000-0000-000000000003', 'Security breach reports and access issues', 1);

-- Tickets (15)
INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000001', 'HD-2024-0001', 'Laptop won''t power on', 'My ThinkPad X1 Carbon won''t turn on after the weekend. Tried holding power button for 30 seconds, no response. Charging light is off.', 'jsmith@company.com', 'John Smith', 'D0000004-0000-0000-0000-000000000004', 'D0000001-0000-0000-0000-000000000002', 'D0000003-0000-0000-0000-000000000001', 'InProgress', '2024-11-01 08:30:00', '2024-11-01 09:15:00', NULL, NULL, '2024-11-02 08:30:00', 0);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000002', 'HD-2024-0002', 'Cannot connect to VPN', 'VPN client shows "Connection timed out" error when trying to connect from home. Was working fine last week. Running Windows 11.', 'mjones@company.com', 'Mary Jones', 'D0000004-0000-0000-0000-000000000003', 'D0000001-0000-0000-0000-000000000002', 'D0000003-0000-0000-0000-000000000002', 'Resolved', '2024-10-28 14:20:00', '2024-10-29 10:00:00', '2024-10-29 10:00:00', NULL, '2024-10-29 14:20:00', 0);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000003', 'HD-2024-0003', 'Outlook keeps crashing', 'Outlook 365 crashes every time I try to open a calendar invite. Error code 0x80040154. Reinstall did not help.', 'rpatel@company.com', 'Raj Patel', 'D0000004-0000-0000-0000-000000000005', 'D0000001-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000003', 'Waiting', '2024-11-02 09:00:00', '2024-11-03 11:30:00', NULL, NULL, '2024-11-03 09:00:00', 0);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000004', 'HD-2024-0004', 'Suspected phishing email received', 'Received an email from "IT Department" asking me to click a link to verify my password. The sender address looks suspicious: it-dept@c0mpany-secure.net', 'lwilson@company.com', 'Lisa Wilson', 'D0000004-0000-0000-0000-000000000006', 'D0000001-0000-0000-0000-000000000001', 'D0000003-0000-0000-0000-000000000005', 'Closed', '2024-10-25 16:45:00', '2024-10-26 09:00:00', '2024-10-25 18:00:00', '2024-10-26 09:00:00', '2024-10-25 17:00:00', 1);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000005', 'HD-2024-0005', 'New software installation request', 'Need Adobe Creative Suite installed on my workstation for the marketing campaign. Manager approved budget code MC-2024-Q4.', 'kgarcia@company.com', 'Karen Garcia', 'D0000004-0000-0000-0000-000000000002', 'D0000001-0000-0000-0000-000000000004', 'D0000003-0000-0000-0000-000000000004', 'Open', '2024-11-04 10:00:00', '2024-11-04 10:00:00', NULL, NULL, NULL, 0);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000006', 'HD-2024-0006', 'Server room UPS alarm', 'UPS unit 3 in server room B is showing a battery fault alarm. Backup power may be compromised.', 'ops@company.com', 'Operations Team', 'D0000004-0000-0000-0000-000000000001', 'D0000001-0000-0000-0000-000000000001', 'D0000003-0000-0000-0000-000000000001', 'InProgress', '2024-11-04 06:15:00', '2024-11-04 06:30:00', NULL, NULL, '2024-11-04 08:15:00', 1);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000007', 'HD-2024-0007', 'Printer not working on 3rd floor', 'The HP LaserJet on the 3rd floor near conference room C is showing "Paper Jam" but there is no paper stuck. Power cycling did not help.', 'tlee@company.com', 'Tom Lee', 'D0000004-0000-0000-0000-000000000001', 'D0000001-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000007', 'Open', '2024-11-04 11:30:00', '2024-11-04 11:30:00', NULL, NULL, '2024-11-05 11:30:00', 0);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000008', 'HD-2024-0008', 'Password reset needed', 'I am locked out of my Active Directory account after too many failed attempts. Need immediate reset.', 'scohen@company.com', 'Sarah Cohen', 'D0000004-0000-0000-0000-000000000006', 'D0000001-0000-0000-0000-000000000002', 'D0000003-0000-0000-0000-000000000006', 'Resolved', '2024-10-30 07:45:00', '2024-10-30 08:10:00', '2024-10-30 08:10:00', '2024-10-30 08:30:00', '2024-10-30 08:45:00', 0);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000009', 'HD-2024-0009', 'WiFi dropping intermittently in Building A', 'Multiple users in Building A reporting WiFi disconnects every 10-15 minutes. Started after the firmware update on Friday.', 'netops@company.com', 'Network Ops', 'D0000004-0000-0000-0000-000000000003', 'D0000001-0000-0000-0000-000000000002', 'D0000003-0000-0000-0000-000000000002', 'InProgress', '2024-11-04 08:00:00', '2024-11-04 10:00:00', NULL, NULL, '2024-11-04 16:00:00', 1);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000010', 'HD-2024-0010', 'Request for second monitor', 'Would like a second monitor for my desk in cubicle 4B. Current setup is a single 24-inch display.', 'azhang@company.com', 'Amy Zhang', 'D0000004-0000-0000-0000-000000000001', 'D0000001-0000-0000-0000-000000000004', NULL, 'Open', '2024-11-04 13:00:00', '2024-11-04 13:00:00', NULL, NULL, NULL, 0);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000011', 'HD-2024-0011', 'Calendar sync issue between phone and desktop', 'My iPhone calendar is not syncing with Outlook desktop. Last sync was 3 days ago. Phone is on iOS 17.', 'bfreeman@company.com', 'Brian Freeman', 'D0000004-0000-0000-0000-000000000005', 'D0000001-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000008', 'Open', '2024-11-04 14:30:00', '2024-11-04 14:30:00', NULL, NULL, '2024-11-05 14:30:00', 0);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000012', 'HD-2024-0012', 'Malware detected on workstation', 'Antivirus flagged trojan activity on WS-3F-012. Machine has been isolated from the network per protocol.', 'security@company.com', 'Security Team', 'D0000004-0000-0000-0000-000000000006', 'D0000001-0000-0000-0000-000000000001', 'D0000003-0000-0000-0000-000000000005', 'InProgress', '2024-11-04 15:00:00', '2024-11-04 15:15:00', NULL, NULL, '2024-11-04 17:00:00', 1);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000013', 'HD-2024-0013', 'Slow application performance', 'Our internal CRM application is extremely slow today. Page loads taking 15-20 seconds. Other websites are fine.', 'dmiller@company.com', 'Diana Miller', 'D0000004-0000-0000-0000-000000000002', 'D0000001-0000-0000-0000-000000000002', 'D0000003-0000-0000-0000-000000000003', 'Waiting', '2024-11-04 09:30:00', '2024-11-04 11:00:00', NULL, NULL, '2024-11-04 17:30:00', 0);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000014', 'HD-2024-0014', 'New employee onboarding - IT setup', 'New hire starting Monday 11/11. Need laptop, monitor, dock, AD account, email, and VPN access. See attached onboarding form.', 'hr@company.com', 'HR Department', 'D0000004-0000-0000-0000-000000000001', 'D0000001-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000004', 'Open', '2024-11-04 16:00:00', '2024-11-04 16:00:00', NULL, NULL, '2024-11-08 17:00:00', 0);

INSERT INTO sample_hd."Ticket" ("ID", "TicketNumber", "Subject", "Description", "RequestorEmail", "RequestorName", "CategoryID", "PriorityID", "AssignedAgentID", "Status", "CreatedAt", "UpdatedAt", "ResolvedAt", "ClosedAt", "DueDate", "IsEscalated")
VALUES ('D0000005-0000-0000-0000-000000000015', 'HD-2024-0015', 'License renewal for Visual Studio', 'Visual Studio Enterprise license expires next week. Need renewal for development team (12 seats). PO attached.', 'devlead@company.com', 'Dev Lead', 'D0000004-0000-0000-0000-000000000002', 'D0000001-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000003', 'Resolved', '2024-10-20 10:00:00', '2024-10-22 14:00:00', '2024-10-22 14:00:00', '2024-10-23 09:00:00', '2024-10-27 10:00:00', 0);

-- TicketComments (various)
INSERT INTO sample_hd."TicketComment" ("ID", "TicketID", "AuthorEmail", "AuthorName", "Body", "IsInternal", "CreatedAt")
VALUES ('D0000006-0000-0000-0000-000000000001', 'D0000005-0000-0000-0000-000000000001', 'alice.chen@helpdesk.com', 'Alice Chen', 'Checked power supply and battery. Battery is completely dead. Ordering replacement battery under warranty.', 1, '2024-11-01 09:15:00');

INSERT INTO sample_hd."TicketComment" ("ID", "TicketID", "AuthorEmail", "AuthorName", "Body", "IsInternal", "CreatedAt")
VALUES ('D0000006-0000-0000-0000-000000000002', 'D0000005-0000-0000-0000-000000000001', 'alice.chen@helpdesk.com', 'Alice Chen', 'Hi John, we''ve identified a dead battery. A replacement has been ordered and should arrive in 1-2 business days.', 0, '2024-11-01 09:20:00');

INSERT INTO sample_hd."TicketComment" ("ID", "TicketID", "AuthorEmail", "AuthorName", "Body", "IsInternal", "CreatedAt")
VALUES ('D0000006-0000-0000-0000-000000000003', 'D0000005-0000-0000-0000-000000000002', 'bob.martinez@helpdesk.com', 'Bob Martinez', 'VPN certificate had expired. Renewed the certificate and pushed updated config to the client. User confirmed connectivity restored.', 0, '2024-10-29 10:00:00');

INSERT INTO sample_hd."TicketComment" ("ID", "TicketID", "AuthorEmail", "AuthorName", "Body", "IsInternal", "CreatedAt")
VALUES ('D0000006-0000-0000-0000-000000000004', 'D0000005-0000-0000-0000-000000000003', 'carol.okafor@helpdesk.com', 'Carol Okafor', 'Reproduced the crash. Appears to be a known Outlook bug with KB5031354. Waiting for Microsoft patch.', 1, '2024-11-03 11:30:00');

INSERT INTO sample_hd."TicketComment" ("ID", "TicketID", "AuthorEmail", "AuthorName", "Body", "IsInternal", "CreatedAt")
VALUES ('D0000006-0000-0000-0000-000000000005', 'D0000005-0000-0000-0000-000000000004', 'eva.kowalski@helpdesk.com', 'Eva Kowalski', 'Confirmed phishing attempt. Email originated from external server. Added sender domain to block list and sent company-wide alert.', 0, '2024-10-25 18:00:00');

INSERT INTO sample_hd."TicketComment" ("ID", "TicketID", "AuthorEmail", "AuthorName", "Body", "IsInternal", "CreatedAt")
VALUES ('D0000006-0000-0000-0000-000000000006', 'D0000005-0000-0000-0000-000000000006', 'alice.chen@helpdesk.com', 'Alice Chen', 'UPS vendor contacted. Technician scheduled for today. Backup generator is covering load in the meantime.', 1, '2024-11-04 06:30:00');

INSERT INTO sample_hd."TicketComment" ("ID", "TicketID", "AuthorEmail", "AuthorName", "Body", "IsInternal", "CreatedAt")
VALUES ('D0000006-0000-0000-0000-000000000007', 'D0000005-0000-0000-0000-000000000009', 'bob.martinez@helpdesk.com', 'Bob Martinez', 'Identified rogue AP causing channel interference. Firmware rollback in progress on affected access points.', 1, '2024-11-04 10:00:00');

INSERT INTO sample_hd."TicketComment" ("ID", "TicketID", "AuthorEmail", "AuthorName", "Body", "IsInternal", "CreatedAt")
VALUES ('D0000006-0000-0000-0000-000000000008', 'D0000005-0000-0000-0000-000000000012', 'eva.kowalski@helpdesk.com', 'Eva Kowalski', 'Forensic image taken of the disk. Running full analysis. Initial indicators point to drive-by download from compromised ad network.', 1, '2024-11-04 15:15:00');

INSERT INTO sample_hd."TicketComment" ("ID", "TicketID", "AuthorEmail", "AuthorName", "Body", "IsInternal", "CreatedAt")
VALUES ('D0000006-0000-0000-0000-000000000009', 'D0000005-0000-0000-0000-000000000013', 'carol.okafor@helpdesk.com', 'Carol Okafor', 'CRM app server logs show high CPU on database tier. Escalated to DBA team for query optimization. Waiting on their response.', 1, '2024-11-04 11:00:00');

INSERT INTO sample_hd."TicketComment" ("ID", "TicketID", "AuthorEmail", "AuthorName", "Body", "IsInternal", "CreatedAt")
VALUES ('D0000006-0000-0000-0000-000000000010', 'D0000005-0000-0000-0000-000000000015', 'carol.okafor@helpdesk.com', 'Carol Okafor', 'License renewal processed through Microsoft VLSC. New keys distributed to dev team leads via secure channel.', 0, '2024-10-22 14:00:00');

-- TicketAttachments
INSERT INTO sample_hd."TicketAttachment" ("ID", "TicketID", "FileName", "FileSize", "MimeType", "StoragePath", "UploadedAt", "UploadedBy")
VALUES ('D0000007-0000-0000-0000-000000000001', 'D0000005-0000-0000-0000-000000000001', 'laptop-photo.jpg', 245760, 'image/jpeg', '/attachments/2024/11/01/laptop-photo.jpg', '2024-11-01 08:31:00', 'jsmith@company.com');

INSERT INTO sample_hd."TicketAttachment" ("ID", "TicketID", "FileName", "FileSize", "MimeType", "StoragePath", "UploadedAt", "UploadedBy")
VALUES ('D0000007-0000-0000-0000-000000000002', 'D0000005-0000-0000-0000-000000000003', 'outlook-error-screenshot.png', 182400, 'image/png', '/attachments/2024/11/02/outlook-error.png', '2024-11-02 09:01:00', 'rpatel@company.com');

INSERT INTO sample_hd."TicketAttachment" ("ID", "TicketID", "FileName", "FileSize", "MimeType", "StoragePath", "UploadedAt", "UploadedBy")
VALUES ('D0000007-0000-0000-0000-000000000003', 'D0000005-0000-0000-0000-000000000004', 'suspicious-email-header.txt', 4096, 'text/plain', '/attachments/2024/10/25/email-header.txt', '2024-10-25 16:46:00', 'lwilson@company.com');

INSERT INTO sample_hd."TicketAttachment" ("ID", "TicketID", "FileName", "FileSize", "MimeType", "StoragePath", "UploadedAt", "UploadedBy")
VALUES ('D0000007-0000-0000-0000-000000000004', 'D0000005-0000-0000-0000-000000000014', 'onboarding-form.pdf', 524288, 'application/pdf', '/attachments/2024/11/04/onboarding.pdf', '2024-11-04 16:01:00', 'hr@company.com');

INSERT INTO sample_hd."TicketAttachment" ("ID", "TicketID", "FileName", "FileSize", "MimeType", "StoragePath", "UploadedAt", "UploadedBy")
VALUES ('D0000007-0000-0000-0000-000000000005', 'D0000005-0000-0000-0000-000000000015', 'purchase-order-VS2024.pdf', 102400, 'application/pdf', '/attachments/2024/10/20/po-vs2024.pdf', '2024-10-20 10:01:00', 'devlead@company.com');

-- KnowledgeArticles (5)
INSERT INTO sample_hd."KnowledgeArticle" ("ID", "Title", "Slug", "Body", "CategoryID", "AuthorAgentID", "IsPublished", "ViewCount", "HelpfulCount", "CreatedAt", "UpdatedAt")
VALUES ('D0000008-0000-0000-0000-000000000001', 'How to Connect to VPN from Home', 'how-to-connect-vpn-from-home', 'Step 1: Open the GlobalProtect VPN client. Step 2: Enter the portal address vpn.company.com. Step 3: Log in with your Active Directory credentials. Step 4: Click Connect. If you experience issues, check that your internet connection is stable and try restarting the VPN client.', 'D0000004-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000002', 1, 342, 287, '2024-06-15 10:00:00', '2024-09-20 14:30:00');

INSERT INTO sample_hd."KnowledgeArticle" ("ID", "Title", "Slug", "Body", "CategoryID", "AuthorAgentID", "IsPublished", "ViewCount", "HelpfulCount", "CreatedAt", "UpdatedAt")
VALUES ('D0000008-0000-0000-0000-000000000002', 'Password Reset Self-Service Guide', 'password-reset-self-service', 'You can reset your own password using the self-service portal at https://passwordreset.company.com. You will need your registered mobile phone for MFA verification. If you are fully locked out, contact the help desk at ext. 4357.', 'D0000004-0000-0000-0000-000000000006', 'D0000003-0000-0000-0000-000000000005', 1, 891, 756, '2024-03-10 08:00:00', '2024-08-15 11:00:00');

INSERT INTO sample_hd."KnowledgeArticle" ("ID", "Title", "Slug", "Body", "CategoryID", "AuthorAgentID", "IsPublished", "ViewCount", "HelpfulCount", "CreatedAt", "UpdatedAt")
VALUES ('D0000008-0000-0000-0000-000000000003', 'Setting Up Your New Laptop', 'setting-up-new-laptop', 'Welcome to the company! This guide walks you through initial laptop setup. Step 1: Power on and connect to WiFi network "CORP-SETUP". Step 2: Sign in with the temporary credentials from your welcome email. Step 3: Run Windows Update. Step 4: Install required software from the Software Center.', 'D0000004-0000-0000-0000-000000000004', 'D0000003-0000-0000-0000-000000000001', 1, 156, 134, '2024-07-01 09:00:00', '2024-10-01 13:00:00');

INSERT INTO sample_hd."KnowledgeArticle" ("ID", "Title", "Slug", "Body", "CategoryID", "AuthorAgentID", "IsPublished", "ViewCount", "HelpfulCount", "CreatedAt", "UpdatedAt")
VALUES ('D0000008-0000-0000-0000-000000000004', 'Reporting a Security Incident', 'reporting-security-incident', 'If you suspect a security breach, phishing, or unauthorized access: 1. Do NOT click suspicious links. 2. Forward phishing emails to security@company.com. 3. Call the security hotline at ext. 9111 for urgent incidents. 4. Disconnect from the network if instructed. All reports are treated confidentially.', 'D0000004-0000-0000-0000-000000000006', 'D0000003-0000-0000-0000-000000000005', 1, 203, 178, '2024-04-20 15:00:00', '2024-10-25 19:00:00');

INSERT INTO sample_hd."KnowledgeArticle" ("ID", "Title", "Slug", "Body", "CategoryID", "AuthorAgentID", "IsPublished", "ViewCount", "HelpfulCount", "CreatedAt", "UpdatedAt")
VALUES ('D0000008-0000-0000-0000-000000000005', 'Troubleshooting Outlook Calendar Sync (Draft)', 'troubleshooting-outlook-calendar-sync', 'Common fixes for Outlook calendar synchronization issues: 1. Check that your Exchange account is properly configured. 2. Clear the Outlook cache folder. 3. Remove and re-add the Exchange account. 4. Ensure your mobile device has the latest OS updates.', 'D0000004-0000-0000-0000-000000000005', 'D0000003-0000-0000-0000-000000000003', 0, 0, 0, '2024-11-03 12:00:00', '2024-11-03 12:00:00');

-- TicketTags
INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000001', 'D0000005-0000-0000-0000-000000000001', 'hardware', '2024-11-01 08:30:00');

INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000002', 'D0000005-0000-0000-0000-000000000001', 'warranty', '2024-11-01 09:15:00');

INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000003', 'D0000005-0000-0000-0000-000000000002', 'vpn', '2024-10-28 14:20:00');

INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000004', 'D0000005-0000-0000-0000-000000000002', 'remote-access', '2024-10-28 14:20:00');

INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000005', 'D0000005-0000-0000-0000-000000000004', 'phishing', '2024-10-25 16:45:00');

INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000006', 'D0000005-0000-0000-0000-000000000004', 'security-incident', '2024-10-25 16:45:00');

INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000007', 'D0000005-0000-0000-0000-000000000006', 'critical-infrastructure', '2024-11-04 06:15:00');

INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000008', 'D0000005-0000-0000-0000-000000000009', 'wifi', '2024-11-04 08:00:00');

INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000009', 'D0000005-0000-0000-0000-000000000009', 'building-a', '2024-11-04 08:00:00');

INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000010', 'D0000005-0000-0000-0000-000000000012', 'malware', '2024-11-04 15:00:00');

INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000011', 'D0000005-0000-0000-0000-000000000012', 'security-incident', '2024-11-04 15:00:00');

INSERT INTO sample_hd."TicketTag" ("ID", "TicketID", "TagName", "AddedAt")
VALUES ('D0000009-0000-0000-0000-000000000012', 'D0000005-0000-0000-0000-000000000014', 'onboarding', '2024-11-04 16:00:00');


-- ===================== FK & CHECK Constraints =====================

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

ALTER TABLE sample_hd."SupportAgent"
    ADD CONSTRAINT "FK_SupportAgent_Department" FOREIGN KEY ("DepartmentID") REFERENCES sample_hd."Department" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hd."Category"
    ADD CONSTRAINT "FK_Category_ParentCategory" FOREIGN KEY ("ParentCategoryID") REFERENCES sample_hd."Category" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hd."Category"
    ADD CONSTRAINT "FK_Category_Department" FOREIGN KEY ("DepartmentID") REFERENCES sample_hd."Department" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hd."Ticket"
    ADD CONSTRAINT "FK_Ticket_Category" FOREIGN KEY ("CategoryID") REFERENCES sample_hd."Category" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hd."Ticket"
    ADD CONSTRAINT "FK_Ticket_Priority" FOREIGN KEY ("PriorityID") REFERENCES sample_hd."Priority" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hd."Ticket"
    ADD CONSTRAINT "FK_Ticket_SupportAgent" FOREIGN KEY ("AssignedAgentID") REFERENCES sample_hd."SupportAgent" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hd."TicketComment"
    ADD CONSTRAINT "FK_TicketComment_Ticket" FOREIGN KEY ("TicketID") REFERENCES sample_hd."Ticket" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hd."TicketAttachment"
    ADD CONSTRAINT "FK_TicketAttachment_Ticket" FOREIGN KEY ("TicketID") REFERENCES sample_hd."Ticket" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hd."KnowledgeArticle"
    ADD CONSTRAINT "FK_KnowledgeArticle_Category" FOREIGN KEY ("CategoryID") REFERENCES sample_hd."Category" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hd."KnowledgeArticle"
    ADD CONSTRAINT "FK_KnowledgeArticle_AuthorAgent" FOREIGN KEY ("AuthorAgentID") REFERENCES sample_hd."SupportAgent" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hd."TicketTag"
    ADD CONSTRAINT "FK_TicketTag_Ticket" FOREIGN KEY ("TicketID") REFERENCES sample_hd."Ticket" ("ID") DEFERRABLE INITIALLY DEFERRED;

-- ============================================================================
-- ALTER TABLE CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE sample_hd."KnowledgeArticle"
    ADD CONSTRAINT "CK_KnowledgeArticle_HelpfulCount" CHECK ("HelpfulCount" >= 0) NOT VALID;

ALTER TABLE sample_hd."TicketTag"
    ADD CONSTRAINT "CK_TicketTag_TagName_NotEmpty" CHECK (LENGTH("TagName") > 0) NOT VALID;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA sample_hd TO hd_reader;


-- ===================== Comments =====================

COMMENT ON TABLE sample_hd."Priority" IS 'Ticket priority levels with SLA thresholds';

COMMENT ON TABLE sample_hd."Department" IS 'Organizational departments for agent grouping';

COMMENT ON TABLE sample_hd."SupportAgent" IS 'Help desk support agents and technicians';

COMMENT ON TABLE sample_hd."Category" IS 'Hierarchical ticket categories for classification';

COMMENT ON TABLE sample_hd."Ticket" IS 'Help desk support tickets from requestors';

COMMENT ON TABLE sample_hd."TicketComment" IS 'Comments and notes on support tickets';

COMMENT ON TABLE sample_hd."TicketAttachment" IS 'File attachments associated with tickets';

COMMENT ON TABLE sample_hd."KnowledgeArticle" IS 'Self-service knowledge base articles';

COMMENT ON TABLE sample_hd."TicketTag" IS 'Tags applied to tickets for flexible categorization';

COMMENT ON COLUMN sample_hd."Priority"."SortOrder" IS 'Display order for priority listing (lower = higher priority)';

COMMENT ON COLUMN sample_hd."Priority"."SLAResponseMinutes" IS 'SLA target for initial response in minutes';

COMMENT ON COLUMN sample_hd."Priority"."SLAResolutionMinutes" IS 'SLA target for full resolution in minutes';

COMMENT ON COLUMN sample_hd."SupportAgent"."Tier" IS 'Support tier level: 1=Basic, 2=Advanced, 3=Expert';

COMMENT ON COLUMN sample_hd."Category"."ParentCategoryID" IS 'Self-referencing FK for category hierarchy';

COMMENT ON COLUMN sample_hd."Ticket"."TicketNumber" IS 'Auto-generated human-readable ticket identifier';

COMMENT ON COLUMN sample_hd."Ticket"."Status" IS 'Current ticket lifecycle status';

COMMENT ON COLUMN sample_hd."TicketComment"."IsInternal" IS 'Whether this comment is internal-only (not visible to requestor)';

COMMENT ON COLUMN sample_hd."KnowledgeArticle"."Slug" IS 'URL-friendly unique identifier for the article';


-- ===================== Other =====================

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Create role if not exists
