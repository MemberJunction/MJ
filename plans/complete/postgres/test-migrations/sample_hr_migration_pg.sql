-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_hr;
SET search_path TO sample_hr, public;

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

-- Department table
CREATE TABLE sample_hr."Department" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "Code" VARCHAR(20) NOT NULL,
 "Description" TEXT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_Department" PRIMARY KEY ("ID")
);

-- Position table
CREATE TABLE sample_hr."Position" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Title" VARCHAR(200) NOT NULL,
 "MinSalary" DECIMAL(12,2) NOT NULL,
 "MaxSalary" DECIMAL(12,2) NOT NULL,
 "IsExempt" BOOLEAN NOT NULL DEFAULT FALSE,
 "DepartmentID" UUID NOT NULL,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_Position" PRIMARY KEY ("ID")
);

-- Employee table (self-referencing ManagerID)
CREATE TABLE sample_hr."Employee" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "HireDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "TerminationDate" TIMESTAMPTZ NULL,
 "DepartmentID" UUID NOT NULL,
 "PositionID" UUID NOT NULL,
 "ManagerID" UUID NULL,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_Employee" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Employee_Email" UNIQUE ("Email")
);

-- TimeOff table
CREATE TABLE sample_hr."TimeOff" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EmployeeID" UUID NOT NULL,
 "StartDate" DATE NOT NULL,
 "EndDate" DATE NOT NULL,
 "HoursRequested" DECIMAL(5,2) NOT NULL,
 "IsApproved" BOOLEAN NOT NULL DEFAULT FALSE,
 "ApprovedByID" UUID NULL,
 "Reason" TEXT NULL,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_TimeOff" PRIMARY KEY ("ID")
);

-- PerformanceReview table
CREATE TABLE sample_hr."PerformanceReview" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EmployeeID" UUID NOT NULL,
 "ReviewerID" UUID NOT NULL,
 "ReviewDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "Rating" INTEGER NOT NULL,
 "Comments" TEXT NULL,
 "IsPublished" BOOLEAN NOT NULL DEFAULT FALSE,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_PerformanceReview" PRIMARY KEY ("ID")
);

-- SalaryHistory table
CREATE TABLE sample_hr."SalaryHistory" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EmployeeID" UUID NOT NULL,
 "EffectiveDate" DATE NOT NULL,
 "Amount" DECIMAL(12,2) NOT NULL,
 "Currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
 "ChangeReason" VARCHAR(500) NULL,
 "Notes" TEXT NULL,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_SalaryHistory" PRIMARY KEY ("ID")
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS "IX_Employee_DepartmentID"
    ON sample_hr."Employee" ("DepartmentID");

CREATE INDEX IF NOT EXISTS "IX_Employee_PositionID"
    ON sample_hr."Employee" ("PositionID");

CREATE INDEX IF NOT EXISTS "IX_Employee_ManagerID"
    ON sample_hr."Employee" ("ManagerID");

CREATE INDEX IF NOT EXISTS "IX_TimeOff_EmployeeID"
    ON sample_hr."TimeOff" ("EmployeeID");

CREATE INDEX IF NOT EXISTS "IX_PerformanceReview_EmployeeID"
    ON sample_hr."PerformanceReview" ("EmployeeID");

CREATE INDEX IF NOT EXISTS "IX_SalaryHistory_EmployeeID"
    ON sample_hr."SalaryHistory" ("EmployeeID");


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_hr."vwActiveEmployees"
AS SELECT
    e."ID",
    e."FirstName",
    e."LastName",
    e."FirstName" || ' ' || e."LastName" AS "FullName",
    e."Email",
    e."HireDate",
    d."Name" AS "DepartmentName",
    p."Title" AS "PositionTitle",
    m."FirstName" || ' ' || m."LastName" AS "ManagerName"
FROM
    sample_hr."Employee" e
    INNER JOIN sample_hr."Department" d ON e."DepartmentID" = d."ID"
    INNER JOIN sample_hr."Position" p ON e."PositionID" = p."ID"
    LEFT JOIN sample_hr."Employee" m ON e."ManagerID" = m."ID"
WHERE
    e."IsActive" = 1;

