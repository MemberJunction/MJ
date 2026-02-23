-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_fitness;
SET search_path TO sample_fitness, public;

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

-- MembershipTier lookup table
CREATE TABLE sample_fit."MembershipTier" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "MonthlyFee" DECIMAL(8,2) NOT NULL CHECK ("MonthlyFee" >= 0),
 "AnnualFee" DECIMAL(8,2) NULL,
 "MaxClassesPerWeek" INTEGER NULL,
 "HasPoolAccess" BOOLEAN NOT NULL DEFAULT FALSE,
 "HasSaunaAccess" BOOLEAN NOT NULL DEFAULT FALSE,
 "Description" TEXT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "PK_MembershipTier" PRIMARY KEY ("ID")
);

-- Location table
CREATE TABLE sample_fit."Location" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Address" VARCHAR(300) NOT NULL,
 "City" VARCHAR(100) NOT NULL,
 "State" VARCHAR(2) NOT NULL,
 "ZipCode" VARCHAR(10) NOT NULL,
 "Phone" VARCHAR(20) NOT NULL,
 "OpenTime" TIME NOT NULL,
 "CloseTime" TIME NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "PK_Location" PRIMARY KEY ("ID")
);

-- Trainer table
CREATE TABLE sample_fit."Trainer" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NOT NULL,
 "Phone" VARCHAR(20) NOT NULL,
 "Specialization" VARCHAR(200) NOT NULL,
 "HourlyRate" DECIMAL(6,2) NOT NULL,
 "Bio" TEXT NULL,
 "LocationID" UUID NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "CertifiedSince" DATE NOT NULL,
 CONSTRAINT "PK_Trainer" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Trainer_Email" UNIQUE ("Email")
);

-- Member table
CREATE TABLE sample_fit."Member" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "DateOfBirth" DATE NOT NULL,
 "EmergencyContact" VARCHAR(200) NOT NULL,
 "MembershipTierID" UUID NOT NULL,
 "LocationID" UUID NOT NULL,
 "JoinDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "Notes" TEXT NULL,
 CONSTRAINT "PK_Member" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Member_Email" UNIQUE ("Email")
);

-- FitnessClass table (inline CHECK constraints on ClassType, DayOfWeek, MaxCapacity)
CREATE TABLE sample_fit."FitnessClass" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "TrainerID" UUID NOT NULL,
 "LocationID" UUID NOT NULL,
 "DayOfWeek" VARCHAR(10) NOT NULL CHECK ("DayOfWeek" IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
 "StartTime" TIME NOT NULL,
 "DurationMinutes" INTEGER NOT NULL DEFAULT 60,
 "MaxCapacity" INTEGER NOT NULL DEFAULT 20 CHECK ("MaxCapacity" > 0),
 "ClassType" VARCHAR(30) NOT NULL CHECK ("ClassType" IN ('Yoga', 'HIIT', 'Spin', 'Pilates', 'CrossFit', 'Boxing', 'Swimming', 'Other')),
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "PK_FitnessClass" PRIMARY KEY ("ID")
);

-- ClassBooking table (inline CHECK on Status)
CREATE TABLE sample_fit."ClassBooking" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ClassID" UUID NOT NULL,
 "MemberID" UUID NOT NULL,
 "BookingDate" DATE NOT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Confirmed' CHECK ("Status" IN ('Confirmed', 'Waitlisted', 'Cancelled')),
 "CheckedIn" BOOLEAN NOT NULL DEFAULT FALSE,
 "CancelledAt" TIMESTAMPTZ NULL,
 CONSTRAINT "PK_ClassBooking" PRIMARY KEY ("ID")
);

-- PersonalTrainingSession table (inline CHECK on Status and Rating)
CREATE TABLE sample_fit."PersonalTrainingSession" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "TrainerID" UUID NOT NULL,
 "MemberID" UUID NOT NULL,
 "SessionDate" DATE NOT NULL,
 "StartTime" TIME NOT NULL,
 "DurationMinutes" INTEGER NOT NULL DEFAULT 60,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Scheduled' CHECK ("Status" IN ('Scheduled', 'Completed', 'Cancelled', 'NoShow')),
 "Notes" TEXT NULL,
 "Rating" SMALLINT NULL CHECK ("Rating" BETWEEN 1 AND 5),
 CONSTRAINT "PK_PersonalTrainingSession" PRIMARY KEY ("ID")
);

-- MemberMeasurement table (inline CHECK on WeightLbs)
CREATE TABLE sample_fit."MemberMeasurement" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "MemberID" UUID NOT NULL,
 "MeasurementDate" DATE NOT NULL DEFAULT NOW(),
 "WeightLbs" DECIMAL(5,1) NOT NULL CHECK ("WeightLbs" > 0),
 "BodyFatPercent" DECIMAL(4,1) NULL,
 "BMI" DECIMAL(4,1) NULL,
 "Notes" TEXT NULL,
 CONSTRAINT "PK_MemberMeasurement" PRIMARY KEY ("ID")
);

