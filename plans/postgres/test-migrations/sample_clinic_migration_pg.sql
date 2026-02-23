-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_clinic;
SET search_path TO sample_clinic, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER → BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER→bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'with') THEN
        CREATE ROLE with;
    END IF;
END $$;

-- ============================================================
-- Tables
-- ============================================================

/* Specialty - Medical specialization categories for DoctorAssignment */
CREATE TABLE sample_clinic."Specialty" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "Description" VARCHAR(500) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT PK_Specialty PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Specialty_Name UNIQUE ("Name")
);

-- Doctor - Physician records with LicenseNumber and ConsultationFee
CREATE TABLE sample_clinic."Doctor" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NOT NULL,
 "Phone" VARCHAR(20) NOT NULL,
 "SpecialtyID" UUID NOT NULL,
 "LicenseNumber" VARCHAR(30) NOT NULL,
 "HireDate" DATE NOT NULL,
 "ConsultationFee" DECIMAL(8,2) NOT NULL CHECK ("ConsultationFee" >= 0),
 "IsAcceptingPatients" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT PK_Doctor PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Doctor_Email UNIQUE ("Email"),
 CONSTRAINT UQ_Doctor_LicenseNumber UNIQUE ("LicenseNumber"),
 CONSTRAINT FK_Doctor_Specialty FOREIGN KEY ("SpecialtyID") REFERENCES sample_clinic."Specialty"("ID")
);

/* Patient - PatientRegistration with EmergencyContact and InsuranceProvider details */
CREATE TABLE sample_clinic."Patient" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NULL,
 "Phone" VARCHAR(20) NOT NULL,
 "DateOfBirth" DATE NOT NULL,
 "Gender" VARCHAR(10) NOT NULL CHECK ("Gender" IN ('Male', 'Female', 'Other')),
 "Address" VARCHAR(300) NULL,
 "EmergencyContactName" VARCHAR(200) NOT NULL,
 "EmergencyContactPhone" VARCHAR(20) NOT NULL,
 "PrimaryDoctorID" UUID NOT NULL,
 "InsuranceProvider" VARCHAR(200) NULL,
 "InsurancePolicyNumber" VARCHAR(50) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "RegisteredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "Notes" TEXT NULL,
 CONSTRAINT PK_Patient PRIMARY KEY ("ID"),
 CONSTRAINT FK_Patient_Doctor FOREIGN KEY ("PrimaryDoctorID") REFERENCES sample_clinic."Doctor"("ID")
);

-- Appointment - Scheduling with self-referencing PreviousAppointmentID for FollowUp tracking
CREATE TABLE sample_clinic."Appointment" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PatientID" UUID NOT NULL,
 "DoctorID" UUID NOT NULL,
 "AppointmentDate" DATE NOT NULL,
 "AppointmentTime" TIME NOT NULL,
 "DurationMinutes" INTEGER NOT NULL DEFAULT 30,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Scheduled' CHECK ("Status" IN ('Scheduled', 'Confirmed', 'InProgress', 'Completed', 'Cancelled', 'NoShow')),
 "ReasonForVisit" VARCHAR(500) NOT NULL,
 "Notes" TEXT NULL,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "CancelledAt" TIMESTAMPTZ NULL,
 "IsFollowUp" BOOLEAN NOT NULL DEFAULT FALSE,
 "PreviousAppointmentID" UUID NULL,
 CONSTRAINT PK_Appointment PRIMARY KEY ("ID"),
 CONSTRAINT FK_Appointment_Patient FOREIGN KEY ("PatientID") REFERENCES sample_clinic."Patient"("ID"),
 CONSTRAINT FK_Appointment_Doctor FOREIGN KEY ("DoctorID") REFERENCES sample_clinic."Doctor"("ID"),
 CONSTRAINT FK_Appointment_Previous FOREIGN KEY ("PreviousAppointmentID") REFERENCES sample_clinic."Appointment"("ID"),
 CONSTRAINT UQ_Appointment_PatientDateTime UNIQUE ("PatientID", "AppointmentDate", "AppointmentTime")
);

/* Diagnosis - Clinical DiagnosisRecord with ICDCode and SeverityLevel */
CREATE TABLE sample_clinic."Diagnosis" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "AppointmentID" UUID NOT NULL,
 "ICDCode" VARCHAR(10) NOT NULL,
 "Description" VARCHAR(500) NOT NULL,
 "Severity" VARCHAR(20) NOT NULL DEFAULT 'Moderate' CHECK ("Severity" IN ('Mild', 'Moderate', 'Severe', 'Critical')),
 "DiagnosedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "Notes" TEXT NULL,
 CONSTRAINT PK_Diagnosis PRIMARY KEY ("ID"),
 CONSTRAINT FK_Diagnosis_Appointment FOREIGN KEY ("AppointmentID") REFERENCES sample_clinic."Appointment"("ID")
);

-- Prescription - MedicationPrescription with Refills count and DosageInformation
CREATE TABLE sample_clinic."Prescription" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "DiagnosisID" UUID NOT NULL,
 "MedicationName" VARCHAR(200) NOT NULL,
 "Dosage" VARCHAR(100) NOT NULL,
 "Frequency" VARCHAR(100) NOT NULL,
 "DurationDays" INTEGER NOT NULL CHECK ("DurationDays" > 0),
 "Quantity" INTEGER NOT NULL CHECK ("Quantity" > 0),
 "Refills" SMALLINT NOT NULL DEFAULT 0,
 "PrescribedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT PK_Prescription PRIMARY KEY ("ID"),
 CONSTRAINT FK_Prescription_Diagnosis FOREIGN KEY ("DiagnosisID") REFERENCES sample_clinic."Diagnosis"("ID")
);

/* Billing - PaymentProcessing with multi-FK to Doctor and Patient, InsuranceCoverage tracking */
CREATE TABLE sample_clinic."Billing" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "AppointmentID" UUID NOT NULL,
 "PatientID" UUID NOT NULL,
 "DoctorID" UUID NOT NULL,
 "ServiceDescription" VARCHAR(300) NOT NULL,
 "Amount" DECIMAL(10,2) NOT NULL CHECK ("Amount" >= 0),
 "InsuranceCoverage" DECIMAL(10,2) NOT NULL DEFAULT 0,
 "PatientResponsibility" DECIMAL(10,2) NOT NULL,
 "PaymentStatus" VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK ("PaymentStatus" IN ('Pending', 'Billed', 'Paid', 'Denied', 'Appealed')),
 "BilledAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "PaidAt" TIMESTAMPTZ NULL,
 "PaymentMethod" VARCHAR(20) NULL,
 CONSTRAINT PK_Billing PRIMARY KEY ("ID"),
 CONSTRAINT FK_Billing_Appointment FOREIGN KEY ("AppointmentID") REFERENCES sample_clinic."Appointment"("ID"),
 CONSTRAINT FK_Billing_Patient FOREIGN KEY ("PatientID") REFERENCES sample_clinic."Patient"("ID"),
 CONSTRAINT FK_Billing_Doctor FOREIGN KEY ("DoctorID") REFERENCES sample_clinic."Doctor"("ID")
);

-- LabResult - TestResult with multi-FK: AppointmentID and OrderedByDoctorID both reference different tables
CREATE TABLE sample_clinic."LabResult" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "AppointmentID" UUID NOT NULL,
 "TestName" VARCHAR(200) NOT NULL,
 "TestDate" DATE NOT NULL,
 "ResultValue" VARCHAR(100) NOT NULL,
 "NormalRange" VARCHAR(100) NULL,
 "IsAbnormal" BOOLEAN NOT NULL DEFAULT FALSE,
 "OrderedByDoctorID" UUID NOT NULL,
 "Notes" TEXT NULL,
 "ReceivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_LabResult PRIMARY KEY ("ID"),
 CONSTRAINT FK_LabResult_Appointment FOREIGN KEY ("AppointmentID") REFERENCES sample_clinic."Appointment"("ID"),
 CONSTRAINT FK_LabResult_Doctor FOREIGN KEY ("OrderedByDoctorID") REFERENCES sample_clinic."Doctor"("ID")
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ClinicReader') THEN
        CREATE ROLE "ClinicReader";
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_clinic."vwDoctorSchedule" AS SELECT
    d."ID" AS "DoctorID",
    d."FirstName" || ' ' || d."LastName" AS "DoctorName",
    s."Name" AS "SpecialtyName",
    a."ID" AS "AppointmentID",
    p."FirstName" || ' ' || p."LastName" AS "PatientName",
    a."AppointmentDate",
    a."AppointmentTime",
    a."DurationMinutes",
    a."Status",
    a."ReasonForVisit",
    COALESCE(a."Notes", 'No notes') AS "AppointmentNotes",
    EXTRACT(EPOCH FROM (a."AppointmentTime" - CAST(NOW() AS TIME))) / 60 AS "MinutesFromNow",
    CASE
        WHEN EXTRACT(EPOCH FROM (a."AppointmentTime" - CAST(NOW() AS TIME))) / 60 < 0 THEN 'Past'
        WHEN EXTRACT(EPOCH FROM (a."AppointmentTime" - CAST(NOW() AS TIME))) / 60 <= 15 THEN 'Imminent'
        ELSE 'Upcoming'
    END AS "TimeStatus",
    CASE WHEN a."IsFollowUp" = 1 THEN 'Yes' ELSE 'No' END AS "IsFollowUpVisit"
