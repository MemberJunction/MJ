-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_fleet;
SET search_path TO sample_fleet, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER → BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER→bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

-- TODO: Review conditional DDL
-- -- Create the schema for Fleet operations
-- IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sample_fleet')
--     EXEC('CREATE SCHEMA sample_fleet');


DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fleet_reader') THEN
        CREATE ROLE fleet_reader;
    END IF;
END $$;

/* ============================================================
 Table: VehicleType
 Classification of vehicles by category and capability
 ============================================================ */
CREATE TABLE sample_fleet."VehicleType" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "Category" VARCHAR(30) NOT NULL DEFAULT 'Sedan',
 "MaxPassengers" SMALLINT NOT NULL DEFAULT 4,
 "CargoCapacityKg" DECIMAL(8,2) NULL,
 "FuelType" VARCHAR(20) NOT NULL DEFAULT 'Gasoline',
 "Description" TEXT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_VehicleType PRIMARY KEY ("ID"),
 CONSTRAINT UQ_VehicleType_Name UNIQUE ("Name"),
 CONSTRAINT CK_VehicleType_Category CHECK ("Category" IN ('Sedan', 'SUV', 'Truck', 'Van', 'Bus', 'Motorcycle', 'Electric')),
 CONSTRAINT CK_VehicleType_FuelType CHECK ("FuelType" IN ('Gasoline', 'Diesel', 'Electric', 'Hybrid', 'CNG')),
 CONSTRAINT CK_VehicleType_MaxPassengers CHECK ("MaxPassengers" >= 1 AND "MaxPassengers" <= 80)
);

/* ============================================================
 Table: Driver
 Fleet drivers with license and employment info
 ============================================================ */
CREATE TABLE sample_fleet."Driver" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "LicenseNumber" VARCHAR(30) NOT NULL,
 "LicenseClass" VARCHAR(10) NOT NULL DEFAULT 'B',
 "LicenseExpiry" DATE NOT NULL,
 "DateOfBirth" DATE NULL,
 "HireDate" DATE NOT NULL,
 "TerminationDate" DATE NULL,
 "Status" VARCHAR(15) NOT NULL DEFAULT 'Active',
 "HourlyRate" DECIMAL(6,2) NOT NULL,
 "Notes" TEXT NULL,
 "SupervisorID" UUID NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Driver PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Driver_Email UNIQUE ("Email"),
 CONSTRAINT UQ_Driver_LicenseNumber UNIQUE ("LicenseNumber"),
 CONSTRAINT FK_Driver_Supervisor FOREIGN KEY ("SupervisorID") REFERENCES sample_fleet."Driver"("ID"),
 CONSTRAINT CK_Driver_Status CHECK ("Status" IN ('Active', 'OnLeave', 'Suspended', 'Terminated')),
 CONSTRAINT CK_Driver_LicenseClass CHECK ("LicenseClass" IN ('A', 'B', 'C', 'D', 'E', 'CDL')),
 CONSTRAINT CK_Driver_HourlyRate CHECK ("HourlyRate" > 0)
);

/* ============================================================
 Table: Vehicle
 Physical fleet vehicles with assignment and mileage tracking
 ============================================================ */
CREATE TABLE sample_fleet."Vehicle" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "VehicleTypeID" UUID NOT NULL,
 "AssignedDriverID" UUID NULL,
 "VIN" VARCHAR(17) NOT NULL,
 "LicensePlate" VARCHAR(15) NOT NULL,
 "Make" VARCHAR(80) NOT NULL,
 "Model" VARCHAR(80) NOT NULL,
 "Year" SMALLINT NOT NULL,
 "Color" VARCHAR(30) NULL,
 "Mileage" INTEGER NOT NULL DEFAULT 0,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Available',
 "AcquisitionDate" DATE NOT NULL,
 "AcquisitionCost" DECIMAL(12,2) NOT NULL,
 "DisposalDate" DATE NULL,
 "InsurancePolicyNumber" VARCHAR(40) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Vehicle PRIMARY KEY ("ID"),
 CONSTRAINT FK_Vehicle_VehicleType FOREIGN KEY ("VehicleTypeID") REFERENCES sample_fleet."VehicleType"("ID"),
 CONSTRAINT FK_Vehicle_AssignedDriver FOREIGN KEY ("AssignedDriverID") REFERENCES sample_fleet."Driver"("ID"),
 CONSTRAINT UQ_Vehicle_VIN UNIQUE ("VIN"),
 CONSTRAINT UQ_Vehicle_LicensePlate UNIQUE ("LicensePlate"),
 CONSTRAINT CK_Vehicle_Status CHECK ("Status" IN ('Available', 'InUse', 'Maintenance', 'Retired', 'Disposed')),
 CONSTRAINT CK_Vehicle_Year CHECK ("Year" >= 1990 AND "Year" <= 2035),
 CONSTRAINT CK_Vehicle_Mileage CHECK ("Mileage" >= 0),
 CONSTRAINT CK_Vehicle_AcquisitionCost CHECK ("AcquisitionCost" > 0)
);

/* Filtered index: quickly find available vehicles */
CREATE INDEX IF NOT EXISTS IX_Vehicle_Available
    ON sample_fleet."Vehicle"("Status", "VehicleTypeID")
    WHERE "Status" = 'Available';

/* ============================================================
 Table: MaintenanceRecord
 Service and repair history for vehicles
 ============================================================ */
CREATE TABLE sample_fleet."MaintenanceRecord" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "VehicleID" UUID NOT NULL,
 "PerformedByDriverID" UUID NULL,
 "MaintenanceType" VARCHAR(25) NOT NULL DEFAULT 'Routine',
 "Description" TEXT NOT NULL,
 "ScheduledDate" DATE NOT NULL,
 "CompletedDate" DATE NULL,
 "MileageAtService" INTEGER NOT NULL,
 "LaborCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
 "PartsCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
 "TotalCost" DECIMAL(10,2) NOT NULL,
 "VendorName" VARCHAR(200) NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_MaintenanceRecord PRIMARY KEY ("ID"),
 CONSTRAINT FK_Maintenance_Vehicle FOREIGN KEY ("VehicleID") REFERENCES sample_fleet."Vehicle"("ID"),
 CONSTRAINT FK_Maintenance_Driver FOREIGN KEY ("PerformedByDriverID") REFERENCES sample_fleet."Driver"("ID"),
 CONSTRAINT CK_Maintenance_Type CHECK ("MaintenanceType" IN ('Routine', 'Repair', 'Inspection', 'TireRotation', 'OilChange', 'Recall', 'Bodywork')),
 CONSTRAINT CK_Maintenance_Status CHECK ("Status" IN ('Scheduled', 'InProgress', 'Completed', 'Cancelled')),
 CONSTRAINT CK_Maintenance_LaborCost CHECK ("LaborCost" >= 0),
 CONSTRAINT CK_Maintenance_PartsCost CHECK ("PartsCost" >= 0),
 CONSTRAINT CK_Maintenance_TotalCost CHECK ("TotalCost" >= 0),
 CONSTRAINT CK_Maintenance_MileageAtService CHECK ("MileageAtService" >= 0)
);