CREATE OR REPLACE VIEW sample_hr."vwDepartmentStats"
AS SELECT
    d."ID" AS "DepartmentID",
    d."Name" AS "DepartmentName",
    COUNT(e."ID") AS "EmployeeCount",
    SUM(CASE WHEN e."IsActive" = 1 THEN 1 ELSE 0 END) AS "ActiveCount",
    SUM(CASE WHEN e."IsActive" = 0 THEN 1 ELSE 0 END) AS "InactiveCount",
    MIN(e."HireDate") AS "EarliestHire",
    MAX(e."HireDate") AS "LatestHire"
FROM
    sample_hr."Department" d
    LEFT JOIN sample_hr."Employee" e ON d."ID" = e."DepartmentID"
GROUP BY
    d."ID", d."Name";


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Departments
INSERT INTO sample_hr."Department" ("ID", "Name", "Code", "Description", "IsActive")
VALUES ('A0000001-0000-0000-0000-000000000001', 'Engineering', 'ENG', 'Software Engineering Department', 1);

INSERT INTO sample_hr."Department" ("ID", "Name", "Code", "Description", "IsActive")
VALUES ('A0000001-0000-0000-0000-000000000002', 'Human Resources', 'HR', 'Human Resources Department', 1);

INSERT INTO sample_hr."Department" ("ID", "Name", "Code", "Description", "IsActive")
VALUES ('A0000001-0000-0000-0000-000000000003', 'Marketing', 'MKT', 'Marketing and Communications', 1);

-- Positions
INSERT INTO sample_hr."Position" ("ID", "Title", "MinSalary", "MaxSalary", "IsExempt", "DepartmentID")
VALUES ('B0000001-0000-0000-0000-000000000001', 'Software Engineer', 80000.00, 150000.00, 1, 'A0000001-0000-0000-0000-000000000001');

INSERT INTO sample_hr."Position" ("ID", "Title", "MinSalary", "MaxSalary", "IsExempt", "DepartmentID")
VALUES ('B0000001-0000-0000-0000-000000000002', 'Engineering Manager', 120000.00, 200000.00, 1, 'A0000001-0000-0000-0000-000000000001');

INSERT INTO sample_hr."Position" ("ID", "Title", "MinSalary", "MaxSalary", "IsExempt", "DepartmentID")
VALUES ('B0000001-0000-0000-0000-000000000003', 'HR Specialist', 55000.00, 90000.00, 0, 'A0000001-0000-0000-0000-000000000002');

INSERT INTO sample_hr."Position" ("ID", "Title", "MinSalary", "MaxSalary", "IsExempt", "DepartmentID")
VALUES ('B0000001-0000-0000-0000-000000000004', 'Marketing Coordinator', 50000.00, 80000.00, 0, 'A0000001-0000-0000-0000-000000000003');

-- Employees (manager first, then reports)
INSERT INTO sample_hr."Employee" ("ID", "FirstName", "LastName", "Email", "Phone", "IsActive", "HireDate", "DepartmentID", "PositionID", "ManagerID")
VALUES ('C0000001-0000-0000-0000-000000000001', 'Alice', 'Johnson', 'alice.johnson@example.com', '555-0101', 1, '2020-03-15', 'A0000001-0000-0000-0000-000000000001', 'B0000001-0000-0000-0000-000000000002', NULL);

INSERT INTO sample_hr."Employee" ("ID", "FirstName", "LastName", "Email", "Phone", "IsActive", "HireDate", "DepartmentID", "PositionID", "ManagerID")
VALUES ('C0000001-0000-0000-0000-000000000002', 'Bob', 'Smith', 'bob.smith@example.com', '555-0102', 1, '2021-06-01', 'A0000001-0000-0000-0000-000000000001', 'B0000001-0000-0000-0000-000000000001', 'C0000001-0000-0000-0000-000000000001');

INSERT INTO sample_hr."Employee" ("ID", "FirstName", "LastName", "Email", "Phone", "IsActive", "HireDate", "DepartmentID", "PositionID", "ManagerID")
VALUES ('C0000001-0000-0000-0000-000000000003', 'Carol', 'Williams', 'carol.williams@example.com', '555-0103', 1, '2022-01-10', 'A0000001-0000-0000-0000-000000000002', 'B0000001-0000-0000-0000-000000000003', NULL);