FROM sample_clinic."Appointment" a
INNER JOIN sample_clinic."Doctor" d ON d."ID" = a."DoctorID"
INNER JOIN sample_clinic."Patient" p ON p."ID" = a."PatientID"
INNER JOIN sample_clinic."Specialty" s ON s."ID" = d."SpecialtyID"
WHERE a."AppointmentDate" = CAST(NOW() AS DATE)
  AND a."Status" NOT IN ('Cancelled', 'NoShow');

CREATE OR REPLACE VIEW sample_clinic."vwPatientHistory" AS SELECT
    p."ID" AS "PatientID",
    p."FirstName" || ' ' || p."LastName" AS "PatientName",
    p."DateOfBirth",
    EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM p."DateOfBirth") AS "ApproxAge",
    p."Gender",
    p."InsuranceProvider",
    COALESCE(p."InsurancePolicyNumber", 'Uninsured') AS "PolicyNumber",
    d."FirstName" || ' ' || d."LastName" AS "PrimaryDoctorName",
    (SELECT COUNT(*) FROM sample_clinic."Appointment" a WHERE a."PatientID" = p."ID") AS "AppointmentCount",
    (SELECT COUNT(*) FROM sample_clinic."Diagnosis" diag
     INNER JOIN sample_clinic."Appointment" a2 ON a2."ID" = diag."AppointmentID"
     WHERE a2."PatientID" = p."ID") AS "DiagnosisCount",
    COALESCE((SELECT SUM(b."Amount") FROM sample_clinic."Billing" b WHERE b."PatientID" = p."ID"), 0) AS "TotalBilled",
    COALESCE((SELECT SUM(b."PatientResponsibility") FROM sample_clinic."Billing" b WHERE b."PatientID" = p."ID" AND b."PaymentStatus" != 'Paid'), 0) AS "OutstandingBalance",
    p."RegisteredAt",
    EXTRACT(DAY FROM p."RegisteredAt") AS "RegisteredDay"
FROM sample_clinic."Patient" p
INNER JOIN sample_clinic."Doctor" d ON d."ID" = p."PrimaryDoctorID";

CREATE OR REPLACE VIEW sample_clinic."vwRevenueSummary" AS SELECT
    EXTRACT(YEAR FROM b."BilledAt") AS "BillingYear",
    EXTRACT(MONTH FROM b."BilledAt") AS "BillingMonth",
    COUNT(b."ID") AS "InvoiceCount",
    ROUND(SUM(b."Amount"), 2) AS "TotalBilled",
    ROUND(SUM(CASE WHEN b."PaymentStatus" = 'Paid' THEN b."Amount" ELSE 0 END), 2) AS "TotalPaid",
    ROUND(SUM(b."InsuranceCoverage"), 2) AS "TotalInsurancePaid",
    ROUND(SUM(b."Amount" + b."InsuranceCoverage"), 2) AS "TotalWithCoverage",
    ROUND(SUM(b."PatientResponsibility"), 2) AS "TotalPatientResponsibility",
    CASE WHEN SUM(b."Amount") > 0 THEN ROUND(CAST(SUM(b."InsuranceCoverage") AS DECIMAL(12,2)) / CAST(SUM(b."Amount") AS DECIMAL(12,2)) * 100, 1) ELSE 0 END AS "InsuranceCoveragePercent",
    CASE
        WHEN SUM(b."Amount") >= 50000 THEN 'High Volume'
        WHEN SUM(b."Amount") >= 20000 THEN 'Medium Volume'
        ELSE 'Low Volume'
    END AS "VolumeCategory"
FROM sample_clinic."Billing" b
GROUP BY EXTRACT(YEAR FROM b."BilledAt"), EXTRACT(MONTH FROM b."BilledAt")
HAVING COUNT(b."ID") > 0;

CREATE OR REPLACE VIEW sample_clinic."vwLabResults" AS SELECT
    lr."ID" AS "LabResultID",
    lr."TestName",
    lr."TestDate",
    lr."ResultValue",
    COALESCE(lr."NormalRange", 'Not specified') AS "NormalRange",
    CASE WHEN lr."IsAbnormal" = 1 THEN 'Abnormal' ELSE 'Normal' END AS "ResultStatus",
    d."FirstName" || ' ' || d."LastName" AS "OrderedByDoctor",
    p."FirstName" || ' ' || p."LastName" AS "PatientName",
    EXTRACT(DAY FROM (CAST(NOW() AS DATE)::TIMESTAMPTZ - lr."TestDate"::TIMESTAMPTZ)) AS "DaysSinceTest",
    CASE
        WHEN EXTRACT(DAY FROM (CAST(NOW() AS DATE)::TIMESTAMPTZ - lr."TestDate"::TIMESTAMPTZ)) <= 7 THEN 'Recent'
        WHEN EXTRACT(DAY FROM (CAST(NOW() AS DATE)::TIMESTAMPTZ - lr."TestDate"::TIMESTAMPTZ)) <= 30 THEN 'This Month'
        ELSE 'Older'
    END AS "Recency",
    LENGTH(lr."ResultValue") AS "ResultValueLength",
    lr."Notes" AS "LabNotes",
    lr."ReceivedAt"
FROM sample_clinic."LabResult" lr
INNER JOIN sample_clinic."Appointment" a ON a."ID" = lr."AppointmentID"
INNER JOIN sample_clinic."Doctor" d ON d."ID" = lr."OrderedByDoctorID"
INNER JOIN sample_clinic."Patient" p ON p."ID" = a."PatientID";

CREATE OR REPLACE VIEW sample_clinic."vwAppointmentMetrics" AS SELECT
    EXTRACT(YEAR FROM a."AppointmentDate") AS "AppointmentYear",
    EXTRACT(MONTH FROM a."AppointmentDate") AS "AppointmentMonth",
    COUNT(a."ID") AS "TotalAppointments",
    AVG(a."DurationMinutes") AS "AvgDurationMinutes",
    SUM(CASE WHEN a."Status" = 'Completed' THEN 1 ELSE 0 END) AS "CompletedCount",
    SUM(CASE WHEN a."Status" = 'Cancelled' THEN 1 ELSE 0 END) AS "CancelledCount",
    SUM(CASE WHEN a."Status" = 'NoShow' THEN 1 ELSE 0 END) AS "NoShowCount",
    SUM(CASE WHEN a."IsFollowUp" = 1 THEN 1 ELSE 0 END) AS "FollowUpCount",
    CAST(
        CASE WHEN COUNT(a."ID") > 0
             THEN ROUND(CAST(SUM(CASE WHEN a."Status" = 'Cancelled' THEN 1 ELSE 0 END) AS DECIMAL(10,2))
                        / CAST(COUNT(a."ID") AS DECIMAL(10,2)) * 100, 1)
             ELSE 0
        END AS DECIMAL(5,1)
    ) AS "CancellationRate",
    CAST(
        CASE WHEN COUNT(a."ID") > 0
             THEN ROUND(CAST(SUM(CASE WHEN a."IsFollowUp" = 1 THEN 1 ELSE 0 END) AS DECIMAL(10,2))
                        / CAST(COUNT(a."ID") AS DECIMAL(10,2)) * 100, 1)
             ELSE 0
        END AS DECIMAL(5,1)
    ) AS "FollowUpRate",
    LENGTH(CAST(COUNT(a."ID") AS VARCHAR(10))) AS "DigitCount"