/* ============================================================
 Table: FuelLog
 Fuel purchase records per vehicle
 ============================================================ */
CREATE TABLE sample_fleet."FuelLog" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "VehicleID" UUID NOT NULL,
 "DriverID" UUID NOT NULL,
 "FuelDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "FuelType" VARCHAR(20) NOT NULL DEFAULT 'Gasoline',
 "Quantity" DECIMAL(8,3) NOT NULL,
 "PricePerUnit" DECIMAL(6,3) NOT NULL,
 "TotalCost" DECIMAL(10,2) NOT NULL,
 "MileageAtFill" INTEGER NOT NULL,
 "StationName" VARCHAR(150) NULL,
 "FullTank" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT PK_FuelLog PRIMARY KEY ("ID"),
 CONSTRAINT FK_FuelLog_Vehicle FOREIGN KEY ("VehicleID") REFERENCES sample_fleet."Vehicle"("ID"),
 CONSTRAINT FK_FuelLog_Driver FOREIGN KEY ("DriverID") REFERENCES sample_fleet."Driver"("ID"),
 CONSTRAINT CK_FuelLog_FuelType CHECK ("FuelType" IN ('Gasoline', 'Diesel', 'Electric', 'Hybrid', 'CNG')),
 CONSTRAINT CK_FuelLog_Quantity CHECK ("Quantity" > 0),
 CONSTRAINT CK_FuelLog_PricePerUnit CHECK ("PricePerUnit" > 0),
 CONSTRAINT CK_FuelLog_TotalCost CHECK ("TotalCost" > 0),
 CONSTRAINT CK_FuelLog_Mileage CHECK ("MileageAtFill" >= 0)
);

/* ============================================================
 Table: Trip
 Individual trips / assignments for fleet vehicles
 ============================================================ */
CREATE TABLE sample_fleet."Trip" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "VehicleID" UUID NOT NULL,
 "DriverID" UUID NOT NULL,
 "Origin" VARCHAR(300) NOT NULL,
 "Destination" VARCHAR(300) NOT NULL,
 "StartTime" TIMESTAMPTZ NOT NULL,
 "EndTime" TIMESTAMPTZ NULL,
 "DistanceKm" DECIMAL(10,2) NULL,
 "Purpose" VARCHAR(25) NOT NULL DEFAULT 'Delivery',
 "PassengerCount" SMALLINT NOT NULL DEFAULT 0,
 "StartMileage" INTEGER NOT NULL,
 "EndMileage" INTEGER NULL,
 "Status" VARCHAR(15) NOT NULL DEFAULT 'Planned',
 "Notes" TEXT NULL,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Trip PRIMARY KEY ("ID"),
 CONSTRAINT FK_Trip_Vehicle FOREIGN KEY ("VehicleID") REFERENCES sample_fleet."Vehicle"("ID"),
 CONSTRAINT FK_Trip_Driver FOREIGN KEY ("DriverID") REFERENCES sample_fleet."Driver"("ID"),
 CONSTRAINT CK_Trip_Purpose CHECK ("Purpose" IN ('Delivery', 'Pickup', 'ClientVisit', 'Transfer', 'Emergency', 'Maintenance', 'Personal')),
 CONSTRAINT CK_Trip_Status CHECK ("Status" IN ('Planned', 'InProgress', 'Completed', 'Cancelled')),
 CONSTRAINT CK_Trip_PassengerCount CHECK ("PassengerCount" >= 0),
 CONSTRAINT CK_Trip_StartMileage CHECK ("StartMileage" >= 0)
);

/* ============================================================
 Table: Inspection
 Regular vehicle inspections and compliance checks
 ============================================================ */
CREATE TABLE sample_fleet."Inspection" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "VehicleID" UUID NOT NULL,
 "InspectorDriverID" UUID NULL,
 "InspectionDate" DATE NOT NULL,
 "InspectionTime" TIME NOT NULL DEFAULT '09:00:00',
 "InspectionType" VARCHAR(25) NOT NULL DEFAULT 'Annual',
 "Result" VARCHAR(15) NOT NULL DEFAULT 'Pending',
 "BrakesOk" BOOLEAN NOT NULL DEFAULT TRUE,
 "TiresOk" BOOLEAN NOT NULL DEFAULT TRUE,
 "LightsOk" BOOLEAN NOT NULL DEFAULT TRUE,
 "EngineOk" BOOLEAN NOT NULL DEFAULT TRUE,
 "BodyOk" BOOLEAN NOT NULL DEFAULT TRUE,
 "MileageAtInspection" INTEGER NOT NULL,
 "Remarks" TEXT NULL,
 "NextInspectionDue" DATE NULL,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Inspection PRIMARY KEY ("ID"),
 CONSTRAINT FK_Inspection_Vehicle FOREIGN KEY ("VehicleID") REFERENCES sample_fleet."Vehicle"("ID"),
 CONSTRAINT FK_Inspection_Inspector FOREIGN KEY ("InspectorDriverID") REFERENCES sample_fleet."Driver"("ID"),
 CONSTRAINT CK_Inspection_Type CHECK ("InspectionType" IN ('Annual', 'Quarterly', 'PreTrip', 'PostTrip', 'Safety', 'Emissions')),
 CONSTRAINT CK_Inspection_Result CHECK ("Result" IN ('Pass', 'Fail', 'Conditional', 'Pending')),
 CONSTRAINT CK_Inspection_Mileage CHECK ("MileageAtInspection" >= 0)
);

-- Filtered index for overdue inspections
CREATE INDEX IF NOT EXISTS IX_Inspection_Overdue
    ON sample_fleet."Inspection"("NextInspectionDue")
    WHERE "Result" = 'Fail' OR "Result" = 'Conditional';

/* ============================================================
 Table: Incident
 Accidents, violations, and other fleet incidents
 ============================================================ */