-- Payment table (inline CHECK on PaymentMethod)
CREATE TABLE sample_fit."Payment" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "MemberID" UUID NOT NULL,
 "Amount" DECIMAL(8,2) NOT NULL,
 "PaymentDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "PaymentMethod" VARCHAR(20) NOT NULL CHECK ("PaymentMethod" IN ('Credit', 'Debit', 'Cash', 'ACH', 'Check')),
 "Description" VARCHAR(300) NOT NULL,
 "ReferenceNumber" VARCHAR(50) NULL,
 "IsRefund" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT "PK_Payment" PRIMARY KEY ("ID")
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sample_fit_reader') THEN
        CREATE ROLE sample_fit_reader;
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_fit."vwClassSchedule"
AS SELECT
    fc."ID",
    fc."Name" AS "ClassName",
    fc."ClassType",
    fc."DayOfWeek",
    fc."StartTime",
    fc."DurationMinutes",
    fc."MaxCapacity",
    fc."IsActive",
    t."FirstName" || ' ' || t."LastName" AS "TrainerName",
    t."Email" AS "TrainerEmail",
    l."Name" AS "LocationName",
    l."Address" AS "LocationAddress",
    (SELECT COUNT(*) FROM sample_fit."ClassBooking" cb WHERE cb."ClassID" = fc."ID" AND cb."Status" = 'Confirmed') AS "CurrentEnrollment"
FROM sample_fit."FitnessClass" fc
INNER JOIN sample_fit."Trainer" t ON fc."TrainerID" = t."ID"
INNER JOIN sample_fit."Location" l ON fc."LocationID" = l."ID";

CREATE OR REPLACE VIEW sample_fit."vwMemberSummary"
AS SELECT
    m."ID",
    m."FirstName",
    m."LastName",
    m."Email",
    m."JoinDate",
    m."IsActive",
    mt."Name" AS "TierName",
    mt."MonthlyFee",
    l."Name" AS "LocationName",
    (SELECT COUNT(*) FROM sample_fit."ClassBooking" cb WHERE cb."MemberID" = m."ID" AND cb."CheckedIn" = 1) AS "ClassesAttended",
    (SELECT mm."MeasurementDate" FROM sample_fit."MemberMeasurement" mm WHERE mm."MemberID" = m."ID" ORDER BY mm."MeasurementDate" DESC
LIMIT 1) AS "LastMeasurementDate",
    (SELECT mm."WeightLbs" FROM sample_fit."MemberMeasurement" mm WHERE mm."MemberID" = m."ID" ORDER BY mm."MeasurementDate" DESC
LIMIT 1) AS "LastWeight"
FROM sample_fit."Member" m
INNER JOIN sample_fit."MembershipTier" mt ON m."MembershipTierID" = mt."ID"
INNER JOIN sample_fit."Location" l ON m."LocationID" = l."ID";

CREATE OR REPLACE VIEW sample_fit."vwTrainerSchedule"
AS SELECT
    t."ID",
    t."FirstName",
    t."LastName",
    t."Email",
    t."Specialization",
    t."HourlyRate",
    t."CertifiedSince",
    l."Name" AS "LocationName",
    (SELECT COUNT(*) FROM sample_fit."FitnessClass" fc WHERE fc."TrainerID" = t."ID" AND fc."IsActive" = 1) AS "ActiveClassCount",
    (SELECT COUNT(*) FROM sample_fit."PersonalTrainingSession" pts WHERE pts."TrainerID" = t."ID") AS "TotalPTSessions",
    (SELECT AVG(CAST(pts."Rating" AS DECIMAL(3,1))) FROM sample_fit."PersonalTrainingSession" pts WHERE pts."TrainerID" = t."ID" AND pts."Rating" IS NOT NULL) AS "AvgRating"
FROM sample_fit."Trainer" t
INNER JOIN sample_fit."Location" l ON t."LocationID" = l."ID";

CREATE OR REPLACE VIEW sample_fit."vwRevenueByMonth"
AS SELECT
    EXTRACT(YEAR FROM p."PaymentDate") AS "PaymentYear",
    EXTRACT(MONTH FROM p."PaymentDate") AS "PaymentMonth",
    COUNT(*) AS "TransactionCount",
    SUM(CASE WHEN p."IsRefund" = 0 THEN p."Amount" ELSE 0 END) AS "TotalRevenue",
    SUM(CASE WHEN p."IsRefund" = 1 THEN p."Amount" ELSE 0 END) AS "TotalRefunds",
    SUM(CASE WHEN p."IsRefund" = 0 THEN p."Amount" ELSE -p."Amount" END) AS "NetRevenue",
    COUNT(DISTINCT p."MemberID") AS "UniqueMemberCount"
FROM sample_fit."Payment" p
GROUP BY EXTRACT(YEAR FROM p."PaymentDate"), EXTRACT(MONTH FROM p."PaymentDate");


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- MembershipTiers (5)
INSERT INTO sample_fit."MembershipTier" ("ID", "Name", "MonthlyFee", "AnnualFee", "MaxClassesPerWeek", "HasPoolAccess", "HasSaunaAccess", "Description", "IsActive") VALUES
    ('A1000001-0001-0001-0001-000000000001', 'Basic', 29.99, 299.00, 2, 0, 0, 'Access to gym floor and basic equipment.', 1),
    ('A1000001-0001-0001-0001-000000000002', 'Standard', 49.99, 499.00, 5, 0, 0, 'Gym access plus group fitness classes.', 1),
    ('A1000001-0001-0001-0001-000000000003', 'Premium', 79.99, 799.00, NULL, 1, 0, 'Unlimited classes with pool access.', 1),
    ('A1000001-0001-0001-0001-000000000004', 'Elite', 119.99, 1199.00, NULL, 1, 1, 'All amenities including sauna and priority booking.', 1),
    ('A1000001-0001-0001-0001-000000000005', 'Student', 19.99, 199.00, 3, 0, 0, 'Discounted plan for students with valid ID.', 1);