FROM sample_clinic."Appointment" a
GROUP BY EXTRACT(YEAR FROM a."AppointmentDate"), EXTRACT(MONTH FROM a."AppointmentDate");


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- ============================================================
-- Seed Data
-- ============================================================

-- Specialty (5)
INSERT INTO sample_clinic."Specialty" ("ID", "Name", "Description", "IsActive") VALUES
    ('10000001-0001-0001-0001-000000000001', 'Cardiology', 'Heart and cardiovascular system disorders', 1),
    ('10000001-0001-0001-0001-000000000002', 'Dermatology', 'Skin, hair, and nail conditions', 1),
    ('10000001-0001-0001-0001-000000000003', 'Orthopedics', 'Musculoskeletal system injuries and diseases', 1),
    ('10000001-0001-0001-0001-000000000004', 'Pediatrics', 'Medical care for infants, children, and adolescents', 1),
    ('10000001-0001-0001-0001-000000000005', 'Neurology', 'Nervous system and brain disorders', 1);

-- Doctor (8)
INSERT INTO sample_clinic."Doctor" ("ID", "FirstName", "LastName", "Email", "Phone", "SpecialtyID", "LicenseNumber", "HireDate", "ConsultationFee", "IsAcceptingPatients") VALUES
    ('20000001-0001-0001-0001-000000000001', 'Sarah', 'Mitchell', 'sarah.mitchell@clinic.com', '555-1001', '10000001-0001-0001-0001-000000000001', 'MD-2019-0451', '2019-03-15', 250.00, 1),
    ('20000001-0001-0001-0001-000000000002', 'James', 'Park', 'james.park@clinic.com', '555-1002', '10000001-0001-0001-0001-000000000001', 'MD-2018-0322', '2018-06-01', 275.00, 1),
    ('20000001-0001-0001-0001-000000000003', 'Elena', 'Vasquez', 'elena.vasquez@clinic.com', '555-1003', '10000001-0001-0001-0001-000000000002', 'MD-2020-0198', '2020-01-10', 200.00, 1),
    ('20000001-0001-0001-0001-000000000004', 'Robert', 'Chen', 'robert.chen@clinic.com', '555-1004', '10000001-0001-0001-0001-000000000003', 'MD-2017-0567', '2017-09-20', 225.00, 1),
    ('20000001-0001-0001-0001-000000000005', 'Aisha', 'Johnson', 'aisha.johnson@clinic.com', '555-1005', '10000001-0001-0001-0001-000000000003', 'MD-2021-0089', '2021-02-14', 225.00, 1),
    ('20000001-0001-0001-0001-000000000006', 'Michael', 'O''Brien', 'michael.obrien@clinic.com', '555-1006', '10000001-0001-0001-0001-000000000004', 'MD-2016-0734', '2016-04-01', 200.00, 1),
    ('20000001-0001-0001-0001-000000000007', 'Priya', 'Sharma', 'priya.sharma@clinic.com', '555-1007', '10000001-0001-0001-0001-000000000005', 'MD-2019-0612', '2019-08-15', 300.00, 1),
    ('20000001-0001-0001-0001-000000000008', 'David', 'Kim', 'david.kim@clinic.com', '555-1008', '10000001-0001-0001-0001-000000000004', 'MD-2022-0045', '2022-05-01', 195.00, 0);

-- Patient (20)
INSERT INTO sample_clinic."Patient" ("ID", "FirstName", "LastName", "Email", "Phone", "DateOfBirth", "Gender", "Address", "EmergencyContactName", "EmergencyContactPhone", "PrimaryDoctorID", "InsuranceProvider", "InsurancePolicyNumber", "IsActive", "Notes") VALUES
    ('30000001-0001-0001-0001-000000000001', 'Alice', 'Thompson', 'alice.t@email.com', '555-2001', '1985-04-12', 'Female', '123 Oak Street, Suite 4A', 'Bob Thompson', '555-2101', '20000001-0001-0001-0001-000000000001', 'Blue Cross', 'BC-100001', 1, NULL),
    ('30000001-0001-0001-0001-000000000002', 'Marcus', 'Williams', 'marcus.w@email.com', '555-2002', '1978-11-23', 'Male', '456 Elm Avenue', 'Linda Williams', '555-2102', '20000001-0001-0001-0001-000000000001', 'Aetna', 'AE-200002', 1, 'History of hypertension'),
    ('30000001-0001-0001-0001-000000000003', 'Sofia', 'Garcia', 'sofia.g@email.com', '555-2003', '1992-07-08', 'Female', '789 Pine Road', 'Carlos Garcia', '555-2103', '20000001-0001-0001-0001-000000000003', 'United Healthcare', 'UH-300003', 1, NULL),
    ('30000001-0001-0001-0001-000000000004', 'Tyler', 'Davis', NULL, '555-2004', '2015-02-14', 'Male', '321 Maple Lane', 'Jennifer Davis', '555-2104', '20000001-0001-0001-0001-000000000006', 'Cigna', 'CI-400004', 1, 'Pediatric patient, parent consent required'),
    ('30000001-0001-0001-0001-000000000005', 'Hannah', 'Wilson', 'hannah.w@email.com', '555-2005', '1990-09-30', 'Female', NULL, 'David Wilson', '555-2105', '20000001-0001-0001-0001-000000000002', 'Blue Cross', 'BC-500005', 1, NULL),
    ('30000001-0001-0001-0001-000000000006', 'James', 'Brown', 'james.b@email.com', '555-2006', '1965-01-17', 'Male', '654 Cedar Court', 'Patricia Brown', '555-2106', '20000001-0001-0001-0001-000000000001', 'Medicare', 'MC-600006', 1, 'Diabetes management program'),
    ('30000001-0001-0001-0001-000000000007', 'Olivia', 'Martinez', 'olivia.m@email.com', '555-2007', '1988-12-05', 'Female', '987 Birch Drive', 'Miguel Martinez', '555-2107', '20000001-0001-0001-0001-000000000004', 'Aetna', 'AE-700007', 1, NULL),
    ('30000001-0001-0001-0001-000000000008', 'Ethan', 'Anderson', NULL, '555-2008', '2018-06-22', 'Male', '147 Walnut Street', 'Sara Anderson', '555-2108', '20000001-0001-0001-0001-000000000006', 'United Healthcare', 'UH-800008', 1, 'Pediatric asthma patient'),
    ('30000001-0001-0001-0001-000000000009', 'Mia', 'Taylor', 'mia.t@email.com', '555-2009', '1975-03-28', 'Female', '258 Spruce Avenue', 'Kevin Taylor', '555-2109', '20000001-0001-0001-0001-000000000007', 'Cigna', 'CI-900009', 1, 'Migraine disorder history'),
    ('30000001-0001-0001-0001-000000000010', 'Daniel', 'Lee', 'daniel.l@email.com', '555-2010', '1982-08-15', 'Male', '369 Ash Boulevard', 'Jenny Lee', '555-2110', '20000001-0001-0001-0001-000000000004', NULL, NULL, 1, 'Self-pay patient, no insurance'),
    ('30000001-0001-0001-0001-000000000011', 'Ava', 'Jackson', 'ava.j@email.com', '555-2011', '1995-05-20', 'Female', '741 Poplar Way', 'Michael Jackson', '555-2111', '20000001-0001-0001-0001-000000000003', 'Blue Cross', 'BC-110011', 1, NULL),
    ('30000001-0001-0001-0001-000000000012', 'Ryan', 'White', 'ryan.w@email.com', '555-2012', '1970-10-03', 'Male', '852 Redwood Circle', 'Susan White', '555-2112', '20000001-0001-0001-0001-000000000002', 'Aetna', 'AE-120012', 1, 'Post-cardiac surgery follow-ups'),
    ('30000001-0001-0001-0001-000000000013', 'Emma', 'Harris', 'emma.h@email.com', '555-2013', '2010-11-11', 'Female', NULL, 'Tom Harris', '555-2113', '20000001-0001-0001-0001-000000000006', 'Cigna', 'CI-130013', 1, NULL),
    ('30000001-0001-0001-0001-000000000014', 'Liam', 'Clark', 'liam.c@email.com', '555-2014', '1998-02-27', 'Male', '963 Sycamore Street', 'Nancy Clark', '555-2114', '20000001-0001-0001-0001-000000000005', 'United Healthcare', 'UH-140014', 1, NULL),
    ('30000001-0001-0001-0001-000000000015', 'Isabella', 'Lewis', 'isabella.l@email.com', '555-2015', '1987-06-14', 'Female', '174 Hickory Lane', 'George Lewis', '555-2115', '20000001-0001-0001-0001-000000000007', 'Medicare', 'MC-150015', 1, 'Chronic migraine management'),
    ('30000001-0001-0001-0001-000000000016', 'Noah', 'Robinson', 'noah.r@email.com', '555-2016', '1960-12-30', 'Male', '285 Dogwood Road', 'Helen Robinson', '555-2116', '20000001-0001-0001-0001-000000000001', 'Medicare', 'MC-160016', 1, 'Pacemaker monitoring'),
    ('30000001-0001-0001-0001-000000000017', 'Charlotte', 'Walker', NULL, '555-2017', '1993-04-09', 'Female', '396 Magnolia Drive', 'Frank Walker', '555-2117', '20000001-0001-0001-0001-000000000002', 'Blue Cross', 'BC-170017', 1, NULL),
    ('30000001-0001-0001-0001-000000000018', 'Lucas', 'Hall', 'lucas.h@email.com', '555-2018', '2012-08-18', 'Male', '507 Willow Court', 'Anna Hall', '555-2118', '20000001-0001-0001-0001-000000000008', 'Aetna', 'AE-180018', 1, 'Pediatric wellness check schedule'),
    ('30000001-0001-0001-0001-000000000019', 'Amelia', 'Young', 'amelia.y@email.com', '555-2019', '1980-07-25', 'Female', '618 Cypress Avenue', 'Jack Young', '555-2119', '20000001-0001-0001-0001-000000000005', 'Cigna', 'CI-190019', 1, NULL),
    ('30000001-0001-0001-0001-000000000020', 'Benjamin', 'King', 'benjamin.k@email.com', '555-2020', '1955-01-02', 'Male', '729 Juniper Terrace', 'Martha King', '555-2120', '20000001-0001-0001-0001-000000000007', NULL, NULL, 1, 'Self-pay, neurological eval pending');