CREATE TABLE sample_fleet."Incident" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "VehicleID" UUID NOT NULL,
 "DriverID" UUID NOT NULL,
 "TripID" UUID NULL,
 "IncidentDate" TIMESTAMPTZ NOT NULL,
 "IncidentType" VARCHAR(25) NOT NULL,
 "Severity" VARCHAR(15) NOT NULL DEFAULT 'Minor',
 "Location" VARCHAR(300) NOT NULL,
 "Description" TEXT NOT NULL,
 "PoliceReportNumber" VARCHAR(40) NULL,
 "InsuranceClaimNumber" VARCHAR(40) NULL,
 "EstimatedDamageCost" DECIMAL(12,2) NULL,
 "IsAtFault" BOOLEAN NOT NULL DEFAULT FALSE,
 "InjuryReported" BOOLEAN NOT NULL DEFAULT FALSE,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Reported',
 "ResolvedDate" DATE NULL,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Incident PRIMARY KEY ("ID"),
 CONSTRAINT FK_Incident_Vehicle FOREIGN KEY ("VehicleID") REFERENCES sample_fleet."Vehicle"("ID"),
 CONSTRAINT FK_Incident_Driver FOREIGN KEY ("DriverID") REFERENCES sample_fleet."Driver"("ID"),
 CONSTRAINT FK_Incident_Trip FOREIGN KEY ("TripID") REFERENCES sample_fleet."Trip"("ID"),
 CONSTRAINT CK_Incident_Type CHECK ("IncidentType" IN ('Collision', 'TrafficViolation', 'Breakdown', 'Theft', 'Vandalism', 'WeatherDamage', 'Other')),
 CONSTRAINT CK_Incident_Severity CHECK ("Severity" IN ('Minor', 'Moderate', 'Major', 'Critical')),
 CONSTRAINT CK_Incident_Status CHECK ("Status" IN ('Reported', 'UnderReview', 'Resolved', 'Closed', 'Disputed')),
 CONSTRAINT CK_Incident_DamageCost CHECK ("EstimatedDamageCost" IS NULL OR "EstimatedDamageCost" >= 0)
);


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_fleet."vwFleetUtilization"
AS SELECT
    v."ID" AS "VehicleID",
    v."LicensePlate",
    v."Make" || ' ' || v."Model" AS "VehicleDescription",
    vt."Name" AS "VehicleTypeName",
    vt."Category",
    COALESCE(d."FirstName" || ' ' || d."LastName", 'Unassigned') AS "AssignedDriver",
    COUNT(t."ID") AS "TotalTrips",
    SUM(CASE WHEN t."Status" = 'Completed' THEN 1 ELSE 0 END) AS "CompletedTrips",
    COALESCE(SUM(t."DistanceKm"), 0) AS "TotalDistanceKm",
    ROUND(AVG(CAST(t."DistanceKm" AS DECIMAL(10,2))), 2) AS "AvgTripDistanceKm",
    ROUND(AVG(CAST(EXTRACT(EPOCH FROM (t."EndTime"::TIMESTAMPTZ - t."StartTime"::TIMESTAMPTZ)) / 60 AS DECIMAL(10,2))), 1) AS "AvgTripMinutes",
    v."Mileage" AS "CurrentMileage",
    EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - v."AcquisitionDate"::TIMESTAMPTZ)) AS "DaysInService",
    v."Status" AS "VehicleStatus",
    v."AcquisitionCost"
FROM
    sample_fleet."Vehicle" v
    INNER JOIN sample_fleet."VehicleType" vt ON vt."ID" = v."VehicleTypeID"
    LEFT JOIN sample_fleet."Driver" d ON d."ID" = v."AssignedDriverID"
    LEFT JOIN sample_fleet."Trip" t ON t."VehicleID" = v."ID"
GROUP BY
    v."ID", v."LicensePlate", v."Make", v."Model", vt."Name", vt."Category",
    d."FirstName", d."LastName", v."Mileage", v."AcquisitionDate",
    v."Status", v."AcquisitionCost"
HAVING
    COUNT(t."ID") >= 0;

CREATE OR REPLACE VIEW sample_fleet."vwDriverPerformance"
AS SELECT
    dr."ID" AS "DriverID",
    dr."FirstName" || ' ' || dr."LastName" AS "DriverName",
    dr."LicenseClass",
    dr."Status" AS "DriverStatus",
    EXTRACT(YEAR FROM dr."HireDate") AS "HireYear",
    EXTRACT(MONTH FROM dr."HireDate") AS "HireMonth",
    (EXTRACT(YEAR FROM AGE(NOW()::TIMESTAMPTZ, dr."HireDate"::TIMESTAMPTZ)) * 12 + EXTRACT(MONTH FROM AGE(NOW()::TIMESTAMPTZ, dr."HireDate"::TIMESTAMPTZ))) AS "MonthsEmployed",
    COUNT(DISTINCT t."ID") AS "TotalTrips",
    COALESCE(SUM(t."DistanceKm"), 0) AS "TotalDistanceKm",
    ROUND(COALESCE(AVG(t."DistanceKm"), 0), 2) AS "AvgTripDistance",
    COUNT(DISTINCT inc."ID") AS "TotalIncidents",
    SUM(CASE WHEN inc."IsAtFault" = 1 THEN 1 ELSE 0 END) AS "AtFaultIncidents",
    CASE WHEN COUNT(DISTINCT t."ID") > 0 THEN ROUND(CAST(COUNT(DISTINCT inc."ID") AS DECIMAL(10,4)) / CAST(COUNT(DISTINCT t."ID") AS DECIMAL(10,4)) * 100, 2) ELSE 0 END AS "IncidentRatePercent",
    LENGTH(COALESCE(dr."Notes", '')) AS "NotesLength",
    dr."HourlyRate",
    CASE WHEN dr."TerminationDate" IS NULL THEN 'Current' ELSE 'Former' END AS "EmploymentStatus"
FROM
    sample_fleet."Driver" dr
    LEFT JOIN sample_fleet."Trip" t ON t."DriverID" = dr."ID"
    LEFT JOIN sample_fleet."Incident" inc ON inc."DriverID" = dr."ID"
GROUP BY
    dr."ID", dr."FirstName", dr."LastName", dr."LicenseClass", dr."Status",
    dr."HireDate", dr."TerminationDate", dr."Notes", dr."HourlyRate"
HAVING
    COUNT(DISTINCT t."ID") >= 0;

CREATE OR REPLACE VIEW sample_fleet."vwMaintenanceCostSummary"
AS SELECT
    v."ID" AS "VehicleID",
    v."LicensePlate",
    v."Make" || ' ' || v."Model" AS "VehicleDescription",
    vt."Name" AS "VehicleTypeName",
    COUNT(m."ID") AS "TotalServiceRecords",
    SUM(CASE WHEN m."Status" = 'Completed' THEN 1 ELSE 0 END) AS "CompletedServices",
    ROUND(COALESCE(SUM(m."LaborCost"), 0), 2) AS "TotalLaborCost",
    ROUND(COALESCE(SUM(m."PartsCost"), 0), 2) AS "TotalPartsCost",
    ROUND(COALESCE(SUM(m."TotalCost"), 0), 2) AS "GrandTotalCost",
    ROUND(COALESCE(AVG(m."TotalCost"), 0), 2) AS "AvgServiceCost",
    COALESCE(CAST(EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - MAX(m."CompletedDate")::TIMESTAMPTZ)) AS INTEGER), 0) AS "DaysSinceLastService",
    COALESCE(SUM(m."LaborCost"), 0) + COALESCE(SUM(m."PartsCost"), 0) AS "CombinedCostCheck",
    v."AcquisitionCost",
    CASE WHEN v."AcquisitionCost" > 0 THEN ROUND(COALESCE(SUM(m."TotalCost"), 0) / v."AcquisitionCost" * 100, 2) ELSE 0 END AS "MaintenanceCostPercent"
