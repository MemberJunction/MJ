/* ============================================================
   Sample Fleet Management Database
   Schema: sample_fleet

   Tables: VehicleType, Vehicle, Driver, MaintenanceRecord,
           FuelLog, Trip, Inspection, Incident
   Views:  vwFleetUtilization, vwDriverPerformance,
           vwMaintenanceCostSummary, vwFuelEfficiency
   ============================================================ */

USE SampleFleet;
GO

-- Create the schema for Fleet operations
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sample_fleet')
    EXEC('CREATE SCHEMA sample_fleet');
GO

-- Security: create a fleet_reader role for read-only access
CREATE ROLE fleet_reader;
GO
GRANT SELECT ON SCHEMA::sample_fleet TO fleet_reader;
GO

/* ============================================================
   Table: VehicleType
   Classification of vehicles by category and capability
   ============================================================ */
CREATE TABLE sample_fleet.VehicleType (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Category VARCHAR(30) NOT NULL DEFAULT 'Sedan',
    MaxPassengers SMALLINT NOT NULL DEFAULT 4,
    CargoCapacityKg DECIMAL(8,2) NULL,
    FuelType VARCHAR(20) NOT NULL DEFAULT 'Gasoline',
    Description NVARCHAR(MAX) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_VehicleType PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_VehicleType_Name UNIQUE (Name),
    CONSTRAINT CK_VehicleType_Category CHECK (Category IN ('Sedan', 'SUV', 'Truck', 'Van', 'Bus', 'Motorcycle', 'Electric')),
    CONSTRAINT CK_VehicleType_FuelType CHECK (FuelType IN ('Gasoline', 'Diesel', 'Electric', 'Hybrid', 'CNG')),
    CONSTRAINT CK_VehicleType_MaxPassengers CHECK (MaxPassengers >= 1 AND MaxPassengers <= 80)
);
GO

-- Extended property on VehicleType
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lookup table for vehicle classifications used across the fleet',
    @level0type = N'SCHEMA', @level0name = N'sample_fleet',
    @level1type = N'TABLE',  @level1name = N'VehicleType';
GO

/* ============================================================
   Table: Driver
   Fleet drivers with license and employment info
   ============================================================ */