-- Appointment (40) - Mix of statuses, TIME values, some follow-ups
INSERT INTO sample_clinic."Appointment" ("ID", "PatientID", "DoctorID", "AppointmentDate", "AppointmentTime", "DurationMinutes", "Status", "ReasonForVisit", "Notes", "IsFollowUp", "PreviousAppointmentID") VALUES
    ('40000001-0001-0001-0001-000000000001', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', '2026-01-15', '09:00', 30, 'Completed', 'Annual cardiac check-up', 'EKG normal, blood pressure slightly elevated', 0, NULL),
    ('40000001-0001-0001-0001-000000000002', '30000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000001', '2026-01-15', '09:30', 45, 'Completed', 'Hypertension follow-up', 'Medication adjusted', 0, NULL),
    ('40000001-0001-0001-0001-000000000003', '30000001-0001-0001-0001-000000000003', '20000001-0001-0001-0001-000000000003', '2026-01-16', '10:00', 30, 'Completed', 'Skin rash evaluation', 'Prescribed topical cream', 0, NULL),
    ('40000001-0001-0001-0001-000000000004', '30000001-0001-0001-0001-000000000004', '20000001-0001-0001-0001-000000000006', '2026-01-16', '10:30', 30, 'Completed', 'Pediatric wellness check', NULL, 0, NULL),
    ('40000001-0001-0001-0001-000000000005', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', '2026-01-17', '11:00', 30, 'Completed', 'Chest pain evaluation', 'Stress test recommended', 0, NULL),
    ('40000001-0001-0001-0001-000000000006', '30000001-0001-0001-0001-000000000006', '20000001-0001-0001-0001-000000000001', '2026-01-17', '14:00', 45, 'Completed', 'Diabetes and cardiac review', 'A1C levels improved', 0, NULL),
    ('40000001-0001-0001-0001-000000000007', '30000001-0001-0001-0001-000000000007', '20000001-0001-0001-0001-000000000004', '2026-01-20', '08:30', 30, 'Completed', 'Knee pain assessment', 'X-ray ordered', 0, NULL),
    ('40000001-0001-0001-0001-000000000008', '30000001-0001-0001-0001-000000000008', '20000001-0001-0001-0001-000000000006', '2026-01-20', '09:00', 30, 'Completed', 'Asthma management review', 'Inhaler technique reviewed', 0, NULL),
    ('40000001-0001-0001-0001-000000000009', '30000001-0001-0001-0001-000000000009', '20000001-0001-0001-0001-000000000007', '2026-01-21', '10:00', 45, 'Completed', 'Migraine consultation', 'New preventive medication started', 0, NULL),
    ('40000001-0001-0001-0001-000000000010', '30000001-0001-0001-0001-000000000010', '20000001-0001-0001-0001-000000000004', '2026-01-21', '11:00', 30, 'Completed', 'Shoulder injury evaluation', NULL, 0, NULL);

-- Appointments 11-20 (more completed + cancelled + follow-ups)
INSERT INTO sample_clinic."Appointment" ("ID", "PatientID", "DoctorID", "AppointmentDate", "AppointmentTime", "DurationMinutes", "Status", "ReasonForVisit", "Notes", "IsFollowUp", "PreviousAppointmentID") VALUES
    ('40000001-0001-0001-0001-000000000011', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', '2026-01-29', '09:00', 30, 'Completed', 'Blood pressure follow-up', 'BP normalized on new dosage', 1, '40000001-0001-0001-0001-000000000001'),
    ('40000001-0001-0001-0001-000000000012', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', '2026-01-31', '11:00', 60, 'Completed', 'Stress test results review', 'Results within normal limits', 1, '40000001-0001-0001-0001-000000000005'),
    ('40000001-0001-0001-0001-000000000013', '30000001-0001-0001-0001-000000000011', '20000001-0001-0001-0001-000000000003', '2026-02-03', '09:30', 30, 'Completed', 'Acne treatment consultation', 'Started oral medication', 0, NULL),
    ('40000001-0001-0001-0001-000000000014', '30000001-0001-0001-0001-000000000012', '20000001-0001-0001-0001-000000000002', '2026-02-03', '14:00', 45, 'Completed', 'Post-surgery cardiac check', 'Healing well, echo normal', 0, NULL),
    ('40000001-0001-0001-0001-000000000015', '30000001-0001-0001-0001-000000000007', '20000001-0001-0001-0001-000000000004', '2026-02-05', '08:30', 30, 'Completed', 'Knee X-ray review', 'Mild arthritis, physical therapy recommended', 1, '40000001-0001-0001-0001-000000000007'),
    ('40000001-0001-0001-0001-000000000016', '30000001-0001-0001-0001-000000000013', '20000001-0001-0001-0001-000000000006', '2026-02-05', '10:00', 30, 'Cancelled', 'Annual checkup', NULL, 0, NULL),
    ('40000001-0001-0001-0001-000000000017', '30000001-0001-0001-0001-000000000014', '20000001-0001-0001-0001-000000000005', '2026-02-07', '15:00', 30, 'Completed', 'Sports injury assessment', 'MRI ordered for torn ligament suspicion', 0, NULL),
    ('40000001-0001-0001-0001-000000000018', '30000001-0001-0001-0001-000000000015', '20000001-0001-0001-0001-000000000007', '2026-02-07', '16:00', 45, 'Completed', 'Migraine pattern review', 'Botox treatment discussed', 1, '40000001-0001-0001-0001-000000000009'),
    ('40000001-0001-0001-0001-000000000019', '30000001-0001-0001-0001-000000000016', '20000001-0001-0001-0001-000000000001', '2026-02-10', '09:00', 45, 'Completed', 'Pacemaker monitoring', 'Device functioning normally', 0, NULL),
    ('40000001-0001-0001-0001-000000000020', '30000001-0001-0001-0001-000000000017', '20000001-0001-0001-0001-000000000002', '2026-02-10', '10:30', 30, 'NoShow', 'Cardiac screening', NULL, 0, NULL);

-- Appointments 21-30
INSERT INTO sample_clinic."Appointment" ("ID", "PatientID", "DoctorID", "AppointmentDate", "AppointmentTime", "DurationMinutes", "Status", "ReasonForVisit", "Notes", "IsFollowUp", "PreviousAppointmentID") VALUES
    ('40000001-0001-0001-0001-000000000021', '30000001-0001-0001-0001-000000000018', '20000001-0001-0001-0001-000000000008', '2026-02-12', '09:00', 30, 'Completed', 'Pediatric growth check', 'Height and weight on track', 0, NULL),
    ('40000001-0001-0001-0001-000000000022', '30000001-0001-0001-0001-000000000019', '20000001-0001-0001-0001-000000000005', '2026-02-12', '13:00', 30, 'Completed', 'Back pain evaluation', 'Physical therapy prescribed', 0, NULL),
    ('40000001-0001-0001-0001-000000000023', '30000001-0001-0001-0001-000000000020', '20000001-0001-0001-0001-000000000007', '2026-02-14', '10:00', 60, 'Completed', 'Neurological evaluation', 'Full neurological exam performed', 0, NULL),
    ('40000001-0001-0001-0001-000000000024', '30000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000001', '2026-02-14', '14:30', 30, 'Completed', 'Hypertension medication review', 'Dosage maintained, BP well controlled', 1, '40000001-0001-0001-0001-000000000002'),
    ('40000001-0001-0001-0001-000000000025', '30000001-0001-0001-0001-000000000003', '20000001-0001-0001-0001-000000000003', '2026-02-17', '09:00', 30, 'Cancelled', 'Skin rash follow-up', NULL, 1, '40000001-0001-0001-0001-000000000003'),
    ('40000001-0001-0001-0001-000000000026', '30000001-0001-0001-0001-000000000014', '20000001-0001-0001-0001-000000000005', '2026-02-17', '15:00', 30, 'Completed', 'MRI results review', 'Partial ligament tear confirmed, brace prescribed', 1, '40000001-0001-0001-0001-000000000017'),
    ('40000001-0001-0001-0001-000000000027', '30000001-0001-0001-0001-000000000006', '20000001-0001-0001-0001-000000000001', '2026-02-19', '09:00', 45, 'Completed', 'Quarterly diabetes check', 'Blood glucose well managed', 0, NULL),
    ('40000001-0001-0001-0001-000000000028', '30000001-0001-0001-0001-000000000010', '20000001-0001-0001-0001-000000000004', '2026-02-19', '11:00', 30, 'Completed', 'Shoulder therapy progress', 'Range of motion improving', 1, '40000001-0001-0001-0001-000000000010'),
    ('40000001-0001-0001-0001-000000000029', '30000001-0001-0001-0001-000000000009', '20000001-0001-0001-0001-000000000007', '2026-02-20', '10:00', 30, 'Completed', 'Migraine medication adjustment', 'Reduced frequency noted', 1, '40000001-0001-0001-0001-000000000018'),
    ('40000001-0001-0001-0001-000000000030', '30000001-0001-0001-0001-000000000012', '20000001-0001-0001-0001-000000000002', '2026-02-20', '14:00', 30, 'Completed', 'Cardiac rehab progress', 'Exercise tolerance improved significantly', 1, '40000001-0001-0001-0001-000000000014');

-- Appointments 31-40 (today + future, scheduled/confirmed)
INSERT INTO sample_clinic."Appointment" ("ID", "PatientID", "DoctorID", "AppointmentDate", "AppointmentTime", "DurationMinutes", "Status", "ReasonForVisit", "Notes", "IsFollowUp", "PreviousAppointmentID") VALUES
    ('40000001-0001-0001-0001-000000000031', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', '2026-02-23', '09:00', 30, 'Confirmed', 'Blood pressure recheck', NULL, 1, '40000001-0001-0001-0001-000000000011'),
    ('40000001-0001-0001-0001-000000000032', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', '2026-02-23', '09:30', 30, 'Confirmed', 'Annual cardiac review', NULL, 0, NULL),
    ('40000001-0001-0001-0001-000000000033', '30000001-0001-0001-0001-000000000004', '20000001-0001-0001-0001-000000000006', '2026-02-23', '10:00', 30, 'Scheduled', 'Vaccination update', NULL, 0, NULL),
    ('40000001-0001-0001-0001-000000000034', '30000001-0001-0001-0001-000000000011', '20000001-0001-0001-0001-000000000003', '2026-02-23', '10:30', 30, 'Scheduled', 'Acne treatment follow-up', NULL, 1, '40000001-0001-0001-0001-000000000013'),
    ('40000001-0001-0001-0001-000000000035', '30000001-0001-0001-0001-000000000016', '20000001-0001-0001-0001-000000000001', '2026-02-23', '14:00', 45, 'InProgress', 'Pacemaker quarterly check', NULL, 1, '40000001-0001-0001-0001-000000000019'),
    ('40000001-0001-0001-0001-000000000036', '30000001-0001-0001-0001-000000000020', '20000001-0001-0001-0001-000000000007', '2026-02-23', '15:00', 60, 'Scheduled', 'Neurological follow-up', NULL, 1, '40000001-0001-0001-0001-000000000023'),
    ('40000001-0001-0001-0001-000000000037', '30000001-0001-0001-0001-000000000007', '20000001-0001-0001-0001-000000000004', '2026-02-25', '08:30', 30, 'Scheduled', 'Knee therapy review', NULL, 1, '40000001-0001-0001-0001-000000000015'),
    ('40000001-0001-0001-0001-000000000038', '30000001-0001-0001-0001-000000000019', '20000001-0001-0001-0001-000000000005', '2026-02-25', '13:00', 30, 'Scheduled', 'Back pain progress', NULL, 1, '40000001-0001-0001-0001-000000000022'),
    ('40000001-0001-0001-0001-000000000039', '30000001-0001-0001-0001-000000000008', '20000001-0001-0001-0001-000000000006', '2026-02-26', '09:00', 30, 'Scheduled', 'Asthma check-up', NULL, 1, '40000001-0001-0001-0001-000000000008'),
    ('40000001-0001-0001-0001-000000000040', '30000001-0001-0001-0001-000000000015', '20000001-0001-0001-0001-000000000007', '2026-02-27', '10:00', 45, 'Scheduled', 'Migraine Botox treatment', NULL, 1, '40000001-0001-0001-0001-000000000029');

-- Diagnosis (25)
INSERT INTO sample_clinic."Diagnosis" ("ID", "AppointmentID", "ICDCode", "Description", "Severity", "Notes") VALUES
    ('50000001-0001-0001-0001-000000000001', '40000001-0001-0001-0001-000000000001', 'I10', 'Essential hypertension', 'Mild', 'Borderline elevated, lifestyle changes recommended'),
    ('50000001-0001-0001-0001-000000000002', '40000001-0001-0001-0001-000000000002', 'I10', 'Essential hypertension', 'Moderate', 'Medication dosage increased'),
    ('50000001-0001-0001-0001-000000000003', '40000001-0001-0001-0001-000000000003', 'L30.9', 'Dermatitis, unspecified', 'Mild', NULL),
    ('50000001-0001-0001-0001-000000000004', '40000001-0001-0001-0001-000000000005', 'R07.9', 'Chest pain, unspecified', 'Moderate', 'Stress test ordered'),
    ('50000001-0001-0001-0001-000000000005', '40000001-0001-0001-0001-000000000006', 'E11.65', 'Type 2 diabetes mellitus with hyperglycemia', 'Moderate', 'A1C improved from 7.8 to 7.1'),
    ('50000001-0001-0001-0001-000000000006', '40000001-0001-0001-0001-000000000007', 'M17.11', 'Primary osteoarthritis, right knee', 'Moderate', 'Physical therapy referral'),
    ('50000001-0001-0001-0001-000000000007', '40000001-0001-0001-0001-000000000008', 'J45.20', 'Mild intermittent asthma, uncomplicated', 'Mild', 'Technique correction helped'),
    ('50000001-0001-0001-0001-000000000008', '40000001-0001-0001-0001-000000000009', 'G43.909', 'Migraine, unspecified, not intractable', 'Severe', 'Preventive medication prescribed'),
    ('50000001-0001-0001-0001-000000000009', '40000001-0001-0001-0001-000000000010', 'M75.111', 'Incomplete rotator cuff tear of right shoulder', 'Moderate', 'Conservative treatment recommended'),
    ('50000001-0001-0001-0001-000000000010', '40000001-0001-0001-0001-000000000011', 'I10', 'Essential hypertension, controlled', 'Mild', 'Blood pressure normalized'),
    ('50000001-0001-0001-0001-000000000011', '40000001-0001-0001-0001-000000000013', 'L70.0', 'Acne vulgaris', 'Moderate', 'Started isotretinoin'),
    ('50000001-0001-0001-0001-000000000012', '40000001-0001-0001-0001-000000000014', 'Z95.1', 'Presence of aortocoronary bypass graft', 'Mild', 'Post-surgical recovery progressing well'),
    ('50000001-0001-0001-0001-000000000013', '40000001-0001-0001-0001-000000000015', 'M17.11', 'Primary osteoarthritis, right knee', 'Moderate', 'PT showing improvement'),
    ('50000001-0001-0001-0001-000000000014', '40000001-0001-0001-0001-000000000017', 'S83.511', 'Sprain of anterior cruciate ligament of right knee', 'Severe', 'MRI confirms partial tear'),
    ('50000001-0001-0001-0001-000000000015', '40000001-0001-0001-0001-000000000018', 'G43.909', 'Migraine, chronic', 'Severe', 'Botox candidacy evaluation positive'),
    ('50000001-0001-0001-0001-000000000016', '40000001-0001-0001-0001-000000000019', 'Z95.0', 'Presence of cardiac pacemaker', 'Mild', 'Device check satisfactory'),
    ('50000001-0001-0001-0001-000000000017', '40000001-0001-0001-0001-000000000022', 'M54.5', 'Low back pain', 'Moderate', 'Physical therapy prescribed'),
    ('50000001-0001-0001-0001-000000000018', '40000001-0001-0001-0001-000000000023', 'G40.909', 'Epilepsy, unspecified, evaluation', 'Severe', 'Full workup ordered'),
    ('50000001-0001-0001-0001-000000000019', '40000001-0001-0001-0001-000000000024', 'I10', 'Hypertension maintenance', 'Mild', 'Well controlled on current meds'),
    ('50000001-0001-0001-0001-000000000020', '40000001-0001-0001-0001-000000000026', 'S83.511', 'ACL partial tear follow-up', 'Moderate', 'Brace fitted, rehab started'),
    ('50000001-0001-0001-0001-000000000021', '40000001-0001-0001-0001-000000000027', 'E11.65', 'Type 2 diabetes quarterly review', 'Mild', 'A1C stable at 6.9'),
    ('50000001-0001-0001-0001-000000000022', '40000001-0001-0001-0001-000000000028', 'M75.111', 'Rotator cuff tear progress', 'Mild', 'Range of motion 80 percent restored'),
    ('50000001-0001-0001-0001-000000000023', '40000001-0001-0001-0001-000000000029', 'G43.909', 'Migraine frequency reduced', 'Moderate', 'From 15 to 8 days per month'),
    ('50000001-0001-0001-0001-000000000024', '40000001-0001-0001-0001-000000000030', 'Z95.1', 'Cardiac rehab milestone', 'Mild', 'Exercise capacity significantly improved'),
    ('50000001-0001-0001-0001-000000000025', '40000001-0001-0001-0001-000000000021', 'Z00.00', 'General pediatric examination', 'Mild', NULL);

-- Prescription (20)
INSERT INTO sample_clinic."Prescription" ("ID", "DiagnosisID", "MedicationName", "Dosage", "Frequency", "DurationDays", "Quantity", "Refills", "IsActive") VALUES
    ('60000001-0001-0001-0001-000000000001', '50000001-0001-0001-0001-000000000001', 'Lisinopril', '10mg', 'Once daily', 90, 90, 3, 1),
    ('60000001-0001-0001-0001-000000000002', '50000001-0001-0001-0001-000000000002', 'Amlodipine', '5mg', 'Once daily', 30, 30, 2, 1),
    ('60000001-0001-0001-0001-000000000003', '50000001-0001-0001-0001-000000000003', 'Hydrocortisone cream', '1% topical', 'Twice daily', 14, 1, 0, 0),
    ('60000001-0001-0001-0001-000000000004', '50000001-0001-0001-0001-000000000005', 'Metformin', '500mg', 'Twice daily', 90, 180, 3, 1),
    ('60000001-0001-0001-0001-000000000005', '50000001-0001-0001-0001-000000000005', 'Glipizide', '5mg', 'Once daily', 90, 90, 3, 1),
    ('60000001-0001-0001-0001-000000000006', '50000001-0001-0001-0001-000000000006', 'Ibuprofen', '400mg', 'Three times daily', 14, 42, 1, 0),
    ('60000001-0001-0001-0001-000000000007', '50000001-0001-0001-0001-000000000007', 'Albuterol inhaler', '90mcg', 'As needed', 30, 1, 5, 1),
    ('60000001-0001-0001-0001-000000000008', '50000001-0001-0001-0001-000000000008', 'Topiramate', '25mg', 'Once daily', 90, 90, 3, 1),
    ('60000001-0001-0001-0001-000000000009', '50000001-0001-0001-0001-000000000008', 'Sumatriptan', '50mg', 'As needed for acute migraine', 30, 9, 2, 1),
    ('60000001-0001-0001-0001-000000000010', '50000001-0001-0001-0001-000000000009', 'Naproxen', '500mg', 'Twice daily', 14, 28, 0, 0),
    ('60000001-0001-0001-0001-000000000011', '50000001-0001-0001-0001-000000000011', 'Isotretinoin', '20mg', 'Once daily', 180, 180, 0, 1),
    ('60000001-0001-0001-0001-000000000012', '50000001-0001-0001-0001-000000000014', 'Acetaminophen', '500mg', 'Every 6 hours as needed', 14, 56, 1, 1),
    ('60000001-0001-0001-0001-000000000013', '50000001-0001-0001-0001-000000000015', 'Amitriptyline', '10mg', 'At bedtime', 90, 90, 3, 1),
    ('60000001-0001-0001-0001-000000000014', '50000001-0001-0001-0001-000000000017', 'Cyclobenzaprine', '10mg', 'Three times daily', 14, 42, 0, 1),
    ('60000001-0001-0001-0001-000000000015', '50000001-0001-0001-0001-000000000018', 'Levetiracetam', '500mg', 'Twice daily', 90, 180, 3, 1),
    ('60000001-0001-0001-0001-000000000016', '50000001-0001-0001-0001-000000000019', 'Lisinopril', '10mg', 'Once daily', 90, 90, 3, 1),
    ('60000001-0001-0001-0001-000000000017', '50000001-0001-0001-0001-000000000020', 'Acetaminophen', '500mg', 'As needed', 30, 60, 1, 1),
    ('60000001-0001-0001-0001-000000000018', '50000001-0001-0001-0001-000000000021', 'Metformin', '500mg', 'Twice daily', 90, 180, 3, 1),
    ('60000001-0001-0001-0001-000000000019', '50000001-0001-0001-0001-000000000023', 'Sumatriptan', '50mg', 'As needed', 30, 9, 2, 1),
    ('60000001-0001-0001-0001-000000000020', '50000001-0001-0001-0001-000000000025', 'Vitamin D', '1000 IU', 'Once daily', 90, 90, 4, 1);

-- Billing (30)
INSERT INTO sample_clinic."Billing" ("ID", "AppointmentID", "PatientID", "DoctorID", "ServiceDescription", "Amount", "InsuranceCoverage", "PatientResponsibility", "PaymentStatus", "PaidAt", "PaymentMethod") VALUES
    ('70000001-0001-0001-0001-000000000001', '40000001-0001-0001-0001-000000000001', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', 'Cardiac consultation with EKG', 350.00, 280.00, 70.00, 'Paid', '2026-01-30', 'Card'),
    ('70000001-0001-0001-0001-000000000002', '40000001-0001-0001-0001-000000000002', '30000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000001', 'Hypertension management visit', 250.00, 200.00, 50.00, 'Paid', '2026-01-30', 'Card'),
    ('70000001-0001-0001-0001-000000000003', '40000001-0001-0001-0001-000000000003', '30000001-0001-0001-0001-000000000003', '20000001-0001-0001-0001-000000000003', 'Dermatology consultation', 200.00, 160.00, 40.00, 'Paid', '2026-01-31', 'Card'),
    ('70000001-0001-0001-0001-000000000004', '40000001-0001-0001-0001-000000000004', '30000001-0001-0001-0001-000000000004', '20000001-0001-0001-0001-000000000006', 'Pediatric wellness visit', 175.00, 140.00, 35.00, 'Paid', '2026-01-31', 'Card'),
    ('70000001-0001-0001-0001-000000000005', '40000001-0001-0001-0001-000000000005', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', 'Chest pain evaluation and stress test order', 400.00, 320.00, 80.00, 'Paid', '2026-02-01', 'Card'),
    ('70000001-0001-0001-0001-000000000006', '40000001-0001-0001-0001-000000000006', '30000001-0001-0001-0001-000000000006', '20000001-0001-0001-0001-000000000001', 'Diabetes and cardiac comprehensive review', 375.00, 337.50, 37.50, 'Paid', '2026-02-01', 'Check'),
    ('70000001-0001-0001-0001-000000000007', '40000001-0001-0001-0001-000000000007', '30000001-0001-0001-0001-000000000007', '20000001-0001-0001-0001-000000000004', 'Orthopedic knee consultation with X-ray', 325.00, 260.00, 65.00, 'Paid', '2026-02-03', 'Card'),
    ('70000001-0001-0001-0001-000000000008', '40000001-0001-0001-0001-000000000008', '30000001-0001-0001-0001-000000000008', '20000001-0001-0001-0001-000000000006', 'Pediatric asthma management', 175.00, 140.00, 35.00, 'Paid', '2026-02-03', 'Card'),
    ('70000001-0001-0001-0001-000000000009', '40000001-0001-0001-0001-000000000009', '30000001-0001-0001-0001-000000000009', '20000001-0001-0001-0001-000000000007', 'Neurology migraine consultation', 450.00, 360.00, 90.00, 'Paid', '2026-02-04', 'Card'),
    ('70000001-0001-0001-0001-000000000010', '40000001-0001-0001-0001-000000000010', '30000001-0001-0001-0001-000000000010', '20000001-0001-0001-0001-000000000004', 'Shoulder injury evaluation', 225.00, 0, 225.00, 'Paid', '2026-02-04', 'Cash'),
    ('70000001-0001-0001-0001-000000000011', '40000001-0001-0001-0001-000000000011', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', 'Blood pressure follow-up', 150.00, 120.00, 30.00, 'Paid', '2026-02-05', 'Card'),
    ('70000001-0001-0001-0001-000000000012', '40000001-0001-0001-0001-000000000012', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', 'Stress test results consultation', 300.00, 240.00, 60.00, 'Paid', '2026-02-05', 'Card'),
    ('70000001-0001-0001-0001-000000000013', '40000001-0001-0001-0001-000000000013', '30000001-0001-0001-0001-000000000011', '20000001-0001-0001-0001-000000000003', 'Acne treatment consultation', 200.00, 160.00, 40.00, 'Paid', '2026-02-07', 'Card'),
    ('70000001-0001-0001-0001-000000000014', '40000001-0001-0001-0001-000000000014', '30000001-0001-0001-0001-000000000012', '20000001-0001-0001-0001-000000000002', 'Post-surgery cardiac assessment', 500.00, 400.00, 100.00, 'Paid', '2026-02-07', 'Card'),
    ('70000001-0001-0001-0001-000000000015', '40000001-0001-0001-0001-000000000015', '30000001-0001-0001-0001-000000000007', '20000001-0001-0001-0001-000000000004', 'Knee arthritis follow-up', 225.00, 180.00, 45.00, 'Paid', '2026-02-10', 'Card'),
    ('70000001-0001-0001-0001-000000000016', '40000001-0001-0001-0001-000000000017', '30000001-0001-0001-0001-000000000014', '20000001-0001-0001-0001-000000000005', 'Sports injury with MRI order', 425.00, 340.00, 85.00, 'Paid', '2026-02-10', 'Card'),
    ('70000001-0001-0001-0001-000000000017', '40000001-0001-0001-0001-000000000018', '30000001-0001-0001-0001-000000000015', '20000001-0001-0001-0001-000000000007', 'Migraine pattern review and Botox eval', 450.00, 337.50, 112.50, 'Paid', '2026-02-12', 'Card'),
    ('70000001-0001-0001-0001-000000000018', '40000001-0001-0001-0001-000000000019', '30000001-0001-0001-0001-000000000016', '20000001-0001-0001-0001-000000000001', 'Pacemaker monitoring visit', 500.00, 450.00, 50.00, 'Paid', '2026-02-14', 'Card'),
    ('70000001-0001-0001-0001-000000000019', '40000001-0001-0001-0001-000000000021', '30000001-0001-0001-0001-000000000018', '20000001-0001-0001-0001-000000000008', 'Pediatric growth assessment', 175.00, 140.00, 35.00, 'Paid', '2026-02-14', 'Card'),
    ('70000001-0001-0001-0001-000000000020', '40000001-0001-0001-0001-000000000022', '30000001-0001-0001-0001-000000000019', '20000001-0001-0001-0001-000000000005', 'Back pain evaluation and therapy referral', 225.00, 180.00, 45.00, 'Billed', NULL, NULL),
    ('70000001-0001-0001-0001-000000000021', '40000001-0001-0001-0001-000000000023', '30000001-0001-0001-0001-000000000020', '20000001-0001-0001-0001-000000000007', 'Comprehensive neurological evaluation', 600.00, 0, 600.00, 'Billed', NULL, NULL),
    ('70000001-0001-0001-0001-000000000022', '40000001-0001-0001-0001-000000000024', '30000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000001', 'Hypertension follow-up', 150.00, 120.00, 30.00, 'Paid', '2026-02-17', 'Card'),
    ('70000001-0001-0001-0001-000000000023', '40000001-0001-0001-0001-000000000026', '30000001-0001-0001-0001-000000000014', '20000001-0001-0001-0001-000000000005', 'MRI results and brace fitting', 350.00, 280.00, 70.00, 'Billed', NULL, NULL),
    ('70000001-0001-0001-0001-000000000024', '40000001-0001-0001-0001-000000000027', '30000001-0001-0001-0001-000000000006', '20000001-0001-0001-0001-000000000001', 'Diabetes quarterly management', 275.00, 247.50, 27.50, 'Paid', '2026-02-21', 'Card'),
    ('70000001-0001-0001-0001-000000000025', '40000001-0001-0001-0001-000000000028', '30000001-0001-0001-0001-000000000010', '20000001-0001-0001-0001-000000000004', 'Shoulder therapy progress check', 225.00, 0, 225.00, 'Pending', NULL, NULL),
    ('70000001-0001-0001-0001-000000000026', '40000001-0001-0001-0001-000000000029', '30000001-0001-0001-0001-000000000009', '20000001-0001-0001-0001-000000000007', 'Migraine medication adjustment visit', 300.00, 240.00, 60.00, 'Paid', '2026-02-22', 'Card'),
    ('70000001-0001-0001-0001-000000000027', '40000001-0001-0001-0001-000000000030', '30000001-0001-0001-0001-000000000012', '20000001-0001-0001-0001-000000000002', 'Cardiac rehabilitation progress', 350.00, 280.00, 70.00, 'Denied', NULL, NULL),
    ('70000001-0001-0001-0001-000000000028', '40000001-0001-0001-0001-000000000031', '30000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', 'Blood pressure recheck', 150.00, 120.00, 30.00, 'Pending', NULL, NULL),
    ('70000001-0001-0001-0001-000000000029', '40000001-0001-0001-0001-000000000032', '30000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000002', 'Annual cardiac review', 275.00, 220.00, 55.00, 'Pending', NULL, NULL),
    ('70000001-0001-0001-0001-000000000030', '40000001-0001-0001-0001-000000000035', '30000001-0001-0001-0001-000000000016', '20000001-0001-0001-0001-000000000001', 'Pacemaker quarterly check', 500.00, 450.00, 50.00, 'Pending', NULL, NULL);

-- LabResult (15)
INSERT INTO sample_clinic."LabResult" ("ID", "AppointmentID", "TestName", "TestDate", "ResultValue", "NormalRange", "IsAbnormal", "OrderedByDoctorID", "Notes") VALUES
    ('80000001-0001-0001-0001-000000000001', '40000001-0001-0001-0001-000000000001', 'Complete Blood Count', '2026-01-15', 'WBC: 7.2 x10^9/L', '4.5-11.0 x10^9/L', 0, '20000001-0001-0001-0001-000000000001', NULL),
    ('80000001-0001-0001-0001-000000000002', '40000001-0001-0001-0001-000000000001', 'Lipid Panel', '2026-01-15', 'Total Cholesterol: 215 mg/dL', '< 200 mg/dL', 1, '20000001-0001-0001-0001-000000000001', 'Slightly elevated, dietary counseling recommended'),
    ('80000001-0001-0001-0001-000000000003', '40000001-0001-0001-0001-000000000002', 'Basic Metabolic Panel', '2026-01-15', 'Potassium: 4.1 mEq/L', '3.5-5.0 mEq/L', 0, '20000001-0001-0001-0001-000000000001', NULL),
    ('80000001-0001-0001-0001-000000000004', '40000001-0001-0001-0001-000000000005', 'Troponin I', '2026-01-17', '< 0.04 ng/mL', '< 0.04 ng/mL', 0, '20000001-0001-0001-0001-000000000002', 'Normal, rules out MI'),
    ('80000001-0001-0001-0001-000000000005', '40000001-0001-0001-0001-000000000006', 'HbA1c', '2026-01-17', '7.1%', '< 5.7% (normal), < 7% (diabetic goal)', 1, '20000001-0001-0001-0001-000000000001', 'Improved from 7.8 percent'),
    ('80000001-0001-0001-0001-000000000006', '40000001-0001-0001-0001-000000000009', 'MRI Brain', '2026-01-22', 'No structural abnormalities', NULL, 0, '20000001-0001-0001-0001-000000000007', 'Clear scan, migraine not structural'),
    ('80000001-0001-0001-0001-000000000007', '40000001-0001-0001-0001-000000000012', 'Stress Test ECG', '2026-01-31', 'Duke score: +5', '> +5 low risk', 0, '20000001-0001-0001-0001-000000000002', 'Normal exercise capacity, no ST changes'),
    ('80000001-0001-0001-0001-000000000008', '40000001-0001-0001-0001-000000000014', 'Echocardiogram', '2026-02-03', 'EF: 55%', '55-70%', 0, '20000001-0001-0001-0001-000000000002', 'Normal ejection fraction post-surgery'),
    ('80000001-0001-0001-0001-000000000009', '40000001-0001-0001-0001-000000000017', 'MRI Right Knee', '2026-02-08', 'Partial ACL tear, grade II', NULL, 1, '20000001-0001-0001-0001-000000000005', 'Surgical consult recommended if conservative treatment fails'),
    ('80000001-0001-0001-0001-000000000010', '40000001-0001-0001-0001-000000000023', 'EEG', '2026-02-14', 'Focal epileptiform activity left temporal', NULL, 1, '20000001-0001-0001-0001-000000000007', 'Consistent with focal epilepsy'),
    ('80000001-0001-0001-0001-000000000011', '40000001-0001-0001-0001-000000000024', 'Basic Metabolic Panel', '2026-02-14', 'All values within range', 'Reference ranges met', 0, '20000001-0001-0001-0001-000000000001', NULL),
    ('80000001-0001-0001-0001-000000000012', '40000001-0001-0001-0001-000000000027', 'HbA1c', '2026-02-19', '6.9%', '< 7% (diabetic goal)', 0, '20000001-0001-0001-0001-000000000001', 'Reached target, maintain current therapy'),
    ('80000001-0001-0001-0001-000000000013', '40000001-0001-0001-0001-000000000019', 'Pacemaker Interrogation', '2026-02-10', 'Battery 85%, lead impedance normal', NULL, 0, '20000001-0001-0001-0001-000000000001', 'All parameters within normal limits'),
    ('80000001-0001-0001-0001-000000000014', '40000001-0001-0001-0001-000000000021', 'CBC with differential', '2026-02-12', 'All counts normal', 'Age-adjusted reference', 0, '20000001-0001-0001-0001-000000000008', 'Routine pediatric screening'),
    ('80000001-0001-0001-0001-000000000015', '40000001-0001-0001-0001-000000000030', 'BNP', '2026-02-20', '45 pg/mL', '< 100 pg/mL', 0, '20000001-0001-0001-0001-000000000002', 'Heart failure markers within normal range');


-- ===================== FK & CHECK Constraints =====================

-- ============================================================
-- ALTER TABLE CHECK Constraints
-- ============================================================

-- PatientResponsibility must be non-negative
ALTER TABLE sample_clinic."Billing" ADD CONSTRAINT CK_Billing_PatientResponsibility CHECK ("PatientResponsibility" >= 0) NOT VALID;

-- ICDCode length must be between 3 and 10 characters - LENGTH() in CHECK
ALTER TABLE sample_clinic."Diagnosis" ADD CONSTRAINT CK_Diagnosis_ICDCodeLength CHECK (LENGTH("ICDCode") BETWEEN 3 AND 10) NOT VALID;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA sample_clinic TO "ClinicReader";


-- ===================== Comments =====================

COMMENT ON TABLE sample_clinic."Specialty" IS 'Medical specialization categories for doctors';

COMMENT ON TABLE sample_clinic."Doctor" IS 'Physician records with licensing and fee information';

COMMENT ON TABLE sample_clinic."Patient" IS 'Patient registration with insurance and emergency contacts';

COMMENT ON TABLE sample_clinic."Appointment" IS 'Appointment scheduling with follow-up chain tracking';

COMMENT ON TABLE sample_clinic."Diagnosis" IS 'Clinical diagnosis records with ICD codes';

COMMENT ON TABLE sample_clinic."Prescription" IS 'Medication prescriptions linked to diagnoses';

COMMENT ON TABLE sample_clinic."Billing" IS 'Billing and payment tracking for appointments';

COMMENT ON TABLE sample_clinic."LabResult" IS 'Laboratory test results linked to appointments';

COMMENT ON COLUMN sample_clinic."Specialty"."Name" IS 'Medical specialty name such as Cardiology or Dermatology';

COMMENT ON COLUMN sample_clinic."Doctor"."LicenseNumber" IS 'Doctor state medical license number';

COMMENT ON COLUMN sample_clinic."Doctor"."ConsultationFee" IS 'Base consultation fee per appointment';

COMMENT ON COLUMN sample_clinic."Doctor"."IsAcceptingPatients" IS 'Whether doctor is currently accepting new patients';

COMMENT ON COLUMN sample_clinic."Patient"."Gender" IS 'Patient biological sex for medical records';

COMMENT ON COLUMN sample_clinic."Patient"."RegisteredAt" IS 'Timestamp when patient first registered';

COMMENT ON COLUMN sample_clinic."Appointment"."AppointmentTime" IS 'Scheduled time slot for the appointment';

COMMENT ON COLUMN sample_clinic."Appointment"."Status" IS 'Current appointment lifecycle status';

COMMENT ON COLUMN sample_clinic."Appointment"."PreviousAppointmentID" IS 'Self-referencing link for follow-up chain';

COMMENT ON COLUMN sample_clinic."Diagnosis"."ICDCode" IS 'International Classification of Diseases code';

COMMENT ON COLUMN sample_clinic."Diagnosis"."Severity" IS 'Diagnosis severity from Mild to Critical';

COMMENT ON COLUMN sample_clinic."Prescription"."Refills" IS 'Number of prescription refills allowed';

COMMENT ON COLUMN sample_clinic."Billing"."Amount" IS 'Total service charge amount';

COMMENT ON COLUMN sample_clinic."Billing"."InsuranceCoverage" IS 'Insurance portion of the bill';

COMMENT ON COLUMN sample_clinic."Billing"."PatientResponsibility" IS 'Amount the patient owes after insurance';

COMMENT ON COLUMN sample_clinic."Billing"."PaymentStatus" IS 'Current payment processing status';

COMMENT ON COLUMN sample_clinic."LabResult"."IsAbnormal" IS 'Whether test result is outside normal range';

COMMENT ON COLUMN sample_clinic."LabResult"."OrderedByDoctorID" IS 'Doctor who ordered the lab test';


-- ===================== Other =====================

-- ============================================================
-- Extended Properties
-- ============================================================

-- Tables

-- Key Columns

-- ============================================================
-- Security: Role + GRANT
-- ============================================================