FROM
    sample_fleet."Vehicle" v
    INNER JOIN sample_fleet."VehicleType" vt ON vt."ID" = v."VehicleTypeID"
    LEFT JOIN sample_fleet."MaintenanceRecord" m ON m."VehicleID" = v."ID"
GROUP BY
    v."ID", v."LicensePlate", v."Make", v."Model", vt."Name", v."AcquisitionCost"
HAVING
    COALESCE(SUM(m."TotalCost"), 0) >= 0;

CREATE OR REPLACE VIEW sample_fleet."vwFuelEfficiency"
AS SELECT
    v."ID" AS "VehicleID",
    v."LicensePlate",
    v."Make" || ' ' || v."Model" AS "VehicleDescription",
    vt."FuelType" AS "VehicleFuelType",
    COUNT(fl."ID") AS "FuelStops",
    ROUND(COALESCE(SUM(fl."Quantity"), 0), 2) AS "TotalFuelQuantity",
    ROUND(COALESCE(SUM(fl."TotalCost"), 0), 2) AS "TotalFuelCost",
    ROUND(COALESCE(AVG(fl."PricePerUnit"), 0), 3) AS "AvgPricePerUnit",
    CASE WHEN COALESCE(SUM(fl."Quantity"), 0) > 0 THEN ROUND(CAST(v."Mileage" AS DECIMAL(12,2)) / SUM(fl."Quantity"), 2) ELSE 0 END AS "KmPerLiter",
    COALESCE(SUM(fl."TotalCost"), 0) + 0 AS "FuelCostTotal",
    EXTRACT(DAY FROM (MAX(fl."FuelDate")::TIMESTAMPTZ - MIN(fl."FuelDate")::TIMESTAMPTZ)) AS "FuelTrackingDays",
    SUM(CASE WHEN fl."FullTank" = 1 THEN 1 ELSE 0 END) AS "FullTankFills",
    SUM(CASE WHEN fl."FullTank" = 0 THEN 1 ELSE 0 END) AS "PartialFills",
    v."Mileage" AS "CurrentMileage"
FROM
    sample_fleet."Vehicle" v
    INNER JOIN sample_fleet."VehicleType" vt ON vt."ID" = v."VehicleTypeID"
    LEFT JOIN sample_fleet."FuelLog" fl ON fl."VehicleID" = v."ID"
GROUP BY
    v."ID", v."LicensePlate", v."Make", v."Model", vt."FuelType", v."Mileage"
HAVING
    COUNT(fl."ID") >= 0;


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

/* ============================================================
   INSERT DATA
   ============================================================ */

-- VehicleType (7 rows)
INSERT INTO sample_fleet."VehicleType" ("ID", "Name", "Category", "MaxPassengers", "CargoCapacityKg", "FuelType", "Description", "IsActive")
VALUES
    ('A0000001-0001-0001-0001-000000000001', 'Compact Sedan', 'Sedan', 4, 350.00, 'Gasoline', 'Fuel-efficient city commuter sedan', 1),
    ('A0000001-0001-0001-0001-000000000002', 'Full-Size SUV', 'SUV', 7, 900.50, 'Diesel', 'Large sport utility for off-road and towing', 1),
    ('A0000001-0001-0001-0001-000000000003', 'Cargo Van', 'Van', 2, 2500.00, 'Diesel', 'Heavy-duty cargo van for deliveries', 1),
    ('A0000001-0001-0001-0001-000000000004', 'Electric Hatchback', 'Electric', 4, 300.00, 'Electric', 'Zero-emission city vehicle with 400km range', 1),
    ('A0000001-0001-0001-0001-000000000005', 'Passenger Bus', 'Bus', 45, 500.00, 'Diesel', 'Standard transit bus for employee shuttles', 1),
    ('A0000001-0001-0001-0001-000000000006', 'Pickup Truck', 'Truck', 5, 1200.00, 'Gasoline', 'Mid-size pickup for maintenance crews', 1),
    ('A0000001-0001-0001-0001-000000000007', 'Hybrid Crossover', 'SUV', 5, 600.00, 'Hybrid', 'Eco-friendly crossover with excellent fuel economy', 1);