CREATE TABLE sample_fleet.Driver (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    Phone VARCHAR(20) NULL,
    LicenseNumber VARCHAR(30) NOT NULL,
    LicenseClass VARCHAR(10) NOT NULL DEFAULT 'B',
    LicenseExpiry DATE NOT NULL,
    DateOfBirth DATE NULL,
    HireDate DATE NOT NULL,
    TerminationDate DATE NULL,
    Status VARCHAR(15) NOT NULL DEFAULT 'Active',
    HourlyRate DECIMAL(6,2) NOT NULL,
    Notes NVARCHAR(MAX) NULL,
    SupervisorID UNIQUEIDENTIFIER NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Driver PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_Driver_Email UNIQUE (Email),
    CONSTRAINT UQ_Driver_LicenseNumber UNIQUE (LicenseNumber),
    CONSTRAINT FK_Driver_Supervisor FOREIGN KEY (SupervisorID) REFERENCES sample_fleet.Driver(ID),
    CONSTRAINT CK_Driver_Status CHECK (Status IN ('Active', 'OnLeave', 'Suspended', 'Terminated')),
    CONSTRAINT CK_Driver_LicenseClass CHECK (LicenseClass IN ('A', 'B', 'C', 'D', 'E', 'CDL')),
    CONSTRAINT CK_Driver_HourlyRate CHECK (HourlyRate > 0)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Self-referencing FK allows tracking supervisor hierarchy among drivers',
    @level0type = N'SCHEMA', @level0name = N'sample_fleet',
    @level1type = N'TABLE',  @level1name = N'Driver',
    @level2type = N'COLUMN', @level2name = N'SupervisorID';
GO

/* ============================================================
   Table: Vehicle
   Physical fleet vehicles with assignment and mileage tracking
   ============================================================ */
CREATE TABLE sample_fleet.Vehicle (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    VehicleTypeID UNIQUEIDENTIFIER NOT NULL,
    AssignedDriverID UNIQUEIDENTIFIER NULL,
    VIN VARCHAR(17) NOT NULL,
    LicensePlate VARCHAR(15) NOT NULL,
    Make NVARCHAR(80) NOT NULL,
    Model NVARCHAR(80) NOT NULL,
    Year SMALLINT NOT NULL,
    Color NVARCHAR(30) NULL,
    Mileage INT NOT NULL DEFAULT 0,
    Status VARCHAR(20) NOT NULL DEFAULT 'Available',
    AcquisitionDate DATE NOT NULL,
    AcquisitionCost DECIMAL(12,2) NOT NULL,
    DisposalDate DATE NULL,
    InsurancePolicyNumber VARCHAR(40) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Vehicle PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT FK_Vehicle_VehicleType FOREIGN KEY (VehicleTypeID) REFERENCES sample_fleet.VehicleType(ID),
    CONSTRAINT FK_Vehicle_AssignedDriver FOREIGN KEY (AssignedDriverID) REFERENCES sample_fleet.Driver(ID),
    CONSTRAINT UQ_Vehicle_VIN UNIQUE (VIN),
    CONSTRAINT UQ_Vehicle_LicensePlate UNIQUE (LicensePlate),
    CONSTRAINT CK_Vehicle_Status CHECK (Status IN ('Available', 'InUse', 'Maintenance', 'Retired', 'Disposed')),
    CONSTRAINT CK_Vehicle_Year CHECK (Year >= 1990 AND Year <= 2035),
    CONSTRAINT CK_Vehicle_Mileage CHECK (Mileage >= 0),
    CONSTRAINT CK_Vehicle_AcquisitionCost CHECK (AcquisitionCost > 0)
);
GO

/* Filtered index: quickly find available vehicles */
CREATE INDEX IX_Vehicle_Available
    ON sample_fleet.Vehicle(Status, VehicleTypeID)
    WHERE Status = 'Available';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Core vehicle inventory tracking VIN, plate, mileage, and assignment',
    @level0type = N'SCHEMA', @level0name = N'sample_fleet',
    @level1type = N'TABLE',  @level1name = N'Vehicle';
GO

/* ============================================================
   Table: MaintenanceRecord
   Service and repair history for vehicles
   ============================================================ */
CREATE TABLE sample_fleet.MaintenanceRecord (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    VehicleID UNIQUEIDENTIFIER NOT NULL,
    PerformedByDriverID UNIQUEIDENTIFIER NULL,
    MaintenanceType VARCHAR(25) NOT NULL DEFAULT 'Routine',
    Description NVARCHAR(MAX) NOT NULL,
    ScheduledDate DATE NOT NULL,
    CompletedDate DATE NULL,
    MileageAtService INT NOT NULL,
    LaborCost DECIMAL(10,2) NOT NULL DEFAULT 0,
    PartsCost DECIMAL(10,2) NOT NULL DEFAULT 0,
    TotalCost DECIMAL(10,2) NOT NULL,
    VendorName NVARCHAR(200) NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_MaintenanceRecord PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT FK_Maintenance_Vehicle FOREIGN KEY (VehicleID) REFERENCES sample_fleet.Vehicle(ID),
    CONSTRAINT FK_Maintenance_Driver FOREIGN KEY (PerformedByDriverID) REFERENCES sample_fleet.Driver(ID),
    CONSTRAINT CK_Maintenance_Type CHECK (MaintenanceType IN ('Routine', 'Repair', 'Inspection', 'TireRotation', 'OilChange', 'Recall', 'Bodywork')),
    CONSTRAINT CK_Maintenance_Status CHECK (Status IN ('Scheduled', 'InProgress', 'Completed', 'Cancelled')),
    CONSTRAINT CK_Maintenance_LaborCost CHECK (LaborCost >= 0),
    CONSTRAINT CK_Maintenance_PartsCost CHECK (PartsCost >= 0),
    CONSTRAINT CK_Maintenance_TotalCost CHECK (TotalCost >= 0),
    CONSTRAINT CK_Maintenance_MileageAtService CHECK (MileageAtService >= 0)
);
GO

-- Add a CHECK constraint via ALTER TABLE
ALTER TABLE sample_fleet.MaintenanceRecord
    ADD CONSTRAINT CK_Maintenance_CompletedAfterScheduled
    CHECK (CompletedDate IS NULL OR CompletedDate >= ScheduledDate);
GO

/* ============================================================
   Table: FuelLog
   Fuel purchase records per vehicle
   ============================================================ */
CREATE TABLE sample_fleet.FuelLog (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    VehicleID UNIQUEIDENTIFIER NOT NULL,
    DriverID UNIQUEIDENTIFIER NOT NULL,
    FuelDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    FuelType VARCHAR(20) NOT NULL DEFAULT 'Gasoline',
    Quantity DECIMAL(8,3) NOT NULL,
    PricePerUnit DECIMAL(6,3) NOT NULL,
    TotalCost DECIMAL(10,2) NOT NULL,
    MileageAtFill INT NOT NULL,
    StationName NVARCHAR(150) NULL,
    FullTank BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_FuelLog PRIMARY KEY (ID),
    CONSTRAINT FK_FuelLog_Vehicle FOREIGN KEY (VehicleID) REFERENCES sample_fleet.Vehicle(ID),
    CONSTRAINT FK_FuelLog_Driver FOREIGN KEY (DriverID) REFERENCES sample_fleet.Driver(ID),
    CONSTRAINT CK_FuelLog_FuelType CHECK (FuelType IN ('Gasoline', 'Diesel', 'Electric', 'Hybrid', 'CNG')),
    CONSTRAINT CK_FuelLog_Quantity CHECK (Quantity > 0),
    CONSTRAINT CK_FuelLog_PricePerUnit CHECK (PricePerUnit > 0),
    CONSTRAINT CK_FuelLog_TotalCost CHECK (TotalCost > 0),
    CONSTRAINT CK_FuelLog_Mileage CHECK (MileageAtFill >= 0)
);
GO

/* ============================================================
   Table: Trip
   Individual trips / assignments for fleet vehicles
   ============================================================ */
CREATE TABLE sample_fleet.Trip (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    VehicleID UNIQUEIDENTIFIER NOT NULL,
    DriverID UNIQUEIDENTIFIER NOT NULL,
    Origin NVARCHAR(300) NOT NULL,
    Destination NVARCHAR(300) NOT NULL,
    StartTime DATETIME NOT NULL,
    EndTime DATETIME NULL,
    DistanceKm DECIMAL(10,2) NULL,
    Purpose VARCHAR(25) NOT NULL DEFAULT 'Delivery',
    PassengerCount SMALLINT NOT NULL DEFAULT 0,
    StartMileage INT NOT NULL,
    EndMileage INT NULL,
    Status VARCHAR(15) NOT NULL DEFAULT 'Planned',
    Notes NVARCHAR(MAX) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Trip PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT FK_Trip_Vehicle FOREIGN KEY (VehicleID) REFERENCES sample_fleet.Vehicle(ID),
    CONSTRAINT FK_Trip_Driver FOREIGN KEY (DriverID) REFERENCES sample_fleet.Driver(ID),
    CONSTRAINT CK_Trip_Purpose CHECK (Purpose IN ('Delivery', 'Pickup', 'ClientVisit', 'Transfer', 'Emergency', 'Maintenance', 'Personal')),
    CONSTRAINT CK_Trip_Status CHECK (Status IN ('Planned', 'InProgress', 'Completed', 'Cancelled')),
    CONSTRAINT CK_Trip_PassengerCount CHECK (PassengerCount >= 0),
    CONSTRAINT CK_Trip_StartMileage CHECK (StartMileage >= 0)
);
GO

ALTER TABLE sample_fleet.Trip
    ADD CONSTRAINT CK_Trip_EndAfterStart
    CHECK (EndTime IS NULL OR EndTime >= StartTime);
GO

ALTER TABLE sample_fleet.Trip
    ADD CONSTRAINT CK_Trip_EndMileageValid
    CHECK (EndMileage IS NULL OR EndMileage >= StartMileage);
GO

/* ============================================================
   Table: Inspection
   Regular vehicle inspections and compliance checks
   ============================================================ */
CREATE TABLE sample_fleet.Inspection (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    VehicleID UNIQUEIDENTIFIER NOT NULL,
    InspectorDriverID UNIQUEIDENTIFIER NULL,
    InspectionDate DATE NOT NULL,
    InspectionTime TIME NOT NULL DEFAULT '09:00:00',
    InspectionType VARCHAR(25) NOT NULL DEFAULT 'Annual',
    Result VARCHAR(15) NOT NULL DEFAULT 'Pending',
    BrakesOk BIT NOT NULL DEFAULT 1,
    TiresOk BIT NOT NULL DEFAULT 1,
    LightsOk BIT NOT NULL DEFAULT 1,
    EngineOk BIT NOT NULL DEFAULT 1,
    BodyOk BIT NOT NULL DEFAULT 1,
    MileageAtInspection INT NOT NULL,
    Remarks NVARCHAR(MAX) NULL,
    NextInspectionDue DATE NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Inspection PRIMARY KEY (ID),
    CONSTRAINT FK_Inspection_Vehicle FOREIGN KEY (VehicleID) REFERENCES sample_fleet.Vehicle(ID),
    CONSTRAINT FK_Inspection_Inspector FOREIGN KEY (InspectorDriverID) REFERENCES sample_fleet.Driver(ID),
    CONSTRAINT CK_Inspection_Type CHECK (InspectionType IN ('Annual', 'Quarterly', 'PreTrip', 'PostTrip', 'Safety', 'Emissions')),
    CONSTRAINT CK_Inspection_Result CHECK (Result IN ('Pass', 'Fail', 'Conditional', 'Pending')),
    CONSTRAINT CK_Inspection_Mileage CHECK (MileageAtInspection >= 0)
);
GO

-- Filtered index for overdue inspections
CREATE INDEX IX_Inspection_Overdue
    ON sample_fleet.Inspection(NextInspectionDue)
    WHERE Result = 'Fail' OR Result = 'Conditional';
GO

/* ============================================================
   Table: Incident
   Accidents, violations, and other fleet incidents
   ============================================================ */
CREATE TABLE sample_fleet.Incident (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    VehicleID UNIQUEIDENTIFIER NOT NULL,
    DriverID UNIQUEIDENTIFIER NOT NULL,
    TripID UNIQUEIDENTIFIER NULL,
    IncidentDate DATETIME NOT NULL,
    IncidentType VARCHAR(25) NOT NULL,
    Severity VARCHAR(15) NOT NULL DEFAULT 'Minor',
    Location NVARCHAR(300) NOT NULL,
    Description NVARCHAR(MAX) NOT NULL,
    PoliceReportNumber VARCHAR(40) NULL,
    InsuranceClaimNumber VARCHAR(40) NULL,
    EstimatedDamageCost DECIMAL(12,2) NULL,
    IsAtFault BIT NOT NULL DEFAULT 0,
    InjuryReported BIT NOT NULL DEFAULT 0,
    Status VARCHAR(20) NOT NULL DEFAULT 'Reported',
    ResolvedDate DATE NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Incident PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT FK_Incident_Vehicle FOREIGN KEY (VehicleID) REFERENCES sample_fleet.Vehicle(ID),
    CONSTRAINT FK_Incident_Driver FOREIGN KEY (DriverID) REFERENCES sample_fleet.Driver(ID),
    CONSTRAINT FK_Incident_Trip FOREIGN KEY (TripID) REFERENCES sample_fleet.Trip(ID),
    CONSTRAINT CK_Incident_Type CHECK (IncidentType IN ('Collision', 'TrafficViolation', 'Breakdown', 'Theft', 'Vandalism', 'WeatherDamage', 'Other')),
    CONSTRAINT CK_Incident_Severity CHECK (Severity IN ('Minor', 'Moderate', 'Major', 'Critical')),
    CONSTRAINT CK_Incident_Status CHECK (Status IN ('Reported', 'UnderReview', 'Resolved', 'Closed', 'Disputed')),
    CONSTRAINT CK_Incident_DamageCost CHECK (EstimatedDamageCost IS NULL OR EstimatedDamageCost >= 0)
);
GO

/* ============================================================
   View: vwFleetUtilization
   Vehicle utilization metrics with trip counts and distance
   Uses: DATEDIFF, ISNULL, COUNT, SUM, AVG, COALESCE, CASE WHEN,
         GROUP BY, HAVING, LEFT JOIN, ROUND, CAST, numeric +
   ============================================================ */
CREATE VIEW sample_fleet.vwFleetUtilization
AS
SELECT
    v.ID AS VehicleID,
    v.LicensePlate,
    v.Make + N' ' + v.Model AS VehicleDescription,
    vt.Name AS VehicleTypeName,
    vt.Category,
    ISNULL(d.FirstName + N' ' + d.LastName, N'Unassigned') AS AssignedDriver,
    COUNT(t.ID) AS TotalTrips,
    SUM(CASE WHEN t.Status = 'Completed' THEN 1 ELSE 0 END) AS CompletedTrips,
    COALESCE(SUM(t.DistanceKm), 0) AS TotalDistanceKm,
    ROUND(AVG(CAST(t.DistanceKm AS DECIMAL(10,2))), 2) AS AvgTripDistanceKm,
    ROUND(AVG(CAST(DATEDIFF(MINUTE, t.StartTime, t.EndTime) AS DECIMAL(10,2))), 1) AS AvgTripMinutes,
    v.Mileage AS CurrentMileage,
    DATEDIFF(DAY, v.AcquisitionDate, GETUTCDATE()) AS DaysInService,
    v.Status AS VehicleStatus,
    v.AcquisitionCost
FROM
    sample_fleet.Vehicle v
    INNER JOIN sample_fleet.VehicleType vt ON vt.ID = v.VehicleTypeID
    LEFT JOIN sample_fleet.Driver d ON d.ID = v.AssignedDriverID
    LEFT JOIN sample_fleet.Trip t ON t.VehicleID = v.ID
GROUP BY
    v.ID, v.LicensePlate, v.Make, v.Model, vt.Name, vt.Category,
    d.FirstName, d.LastName, v.Mileage, v.AcquisitionDate,
    v.Status, v.AcquisitionCost
HAVING
    COUNT(t.ID) >= 0;
GO

/* ============================================================
   View: vwDriverPerformance
   Driver statistics including trips, incidents, and efficiency
   Uses: DATEDIFF, YEAR, MONTH, IIF, COUNT, SUM, ROUND, LEN,
         COALESCE, CASE WHEN, LEFT JOIN, GROUP BY, HAVING
   ============================================================ */
CREATE VIEW sample_fleet.vwDriverPerformance
AS
SELECT
    dr.ID AS DriverID,
    dr.FirstName + N' ' + dr.LastName AS DriverName,
    dr.LicenseClass,
    dr.Status AS DriverStatus,
    YEAR(dr.HireDate) AS HireYear,
    MONTH(dr.HireDate) AS HireMonth,
    DATEDIFF(MONTH, dr.HireDate, GETUTCDATE()) AS MonthsEmployed,
    COUNT(DISTINCT t.ID) AS TotalTrips,
    COALESCE(SUM(t.DistanceKm), 0) AS TotalDistanceKm,
    ROUND(COALESCE(AVG(t.DistanceKm), 0), 2) AS AvgTripDistance,
    COUNT(DISTINCT inc.ID) AS TotalIncidents,
    SUM(CASE WHEN inc.IsAtFault = 1 THEN 1 ELSE 0 END) AS AtFaultIncidents,
    IIF(COUNT(DISTINCT t.ID) > 0,
        ROUND(CAST(COUNT(DISTINCT inc.ID) AS DECIMAL(10,4)) / CAST(COUNT(DISTINCT t.ID) AS DECIMAL(10,4)) * 100, 2),
        0) AS IncidentRatePercent,
    LEN(COALESCE(dr.Notes, N'')) AS NotesLength,
    dr.HourlyRate,
    IIF(dr.TerminationDate IS NULL, N'Current', N'Former') AS EmploymentStatus
FROM
    sample_fleet.Driver dr
    LEFT JOIN sample_fleet.Trip t ON t.DriverID = dr.ID
    LEFT JOIN sample_fleet.Incident inc ON inc.DriverID = dr.ID
GROUP BY
    dr.ID, dr.FirstName, dr.LastName, dr.LicenseClass, dr.Status,
    dr.HireDate, dr.TerminationDate, dr.Notes, dr.HourlyRate
HAVING
    COUNT(DISTINCT t.ID) >= 0;
GO

/* ============================================================
   View: vwMaintenanceCostSummary
   Maintenance cost analysis per vehicle
   Uses: DATEDIFF, SUM, AVG, COUNT, ROUND, COALESCE, ISNULL,
         CASE WHEN, CAST, GROUP BY, HAVING, LEFT JOIN
   ============================================================ */
CREATE VIEW sample_fleet.vwMaintenanceCostSummary
AS
SELECT
    v.ID AS VehicleID,
    v.LicensePlate,
    v.Make + N' ' + v.Model AS VehicleDescription,
    vt.Name AS VehicleTypeName,
    COUNT(m.ID) AS TotalServiceRecords,
    SUM(CASE WHEN m.Status = 'Completed' THEN 1 ELSE 0 END) AS CompletedServices,
    ROUND(COALESCE(SUM(m.LaborCost), 0), 2) AS TotalLaborCost,
    ROUND(COALESCE(SUM(m.PartsCost), 0), 2) AS TotalPartsCost,
    ROUND(COALESCE(SUM(m.TotalCost), 0), 2) AS GrandTotalCost,
    ROUND(COALESCE(AVG(m.TotalCost), 0), 2) AS AvgServiceCost,
    ISNULL(CAST(DATEDIFF(DAY, MAX(m.CompletedDate), GETUTCDATE()) AS INT), 0) AS DaysSinceLastService,
    COALESCE(SUM(m.LaborCost), 0) + COALESCE(SUM(m.PartsCost), 0) AS CombinedCostCheck,
    v.AcquisitionCost,
    IIF(v.AcquisitionCost > 0,
        ROUND(COALESCE(SUM(m.TotalCost), 0) / v.AcquisitionCost * 100, 2),
        0) AS MaintenanceCostPercent
FROM
    sample_fleet.Vehicle v
    INNER JOIN sample_fleet.VehicleType vt ON vt.ID = v.VehicleTypeID
    LEFT JOIN sample_fleet.MaintenanceRecord m ON m.VehicleID = v.ID
GROUP BY
    v.ID, v.LicensePlate, v.Make, v.Model, vt.Name, v.AcquisitionCost
HAVING
    COALESCE(SUM(m.TotalCost), 0) >= 0;
GO

/* ============================================================
   View: vwFuelEfficiency
   Fuel consumption and cost analysis per vehicle
   Uses: DATEDIFF, SUM, AVG, COUNT, ROUND, COALESCE, CAST,
         CASE WHEN, IIF, GROUP BY, HAVING, LEFT JOIN, numeric +
   ============================================================ */
CREATE VIEW sample_fleet.vwFuelEfficiency
AS
SELECT
    v.ID AS VehicleID,
    v.LicensePlate,
    v.Make + N' ' + v.Model AS VehicleDescription,
    vt.FuelType AS VehicleFuelType,
    COUNT(fl.ID) AS FuelStops,
    ROUND(COALESCE(SUM(fl.Quantity), 0), 2) AS TotalFuelQuantity,
    ROUND(COALESCE(SUM(fl.TotalCost), 0), 2) AS TotalFuelCost,
    ROUND(COALESCE(AVG(fl.PricePerUnit), 0), 3) AS AvgPricePerUnit,
    IIF(COALESCE(SUM(fl.Quantity), 0) > 0,
        ROUND(CAST(v.Mileage AS DECIMAL(12,2)) / SUM(fl.Quantity), 2),
        0) AS KmPerLiter,
    COALESCE(SUM(fl.TotalCost), 0) + 0 AS FuelCostTotal,
    DATEDIFF(DAY, MIN(fl.FuelDate), MAX(fl.FuelDate)) AS FuelTrackingDays,
    SUM(CASE WHEN fl.FullTank = 1 THEN 1 ELSE 0 END) AS FullTankFills,
    SUM(CASE WHEN fl.FullTank = 0 THEN 1 ELSE 0 END) AS PartialFills,
    v.Mileage AS CurrentMileage
FROM
    sample_fleet.Vehicle v
    INNER JOIN sample_fleet.VehicleType vt ON vt.ID = v.VehicleTypeID
    LEFT JOIN sample_fleet.FuelLog fl ON fl.VehicleID = v.ID
GROUP BY
    v.ID, v.LicensePlate, v.Make, v.Model, vt.FuelType, v.Mileage
HAVING
    COUNT(fl.ID) >= 0;
GO

/* ============================================================
   INSERT DATA
   ============================================================ */

-- VehicleType (7 rows)
INSERT INTO sample_fleet.VehicleType (ID, Name, Category, MaxPassengers, CargoCapacityKg, FuelType, Description, IsActive)
VALUES
    ('A0000001-0001-0001-0001-000000000001', N'Compact Sedan', 'Sedan', 4, 350.00, 'Gasoline', N'Fuel-efficient city commuter sedan', 1),
    ('A0000001-0001-0001-0001-000000000002', N'Full-Size SUV', 'SUV', 7, 900.50, 'Diesel', N'Large sport utility for off-road and towing', 1),
    ('A0000001-0001-0001-0001-000000000003', N'Cargo Van', 'Van', 2, 2500.00, 'Diesel', N'Heavy-duty cargo van for deliveries', 1),
    ('A0000001-0001-0001-0001-000000000004', N'Electric Hatchback', 'Electric', 4, 300.00, 'Electric', N'Zero-emission city vehicle with 400km range', 1),
    ('A0000001-0001-0001-0001-000000000005', N'Passenger Bus', 'Bus', 45, 500.00, 'Diesel', N'Standard transit bus for employee shuttles', 1),
    ('A0000001-0001-0001-0001-000000000006', N'Pickup Truck', 'Truck', 5, 1200.00, 'Gasoline', N'Mid-size pickup for maintenance crews', 1),
    ('A0000001-0001-0001-0001-000000000007', N'Hybrid Crossover', 'SUV', 5, 600.00, 'Hybrid', N'Eco-friendly crossover with excellent fuel economy', 1);
GO

-- Driver (12 rows, includes self-referencing supervisor)
INSERT INTO sample_fleet.Driver (ID, FirstName, LastName, Email, Phone, LicenseNumber, LicenseClass, LicenseExpiry, DateOfBirth, HireDate, TerminationDate, Status, HourlyRate, Notes, SupervisorID, IsActive)
VALUES
    ('B0000001-0001-0001-0001-000000000001', N'Carlos', N'Méndez', N'carlos.mendez@fleet.example.com', '555-0101', 'DL-100001', 'CDL', '2028-06-15', '1985-03-12', '2018-01-15', NULL, 'Active', 28.50, N'Fleet supervisor – CDL certified for all vehicle classes', NULL, 1),
    ('B0000001-0001-0001-0001-000000000002', N'Aisha', N'Patel', N'aisha.patel@fleet.example.com', '555-0102', 'DL-100002', 'B', '2027-09-01', '1990-07-22', '2019-04-01', NULL, 'Active', 22.00, N'Primarily assigned to compact sedans', 'B0000001-0001-0001-0001-000000000001', 1),
    ('B0000001-0001-0001-0001-000000000003', N'James', N'O''Brien', N'james.obrien@fleet.example.com', '555-0103', 'DL-100003', 'C', '2027-12-31', '1982-11-05', '2017-08-20', NULL, 'Active', 25.00, N'Experienced truck and van operator', 'B0000001-0001-0001-0001-000000000001', 1),
    ('B0000001-0001-0001-0001-000000000004', N'Yuki', N'Tanaka', N'yuki.tanaka@fleet.example.com', '555-0104', 'DL-100004', 'B', '2028-03-15', '1993-01-30', '2020-02-10', NULL, 'Active', 21.50, NULL, 'B0000001-0001-0001-0001-000000000001', 1),
    ('B0000001-0001-0001-0001-000000000005', N'Fatima', N'Al-Hassan', N'fatima.alhassan@fleet.example.com', '555-0105', 'DL-100005', 'CDL', '2027-11-20', '1988-09-14', '2019-06-01', NULL, 'Active', 27.00, N'Bus and heavy vehicle specialist', 'B0000001-0001-0001-0001-000000000001', 1),
    ('B0000001-0001-0001-0001-000000000006', N'Marco', N'Rossi', N'marco.rossi@fleet.example.com', '555-0106', 'DL-100006', 'B', '2026-08-30', '1995-04-18', '2021-01-05', NULL, 'Active', 20.50, N'New hire – electric vehicle specialist', 'B0000001-0001-0001-0001-000000000002', 1),
    ('B0000001-0001-0001-0001-000000000007', N'Elena', N'Volkov', N'elena.volkov@fleet.example.com', '555-0107', 'DL-100007', 'D', '2028-02-28', '1987-12-03', '2018-09-15', NULL, 'OnLeave', 24.00, N'Currently on medical leave', 'B0000001-0001-0001-0001-000000000001', 1),
    ('B0000001-0001-0001-0001-000000000008', N'David', N'Chen', N'david.chen@fleet.example.com', '555-0108', 'DL-100008', 'C', '2027-07-10', '1991-06-25', '2020-11-01', NULL, 'Active', 23.50, N'Night shift driver – cargo runs', 'B0000001-0001-0001-0001-000000000003', 1),
    ('B0000001-0001-0001-0001-000000000009', N'Sophie', N'Dubois', N'sophie.dubois@fleet.example.com', '555-0109', 'DL-100009', 'B', '2028-05-01', '1994-02-08', '2022-03-01', NULL, 'Active', 21.00, NULL, 'B0000001-0001-0001-0001-000000000002', 1),
    ('B0000001-0001-0001-0001-000000000010', N'Ahmed', N'Ibrahim', N'ahmed.ibrahim@fleet.example.com', '555-0110', 'DL-100010', 'CDL', '2027-10-15', '1983-08-19', '2016-05-20', '2024-12-31', 'Terminated', 26.00, N'Terminated due to license expiry', 'B0000001-0001-0001-0001-000000000001', 0),
    ('B0000001-0001-0001-0001-000000000011', N'Lin', N'Zhāng', N'lin.zhang@fleet.example.com', '555-0111', 'DL-100011', 'E', '2028-01-20', '1989-10-31', '2019-07-15', NULL, 'Active', 25.50, N'Specialized in long-haul transport', 'B0000001-0001-0001-0001-000000000003', 1),
    ('B0000001-0001-0001-0001-000000000012', N'Priya', N'Sharma', N'priya.sharma@fleet.example.com', '555-0112', 'DL-100012', 'B', '2028-09-30', '1996-05-12', '2023-01-10', NULL, 'Active', 20.00, N'Junior driver – training period', 'B0000001-0001-0001-0001-000000000002', 1);
GO

-- Vehicle (10 rows)
INSERT INTO sample_fleet.Vehicle (ID, VehicleTypeID, AssignedDriverID, VIN, LicensePlate, Make, Model, Year, Color, Mileage, Status, AcquisitionDate, AcquisitionCost, DisposalDate, InsurancePolicyNumber, IsActive)
VALUES
    ('C0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', '1HGBH41JXMN109186', 'FLT-001', N'Honda', N'Civic', 2022, N'Silver', 45200, 'InUse', '2022-01-15', 24500.00, NULL, 'INS-FL-001', 1),
    ('C0000001-0001-0001-0001-000000000002', 'A0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', '5TFBV54128X012345', 'FLT-002', N'Toyota', N'Land Cruiser', 2021, N'White', 68300, 'InUse', '2021-06-01', 58000.00, NULL, 'INS-FL-002', 1),
    ('C0000001-0001-0001-0001-000000000003', 'A0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', '2C4RC1BG8LR123456', 'FLT-003', N'Mercedes', N'Sprinter', 2020, N'White', 112500, 'InUse', '2020-03-10', 42000.00, NULL, 'INS-FL-003', 1),
    ('C0000001-0001-0001-0001-000000000004', 'A0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', '5YJ3E1EA8LF098765', 'FLT-004', N'Tesla', N'Model 3', 2023, N'Blue', 18700, 'InUse', '2023-02-20', 41000.00, NULL, 'INS-FL-004', 1),
    ('C0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', '1M8PDMTA7WP012345', 'FLT-005', N'Blue Bird', N'Vision', 2019, N'Yellow', 89400, 'InUse', '2019-09-01', 95000.00, NULL, 'INS-FL-005', 1),
    ('C0000001-0001-0001-0001-000000000006', 'A0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', '3C6JR7AT0JG123456', 'FLT-006', N'Ford', N'F-150', 2021, N'Red', 55100, 'InUse', '2021-04-15', 38500.00, NULL, 'INS-FL-006', 1),
    ('C0000001-0001-0001-0001-000000000007', 'A0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', 'JTDKN3DU5A1234567', 'FLT-007', N'Toyota', N'RAV4 Hybrid', 2023, N'Green', 12300, 'InUse', '2023-05-10', 36500.00, NULL, 'INS-FL-007', 1),
    ('C0000001-0001-0001-0001-000000000008', 'A0000001-0001-0001-0001-000000000001', NULL, 'WVWZZZ3CZWE123456', 'FLT-008', N'Volkswagen', N'Jetta', 2020, N'Black', 72800, 'Available', '2020-08-20', 22000.00, NULL, 'INS-FL-008', 1),
    ('C0000001-0001-0001-0001-000000000009', 'A0000001-0001-0001-0001-000000000003', NULL, '1FTYE2CM3HKA98765', 'FLT-009', N'Ford', N'Transit', 2018, N'White', 145000, 'Maintenance', '2018-02-28', 35000.00, NULL, 'INS-FL-009', 1),
    ('C0000001-0001-0001-0001-000000000010', 'A0000001-0001-0001-0001-000000000002', NULL, 'WDBRF61J21F123456', 'FLT-010', N'Chevrolet', N'Suburban', 2017, N'Gray', 168000, 'Retired', '2017-01-10', 52000.00, '2025-01-15', 'INS-FL-010', 0);
GO

-- MaintenanceRecord (15 rows)
INSERT INTO sample_fleet.MaintenanceRecord (ID, VehicleID, PerformedByDriverID, MaintenanceType, Description, ScheduledDate, CompletedDate, MileageAtService, LaborCost, PartsCost, TotalCost, VendorName, Status)
VALUES
    ('D0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', NULL, 'OilChange', N'Synthetic oil change and filter replacement', '2025-01-10', '2025-01-10', 43000, 45.00, 65.00, 110.00, N'QuickLube Express', 'Completed'),
    ('D0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000002', NULL, 'TireRotation', N'Tire rotation and alignment check', '2025-01-15', '2025-01-15', 66500, 80.00, 0.00, 80.00, N'TirePro Service', 'Completed'),
    ('D0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000003', 'Repair', N'Brake pad replacement – front axle', '2025-02-01', '2025-02-03', 110000, 150.00, 220.00, 370.00, N'FleetFix Garage', 'Completed'),
    ('D0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000005', NULL, 'Routine', N'Annual bus safety certification service', '2025-02-10', '2025-02-12', 87000, 300.00, 450.00, 750.00, N'National Bus Services', 'Completed'),
    ('D0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000009', NULL, 'Repair', N'Transmission fluid leak repair', '2025-02-15', NULL, 144000, 0.00, 0.00, 0.00, N'FleetFix Garage', 'InProgress'),
    ('D0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000004', NULL, 'Inspection', N'Battery health check and software update', '2025-02-20', '2025-02-20', 18000, 50.00, 0.00, 50.00, N'Tesla Service Center', 'Completed'),
    ('D0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000006', NULL, 'OilChange', N'Standard oil change with synthetic blend', '2025-03-01', '2025-03-01', 53000, 40.00, 55.00, 95.00, N'QuickLube Express', 'Completed'),
    ('D0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000007', NULL, 'Routine', N'30,000 km scheduled maintenance', '2025-03-05', '2025-03-06', 12000, 120.00, 180.00, 300.00, N'Toyota Dealership', 'Completed'),
    ('D0000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000008', NULL, 'Recall', N'Airbag recall – Takata inflator replacement', '2025-03-10', '2025-03-10', 72000, 0.00, 0.00, 0.00, N'VW Dealership', 'Completed'),
    ('D0000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000001', NULL, 'TireRotation', N'Tire rotation and balance', '2025-03-15', '2025-03-15', 44800, 60.00, 0.00, 60.00, N'TirePro Service', 'Completed'),
    ('D0000001-0001-0001-0001-000000000011', 'C0000001-0001-0001-0001-000000000010', NULL, 'Bodywork', N'Front bumper repair after minor collision', '2024-11-20', '2024-12-05', 165000, 400.00, 850.00, 1250.00, N'AutoBody Pros', 'Completed'),
    ('D0000001-0001-0001-0001-000000000012', 'C0000001-0001-0001-0001-000000000003', NULL, 'Routine', N'100k km major service – belts, filters, fluids', '2025-04-01', NULL, 112500, 0.00, 0.00, 0.00, NULL, 'Scheduled'),
    ('D0000001-0001-0001-0001-000000000013', 'C0000001-0001-0001-0001-000000000005', NULL, 'TireRotation', N'Bus tire rotation – all six wheels', '2025-03-20', '2025-03-21', 88500, 150.00, 0.00, 150.00, N'National Bus Services', 'Completed'),
    ('D0000001-0001-0001-0001-000000000014', 'C0000001-0001-0001-0001-000000000006', NULL, 'Repair', N'Windshield chip repair', '2025-03-25', '2025-03-25', 54800, 75.00, 120.00, 195.00, N'GlassFix Mobile', 'Completed'),
    ('D0000001-0001-0001-0001-000000000015', 'C0000001-0001-0001-0001-000000000002', NULL, 'OilChange', N'Full synthetic oil change for diesel engine', '2025-04-05', NULL, 68300, 0.00, 0.00, 0.00, NULL, 'Scheduled');
GO

-- FuelLog (18 rows)
INSERT INTO sample_fleet.FuelLog (ID, VehicleID, DriverID, FuelDate, FuelType, Quantity, PricePerUnit, TotalCost, MileageAtFill, StationName, FullTank)
VALUES
    ('E0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', '2025-01-05 08:30:00', 'Gasoline', 42.500, 1.459, 62.01, 42800, N'Shell Downtown', 1),
    ('E0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', '2025-01-20 17:15:00', 'Gasoline', 38.200, 1.479, 56.50, 43600, N'BP Highway', 1),
    ('E0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', '2025-01-08 07:45:00', 'Diesel', 75.000, 1.629, 122.18, 65800, N'Petro-Canada Main', 1),
    ('E0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', '2025-01-25 14:00:00', 'Diesel', 68.300, 1.599, 109.22, 67200, N'Shell Industrial', 1),
    ('E0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', '2025-01-12 06:00:00', 'Diesel', 85.000, 1.649, 140.17, 108500, N'Fleet Fuel Depot', 1),
    ('E0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', '2025-02-02 19:30:00', 'Diesel', 80.700, 1.619, 130.65, 110800, N'Fleet Fuel Depot', 1),
    ('E0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', '2025-01-18 12:00:00', 'Electric', 55.000, 0.350, 19.25, 17500, N'Tesla Supercharger', 1),
    ('E0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', '2025-02-10 09:45:00', 'Electric', 48.200, 0.355, 17.11, 18200, N'ChargePoint Hub', 1),
    ('E0000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', '2025-01-15 05:30:00', 'Diesel', 120.000, 1.589, 190.68, 86200, N'Fleet Fuel Depot', 1),
    ('E0000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', '2025-02-05 06:15:00', 'Diesel', 115.500, 1.609, 185.84, 88000, N'Petro-Canada Main', 1),
    ('E0000001-0001-0001-0001-000000000011', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', '2025-01-22 16:00:00', 'Gasoline', 65.000, 1.489, 96.79, 53500, N'Esso Service', 1),
    ('E0000001-0001-0001-0001-000000000012', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', '2025-02-08 11:30:00', 'Gasoline', 58.400, 1.499, 87.54, 54500, N'Shell Downtown', 1),
    ('E0000001-0001-0001-0001-000000000013', 'C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', '2025-01-28 13:15:00', 'Hybrid', 32.000, 1.469, 47.01, 11500, N'BP Highway', 1),
    ('E0000001-0001-0001-0001-000000000014', 'C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', '2025-02-15 10:00:00', 'Hybrid', 28.500, 1.479, 42.15, 12100, N'Shell Downtown', 0),
    ('E0000001-0001-0001-0001-000000000015', 'C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000009', '2025-01-10 08:00:00', 'Gasoline', 45.000, 1.449, 65.21, 71500, N'Esso Service', 1),
    ('E0000001-0001-0001-0001-000000000016', 'C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000009', '2025-02-01 15:45:00', 'Gasoline', 40.800, 1.469, 59.94, 72200, N'BP Highway', 1),
    ('E0000001-0001-0001-0001-000000000017', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', '2025-02-12 09:00:00', 'Gasoline', 41.000, 1.489, 61.05, 44500, N'Shell Downtown', 1),
    ('E0000001-0001-0001-0001-000000000018', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', '2025-02-22 07:00:00', 'Diesel', 82.100, 1.639, 134.56, 112000, N'Fleet Fuel Depot', 0);
GO

-- Trip (20 rows)
INSERT INTO sample_fleet.Trip (ID, VehicleID, DriverID, Origin, Destination, StartTime, EndTime, DistanceKm, Purpose, PassengerCount, StartMileage, EndMileage, Status, Notes)
VALUES
    ('F0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', N'Head Office – 100 Main St', N'Client Site – 450 Oak Ave', '2025-01-06 08:00:00', '2025-01-06 09:15:00', 35.50, 'ClientVisit', 1, 42800, 42836, 'Completed', N'Quarterly review meeting with Acme Corp'),
    ('F0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', N'Client Site – 450 Oak Ave', N'Head Office – 100 Main St', '2025-01-06 16:30:00', '2025-01-06 17:50:00', 37.20, 'ClientVisit', 0, 42836, 42873, 'Completed', NULL),
    ('F0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', N'Warehouse – 80 Industrial Rd', N'Construction Site B – Hwy 7', '2025-01-10 07:00:00', '2025-01-10 09:30:00', 95.00, 'Delivery', 2, 66000, 66095, 'Completed', N'Equipment delivery for project Delta'),
    ('F0000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', N'Distribution Center – 25 Cargo Ln', N'Metro Area – 5 Locations', '2025-01-12 05:00:00', '2025-01-12 14:00:00', 180.00, 'Delivery', 0, 108500, 108680, 'Completed', N'Multi-stop delivery route – morning run'),
    ('F0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', N'Tech Park – 200 Innovation Dr', N'Data Center – 15 Server Rd', '2025-01-15 10:00:00', '2025-01-15 10:45:00', 22.00, 'Transfer', 3, 17500, 17522, 'Completed', N'IT team transfer to data center'),
    ('F0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', N'Main Campus – Gate A', N'Satellite Office – 500 Park Blvd', '2025-01-15 07:30:00', '2025-01-15 08:30:00', 28.00, 'Transfer', 32, 86200, 86228, 'Completed', N'Employee shuttle – morning route'),
    ('F0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', N'Satellite Office – 500 Park Blvd', N'Main Campus – Gate A', '2025-01-15 17:00:00', '2025-01-15 18:10:00', 29.50, 'Transfer', 28, 86228, 86258, 'Completed', N'Employee shuttle – evening return'),
    ('F0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', N'Maintenance Yard – 10 Shop Ln', N'Remote Tower Site – Rural Route 4', '2025-01-20 06:30:00', '2025-01-20 10:00:00', 145.00, 'Maintenance', 1, 53500, 53645, 'Completed', N'Tower maintenance equipment transport'),
    ('F0000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', N'Head Office – 100 Main St', N'Airport – Terminal 3', '2025-01-22 14:00:00', '2025-01-22 15:20:00', 42.00, 'Transfer', 2, 11500, 11542, 'Completed', N'Executive airport transfer'),
    ('F0000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', N'Distribution Center – 25 Cargo Ln', N'Regional Hub – 300 Commerce Way', '2025-01-25 04:30:00', '2025-01-25 08:45:00', 165.00, 'Delivery', 0, 109200, 109365, 'Completed', N'Overnight cargo run – priority shipment'),
    ('F0000001-0001-0001-0001-000000000011', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', N'Head Office – 100 Main St', N'Training Center – 75 Learning Way', '2025-01-28 09:00:00', '2025-01-28 09:40:00', 18.50, 'Transfer', 4, 43200, 43219, 'Completed', N'Driver training session'),
    ('F0000001-0001-0001-0001-000000000012', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', N'Tech Park – 200 Innovation Dr', N'Supplier – 88 Component Ave', '2025-02-01 11:00:00', '2025-02-01 11:50:00', 25.00, 'Pickup', 0, 17800, 17825, 'Completed', N'Picking up replacement parts'),
    ('F0000001-0001-0001-0001-000000000013', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', N'Head Office – 100 Main St', N'Emergency Site – 12 River Rd', '2025-02-05 22:00:00', '2025-02-06 00:30:00', 78.00, 'Emergency', 3, 67500, 67578, 'Completed', N'Emergency response – flood damage assessment'),
    ('F0000001-0001-0001-0001-000000000014', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', N'Maintenance Yard – 10 Shop Ln', N'Substation – 200 Power Line Rd', '2025-02-08 07:00:00', '2025-02-08 12:30:00', 110.00, 'Maintenance', 2, 54000, 54110, 'Completed', N'Substation equipment delivery and setup'),
    ('F0000001-0001-0001-0001-000000000015', 'C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', N'Head Office – 100 Main St', N'Conference Center – 1 Grand Hall Dr', '2025-02-10 08:30:00', '2025-02-10 09:10:00', 15.00, 'ClientVisit', 3, 11800, 11815, 'Completed', N'Annual vendor conference'),
    ('F0000001-0001-0001-0001-000000000016', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', N'Distribution Center – 25 Cargo Ln', N'Metro Area – 8 Locations', '2025-02-15 05:00:00', '2025-02-15 15:00:00', 210.00, 'Delivery', 0, 111000, 111210, 'Completed', N'Extended delivery route – 8 stops'),
    ('F0000001-0001-0001-0001-000000000017', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', N'Main Campus – Gate A', N'Convention Center – 2 Expo Rd', '2025-02-18 06:00:00', '2025-02-18 07:30:00', 40.00, 'Transfer', 38, 87500, 87540, 'Completed', N'Special event shuttle'),
    ('F0000001-0001-0001-0001-000000000018', 'C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000009', N'Office Branch B – 55 Elm St', N'Client Site – 320 Finance Blvd', '2025-02-20 09:00:00', '2025-02-20 09:30:00', 12.00, 'ClientVisit', 1, 72200, 72212, 'Completed', NULL),
    ('F0000001-0001-0001-0001-000000000019', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000012', N'Training Center – 75 Learning Way', N'Head Office – 100 Main St', '2025-02-22 16:00:00', '2025-02-22 16:35:00', 18.50, 'Transfer', 2, 44800, 44819, 'Completed', N'Return from driver certification exam'),
    ('F0000001-0001-0001-0001-000000000020', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', N'Warehouse – 80 Industrial Rd', N'Northern Depot – 400 North Hwy', '2025-02-25 06:00:00', NULL, NULL, 'Delivery', 1, 68000, NULL, 'InProgress', N'Heavy equipment shipment – en route');
GO

-- Inspection (12 rows)
INSERT INTO sample_fleet.Inspection (ID, VehicleID, InspectorDriverID, InspectionDate, InspectionTime, InspectionType, Result, BrakesOk, TiresOk, LightsOk, EngineOk, BodyOk, MileageAtInspection, Remarks, NextInspectionDue)
VALUES
    ('A7000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', '2025-01-05', '09:00:00', 'Annual', 'Pass', 1, 1, 1, 1, 1, 42500, N'All systems nominal – excellent condition', '2026-01-05'),
    ('A7000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000001', '2025-01-06', '10:30:00', 'Annual', 'Pass', 1, 1, 1, 1, 1, 65500, N'Minor surface rust on undercarriage – monitor', '2026-01-06'),
    ('A7000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000001', '2025-01-07', '08:00:00', 'Annual', 'Conditional', 1, 0, 1, 1, 1, 108000, N'Rear tires below minimum tread depth – replacement required within 30 days', '2025-02-07'),
    ('A7000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000006', '2025-01-10', '14:00:00', 'Quarterly', 'Pass', 1, 1, 1, 1, 1, 17200, N'Battery health at 94% – excellent', '2025-04-10'),
    ('A7000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000001', '2025-01-12', '07:00:00', 'Safety', 'Pass', 1, 1, 1, 1, 1, 86000, N'Bus meets all passenger safety requirements', '2025-07-12'),
    ('A7000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', '2025-01-15', '11:00:00', 'PreTrip', 'Pass', 1, 1, 1, 1, 0, 53200, N'Small dent on tailgate – cosmetic only', '2025-04-15'),
    ('A7000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000004', '2025-01-20', '09:30:00', 'Quarterly', 'Pass', 1, 1, 1, 1, 1, 11200, N'Near-new condition', '2025-04-20'),
    ('A7000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000001', '2025-01-22', '13:00:00', 'Annual', 'Pass', 1, 1, 1, 1, 1, 71800, N'Good condition for age and mileage', '2026-01-22'),
    ('A7000001-0001-0001-0001-000000000009', 'C0000001-0001-0001-0001-000000000009', 'B0000001-0001-0001-0001-000000000001', '2025-01-25', '08:30:00', 'Annual', 'Fail', 0, 0, 1, 0, 1, 144000, N'Brake lines corroded, engine oil leak, tires worn – requires major service', NULL),
    ('A7000001-0001-0001-0001-000000000010', 'C0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000001', '2024-12-15', '10:00:00', 'Annual', 'Fail', 0, 0, 0, 0, 0, 167500, N'Vehicle recommended for disposal – uneconomical to repair', NULL),
    ('A7000001-0001-0001-0001-000000000011', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000003', '2025-02-10', '07:30:00', 'PostTrip', 'Pass', 1, 1, 1, 1, 1, 110000, N'Post-delivery check – all good after tire replacement', '2025-05-10'),
    ('A7000001-0001-0001-0001-000000000012', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', '2025-02-15', '06:30:00', 'Emissions', 'Pass', 1, 1, 1, 1, 1, 87800, N'Emissions within regulatory limits', '2025-08-15');
GO

-- Incident (8 rows)
INSERT INTO sample_fleet.Incident (ID, VehicleID, DriverID, TripID, IncidentDate, IncidentType, Severity, Location, Description, PoliceReportNumber, InsuranceClaimNumber, EstimatedDamageCost, IsAtFault, InjuryReported, Status, ResolvedDate)
VALUES
    ('A8000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000010', NULL, '2024-11-15 14:30:00', 'Collision', 'Moderate', N'Intersection of 5th Ave and Elm St', N'Rear-ended at red light by third party. Bumper and trunk damage.', 'PR-2024-11501', 'CLM-2024-8801', 3500.00, 0, 0, 'Resolved', '2024-12-20'),
    ('A8000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000008', 'F0000001-0001-0001-0001-000000000004', '2025-01-12 11:45:00', 'Breakdown', 'Minor', N'Highway 401 Eastbound – KM marker 215', N'Flat tire during delivery route. Replaced with spare on-site.', NULL, NULL, 150.00, 0, 0, 'Resolved', '2025-01-12'),
    ('A8000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000011', 'F0000001-0001-0001-0001-000000000008', '2025-01-20 09:15:00', 'TrafficViolation', 'Minor', N'Rural Route 4 – Speed Zone', N'Speeding ticket – 72 km/h in 50 km/h zone.', NULL, NULL, NULL, 0, 0, 'Resolved', '2025-02-01'),
    ('A8000001-0001-0001-0001-000000000004', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000013', '2025-02-05 23:30:00', 'WeatherDamage', 'Moderate', N'Highway 7 – Near Emergency Site', N'Hail damage to windshield and roof during emergency response.', NULL, 'CLM-2025-1201', 2200.00, 0, 0, 'UnderReview', NULL),
    ('A8000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000009', NULL, '2025-02-18 08:00:00', 'Vandalism', 'Minor', N'Office Branch B Parking Lot – 55 Elm St', N'Side mirror broken overnight. Security footage under review.', 'PR-2025-02181', NULL, 350.00, 0, 0, 'UnderReview', NULL),
    ('A8000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000001', '2025-01-06 08:45:00', 'Collision', 'Minor', N'Intersection of Main St and 3rd Ave', N'Minor fender contact while changing lanes. No visible damage to other vehicle.', NULL, NULL, 200.00, 1, 0, 'Closed', '2025-01-10'),
    ('A8000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000017', '2025-02-18 07:15:00', 'Collision', 'Major', N'Convention Center Entrance – 2 Expo Rd', N'Bus clipped concrete bollard while turning into parking area. Significant side panel damage.', 'PR-2025-02182', 'CLM-2025-1401', 8500.00, 1, 0, 'Reported', NULL),
    ('A8000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000009', 'B0000001-0001-0001-0001-000000000008', NULL, '2025-02-20 10:00:00', 'Theft', 'Critical', N'Distribution Center – 25 Cargo Ln', N'Catalytic converter stolen from vehicle while in maintenance bay.', 'PR-2025-02201', 'CLM-2025-1501', 4000.00, 0, 0, 'Reported', NULL);
GO