INSERT INTO sample_hr."Employee" ("ID", "FirstName", "LastName", "Email", "Phone", "IsActive", "HireDate", "DepartmentID", "PositionID", "ManagerID")
VALUES ('C0000001-0000-0000-0000-000000000004', 'Dave', 'Brown', 'dave.brown@example.com', '555-0104', 0, '2019-11-20', 'A0000001-0000-0000-0000-000000000001', 'B0000001-0000-0000-0000-000000000001', 'C0000001-0000-0000-0000-000000000001');

INSERT INTO sample_hr."Employee" ("ID", "FirstName", "LastName", "Email", "Phone", "IsActive", "HireDate", "DepartmentID", "PositionID", "ManagerID")
VALUES ('C0000001-0000-0000-0000-000000000005', 'Eve', 'Davis', 'eve.davis@example.com', NULL, 1, '2023-04-05', 'A0000001-0000-0000-0000-000000000003', 'B0000001-0000-0000-0000-000000000004', NULL);

-- TimeOff requests
INSERT INTO sample_hr."TimeOff" ("ID", "EmployeeID", "StartDate", "EndDate", "HoursRequested", "IsApproved", "ApprovedByID", "Reason")
VALUES ('D0000001-0000-0000-0000-000000000001', 'C0000001-0000-0000-0000-000000000002', '2024-07-01', '2024-07-05', 40.00, 1, 'C0000001-0000-0000-0000-000000000001', 'Summer vacation');

INSERT INTO sample_hr."TimeOff" ("ID", "EmployeeID", "StartDate", "EndDate", "HoursRequested", "IsApproved", "Reason")
VALUES ('D0000001-0000-0000-0000-000000000002', 'C0000001-0000-0000-0000-000000000003', '2024-08-15', '2024-08-16', 16.00, 0, 'Personal day');

-- Performance Reviews
INSERT INTO sample_hr."PerformanceReview" ("ID", "EmployeeID", "ReviewerID", "ReviewDate", "Rating", "Comments", "IsPublished")
VALUES ('E0000001-0000-0000-0000-000000000001', 'C0000001-0000-0000-0000-000000000002', 'C0000001-0000-0000-0000-000000000001', '2024-01-15', 4, 'Excellent performance, consistently delivers quality code', 1);

INSERT INTO sample_hr."PerformanceReview" ("ID", "EmployeeID", "ReviewerID", "ReviewDate", "Rating", "Comments", "IsPublished")
VALUES ('E0000001-0000-0000-0000-000000000002', 'C0000001-0000-0000-0000-000000000003', 'C0000001-0000-0000-0000-000000000001', '2024-01-20', 3, 'Meets expectations, room for growth in process improvement', 0);

-- Salary History
INSERT INTO sample_hr."SalaryHistory" ("ID", "EmployeeID", "EffectiveDate", "Amount", "Currency", "ChangeReason")
VALUES ('F0000001-0000-0000-0000-000000000001', 'C0000001-0000-0000-0000-000000000001', '2020-03-15', 140000.00, 'USD', 'Initial hire');

INSERT INTO sample_hr."SalaryHistory" ("ID", "EmployeeID", "EffectiveDate", "Amount", "Currency", "ChangeReason")
VALUES ('F0000001-0000-0000-0000-000000000002', 'C0000001-0000-0000-0000-000000000002', '2021-06-01', 95000.00, 'USD', 'Initial hire');

INSERT INTO sample_hr."SalaryHistory" ("ID", "EmployeeID", "EffectiveDate", "Amount", "Currency", "ChangeReason")
VALUES ('F0000001-0000-0000-0000-000000000003', 'C0000001-0000-0000-0000-000000000002', '2022-06-01', 110000.00, 'USD', 'Annual merit increase');

INSERT INTO sample_hr."SalaryHistory" ("ID", "EmployeeID", "EffectiveDate", "Amount", "Currency", "ChangeReason")
VALUES ('F0000001-0000-0000-0000-000000000004', 'C0000001-0000-0000-0000-000000000003', '2022-01-10', 62000.00, 'USD', 'Initial hire');