-- Locations (4)
INSERT INTO sample_fit."Location" ("ID", "Name", "Address", "City", "State", "ZipCode", "Phone", "OpenTime", "CloseTime", "IsActive") VALUES
    ('A2000001-0001-0001-0001-000000000001', 'FitZone Downtown', '100 Main Street', 'Austin', 'TX', '78701', '512-555-0100', '05:00:00', '23:00:00', 1),
    ('A2000001-0001-0001-0001-000000000002', 'FitZone North', '500 Research Blvd', 'Austin', 'TX', '78759', '512-555-0200', '05:30:00', '22:00:00', 1),
    ('A2000001-0001-0001-0001-000000000003', 'FitZone South', '2200 S Lamar Blvd', 'Austin', 'TX', '78704', '512-555-0300', '06:00:00', '22:00:00', 1),
    ('A2000001-0001-0001-0001-000000000004', 'FitZone Lakeway', '1800 Lohmans Crossing', 'Lakeway', 'TX', '78734', '512-555-0400', '06:00:00', '21:00:00', 1);

-- Trainers (8)
INSERT INTO sample_fit."Trainer" ("ID", "FirstName", "LastName", "Email", "Phone", "Specialization", "HourlyRate", "Bio", "LocationID", "IsActive", "CertifiedSince") VALUES
    ('A3000001-0001-0001-0001-000000000001', 'Carlos', 'Rivera', 'carlos.rivera@fitzone.com', '512-555-1001', 'Strength & Conditioning', 75.00, 'NSCA certified strength coach with 10 years experience.', 'A2000001-0001-0001-0001-000000000001', 1, '2015-06-15'),
    ('A3000001-0001-0001-0001-000000000002', 'Maya', 'Patel', 'maya.patel@fitzone.com', '512-555-1002', 'Yoga & Flexibility', 65.00, 'RYT-500 yoga instructor specializing in vinyasa and restorative.', 'A2000001-0001-0001-0001-000000000001', 1, '2017-03-01'),
    ('A3000001-0001-0001-0001-000000000003', 'Jake', 'Thompson', 'jake.thompson@fitzone.com', '512-555-1003', 'HIIT & CrossFit', 80.00, 'CrossFit Level 3 trainer and former competitive athlete.', 'A2000001-0001-0001-0001-000000000002', 1, '2016-01-20'),
    ('A3000001-0001-0001-0001-000000000004', 'Alicia', 'Chen', 'alicia.chen@fitzone.com', '512-555-1004', 'Pilates & Core', 70.00, 'Balanced Body certified Pilates instructor.', 'A2000001-0001-0001-0001-000000000002', 1, '2018-09-10'),
    ('A3000001-0001-0001-0001-000000000005', 'Derek', 'Williams', 'derek.williams@fitzone.com', '512-555-1005', 'Boxing & MMA', 85.00, 'Former amateur boxer with USA Boxing coaching certification.', 'A2000001-0001-0001-0001-000000000003', 1, '2014-11-05'),
    ('A3000001-0001-0001-0001-000000000006', 'Sophie', 'Martin', 'sophie.martin@fitzone.com', '512-555-1006', 'Swimming & Aquatics', 70.00, 'Former collegiate swimmer and Red Cross certified instructor.', 'A2000001-0001-0001-0001-000000000001', 1, '2019-05-20'),
    ('A3000001-0001-0001-0001-000000000007', 'Ryan', 'Nakamura', 'ryan.nakamura@fitzone.com', '512-555-1007', 'Spin & Cardio', 60.00, 'Schwinn certified cycling instructor with high-energy style.', 'A2000001-0001-0001-0001-000000000003', 1, '2020-02-14'),
    ('A3000001-0001-0001-0001-000000000008', 'Brittany', 'Owens', 'brittany.owens@fitzone.com', '512-555-1008', 'Yoga & Meditation', 65.00, NULL, 'A2000001-0001-0001-0001-000000000004', 0, '2021-07-01');