-- Driver (12 rows, includes self-referencing supervisor)
INSERT INTO sample_fleet."Driver" ("ID", "FirstName", "LastName", "Email", "Phone", "LicenseNumber", "LicenseClass", "LicenseExpiry", "DateOfBirth", "HireDate", "TerminationDate", "Status", "HourlyRate", "Notes", "SupervisorID", "IsActive")
VALUES
    ('B0000001-0001-0001-0001-000000000001', 'Carlos', 'Méndez', 'carlos.mendez@fleet.example.com', '555-0101', 'DL-100001', 'CDL', '2028-06-15', '1985-03-12', '2018-01-15', NULL, 'Active', 28.50, 'Fleet supervisor – CDL certified for all vehicle classes', NULL, 1),
    ('B0000001-0001-0001-0001-000000000002', 'Aisha', 'Patel', 'aisha.patel@fleet.example.com', '555-0102', 'DL-100002', 'B', '2027-09-01', '1990-07-22', '2019-04-01', NULL, 'Active', 22.00, 'Primarily assigned to compact sedans', 'B0000001-0001-0001-0001-000000000001', 1),
    ('B0000001-0001-0001-0001-000000000003', 'James', 'O''Brien', 'james.obrien@fleet.example.com', '555-0103', 'DL-100003', 'C', '2027-12-31', '1982-11-05', '2017-08-20', NULL, 'Active', 25.00, 'Experienced truck and van operator', 'B0000001-0001-0001-0001-000000000001', 1),
    ('B0000001-0001-0001-0001-000000000004', 'Yuki', 'Tanaka', 'yuki.tanaka@fleet.example.com', '555-0104', 'DL-100004', 'B', '2028-03-15', '1993-01-30', '2020-02-10', NULL, 'Active', 21.50, NULL, 'B0000001-0001-0001-0001-000000000001', 1),
    ('B0000001-0001-0001-0001-000000000005', 'Fatima', 'Al-Hassan', 'fatima.alhassan@fleet.example.com', '555-0105', 'DL-100005', 'CDL', '2027-11-20', '1988-09-14', '2019-06-01', NULL, 'Active', 27.00, 'Bus and heavy vehicle specialist', 'B0000001-0001-0001-0001-000000000001', 1),
    ('B0000001-0001-0001-0001-000000000006', 'Marco', 'Rossi', 'marco.rossi@fleet.example.com', '555-0106', 'DL-100006', 'B', '2026-08-30', '1995-04-18', '2021-01-05', NULL, 'Active', 20.50, 'New hire – electric vehicle specialist', 'B0000001-0001-0001-0001-000000000002', 1),
    ('B0000001-0001-0001-0001-000000000007', 'Elena', 'Volkov', 'elena.volkov@fleet.example.com', '555-0107', 'DL-100007', 'D', '2028-02-28', '1987-12-03', '2018-09-15', NULL, 'OnLeave', 24.00, 'Currently on medical leave', 'B0000001-0001-0001-0001-000000000001', 1),
    ('B0000001-0001-0001-0001-000000000008', 'David', 'Chen', 'david.chen@fleet.example.com', '555-0108', 'DL-100008', 'C', '2027-07-10', '1991-06-25', '2020-11-01', NULL, 'Active', 23.50, 'Night shift driver – cargo runs', 'B0000001-0001-0001-0001-000000000003', 1),
    ('B0000001-0001-0001-0001-000000000009', 'Sophie', 'Dubois', 'sophie.dubois@fleet.example.com', '555-0109', 'DL-100009', 'B', '2028-05-01', '1994-02-08', '2022-03-01', NULL, 'Active', 21.00, NULL, 'B0000001-0001-0001-0001-000000000002', 1),
    ('B0000001-0001-0001-0001-000000000010', 'Ahmed', 'Ibrahim', 'ahmed.ibrahim@fleet.example.com', '555-0110', 'DL-100010', 'CDL', '2027-10-15', '1983-08-19', '2016-05-20', '2024-12-31', 'Terminated', 26.00, 'Terminated due to license expiry', 'B0000001-0001-0001-0001-000000000001', 0),
    ('B0000001-0001-0001-0001-000000000011', 'Lin', 'Zhāng', 'lin.zhang@fleet.example.com', '555-0111', 'DL-100011', 'E', '2028-01-20', '1989-10-31', '2019-07-15', NULL, 'Active', 25.50, 'Specialized in long-haul transport', 'B0000001-0001-0001-0001-000000000003', 1),
    ('B0000001-0001-0001-0001-000000000012', 'Priya', 'Sharma', 'priya.sharma@fleet.example.com', '555-0112', 'DL-100012', 'B', '2028-09-30', '1996-05-12', '2023-01-10', NULL, 'Active', 20.00, 'Junior driver – training period', 'B0000001-0001-0001-0001-000000000002', 1);

-- Vehicle (10 rows)
INSERT INTO sample_fleet."Vehicle" ("ID", "VehicleTypeID", "AssignedDriverID", "VIN", "LicensePlate", "Make", "Model", "Year", "Color", "Mileage", "Status", "AcquisitionDate", "AcquisitionCost", "DisposalDate", "InsurancePolicyNumber", "IsActive")
VALUES
    ('C0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', '1HGBH41JXMN109186', 'FLT-001', 'Honda', 'Civic', 2022, 'Silver', 45200, 'InUse', '2022-01-15', 24500.00, NULL, 'INS-FL-001', 1),
    ('C0000001-0001-0001-0001-000000000002', 'A0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', '5TFBV54128X012345', 'FLT-002', 'Toyota', 'Land Cruiser', 2021, 'White', 68300, 'InUse', '2021-06-01', 58000.00, NULL, 'INS-FL-002', 1),
    ('C0000001-0001-0001-0001-000000000003', 'A0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', '2C4RC1BG8LR123456', 'FLT-003', 'Mercedes', 'Sprinter', 2020, 'White', 112500, 'InUse', '2020-03-10', 42000.00, NULL, 'INS-FL-003', 1),
    ('C0000001-0001-0001-0001-000000000004', 'A0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', '5YJ3E1EA8LF098765', 'FLT-004', 'Tesla', 'Model 3', 2023, 'Blue', 18700, 'InUse', '2023-02-20', 41000.00, NULL, 'INS-FL-004', 1),
    ('C0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', '1M8PDMTA7WP012345', 'FLT-005', 'Blue Bird', 'Vision', 2019, 'Yellow', 89400, 'InUse', '2019-09-01', 95000.00, NULL, 'INS-FL-005', 1),
    ('C0000001-0001-0001-0001-000000000006', 'A0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', '3C6JR7AT0JG123456', 'FLT-006', 'Ford', 'F-150', 2021, 'Red', 55100, 'InUse', '2021-04-15', 38500.00, NULL, 'INS-FL-006', 1),
    ('C0000001-0001-0001-0001-000000000007', 'A0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', 'JTDKN3DU5A1234567', 'FLT-007', 'Toyota', 'RAV4 Hybrid', 2023, 'Green', 12300, 'InUse', '2023-05-10', 36500.00, NULL, 'INS-FL-007', 1),
    ('C0000001-0001-0001-0001-000000000008', 'A0000001-0001-0001-0001-000000000001', NULL, 'WVWZZZ3CZWE123456', 'FLT-008', 'Volkswagen', 'Jetta', 2020, 'Black', 72800, 'Available', '2020-08-20', 22000.00, NULL, 'INS-FL-008', 1),
    ('C0000001-0001-0001-0001-000000000009', 'A0000001-0001-0001-0001-000000000003', NULL, '1FTYE2CM3HKA98765', 'FLT-009', 'Ford', 'Transit', 2018, 'White', 145000, 'Maintenance', '2018-02-28', 35000.00, NULL, 'INS-FL-009', 1),
    ('C0000001-0001-0001-0001-000000000010', 'A0000001-0001-0001-0001-000000000002', NULL, 'WDBRF61J21F123456', 'FLT-010', 'Chevrolet', 'Suburban', 2017, 'Gray', 168000, 'Retired', '2017-01-10', 52000.00, '2025-01-15', 'INS-FL-010', 0);