-- ===================== FK & CHECK Constraints =====================

-- ============================================================================
-- CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE sample_hr."PerformanceReview"
    ADD CONSTRAINT "CK_PerformanceReview_Rating" CHECK ("Rating" BETWEEN 1 AND 5) NOT VALID;

ALTER TABLE sample_hr."Position"
    ADD CONSTRAINT "CK_Position_Salary" CHECK ("MaxSalary" >= "MinSalary") NOT VALID;

ALTER TABLE sample_hr."TimeOff"
    ADD CONSTRAINT "CK_TimeOff_Dates" CHECK ("EndDate" >= "StartDate") NOT VALID;

ALTER TABLE sample_hr."SalaryHistory"
    ADD CONSTRAINT "CK_SalaryHistory_Amount" CHECK ("Amount" > 0) NOT VALID;

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

ALTER TABLE sample_hr."Position"
    ADD CONSTRAINT "FK_Position_Department" FOREIGN KEY ("DepartmentID")
    REFERENCES sample_hr."Department" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hr."Employee"
    ADD CONSTRAINT "FK_Employee_Department" FOREIGN KEY ("DepartmentID")
    REFERENCES sample_hr."Department" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hr."Employee"
    ADD CONSTRAINT "FK_Employee_Position" FOREIGN KEY ("PositionID")
    REFERENCES sample_hr."Position" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hr."Employee"
    ADD CONSTRAINT "FK_Employee_Manager" FOREIGN KEY ("ManagerID")
    REFERENCES sample_hr."Employee" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hr."TimeOff"
    ADD CONSTRAINT "FK_TimeOff_Employee" FOREIGN KEY ("EmployeeID")
    REFERENCES sample_hr."Employee" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hr."TimeOff"
    ADD CONSTRAINT "FK_TimeOff_ApprovedBy" FOREIGN KEY ("ApprovedByID")
    REFERENCES sample_hr."Employee" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hr."PerformanceReview"
    ADD CONSTRAINT "FK_PerformanceReview_Employee" FOREIGN KEY ("EmployeeID")
    REFERENCES sample_hr."Employee" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hr."PerformanceReview"
    ADD CONSTRAINT "FK_PerformanceReview_Reviewer" FOREIGN KEY ("ReviewerID")
    REFERENCES sample_hr."Employee" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_hr."SalaryHistory"
    ADD CONSTRAINT "FK_SalaryHistory_Employee" FOREIGN KEY ("EmployeeID")
    REFERENCES sample_hr."Employee" ("ID") DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON sample_hr."vwActiveEmployees" TO "cdp_UI";

GRANT SELECT ON sample_hr."vwDepartmentStats" TO "cdp_UI";

GRANT SELECT, INSERT, UPDATE ON sample_hr."Department" TO "cdp_Developer";

GRANT SELECT, INSERT, UPDATE ON sample_hr."Employee" TO "cdp_Developer";

GRANT SELECT ON sample_hr."SalaryHistory" TO "cdp_UI";


-- ===================== Comments =====================

COMMENT ON TABLE sample_hr."Department" IS 'Core organizational units';

COMMENT ON COLUMN sample_hr."Department"."ID" IS 'Unique department identifier';

COMMENT ON COLUMN sample_hr."Department"."Name" IS 'Department display name';

COMMENT ON TABLE sample_hr."Position" IS 'Job positions with salary ranges';

COMMENT ON TABLE sample_hr."Employee" IS 'Employee records including reporting hierarchy';

COMMENT ON COLUMN sample_hr."Employee"."IsActive" IS 'Whether the employee is currently active';

COMMENT ON TABLE sample_hr."TimeOff" IS 'Time off and leave requests';

COMMENT ON TABLE sample_hr."PerformanceReview" IS 'Annual and periodic performance evaluations';

COMMENT ON COLUMN sample_hr."PerformanceReview"."Rating" IS 'Rating must be between 1 (lowest) and 5 (highest)';

COMMENT ON TABLE sample_hr."SalaryHistory" IS 'Historical salary changes for audit and analytics';