-- Members (15)
INSERT INTO sample_fit."Member" ("ID", "FirstName", "LastName", "Email", "Phone", "DateOfBirth", "EmergencyContact", "MembershipTierID", "LocationID", "JoinDate", "IsActive", "Notes") VALUES
    ('A4000001-0001-0001-0001-000000000001', 'Emma', 'Johnson', 'emma.johnson@email.com', '512-555-2001', '1990-03-15', 'Tom Johnson 512-555-9001', 'A1000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000001', '2023-01-15', 1, 'Prefers morning classes.'),
    ('A4000001-0001-0001-0001-000000000002', 'Marcus', 'Lee', 'marcus.lee@email.com', '512-555-2002', '1985-07-22', 'Sarah Lee 512-555-9002', 'A1000001-0001-0001-0001-000000000004', 'A2000001-0001-0001-0001-000000000001', '2022-06-01', 1, 'Training for marathon.'),
    ('A4000001-0001-0001-0001-000000000003', 'Sofia', 'Garcia', 'sofia.garcia@email.com', '512-555-2003', '1995-11-08', 'Maria Garcia 512-555-9003', 'A1000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000002', '2023-03-20', 1, NULL),
    ('A4000001-0001-0001-0001-000000000004', 'David', 'Kim', 'david.kim@email.com', '512-555-2004', '1988-02-14', 'Lisa Kim 512-555-9004', 'A1000001-0001-0001-0001-000000000004', 'A2000001-0001-0001-0001-000000000001', '2021-11-10', 1, 'Personal training 2x/week.'),
    ('A4000001-0001-0001-0001-000000000005', 'Rachel', 'Brown', 'rachel.brown@email.com', NULL, '1992-09-30', 'Mike Brown 512-555-9005', 'A1000001-0001-0001-0001-000000000001', 'A2000001-0001-0001-0001-000000000003', '2024-01-05', 1, NULL),
    ('A4000001-0001-0001-0001-000000000006', 'Tyler', 'Martinez', 'tyler.martinez@email.com', '512-555-2006', '1998-05-17', 'Ana Martinez 512-555-9006', 'A1000001-0001-0001-0001-000000000005', 'A2000001-0001-0001-0001-000000000002', '2024-08-20', 1, 'UT Austin student.'),
    ('A4000001-0001-0001-0001-000000000007', 'Jessica', 'Davis', 'jessica.davis@email.com', '512-555-2007', '1983-12-03', 'Robert Davis 512-555-9007', 'A1000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000001', '2022-02-28', 1, 'Recovering from knee surgery, needs modified exercises.'),
    ('A4000001-0001-0001-0001-000000000008', 'Brandon', 'Wilson', 'brandon.wilson@email.com', '512-555-2008', '1991-08-25', 'Carol Wilson 512-555-9008', 'A1000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000003', '2023-07-14', 1, NULL),
    ('A4000001-0001-0001-0001-000000000009', 'Olivia', 'Taylor', 'olivia.taylor@email.com', '512-555-2009', '1997-01-19', 'James Taylor 512-555-9009', 'A1000001-0001-0001-0001-000000000004', 'A2000001-0001-0001-0001-000000000004', '2023-10-01', 1, 'Interested in swim lessons.'),
    ('A4000001-0001-0001-0001-000000000010', 'Nathan', 'Anderson', 'nathan.anderson@email.com', '512-555-2010', '1986-04-11', 'Linda Anderson 512-555-9010', 'A1000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000002', '2022-09-15', 1, 'CrossFit enthusiast.'),
    ('A4000001-0001-0001-0001-000000000011', 'Hannah', 'Thomas', 'hannah.thomas@email.com', '512-555-2011', '1994-06-28', 'Bill Thomas 512-555-9011', 'A1000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000001', '2024-03-10', 1, NULL),
    ('A4000001-0001-0001-0001-000000000012', 'Ethan', 'Moore', 'ethan.moore@email.com', NULL, '2000-10-05', 'Diane Moore 512-555-9012', 'A1000001-0001-0001-0001-000000000005', 'A2000001-0001-0001-0001-000000000003', '2024-09-01', 1, 'ACC student, evening availability only.'),
    ('A4000001-0001-0001-0001-000000000013', 'Mia', 'Jackson', 'mia.jackson@email.com', '512-555-2013', '1987-03-22', 'Paul Jackson 512-555-9013', 'A1000001-0001-0001-0001-000000000001', 'A2000001-0001-0001-0001-000000000004', '2023-05-18', 0, 'Membership frozen - travel.'),
    ('A4000001-0001-0001-0001-000000000014', 'Christopher', 'White', 'chris.white@email.com', '512-555-2014', '1993-09-14', 'Amy White 512-555-9014', 'A1000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000001', '2022-12-01', 1, NULL),
    ('A4000001-0001-0001-0001-000000000015', 'Lauren', 'Harris', 'lauren.harris@email.com', '512-555-2015', '1996-07-07', 'Greg Harris 512-555-9015', 'A1000001-0001-0001-0001-000000000004', 'A2000001-0001-0001-0001-000000000002', '2023-08-22', 1, 'Competes in local triathlons.');

-- FitnessClasses (12)
INSERT INTO sample_fit."FitnessClass" ("ID", "Name", "Description", "TrainerID", "LocationID", "DayOfWeek", "StartTime", "DurationMinutes", "MaxCapacity", "ClassType", "IsActive") VALUES
    ('A5000001-0001-0001-0001-000000000001', 'Morning Vinyasa Flow', 'Energizing vinyasa yoga to start your day.', 'A3000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000001', 'Monday', '06:30:00', 60, 25, 'Yoga', 1),
    ('A5000001-0001-0001-0001-000000000002', 'Power HIIT', 'High intensity interval training for max calorie burn.', 'A3000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000002', 'Monday', '07:00:00', 45, 20, 'HIIT', 1),
    ('A5000001-0001-0001-0001-000000000003', 'Lunchtime Spin', 'Fast-paced cycling session during your lunch break.', 'A3000001-0001-0001-0001-000000000007', 'A2000001-0001-0001-0001-000000000003', 'Tuesday', '12:00:00', 45, 30, 'Spin', 1),
    ('A5000001-0001-0001-0001-000000000004', 'Core Pilates', 'Strengthen your core with mat Pilates techniques.', 'A3000001-0001-0001-0001-000000000004', 'A2000001-0001-0001-0001-000000000002', 'Tuesday', '17:30:00', 50, 18, 'Pilates', 1),
    ('A5000001-0001-0001-0001-000000000005', 'CrossFit WOD', 'Workout of the day - varied functional movements.', 'A3000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000002', 'Wednesday', '06:00:00', 60, 15, 'CrossFit', 1),
    ('A5000001-0001-0001-0001-000000000006', 'Boxing Fundamentals', 'Learn boxing basics: stance, jab, cross, hooks.', 'A3000001-0001-0001-0001-000000000005', 'A2000001-0001-0001-0001-000000000003', 'Wednesday', '18:00:00', 60, 20, 'Boxing', 1),
    ('A5000001-0001-0001-0001-000000000007', 'Lap Swimming', 'Guided lap swim session for all skill levels.', 'A3000001-0001-0001-0001-000000000006', 'A2000001-0001-0001-0001-000000000001', 'Thursday', '06:00:00', 45, 12, 'Swimming', 1),
    ('A5000001-0001-0001-0001-000000000008', 'Evening Yoga Restore', 'Gentle restorative yoga for relaxation and recovery.', 'A3000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000001', 'Thursday', '19:00:00', 75, 20, 'Yoga', 1),
    ('A5000001-0001-0001-0001-000000000009', 'Saturday HIIT Blast', 'Weekend warrior high-intensity workout.', 'A3000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000002', 'Saturday', '09:00:00', 45, 25, 'HIIT', 1),
    ('A5000001-0001-0001-0001-000000000010', 'Weekend Spin', 'Upbeat weekend cycling session.', 'A3000001-0001-0001-0001-000000000007', 'A2000001-0001-0001-0001-000000000003', 'Saturday', '10:00:00', 45, 30, 'Spin', 1),
    ('A5000001-0001-0001-0001-000000000011', 'Sunday Yoga Flow', 'Relaxing end-of-week yoga session.', 'A3000001-0001-0001-0001-000000000008', 'A2000001-0001-0001-0001-000000000004', 'Sunday', '08:00:00', 60, 15, 'Yoga', 0),
    ('A5000001-0001-0001-0001-000000000012', 'Aqua Aerobics', 'Low-impact water-based fitness class.', 'A3000001-0001-0001-0001-000000000006', 'A2000001-0001-0001-0001-000000000001', 'Friday', '10:00:00', 50, 15, 'Swimming', 1);