-- MaintenanceRecord (15 rows)
INSERT INTO sample_fleet."MaintenanceRecord" ("ID", "VehicleID", "PerformedByDriverID", "MaintenanceType", "Description", "ScheduledDate", "CompletedDate", "MileageAtService", "LaborCost", "PartsCost", "TotalCost", "VendorName", "Status")
VALUES
    ('D0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', NULL, 'OilChange', 'Synthetic oil change and filter replacement', '2025-01-10', '2025-01-10', 43000, 45.00, 65.00, 110.00, 'QuickLube Express', 'Completed'),
    ('D0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000002', NULL, 'TireRotation', 'Tire rotation and alignment check', '2025-01-15', '2025-01-15', 66500, 80.00, 0.00, 80.00, 'TirePro Service', 'Completed'),
    ('D0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000003', 'Repair', 'Brake pad replacement – front axle', '2025-02-01', '2025-02-03', 110000, 150.00, 220.00, 370.00, 'FleetFix Garage', 'Completed'),
    ('D0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000005', NULL, 'Routine', 'Annual bus safety certification service', '2025-02-10', '2025-02-12', 87000, 300.00, 450.00, 750.00, 'National Bus Services', 'Completed'),
    ('D0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000009', NULL, 'Repair', 'Transmission fluid leak repair', '2025-02-15', NULL, 144000, 0.00, 0.00, 0.00, 'FleetFix Garage', 'InProgress'),
    ('D0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000004', NULL, 'Inspection', 'Battery health check and software update', '2025-02-20', '2025-02-20', 18000, 50.00, 0.00, 50.00, 'Tesla Service Center', 'Completed'),
    ('D0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000006', NULL, 'OilChange', 'Standard oil change with synthetic blend', '2025-03-01', '2025-03-01', 53000, 40.00, 55.00, 95.00, 'QuickLube Express', 'Completed'),
    ('D0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000007', NULL, 'Routine', '30,000 km scheduled maintenance', '2025-03-05', '2025-03-06', 12000, 120.00, 180.00, 300.00, 'Toyota Dealership', 'Completed'),
    ('D0000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000008', NULL, 'Recall', 'Airbag recall – Takata inflator replacement', '2025-03-10', '2025-03-10', 72000, 0.00, 0.00, 0.00, 'VW Dealership', 'Completed'),
    ('D0000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000001', NULL, 'TireRotation', 'Tire rotation and balance', '2025-03-15', '2025-03-15', 44800, 60.00, 0.00, 60.00, 'TirePro Service', 'Completed'),
    ('D0000001-0001-0001-0001-000000000011', 'C0000001-0001-0001-0001-000000000010', NULL, 'Bodywork', 'Front bumper repair after minor collision', '2024-11-20', '2024-12-05', 165000, 400.00, 850.00, 1250.00, 'AutoBody Pros', 'Completed'),
    ('D0000001-0001-0001-0001-000000000012', 'C0000001-0001-0001-0001-000000000003', NULL, 'Routine', '100k km major service – belts, filters, fluids', '2025-04-01', NULL, 112500, 0.00, 0.00, 0.00, NULL, 'Scheduled'),
    ('D0000001-0001-0001-0001-000000000013', 'C0000001-0001-0001-0001-000000000005', NULL, 'TireRotation', 'Bus tire rotation – all six wheels', '2025-03-20', '2025-03-21', 88500, 150.00, 0.00, 150.00, 'National Bus Services', 'Completed'),
    ('D0000001-0001-0001-0001-000000000014', 'C0000001-0001-0001-0001-000000000006', NULL, 'Repair', 'Windshield chip repair', '2025-03-25', '2025-03-25', 54800, 75.00, 120.00, 195.00, 'GlassFix Mobile', 'Completed'),
    ('D0000001-0001-0001-0001-000000000015', 'C0000001-0001-0001-0001-000000000002', NULL, 'OilChange', 'Full synthetic oil change for diesel engine', '2025-04-05', NULL, 68300, 0.00, 0.00, 0.00, NULL, 'Scheduled');