-- ClassBookings (20)
INSERT INTO sample_fit."ClassBooking" ("ID", "ClassID", "MemberID", "BookingDate", "Status", "CheckedIn", "CancelledAt") VALUES
    ('A6000001-0001-0001-0001-000000000001', 'A5000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000001', '2025-01-06', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000002', 'A5000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000007', '2025-01-06', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000003', 'A5000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000011', '2025-01-06', 'Confirmed', 0, NULL),
    ('A6000001-0001-0001-0001-000000000004', 'A5000001-0001-0001-0001-000000000002', 'A4000001-0001-0001-0001-000000000002', '2025-01-06', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000005', 'A5000001-0001-0001-0001-000000000002', 'A4000001-0001-0001-0001-000000000010', '2025-01-06', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000006', 'A5000001-0001-0001-0001-000000000003', 'A4000001-0001-0001-0001-000000000008', '2025-01-07', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000007', 'A5000001-0001-0001-0001-000000000004', 'A4000001-0001-0001-0001-000000000003', '2025-01-07', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000008', 'A5000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000010', '2025-01-08', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000009', 'A5000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000015', '2025-01-08', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000010', 'A5000001-0001-0001-0001-000000000006', 'A4000001-0001-0001-0001-000000000004', '2025-01-08', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000011', 'A5000001-0001-0001-0001-000000000006', 'A4000001-0001-0001-0001-000000000005', '2025-01-08', 'Cancelled', 0, '2025-01-07 14:00:00'),
    ('A6000001-0001-0001-0001-000000000012', 'A5000001-0001-0001-0001-000000000007', 'A4000001-0001-0001-0001-000000000002', '2025-01-09', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000013', 'A5000001-0001-0001-0001-000000000007', 'A4000001-0001-0001-0001-000000000009', '2025-01-09', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000014', 'A5000001-0001-0001-0001-000000000008', 'A4000001-0001-0001-0001-000000000001', '2025-01-09', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000015', 'A5000001-0001-0001-0001-000000000009', 'A4000001-0001-0001-0001-000000000002', '2025-01-11', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000016', 'A5000001-0001-0001-0001-000000000009', 'A4000001-0001-0001-0001-000000000006', '2025-01-11', 'Waitlisted', 0, NULL),
    ('A6000001-0001-0001-0001-000000000017', 'A5000001-0001-0001-0001-000000000010', 'A4000001-0001-0001-0001-000000000008', '2025-01-11', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000018', 'A5000001-0001-0001-0001-000000000010', 'A4000001-0001-0001-0001-000000000012', '2025-01-11', 'Confirmed', 0, NULL),
    ('A6000001-0001-0001-0001-000000000019', 'A5000001-0001-0001-0001-000000000012', 'A4000001-0001-0001-0001-000000000009', '2025-01-10', 'Confirmed', 1, NULL),
    ('A6000001-0001-0001-0001-000000000020', 'A5000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000014', '2025-01-13', 'Confirmed', 0, NULL);

-- PersonalTrainingSessions (15)
INSERT INTO sample_fit."PersonalTrainingSession" ("ID", "TrainerID", "MemberID", "SessionDate", "StartTime", "DurationMinutes", "Status", "Notes", "Rating") VALUES
    ('A7000001-0001-0001-0001-000000000001', 'A3000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000002', '2025-01-06', '08:00:00', 60, 'Completed', 'Focused on upper body strength. Increased bench press by 10lbs.', 5),
    ('A7000001-0001-0001-0001-000000000002', 'A3000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000004', '2025-01-06', '10:00:00', 60, 'Completed', 'Leg day with squats and deadlifts.', 4),
    ('A7000001-0001-0001-0001-000000000003', 'A3000001-0001-0001-0001-000000000002', 'A4000001-0001-0001-0001-000000000007', '2025-01-07', '09:00:00', 45, 'Completed', 'Modified poses for knee rehabilitation.', 5),
    ('A7000001-0001-0001-0001-000000000004', 'A3000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000004', '2025-01-07', '16:00:00', 60, 'Completed', 'Pad work and heavy bag combinations.', 4),
    ('A7000001-0001-0001-0001-000000000005', 'A3000001-0001-0001-0001-000000000003', 'A4000001-0001-0001-0001-000000000010', '2025-01-08', '07:00:00', 60, 'Completed', 'CrossFit skill work: muscle-ups and handstand walks.', 5),
    ('A7000001-0001-0001-0001-000000000006', 'A3000001-0001-0001-0001-000000000006', 'A4000001-0001-0001-0001-000000000009', '2025-01-08', '14:00:00', 45, 'Completed', 'Freestyle technique improvement.', 3),
    ('A7000001-0001-0001-0001-000000000007', 'A3000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000002', '2025-01-09', '08:00:00', 60, 'Completed', 'Core and conditioning circuit.', 5),
    ('A7000001-0001-0001-0001-000000000008', 'A3000001-0001-0001-0001-000000000004', 'A4000001-0001-0001-0001-000000000003', '2025-01-09', '11:00:00', 45, 'Completed', 'Reformer Pilates introduction.', 4),
    ('A7000001-0001-0001-0001-000000000009', 'A3000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000008', '2025-01-10', '17:00:00', 60, 'Cancelled', 'Member called in sick.', NULL),
    ('A7000001-0001-0001-0001-000000000010', 'A3000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000004', '2025-01-10', '10:00:00', 60, 'Completed', 'Olympic lifting technique: clean and jerk.', 4),
    ('A7000001-0001-0001-0001-000000000011', 'A3000001-0001-0001-0001-000000000003', 'A4000001-0001-0001-0001-000000000015', '2025-01-11', '08:00:00', 60, 'Completed', 'Triathlon-specific strength training.', 5),
    ('A7000001-0001-0001-0001-000000000012', 'A3000001-0001-0001-0001-000000000002', 'A4000001-0001-0001-0001-000000000001', '2025-01-11', '09:00:00', 60, 'NoShow', NULL, NULL),
    ('A7000001-0001-0001-0001-000000000013', 'A3000001-0001-0001-0001-000000000006', 'A4000001-0001-0001-0001-000000000009', '2025-01-13', '14:00:00', 45, 'Scheduled', NULL, NULL),
    ('A7000001-0001-0001-0001-000000000014', 'A3000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000002', '2025-01-13', '08:00:00', 60, 'Scheduled', NULL, NULL),
    ('A7000001-0001-0001-0001-000000000015', 'A3000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000014', '2025-01-14', '16:00:00', 60, 'Scheduled', NULL, NULL);

-- MemberMeasurements (18)
INSERT INTO sample_fit."MemberMeasurement" ("ID", "MemberID", "MeasurementDate", "WeightLbs", "BodyFatPercent", "BMI", "Notes") VALUES
    ('A8000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000001', '2024-01-15', 145.0, 22.5, 23.8, 'Initial assessment.'),
    ('A8000001-0001-0001-0001-000000000002', 'A4000001-0001-0001-0001-000000000001', '2024-07-15', 140.5, 21.0, 23.1, 'Six-month progress check.'),
    ('A8000001-0001-0001-0001-000000000003', 'A4000001-0001-0001-0001-000000000001', '2025-01-10', 138.0, 20.2, 22.7, 'One year milestone - great progress!'),
    ('A8000001-0001-0001-0001-000000000004', 'A4000001-0001-0001-0001-000000000002', '2023-06-01', 195.0, 18.5, 27.0, 'Initial assessment. Marathon training plan.'),
    ('A8000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000002', '2024-01-10', 188.0, 16.0, 26.0, 'Good progress, increasing cardio endurance.'),
    ('A8000001-0001-0001-0001-000000000006', 'A4000001-0001-0001-0001-000000000002', '2025-01-08', 182.5, 14.5, 25.2, 'Race weight target approaching.'),
    ('A8000001-0001-0001-0001-000000000007', 'A4000001-0001-0001-0001-000000000004', '2022-11-10', 210.0, 25.0, 28.5, 'Initial assessment.'),
    ('A8000001-0001-0001-0001-000000000008', 'A4000001-0001-0001-0001-000000000004', '2024-05-15', 198.0, 20.0, 26.9, 'Significant body composition improvement.'),
    ('A8000001-0001-0001-0001-000000000009', 'A4000001-0001-0001-0001-000000000004', '2025-01-06', 192.0, 18.0, 26.1, 'Continuing to build lean muscle.'),
    ('A8000001-0001-0001-0001-000000000010', 'A4000001-0001-0001-0001-000000000007', '2024-03-01', 155.0, 28.0, 25.5, NULL),
    ('A8000001-0001-0001-0001-000000000011', 'A4000001-0001-0001-0001-000000000007', '2025-01-07', 148.0, 24.5, 24.4, 'Post-rehab progress.'),
    ('A8000001-0001-0001-0001-000000000012', 'A4000001-0001-0001-0001-000000000010', '2023-09-15', 175.0, 15.0, 24.2, 'Already fit, focus on performance.'),
    ('A8000001-0001-0001-0001-000000000013', 'A4000001-0001-0001-0001-000000000010', '2025-01-09', 178.0, 13.5, 24.6, 'Muscle gain with low fat.'),
    ('A8000001-0001-0001-0001-000000000014', 'A4000001-0001-0001-0001-000000000015', '2023-08-22', 130.0, 19.0, 21.5, 'Triathlon baseline assessment.'),
    ('A8000001-0001-0001-0001-000000000015', 'A4000001-0001-0001-0001-000000000015', '2025-01-11', 128.5, 17.5, 21.2, 'Competition weight, strong performance.'),
    ('A8000001-0001-0001-0001-000000000016', 'A4000001-0001-0001-0001-000000000003', '2024-03-20', 135.0, 24.0, 22.3, NULL),
    ('A8000001-0001-0001-0001-000000000017', 'A4000001-0001-0001-0001-000000000005', '2024-01-05', 160.0, 30.0, 26.5, 'Starting fitness journey.'),
    ('A8000001-0001-0001-0001-000000000018', 'A4000001-0001-0001-0001-000000000009', '2024-10-01', 142.0, 21.0, 23.5, 'Baseline for swim training program.');

-- Payments (25)
INSERT INTO sample_fit."Payment" ("ID", "MemberID", "Amount", "PaymentDate", "PaymentMethod", "Description", "ReferenceNumber", "IsRefund") VALUES
    ('A9000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000001', 79.99, '2025-01-01', 'Credit', 'Premium monthly membership - January 2025', 'TXN-2025-00001', 0),
    ('A9000001-0001-0001-0001-000000000002', 'A4000001-0001-0001-0001-000000000002', 119.99, '2025-01-01', 'Credit', 'Elite monthly membership - January 2025', 'TXN-2025-00002', 0),
    ('A9000001-0001-0001-0001-000000000003', 'A4000001-0001-0001-0001-000000000003', 49.99, '2025-01-01', 'Debit', 'Standard monthly membership - January 2025', 'TXN-2025-00003', 0),
    ('A9000001-0001-0001-0001-000000000004', 'A4000001-0001-0001-0001-000000000004', 119.99, '2025-01-01', 'ACH', 'Elite monthly membership - January 2025', 'TXN-2025-00004', 0),
    ('A9000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000005', 29.99, '2025-01-01', 'Credit', 'Basic monthly membership - January 2025', 'TXN-2025-00005', 0),
    ('A9000001-0001-0001-0001-000000000006', 'A4000001-0001-0001-0001-000000000006', 19.99, '2025-01-01', 'Debit', 'Student monthly membership - January 2025', 'TXN-2025-00006', 0),
    ('A9000001-0001-0001-0001-000000000007', 'A4000001-0001-0001-0001-000000000007', 79.99, '2025-01-01', 'Credit', 'Premium monthly membership - January 2025', 'TXN-2025-00007', 0),
    ('A9000001-0001-0001-0001-000000000008', 'A4000001-0001-0001-0001-000000000008', 49.99, '2025-01-01', 'Cash', 'Standard monthly membership - January 2025', 'TXN-2025-00008', 0),
    ('A9000001-0001-0001-0001-000000000009', 'A4000001-0001-0001-0001-000000000009', 119.99, '2025-01-01', 'Credit', 'Elite monthly membership - January 2025', 'TXN-2025-00009', 0),
    ('A9000001-0001-0001-0001-000000000010', 'A4000001-0001-0001-0001-000000000010', 79.99, '2025-01-01', 'ACH', 'Premium monthly membership - January 2025', 'TXN-2025-00010', 0),
    ('A9000001-0001-0001-0001-000000000011', 'A4000001-0001-0001-0001-000000000011', 49.99, '2025-01-01', 'Credit', 'Standard monthly membership - January 2025', 'TXN-2025-00011', 0),
    ('A9000001-0001-0001-0001-000000000012', 'A4000001-0001-0001-0001-000000000012', 19.99, '2025-01-01', 'Debit', 'Student monthly membership - January 2025', 'TXN-2025-00012', 0),
    ('A9000001-0001-0001-0001-000000000013', 'A4000001-0001-0001-0001-000000000014', 79.99, '2025-01-01', 'Credit', 'Premium monthly membership - January 2025', 'TXN-2025-00013', 0),
    ('A9000001-0001-0001-0001-000000000014', 'A4000001-0001-0001-0001-000000000015', 119.99, '2025-01-01', 'Check', 'Elite monthly membership - January 2025', 'TXN-2025-00014', 0),
    ('A9000001-0001-0001-0001-000000000015', 'A4000001-0001-0001-0001-000000000002', 75.00, '2025-01-06', 'Credit', 'Personal training session - Carlos Rivera', 'TXN-2025-00015', 0),
    ('A9000001-0001-0001-0001-000000000016', 'A4000001-0001-0001-0001-000000000004', 75.00, '2025-01-06', 'Credit', 'Personal training session - Carlos Rivera', 'TXN-2025-00016', 0),
    ('A9000001-0001-0001-0001-000000000017', 'A4000001-0001-0001-0001-000000000007', 65.00, '2025-01-07', 'Debit', 'Personal training session - Maya Patel (yoga)', 'TXN-2025-00017', 0),
    ('A9000001-0001-0001-0001-000000000018', 'A4000001-0001-0001-0001-000000000004', 85.00, '2025-01-07', 'Credit', 'Personal training session - Derek Williams (boxing)', 'TXN-2025-00018', 0),
    ('A9000001-0001-0001-0001-000000000019', 'A4000001-0001-0001-0001-000000000010', 80.00, '2025-01-08', 'ACH', 'Personal training session - Jake Thompson (CrossFit)', 'TXN-2025-00019', 0),
    ('A9000001-0001-0001-0001-000000000020', 'A4000001-0001-0001-0001-000000000009', 70.00, '2025-01-08', 'Credit', 'Personal training session - Sophie Martin (swimming)', 'TXN-2025-00020', 0),
    ('A9000001-0001-0001-0001-000000000021', 'A4000001-0001-0001-0001-000000000002', 75.00, '2025-01-09', 'Credit', 'Personal training session - Carlos Rivera', 'TXN-2025-00021', 0),
    ('A9000001-0001-0001-0001-000000000022', 'A4000001-0001-0001-0001-000000000003', 70.00, '2025-01-09', 'Debit', 'Personal training session - Alicia Chen (Pilates)', 'TXN-2025-00022', 0),
    ('A9000001-0001-0001-0001-000000000023', 'A4000001-0001-0001-0001-000000000015', 80.00, '2025-01-11', 'Credit', 'Personal training session - Jake Thompson', 'TXN-2025-00023', 0),
    ('A9000001-0001-0001-0001-000000000024', 'A4000001-0001-0001-0001-000000000005', 29.99, '2024-12-01', 'Credit', 'Basic monthly membership - December 2024', 'TXN-2024-00024', 0),
    ('A9000001-0001-0001-0001-000000000025', 'A4000001-0001-0001-0001-000000000008', 49.99, '2024-12-15', 'Cash', 'Standard monthly membership - December 2024 (late)', NULL, 0);


-- ===================== FK & CHECK Constraints =====================

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

ALTER TABLE sample_fit."Trainer"
    ADD CONSTRAINT "FK_Trainer_Location" FOREIGN KEY ("LocationID") REFERENCES sample_fit."Location" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_fit."Member"
    ADD CONSTRAINT "FK_Member_MembershipTier" FOREIGN KEY ("MembershipTierID") REFERENCES sample_fit."MembershipTier" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_fit."Member"
    ADD CONSTRAINT "FK_Member_Location" FOREIGN KEY ("LocationID") REFERENCES sample_fit."Location" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_fit."FitnessClass"
    ADD CONSTRAINT "FK_FitnessClass_Trainer" FOREIGN KEY ("TrainerID") REFERENCES sample_fit."Trainer" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_fit."FitnessClass"
    ADD CONSTRAINT "FK_FitnessClass_Location" FOREIGN KEY ("LocationID") REFERENCES sample_fit."Location" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_fit."ClassBooking"
    ADD CONSTRAINT "FK_ClassBooking_FitnessClass" FOREIGN KEY ("ClassID") REFERENCES sample_fit."FitnessClass" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_fit."ClassBooking"
    ADD CONSTRAINT "FK_ClassBooking_Member" FOREIGN KEY ("MemberID") REFERENCES sample_fit."Member" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_fit."PersonalTrainingSession"
    ADD CONSTRAINT "FK_PersonalTrainingSession_Trainer" FOREIGN KEY ("TrainerID") REFERENCES sample_fit."Trainer" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_fit."PersonalTrainingSession"
    ADD CONSTRAINT "FK_PersonalTrainingSession_Member" FOREIGN KEY ("MemberID") REFERENCES sample_fit."Member" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_fit."MemberMeasurement"
    ADD CONSTRAINT "FK_MemberMeasurement_Member" FOREIGN KEY ("MemberID") REFERENCES sample_fit."Member" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_fit."Payment"
    ADD CONSTRAINT "FK_Payment_Member" FOREIGN KEY ("MemberID") REFERENCES sample_fit."Member" ("ID") DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA sample_fit TO sample_fit_reader;


-- ===================== Comments =====================

COMMENT ON TABLE sample_fit."MembershipTier" IS 'Membership tier definitions with pricing and amenity access';

COMMENT ON TABLE sample_fit."Location" IS 'Gym and fitness center locations';

COMMENT ON TABLE sample_fit."Trainer" IS 'Personal trainers and fitness instructors';

COMMENT ON TABLE sample_fit."Member" IS 'Gym members with membership tier and home location';

COMMENT ON TABLE sample_fit."FitnessClass" IS 'Scheduled group fitness classes';

COMMENT ON TABLE sample_fit."ClassBooking" IS 'Member bookings for group fitness classes';

COMMENT ON TABLE sample_fit."PersonalTrainingSession" IS 'One-on-one personal training sessions';

COMMENT ON TABLE sample_fit."MemberMeasurement" IS 'Body measurement tracking for members';

COMMENT ON TABLE sample_fit."Payment" IS 'Payment transactions for memberships and services';

COMMENT ON COLUMN sample_fit."MembershipTier"."MonthlyFee" IS 'Monthly membership fee in dollars';

COMMENT ON COLUMN sample_fit."MembershipTier"."AnnualFee" IS 'Optional annual fee (discount vs monthly)';

COMMENT ON COLUMN sample_fit."MembershipTier"."MaxClassesPerWeek" IS 'Maximum group classes allowed per week for this tier';

COMMENT ON COLUMN sample_fit."Location"."OpenTime" IS 'Facility daily opening time';

COMMENT ON COLUMN sample_fit."Location"."CloseTime" IS 'Facility daily closing time';

COMMENT ON COLUMN sample_fit."Trainer"."HourlyRate" IS 'Trainer per-hour rate for personal training sessions';

COMMENT ON COLUMN sample_fit."Trainer"."CertifiedSince" IS 'Date trainer obtained primary certification';

COMMENT ON COLUMN sample_fit."Member"."EmergencyContact" IS 'Emergency contact name and phone number';

COMMENT ON COLUMN sample_fit."FitnessClass"."DayOfWeek" IS 'Day of week: Monday through Sunday';

COMMENT ON COLUMN sample_fit."FitnessClass"."StartTime" IS 'Class start time of day';

COMMENT ON COLUMN sample_fit."FitnessClass"."ClassType" IS 'Class type: Yoga, HIIT, Spin, Pilates, CrossFit, Boxing, Swimming, Other';

COMMENT ON COLUMN sample_fit."MemberMeasurement"."WeightLbs" IS 'Member weight in pounds';

COMMENT ON COLUMN sample_fit."MemberMeasurement"."BodyFatPercent" IS 'Body fat percentage';

COMMENT ON COLUMN sample_fit."Payment"."PaymentMethod" IS 'Payment method: Credit, Debit, Cash, ACH, Check';

COMMENT ON COLUMN sample_fit."PersonalTrainingSession"."Rating" IS 'Session rating by member (1-5 scale)';


-- ===================== Other =====================

-- ============================================================================
-- SECURITY
-- ============================================================================

-- Create role and grant permissions