-- FuelLog (18 rows)
INSERT INTO sample_fleet."FuelLog" ("ID", "VehicleID", "DriverID", "FuelDate", "FuelType", "Quantity", "PricePerUnit", "TotalCost", "MileageAtFill", "StationName", "FullTank")
VALUES
    ('E0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', '2025-01-05 08:30:00', 'Gasoline', 42.500, 1.459, 62.01, 42800, 'Shell Downtown', 1),
    ('E0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', '2025-01-20 17:15:00', 'Gasoline', 38.200, 1.479, 56.50, 43600, 'BP Highway', 1),
    ('E0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', '2025-01-08 07:45:00', 'Diesel', 75.000, 1.629, 122.18, 65800, 'Petro-Canada Main', 1),
    ('E0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', '2025-01-25 14:00:00', 'Diesel', 68.300, 1.599, 109.22, 67200, 'Shell Industrial', 1),
    ('E0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', '2025-01-12 06:00:00', 'Diesel', 85.000, 1.649, 140.17, 108500, 'Fleet Fuel Depot', 1),
    ('E0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', '2025-02-02 19:30:00', 'Diesel', 80.700, 1.619, 130.65, 110800, 'Fleet Fuel Depot', 1),
    ('E0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', '2025-01-18 12:00:00', 'Electric', 55.000, 0.350, 19.25, 17500, 'Tesla Supercharger', 1),
    ('E0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', '2025-02-10 09:45:00', 'Electric', 48.200, 0.355, 17.11, 18200, 'ChargePoint Hub', 1),
    ('E0000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', '2025-01-15 05:30:00', 'Diesel', 120.000, 1.589, 190.68, 86200, 'Fleet Fuel Depot', 1),
    ('E0000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', '2025-02-05 06:15:00', 'Diesel', 115.500, 1.609, 185.84, 88000, 'Petro-Canada Main', 1),
    ('E0000001-0001-0001-0001-000000000011', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', '2025-01-22 16:00:00', 'Gasoline', 65.000, 1.489, 96.79, 53500, 'Esso Service', 1),
    ('E0000001-0001-0001-0001-000000000012', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', '2025-02-08 11:30:00', 'Gasoline', 58.400, 1.499, 87.54, 54500, 'Shell Downtown', 1),
    ('E0000001-0001-0001-0001-000000000013', 'C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', '2025-01-28 13:15:00', 'Hybrid', 32.000, 1.469, 47.01, 11500, 'BP Highway', 1),
    ('E0000001-0001-0001-0001-000000000014', 'C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', '2025-02-15 10:00:00', 'Hybrid', 28.500, 1.479, 42.15, 12100, 'Shell Downtown', 0),
    ('E0000001-0001-0001-0001-000000000015', 'C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000009', '2025-01-10 08:00:00', 'Gasoline', 45.000, 1.449, 65.21, 71500, 'Esso Service', 1),
    ('E0000001-0001-0001-0001-000000000016', 'C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000009', '2025-02-01 15:45:00', 'Gasoline', 40.800, 1.469, 59.94, 72200, 'BP Highway', 1),
    ('E0000001-0001-0001-0001-000000000017', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', '2025-02-12 09:00:00', 'Gasoline', 41.000, 1.489, 61.05, 44500, 'Shell Downtown', 1),
    ('E0000001-0001-0001-0001-000000000018', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', '2025-02-22 07:00:00', 'Diesel', 82.100, 1.639, 134.56, 112000, 'Fleet Fuel Depot', 0);

-- Trip (20 rows)
INSERT INTO sample_fleet."Trip" ("ID", "VehicleID", "DriverID", "Origin", "Destination", "StartTime", "EndTime", "DistanceKm", "Purpose", "PassengerCount", "StartMileage", "EndMileage", "Status", "Notes")
VALUES
    ('F0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', 'Head Office – 100 Main St', 'Client Site – 450 Oak Ave', '2025-01-06 08:00:00', '2025-01-06 09:15:00', 35.50, 'ClientVisit', 1, 42800, 42836, 'Completed', 'Quarterly review meeting with Acme Corp'),
    ('F0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', 'Client Site – 450 Oak Ave', 'Head Office – 100 Main St', '2025-01-06 16:30:00', '2025-01-06 17:50:00', 37.20, 'ClientVisit', 0, 42836, 42873, 'Completed', NULL),
    ('F0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', 'Warehouse – 80 Industrial Rd', 'Construction Site B – Hwy 7', '2025-01-10 07:00:00', '2025-01-10 09:30:00', 95.00, 'Delivery', 2, 66000, 66095, 'Completed', 'Equipment delivery for project Delta'),
    ('F0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', 'Distribution Center – 25 Cargo Ln', 'Metro Area – 5 Locations', '2025-01-12 05:00:00', '2025-01-12 14:00:00', 180.00, 'Delivery', 0, 108500, 108680, 'Completed', 'Multi-stop delivery route – morning run'),
    ('F0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', 'Tech Park – 200 Innovation Dr', 'Data Center – 15 Server Rd', '2025-01-15 10:00:00', '2025-01-15 10:45:00', 22.00, 'Transfer', 3, 17500, 17522, 'Completed', 'IT team transfer to data center'),
    ('F0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', 'Main Campus – Gate A', 'Satellite Office – 500 Park Blvd', '2025-01-15 07:30:00', '2025-01-15 08:30:00', 28.00, 'Transfer', 32, 86200, 86228, 'Completed', 'Employee shuttle – morning route'),
    ('F0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', 'Satellite Office – 500 Park Blvd', 'Main Campus – Gate A', '2025-01-15 17:00:00', '2025-01-15 18:10:00', 29.50, 'Transfer', 28, 86228, 86258, 'Completed', 'Employee shuttle – evening return'),
    ('F0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', 'Maintenance Yard – 10 Shop Ln', 'Remote Tower Site – Rural Route 4', '2025-01-20 06:30:00', '2025-01-20 10:00:00', 145.00, 'Maintenance', 1, 53500, 53645, 'Completed', 'Tower maintenance equipment transport'),
    ('F0000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', 'Head Office – 100 Main St', 'Airport – Terminal 3', '2025-01-22 14:00:00', '2025-01-22 15:20:00', 42.00, 'Transfer', 2, 11500, 11542, 'Completed', 'Executive airport transfer'),
    ('F0000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', 'Distribution Center – 25 Cargo Ln', 'Regional Hub – 300 Commerce Way', '2025-01-25 04:30:00', '2025-01-25 08:45:00', 165.00, 'Delivery', 0, 109200, 109365, 'Completed', 'Overnight cargo run – priority shipment'),
    ('F0000001-0001-0001-0001-000000000011', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', 'Head Office – 100 Main St', 'Training Center – 75 Learning Way', '2025-01-28 09:00:00', '2025-01-28 09:40:00', 18.50, 'Transfer', 4, 43200, 43219, 'Completed', 'Driver training session'),
    ('F0000001-0001-0001-0001-000000000012', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', 'Tech Park – 200 Innovation Dr', 'Supplier – 88 Component Ave', '2025-02-01 11:00:00', '2025-02-01 11:50:00', 25.00, 'Pickup', 0, 17800, 17825, 'Completed', 'Picking up replacement parts'),
    ('F0000001-0001-0001-0001-000000000013', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', 'Head Office – 100 Main St', 'Emergency Site – 12 River Rd', '2025-02-05 22:00:00', '2025-02-06 00:30:00', 78.00, 'Emergency', 3, 67500, 67578, 'Completed', 'Emergency response – flood damage assessment'),
    ('F0000001-0001-0001-0001-000000000014', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', 'Maintenance Yard – 10 Shop Ln', 'Substation – 200 Power Line Rd', '2025-02-08 07:00:00', '2025-02-08 12:30:00', 110.00, 'Maintenance', 2, 54000, 54110, 'Completed', 'Substation equipment delivery and setup'),
    ('F0000001-0001-0001-0001-000000000015', 'C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', 'Head Office – 100 Main St', 'Conference Center – 1 Grand Hall Dr', '2025-02-10 08:30:00', '2025-02-10 09:10:00', 15.00, 'ClientVisit', 3, 11800, 11815, 'Completed', 'Annual vendor conference'),
    ('F0000001-0001-0001-0001-000000000016', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', 'Distribution Center – 25 Cargo Ln', 'Metro Area – 8 Locations', '2025-02-15 05:00:00', '2025-02-15 15:00:00', 210.00, 'Delivery', 0, 111000, 111210, 'Completed', 'Extended delivery route – 8 stops'),
    ('F0000001-0001-0001-0001-000000000017', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', 'Main Campus – Gate A', 'Convention Center – 2 Expo Rd', '2025-02-18 06:00:00', '2025-02-18 07:30:00', 40.00, 'Transfer', 38, 87500, 87540, 'Completed', 'Special event shuttle'),
    ('F0000001-0001-0001-0001-000000000018', 'C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000009', 'Office Branch B – 55 Elm St', 'Client Site – 320 Finance Blvd', '2025-02-20 09:00:00', '2025-02-20 09:30:00', 12.00, 'ClientVisit', 1, 72200, 72212, 'Completed', NULL),
    ('F0000001-0001-0001-0001-000000000019', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000012', 'Training Center – 75 Learning Way', 'Head Office – 100 Main St', '2025-02-22 16:00:00', '2025-02-22 16:35:00', 18.50, 'Transfer', 2, 44800, 44819, 'Completed', 'Return from driver certification exam'),
    ('F0000001-0001-0001-0001-000000000020', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', 'Warehouse – 80 Industrial Rd', 'Northern Depot – 400 North Hwy', '2025-02-25 06:00:00', NULL, NULL, 'Delivery', 1, 68000, NULL, 'InProgress', 'Heavy equipment shipment – en route');

-- Inspection (12 rows)
INSERT INTO sample_fleet."Inspection" ("ID", "VehicleID", "InspectorDriverID", "InspectionDate", "InspectionTime", "InspectionType", "Result", "BrakesOk", "TiresOk", "LightsOk", "EngineOk", "BodyOk", "MileageAtInspection", "Remarks", "NextInspectionDue")
VALUES
    ('G0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', '2025-01-05', '09:00:00', 'Annual', 'Pass', 1, 1, 1, 1, 1, 42500, 'All systems nominal – excellent condition', '2026-01-05'),
    ('G0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000001', '2025-01-06', '10:30:00', 'Annual', 'Pass', 1, 1, 1, 1, 1, 65500, 'Minor surface rust on undercarriage – monitor', '2026-01-06'),
    ('G0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000001', '2025-01-07', '08:00:00', 'Annual', 'Conditional', 1, 0, 1, 1, 1, 108000, 'Rear tires below minimum tread depth – replacement required within 30 days', '2025-02-07'),
    ('G0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', '2025-01-10', '14:00:00', 'Quarterly', 'Pass', 1, 1, 1, 1, 1, 17200, 'Battery health at 94% – excellent', '2025-04-10'),
    ('G0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000001', '2025-01-12', '07:00:00', 'Safety', 'Pass', 1, 1, 1, 1, 1, 86000, 'Bus meets all passenger safety requirements', '2025-07-12'),
    ('G0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', '2025-01-15', '11:00:00', 'PreTrip', 'Pass', 1, 1, 1, 1, 0, 53200, 'Small dent on tailgate – cosmetic only', '2025-04-15'),
    ('G0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', '2025-01-20', '09:30:00', 'Quarterly', 'Pass', 1, 1, 1, 1, 1, 11200, 'Near-new condition', '2025-04-20'),
    ('G0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000001', '2025-01-22', '13:00:00', 'Annual', 'Pass', 1, 1, 1, 1, 1, 71800, 'Good condition for age and mileage', '2026-01-22'),
    ('G0000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000009', 'B0000001-0001-0001-0001-000000000001', '2025-01-25', '08:30:00', 'Annual', 'Fail', 0, 0, 1, 0, 1, 144000, 'Brake lines corroded, engine oil leak, tires worn – requires major service', NULL),
    ('G0000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000001', '2024-12-15', '10:00:00', 'Annual', 'Fail', 0, 0, 0, 0, 0, 167500, 'Vehicle recommended for disposal – uneconomical to repair', NULL),
    ('G0000001-0001-0001-0001-000000000011', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000003', '2025-02-10', '07:30:00', 'PostTrip', 'Pass', 1, 1, 1, 1, 1, 110000, 'Post-delivery check – all good after tire replacement', '2025-05-10'),
    ('G0000001-0001-0001-0001-000000000012', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', '2025-02-15', '06:30:00', 'Emissions', 'Pass', 1, 1, 1, 1, 1, 87800, 'Emissions within regulatory limits', '2025-08-15');

-- Incident (8 rows)
INSERT INTO sample_fleet."Incident" ("ID", "VehicleID", "DriverID", "TripID", "IncidentDate", "IncidentType", "Severity", "Location", "Description", "PoliceReportNumber", "InsuranceClaimNumber", "EstimatedDamageCost", "IsAtFault", "InjuryReported", "Status", "ResolvedDate")
VALUES
    ('H0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000010', NULL, '2024-11-15 14:30:00', 'Collision', 'Moderate', 'Intersection of 5th Ave and Elm St', 'Rear-ended at red light by third party. Bumper and trunk damage.', 'PR-2024-11501', 'CLM-2024-8801', 3500.00, 0, 0, 'Resolved', '2024-12-20'),
    ('H0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', 'F0000001-0001-0001-0001-000000000004', '2025-01-12 11:45:00', 'Breakdown', 'Minor', 'Highway 401 Eastbound – KM marker 215', 'Flat tire during delivery route. Replaced with spare on-site.', NULL, NULL, 150.00, 0, 0, 'Resolved', '2025-01-12'),
    ('H0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', 'F0000001-0001-0001-0001-000000000008', '2025-01-20 09:15:00', 'TrafficViolation', 'Minor', 'Rural Route 4 – Speed Zone', 'Speeding ticket – 72 km/h in 50 km/h zone.', NULL, NULL, NULL, 0, 0, 'Resolved', '2025-02-01'),
    ('H0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000013', '2025-02-05 23:30:00', 'WeatherDamage', 'Moderate', 'Highway 7 – Near Emergency Site', 'Hail damage to windshield and roof during emergency response.', NULL, 'CLM-2025-1201', 2200.00, 0, 0, 'UnderReview', NULL),
    ('H0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000009', NULL, '2025-02-18 08:00:00', 'Vandalism', 'Minor', 'Office Branch B Parking Lot – 55 Elm St', 'Side mirror broken overnight. Security footage under review.', 'PR-2025-02181', NULL, 350.00, 0, 0, 'UnderReview', NULL),
    ('H0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000001', '2025-01-06 08:45:00', 'Collision', 'Minor', 'Intersection of Main St and 3rd Ave', 'Minor fender contact while changing lanes. No visible damage to other vehicle.', NULL, NULL, 200.00, 1, 0, 'Closed', '2025-01-10'),
    ('H0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000017', '2025-02-18 07:15:00', 'Collision', 'Major', 'Convention Center Entrance – 2 Expo Rd', 'Bus clipped concrete bollard while turning into parking area. Significant side panel damage.', 'PR-2025-02182', 'CLM-2025-1401', 8500.00, 1, 0, 'Reported', NULL),
    ('H0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000009', 'B0000001-0001-0001-0001-000000000008', NULL, '2025-02-20 10:00:00', 'Theft', 'Critical', 'Distribution Center – 25 Cargo Ln', 'Catalytic converter stolen from vehicle while in maintenance bay.', 'PR-2025-02201', 'CLM-2025-1501', 4000.00, 0, 0, 'Reported', NULL);


-- ===================== FK & CHECK Constraints =====================

-- Add a CHECK constraint via ALTER TABLE
ALTER TABLE sample_fleet."MaintenanceRecord"
    ADD CONSTRAINT CK_Maintenance_CompletedAfterScheduled
    CHECK ("CompletedDate" IS NULL OR "CompletedDate" >= "ScheduledDate") NOT VALID;

ALTER TABLE sample_fleet."Trip"
    ADD CONSTRAINT CK_Trip_EndAfterStart
    CHECK ("EndTime" IS NULL OR "EndTime" >= "StartTime") NOT VALID;

ALTER TABLE sample_fleet."Trip"
    ADD CONSTRAINT CK_Trip_EndMileageValid
    CHECK ("EndMileage" IS NULL OR "EndMileage" >= "StartMileage") NOT VALID;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA sample_fleet TO fleet_reader;


-- ===================== Comments =====================

COMMENT ON TABLE sample_fleet."VehicleType" IS 'Lookup table for vehicle classifications used across the fleet';

COMMENT ON COLUMN sample_fleet."Driver"."SupervisorID" IS 'Self-referencing FK allows tracking supervisor hierarchy among drivers';

COMMENT ON TABLE sample_fleet."Vehicle" IS 'Core vehicle inventory tracking VIN, plate, mileage, and assignment';
