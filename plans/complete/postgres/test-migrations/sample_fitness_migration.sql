-- ============================================================================
-- Sample Fitness Migration - T-SQL
-- Pass 5 converter validation: new domain, new schema
-- Schema: sample_fit (Fitness / Gym Management)
-- 9 tables, 4 views, TIME columns, inline CHECK constraints,
-- varied DECIMAL precisions, 100+ sample rows
-- ============================================================================

-- Create schema
CREATE SCHEMA sample_fit
GO

-- ============================================================================
-- TABLES
-- ============================================================================

-- MembershipTier lookup table
CREATE TABLE [sample_fit].[MembershipTier] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(100) NOT NULL,
    [MonthlyFee] DECIMAL(8,2) NOT NULL CHECK ([MonthlyFee] >= 0),
    [AnnualFee] DECIMAL(8,2) NULL,
    [MaxClassesPerWeek] INT NULL,
    [HasPoolAccess] BIT NOT NULL DEFAULT 0,
    [HasSaunaAccess] BIT NOT NULL DEFAULT 0,
    [Description] NVARCHAR(MAX) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_MembershipTier] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- Location table
CREATE TABLE [sample_fit].[Location] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(200) NOT NULL,
    [Address] NVARCHAR(300) NOT NULL,
    [City] NVARCHAR(100) NOT NULL,
    [State] VARCHAR(2) NOT NULL,
    [ZipCode] VARCHAR(10) NOT NULL,
    [Phone] VARCHAR(20) NOT NULL,
    [OpenTime] TIME NOT NULL,
    [CloseTime] TIME NOT NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_Location] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- Trainer table
CREATE TABLE [sample_fit].[Trainer] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [FirstName] NVARCHAR(100) NOT NULL,
    [LastName] NVARCHAR(100) NOT NULL,
    [Email] NVARCHAR(255) NOT NULL,
    [Phone] VARCHAR(20) NOT NULL,
    [Specialization] NVARCHAR(200) NOT NULL,
    [HourlyRate] DECIMAL(6,2) NOT NULL,
    [Bio] NVARCHAR(MAX) NULL,
    [LocationID] UNIQUEIDENTIFIER NOT NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CertifiedSince] DATE NOT NULL,
    CONSTRAINT [PK_Trainer] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Trainer_Email] UNIQUE NONCLUSTERED ([Email])
)
GO

-- Member table
CREATE TABLE [sample_fit].[Member] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [FirstName] NVARCHAR(100) NOT NULL,
    [LastName] NVARCHAR(100) NOT NULL,
    [Email] NVARCHAR(255) NOT NULL,
    [Phone] VARCHAR(20) NULL,
    [DateOfBirth] DATE NOT NULL,
    [EmergencyContact] NVARCHAR(200) NOT NULL,
    [MembershipTierID] UNIQUEIDENTIFIER NOT NULL,
    [LocationID] UNIQUEIDENTIFIER NOT NULL,
    [JoinDate] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [IsActive] BIT NOT NULL DEFAULT 1,
    [Notes] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_Member] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Member_Email] UNIQUE NONCLUSTERED ([Email])
)
GO

-- FitnessClass table (inline CHECK constraints on ClassType, DayOfWeek, MaxCapacity)
CREATE TABLE [sample_fit].[FitnessClass] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(200) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [TrainerID] UNIQUEIDENTIFIER NOT NULL,
    [LocationID] UNIQUEIDENTIFIER NOT NULL,
    [DayOfWeek] VARCHAR(10) NOT NULL CHECK ([DayOfWeek] IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    [StartTime] TIME NOT NULL,
    [DurationMinutes] INT NOT NULL DEFAULT 60,
    [MaxCapacity] INT NOT NULL DEFAULT 20 CHECK ([MaxCapacity] > 0),
    [ClassType] VARCHAR(30) NOT NULL CHECK ([ClassType] IN ('Yoga', 'HIIT', 'Spin', 'Pilates', 'CrossFit', 'Boxing', 'Swimming', 'Other')),
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_FitnessClass] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- ClassBooking table (inline CHECK on Status)
CREATE TABLE [sample_fit].[ClassBooking] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ClassID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [BookingDate] DATE NOT NULL,
    [Status] VARCHAR(20) NOT NULL DEFAULT 'Confirmed' CHECK ([Status] IN ('Confirmed', 'Waitlisted', 'Cancelled')),
    [CheckedIn] BIT NOT NULL DEFAULT 0,
    [CancelledAt] DATETIME NULL,
    CONSTRAINT [PK_ClassBooking] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- PersonalTrainingSession table (inline CHECK on Status and Rating)
CREATE TABLE [sample_fit].[PersonalTrainingSession] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [TrainerID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [SessionDate] DATE NOT NULL,
    [StartTime] TIME NOT NULL,
    [DurationMinutes] INT NOT NULL DEFAULT 60,
    [Status] VARCHAR(20) NOT NULL DEFAULT 'Scheduled' CHECK ([Status] IN ('Scheduled', 'Completed', 'Cancelled', 'NoShow')),
    [Notes] NVARCHAR(MAX) NULL,
    [Rating] SMALLINT NULL CHECK ([Rating] BETWEEN 1 AND 5),
    CONSTRAINT [PK_PersonalTrainingSession] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- MemberMeasurement table (inline CHECK on WeightLbs)
CREATE TABLE [sample_fit].[MemberMeasurement] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [MeasurementDate] DATE NOT NULL DEFAULT GETUTCDATE(),
    [WeightLbs] DECIMAL(5,1) NOT NULL CHECK ([WeightLbs] > 0),
    [BodyFatPercent] DECIMAL(4,1) NULL,
    [BMI] DECIMAL(4,1) NULL,
    [Notes] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_MemberMeasurement] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- Payment table (inline CHECK on PaymentMethod)
CREATE TABLE [sample_fit].[Payment] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [Amount] DECIMAL(8,2) NOT NULL,
    [PaymentDate] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [PaymentMethod] VARCHAR(20) NOT NULL CHECK ([PaymentMethod] IN ('Credit', 'Debit', 'Cash', 'ACH', 'Check')),
    [Description] NVARCHAR(300) NOT NULL,
    [ReferenceNumber] VARCHAR(50) NULL,
    [IsRefund] BIT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_Payment] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

ALTER TABLE [sample_fit].[Trainer]
    ADD CONSTRAINT [FK_Trainer_Location] FOREIGN KEY ([LocationID]) REFERENCES [sample_fit].[Location] ([ID])
GO

ALTER TABLE [sample_fit].[Member]
    ADD CONSTRAINT [FK_Member_MembershipTier] FOREIGN KEY ([MembershipTierID]) REFERENCES [sample_fit].[MembershipTier] ([ID])
GO

ALTER TABLE [sample_fit].[Member]
    ADD CONSTRAINT [FK_Member_Location] FOREIGN KEY ([LocationID]) REFERENCES [sample_fit].[Location] ([ID])
GO

ALTER TABLE [sample_fit].[FitnessClass]
    ADD CONSTRAINT [FK_FitnessClass_Trainer] FOREIGN KEY ([TrainerID]) REFERENCES [sample_fit].[Trainer] ([ID])
GO

ALTER TABLE [sample_fit].[FitnessClass]
    ADD CONSTRAINT [FK_FitnessClass_Location] FOREIGN KEY ([LocationID]) REFERENCES [sample_fit].[Location] ([ID])
GO

ALTER TABLE [sample_fit].[ClassBooking]
    ADD CONSTRAINT [FK_ClassBooking_FitnessClass] FOREIGN KEY ([ClassID]) REFERENCES [sample_fit].[FitnessClass] ([ID])
GO

ALTER TABLE [sample_fit].[ClassBooking]
    ADD CONSTRAINT [FK_ClassBooking_Member] FOREIGN KEY ([MemberID]) REFERENCES [sample_fit].[Member] ([ID])
GO

ALTER TABLE [sample_fit].[PersonalTrainingSession]
    ADD CONSTRAINT [FK_PersonalTrainingSession_Trainer] FOREIGN KEY ([TrainerID]) REFERENCES [sample_fit].[Trainer] ([ID])
GO

ALTER TABLE [sample_fit].[PersonalTrainingSession]
    ADD CONSTRAINT [FK_PersonalTrainingSession_Member] FOREIGN KEY ([MemberID]) REFERENCES [sample_fit].[Member] ([ID])
GO

ALTER TABLE [sample_fit].[MemberMeasurement]
    ADD CONSTRAINT [FK_MemberMeasurement_Member] FOREIGN KEY ([MemberID]) REFERENCES [sample_fit].[Member] ([ID])
GO

ALTER TABLE [sample_fit].[Payment]
    ADD CONSTRAINT [FK_Payment_Member] FOREIGN KEY ([MemberID]) REFERENCES [sample_fit].[Member] ([ID])
GO

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Class Schedule: classes with trainer name, location, day/time, current enrollment
CREATE VIEW [sample_fit].[vwClassSchedule]
AS
SELECT
    fc.[ID],
    fc.[Name] AS [ClassName],
    fc.[ClassType],
    fc.[DayOfWeek],
    fc.[StartTime],
    fc.[DurationMinutes],
    fc.[MaxCapacity],
    fc.[IsActive],
    t.[FirstName] + ' ' + t.[LastName] AS [TrainerName],
    t.[Email] AS [TrainerEmail],
    l.[Name] AS [LocationName],
    l.[Address] AS [LocationAddress],
    (SELECT COUNT(*) FROM [sample_fit].[ClassBooking] cb WHERE cb.[ClassID] = fc.[ID] AND cb.[Status] = 'Confirmed') AS [CurrentEnrollment]
FROM [sample_fit].[FitnessClass] fc
INNER JOIN [sample_fit].[Trainer] t ON fc.[TrainerID] = t.[ID]
INNER JOIN [sample_fit].[Location] l ON fc.[LocationID] = l.[ID]
GO

-- Member Summary: member with tier, location, classes attended, last measurement
CREATE VIEW [sample_fit].[vwMemberSummary]
AS
SELECT
    m.[ID],
    m.[FirstName],
    m.[LastName],
    m.[Email],
    m.[JoinDate],
    m.[IsActive],
    mt.[Name] AS [TierName],
    mt.[MonthlyFee],
    l.[Name] AS [LocationName],
    (SELECT COUNT(*) FROM [sample_fit].[ClassBooking] cb WHERE cb.[MemberID] = m.[ID] AND cb.[CheckedIn] = 1) AS [ClassesAttended],
    (SELECT TOP 1 mm.[MeasurementDate] FROM [sample_fit].[MemberMeasurement] mm WHERE mm.[MemberID] = m.[ID] ORDER BY mm.[MeasurementDate] DESC) AS [LastMeasurementDate],
    (SELECT TOP 1 mm.[WeightLbs] FROM [sample_fit].[MemberMeasurement] mm WHERE mm.[MemberID] = m.[ID] ORDER BY mm.[MeasurementDate] DESC) AS [LastWeight]
FROM [sample_fit].[Member] m
INNER JOIN [sample_fit].[MembershipTier] mt ON m.[MembershipTierID] = mt.[ID]
INNER JOIN [sample_fit].[Location] l ON m.[LocationID] = l.[ID]
GO

-- Trainer Schedule: trainer with class count, PT session count, avg rating
CREATE VIEW [sample_fit].[vwTrainerSchedule]
AS
SELECT
    t.[ID],
    t.[FirstName],
    t.[LastName],
    t.[Email],
    t.[Specialization],
    t.[HourlyRate],
    t.[CertifiedSince],
    l.[Name] AS [LocationName],
    (SELECT COUNT(*) FROM [sample_fit].[FitnessClass] fc WHERE fc.[TrainerID] = t.[ID] AND fc.[IsActive] = 1) AS [ActiveClassCount],
    (SELECT COUNT(*) FROM [sample_fit].[PersonalTrainingSession] pts WHERE pts.[TrainerID] = t.[ID]) AS [TotalPTSessions],
    (SELECT AVG(CAST(pts.[Rating] AS DECIMAL(3,1))) FROM [sample_fit].[PersonalTrainingSession] pts WHERE pts.[TrainerID] = t.[ID] AND pts.[Rating] IS NOT NULL) AS [AvgRating]
FROM [sample_fit].[Trainer] t
INNER JOIN [sample_fit].[Location] l ON t.[LocationID] = l.[ID]
GO

-- Revenue By Month: payments grouped by month, total revenue, member count
CREATE VIEW [sample_fit].[vwRevenueByMonth]
AS
SELECT
    YEAR(p.[PaymentDate]) AS [PaymentYear],
    MONTH(p.[PaymentDate]) AS [PaymentMonth],
    COUNT(*) AS [TransactionCount],
    SUM(CASE WHEN p.[IsRefund] = 0 THEN p.[Amount] ELSE 0 END) AS [TotalRevenue],
    SUM(CASE WHEN p.[IsRefund] = 1 THEN p.[Amount] ELSE 0 END) AS [TotalRefunds],
    SUM(CASE WHEN p.[IsRefund] = 0 THEN p.[Amount] ELSE -p.[Amount] END) AS [NetRevenue],
    COUNT(DISTINCT p.[MemberID]) AS [UniqueMemberCount]
FROM [sample_fit].[Payment] p
GROUP BY YEAR(p.[PaymentDate]), MONTH(p.[PaymentDate])
GO

-- ============================================================================
-- EXTENDED PROPERTIES (Metadata)
-- ============================================================================

-- Table descriptions
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Membership tier definitions with pricing and amenity access', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'MembershipTier'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Gym and fitness center locations', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'Location'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Personal trainers and fitness instructors', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'Trainer'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Gym members with membership tier and home location', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'Member'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Scheduled group fitness classes', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'FitnessClass'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Member bookings for group fitness classes', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'ClassBooking'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One-on-one personal training sessions', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'PersonalTrainingSession'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Body measurement tracking for members', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'MemberMeasurement'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Payment transactions for memberships and services', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'Payment'
GO

-- Column descriptions for key columns
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Monthly membership fee in dollars', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'MembershipTier', @level2type = N'COLUMN', @level2name = N'MonthlyFee'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional annual fee (discount vs monthly)', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'MembershipTier', @level2type = N'COLUMN', @level2name = N'AnnualFee'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Maximum group classes allowed per week for this tier', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'MembershipTier', @level2type = N'COLUMN', @level2name = N'MaxClassesPerWeek'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Facility daily opening time', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'OpenTime'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Facility daily closing time', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'CloseTime'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Trainer per-hour rate for personal training sessions', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'Trainer', @level2type = N'COLUMN', @level2name = N'HourlyRate'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Date trainer obtained primary certification', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'Trainer', @level2type = N'COLUMN', @level2name = N'CertifiedSince'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Emergency contact name and phone number', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'Member', @level2type = N'COLUMN', @level2name = N'EmergencyContact'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Day of week: Monday through Sunday', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'FitnessClass', @level2type = N'COLUMN', @level2name = N'DayOfWeek'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Class start time of day', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'FitnessClass', @level2type = N'COLUMN', @level2name = N'StartTime'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Class type: Yoga, HIIT, Spin, Pilates, CrossFit, Boxing, Swimming, Other', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'FitnessClass', @level2type = N'COLUMN', @level2name = N'ClassType'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Member weight in pounds', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'MemberMeasurement', @level2type = N'COLUMN', @level2name = N'WeightLbs'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Body fat percentage', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'MemberMeasurement', @level2type = N'COLUMN', @level2name = N'BodyFatPercent'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Payment method: Credit, Debit, Cash, ACH, Check', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'Payment', @level2type = N'COLUMN', @level2name = N'PaymentMethod'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Session rating by member (1-5 scale)', @level0type = N'SCHEMA', @level0name = N'sample_fit', @level1type = N'TABLE', @level1name = N'PersonalTrainingSession', @level2type = N'COLUMN', @level2name = N'Rating'
GO

-- ============================================================================
-- SECURITY
-- ============================================================================

-- Create role and grant permissions
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'sample_fit_reader')
    CREATE ROLE sample_fit_reader
GO

GRANT SELECT ON SCHEMA::sample_fit TO sample_fit_reader
GO

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- MembershipTiers (5)
INSERT INTO [sample_fit].[MembershipTier] ([ID], [Name], [MonthlyFee], [AnnualFee], [MaxClassesPerWeek], [HasPoolAccess], [HasSaunaAccess], [Description], [IsActive]) VALUES
    ('A1000001-0001-0001-0001-000000000001', N'Basic', 29.99, 299.00, 2, 0, 0, N'Access to gym floor and basic equipment.', 1),
    ('A1000001-0001-0001-0001-000000000002', N'Standard', 49.99, 499.00, 5, 0, 0, N'Gym access plus group fitness classes.', 1),
    ('A1000001-0001-0001-0001-000000000003', N'Premium', 79.99, 799.00, NULL, 1, 0, N'Unlimited classes with pool access.', 1),
    ('A1000001-0001-0001-0001-000000000004', N'Elite', 119.99, 1199.00, NULL, 1, 1, N'All amenities including sauna and priority booking.', 1),
    ('A1000001-0001-0001-0001-000000000005', N'Student', 19.99, 199.00, 3, 0, 0, N'Discounted plan for students with valid ID.', 1)
GO

-- Locations (4)
INSERT INTO [sample_fit].[Location] ([ID], [Name], [Address], [City], [State], [ZipCode], [Phone], [OpenTime], [CloseTime], [IsActive]) VALUES
    ('A2000001-0001-0001-0001-000000000001', N'FitZone Downtown', N'100 Main Street', N'Austin', 'TX', '78701', '512-555-0100', '05:00:00', '23:00:00', 1),
    ('A2000001-0001-0001-0001-000000000002', N'FitZone North', N'500 Research Blvd', N'Austin', 'TX', '78759', '512-555-0200', '05:30:00', '22:00:00', 1),
    ('A2000001-0001-0001-0001-000000000003', N'FitZone South', N'2200 S Lamar Blvd', N'Austin', 'TX', '78704', '512-555-0300', '06:00:00', '22:00:00', 1),
    ('A2000001-0001-0001-0001-000000000004', N'FitZone Lakeway', N'1800 Lohmans Crossing', N'Lakeway', 'TX', '78734', '512-555-0400', '06:00:00', '21:00:00', 1)
GO

-- Trainers (8)
INSERT INTO [sample_fit].[Trainer] ([ID], [FirstName], [LastName], [Email], [Phone], [Specialization], [HourlyRate], [Bio], [LocationID], [IsActive], [CertifiedSince]) VALUES
    ('A3000001-0001-0001-0001-000000000001', N'Carlos', N'Rivera', N'carlos.rivera@fitzone.com', '512-555-1001', N'Strength & Conditioning', 75.00, N'NSCA certified strength coach with 10 years experience.', 'A2000001-0001-0001-0001-000000000001', 1, '2015-06-15'),
    ('A3000001-0001-0001-0001-000000000002', N'Maya', N'Patel', N'maya.patel@fitzone.com', '512-555-1002', N'Yoga & Flexibility', 65.00, N'RYT-500 yoga instructor specializing in vinyasa and restorative.', 'A2000001-0001-0001-0001-000000000001', 1, '2017-03-01'),
    ('A3000001-0001-0001-0001-000000000003', N'Jake', N'Thompson', N'jake.thompson@fitzone.com', '512-555-1003', N'HIIT & CrossFit', 80.00, N'CrossFit Level 3 trainer and former competitive athlete.', 'A2000001-0001-0001-0001-000000000002', 1, '2016-01-20'),
    ('A3000001-0001-0001-0001-000000000004', N'Alicia', N'Chen', N'alicia.chen@fitzone.com', '512-555-1004', N'Pilates & Core', 70.00, N'Balanced Body certified Pilates instructor.', 'A2000001-0001-0001-0001-000000000002', 1, '2018-09-10'),
    ('A3000001-0001-0001-0001-000000000005', N'Derek', N'Williams', N'derek.williams@fitzone.com', '512-555-1005', N'Boxing & MMA', 85.00, N'Former amateur boxer with USA Boxing coaching certification.', 'A2000001-0001-0001-0001-000000000003', 1, '2014-11-05'),
    ('A3000001-0001-0001-0001-000000000006', N'Sophie', N'Martin', N'sophie.martin@fitzone.com', '512-555-1006', N'Swimming & Aquatics', 70.00, N'Former collegiate swimmer and Red Cross certified instructor.', 'A2000001-0001-0001-0001-000000000001', 1, '2019-05-20'),
    ('A3000001-0001-0001-0001-000000000007', N'Ryan', N'Nakamura', N'ryan.nakamura@fitzone.com', '512-555-1007', N'Spin & Cardio', 60.00, N'Schwinn certified cycling instructor with high-energy style.', 'A2000001-0001-0001-0001-000000000003', 1, '2020-02-14'),
    ('A3000001-0001-0001-0001-000000000008', N'Brittany', N'Owens', N'brittany.owens@fitzone.com', '512-555-1008', N'Yoga & Meditation', 65.00, NULL, 'A2000001-0001-0001-0001-000000000004', 0, '2021-07-01')
GO

-- Members (15)
INSERT INTO [sample_fit].[Member] ([ID], [FirstName], [LastName], [Email], [Phone], [DateOfBirth], [EmergencyContact], [MembershipTierID], [LocationID], [JoinDate], [IsActive], [Notes]) VALUES
    ('A4000001-0001-0001-0001-000000000001', N'Emma', N'Johnson', N'emma.johnson@email.com', '512-555-2001', '1990-03-15', N'Tom Johnson 512-555-9001', 'A1000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000001', '2023-01-15', 1, N'Prefers morning classes.'),
    ('A4000001-0001-0001-0001-000000000002', N'Marcus', N'Lee', N'marcus.lee@email.com', '512-555-2002', '1985-07-22', N'Sarah Lee 512-555-9002', 'A1000001-0001-0001-0001-000000000004', 'A2000001-0001-0001-0001-000000000001', '2022-06-01', 1, N'Training for marathon.'),
    ('A4000001-0001-0001-0001-000000000003', N'Sofia', N'Garcia', N'sofia.garcia@email.com', '512-555-2003', '1995-11-08', N'Maria Garcia 512-555-9003', 'A1000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000002', '2023-03-20', 1, NULL),
    ('A4000001-0001-0001-0001-000000000004', N'David', N'Kim', N'david.kim@email.com', '512-555-2004', '1988-02-14', N'Lisa Kim 512-555-9004', 'A1000001-0001-0001-0001-000000000004', 'A2000001-0001-0001-0001-000000000001', '2021-11-10', 1, N'Personal training 2x/week.'),
    ('A4000001-0001-0001-0001-000000000005', N'Rachel', N'Brown', N'rachel.brown@email.com', NULL, '1992-09-30', N'Mike Brown 512-555-9005', 'A1000001-0001-0001-0001-000000000001', 'A2000001-0001-0001-0001-000000000003', '2024-01-05', 1, NULL),
    ('A4000001-0001-0001-0001-000000000006', N'Tyler', N'Martinez', N'tyler.martinez@email.com', '512-555-2006', '1998-05-17', N'Ana Martinez 512-555-9006', 'A1000001-0001-0001-0001-000000000005', 'A2000001-0001-0001-0001-000000000002', '2024-08-20', 1, N'UT Austin student.'),
    ('A4000001-0001-0001-0001-000000000007', N'Jessica', N'Davis', N'jessica.davis@email.com', '512-555-2007', '1983-12-03', N'Robert Davis 512-555-9007', 'A1000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000001', '2022-02-28', 1, N'Recovering from knee surgery, needs modified exercises.'),
    ('A4000001-0001-0001-0001-000000000008', N'Brandon', N'Wilson', N'brandon.wilson@email.com', '512-555-2008', '1991-08-25', N'Carol Wilson 512-555-9008', 'A1000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000003', '2023-07-14', 1, NULL),
    ('A4000001-0001-0001-0001-000000000009', N'Olivia', N'Taylor', N'olivia.taylor@email.com', '512-555-2009', '1997-01-19', N'James Taylor 512-555-9009', 'A1000001-0001-0001-0001-000000000004', 'A2000001-0001-0001-0001-000000000004', '2023-10-01', 1, N'Interested in swim lessons.'),
    ('A4000001-0001-0001-0001-000000000010', N'Nathan', N'Anderson', N'nathan.anderson@email.com', '512-555-2010', '1986-04-11', N'Linda Anderson 512-555-9010', 'A1000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000002', '2022-09-15', 1, N'CrossFit enthusiast.'),
    ('A4000001-0001-0001-0001-000000000011', N'Hannah', N'Thomas', N'hannah.thomas@email.com', '512-555-2011', '1994-06-28', N'Bill Thomas 512-555-9011', 'A1000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000001', '2024-03-10', 1, NULL),
    ('A4000001-0001-0001-0001-000000000012', N'Ethan', N'Moore', N'ethan.moore@email.com', NULL, '2000-10-05', N'Diane Moore 512-555-9012', 'A1000001-0001-0001-0001-000000000005', 'A2000001-0001-0001-0001-000000000003', '2024-09-01', 1, N'ACC student, evening availability only.'),
    ('A4000001-0001-0001-0001-000000000013', N'Mia', N'Jackson', N'mia.jackson@email.com', '512-555-2013', '1987-03-22', N'Paul Jackson 512-555-9013', 'A1000001-0001-0001-0001-000000000001', 'A2000001-0001-0001-0001-000000000004', '2023-05-18', 0, N'Membership frozen - travel.'),
    ('A4000001-0001-0001-0001-000000000014', N'Christopher', N'White', N'chris.white@email.com', '512-555-2014', '1993-09-14', N'Amy White 512-555-9014', 'A1000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000001', '2022-12-01', 1, NULL),
    ('A4000001-0001-0001-0001-000000000015', N'Lauren', N'Harris', N'lauren.harris@email.com', '512-555-2015', '1996-07-07', N'Greg Harris 512-555-9015', 'A1000001-0001-0001-0001-000000000004', 'A2000001-0001-0001-0001-000000000002', '2023-08-22', 1, N'Competes in local triathlons.')
GO

-- FitnessClasses (12)
INSERT INTO [sample_fit].[FitnessClass] ([ID], [Name], [Description], [TrainerID], [LocationID], [DayOfWeek], [StartTime], [DurationMinutes], [MaxCapacity], [ClassType], [IsActive]) VALUES
    ('A5000001-0001-0001-0001-000000000001', N'Morning Vinyasa Flow', N'Energizing vinyasa yoga to start your day.', 'A3000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000001', 'Monday', '06:30:00', 60, 25, 'Yoga', 1),
    ('A5000001-0001-0001-0001-000000000002', N'Power HIIT', N'High intensity interval training for max calorie burn.', 'A3000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000002', 'Monday', '07:00:00', 45, 20, 'HIIT', 1),
    ('A5000001-0001-0001-0001-000000000003', N'Lunchtime Spin', N'Fast-paced cycling session during your lunch break.', 'A3000001-0001-0001-0001-000000000007', 'A2000001-0001-0001-0001-000000000003', 'Tuesday', '12:00:00', 45, 30, 'Spin', 1),
    ('A5000001-0001-0001-0001-000000000004', N'Core Pilates', N'Strengthen your core with mat Pilates techniques.', 'A3000001-0001-0001-0001-000000000004', 'A2000001-0001-0001-0001-000000000002', 'Tuesday', '17:30:00', 50, 18, 'Pilates', 1),
    ('A5000001-0001-0001-0001-000000000005', N'CrossFit WOD', N'Workout of the day - varied functional movements.', 'A3000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000002', 'Wednesday', '06:00:00', 60, 15, 'CrossFit', 1),
    ('A5000001-0001-0001-0001-000000000006', N'Boxing Fundamentals', N'Learn boxing basics: stance, jab, cross, hooks.', 'A3000001-0001-0001-0001-000000000005', 'A2000001-0001-0001-0001-000000000003', 'Wednesday', '18:00:00', 60, 20, 'Boxing', 1),
    ('A5000001-0001-0001-0001-000000000007', N'Lap Swimming', N'Guided lap swim session for all skill levels.', 'A3000001-0001-0001-0001-000000000006', 'A2000001-0001-0001-0001-000000000001', 'Thursday', '06:00:00', 45, 12, 'Swimming', 1),
    ('A5000001-0001-0001-0001-000000000008', N'Evening Yoga Restore', N'Gentle restorative yoga for relaxation and recovery.', 'A3000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000001', 'Thursday', '19:00:00', 75, 20, 'Yoga', 1),
    ('A5000001-0001-0001-0001-000000000009', N'Saturday HIIT Blast', N'Weekend warrior high-intensity workout.', 'A3000001-0001-0001-0001-000000000003', 'A2000001-0001-0001-0001-000000000002', 'Saturday', '09:00:00', 45, 25, 'HIIT', 1),
    ('A5000001-0001-0001-0001-000000000010', N'Weekend Spin', N'Upbeat weekend cycling session.', 'A3000001-0001-0001-0001-000000000007', 'A2000001-0001-0001-0001-000000000003', 'Saturday', '10:00:00', 45, 30, 'Spin', 1),
    ('A5000001-0001-0001-0001-000000000011', N'Sunday Yoga Flow', N'Relaxing end-of-week yoga session.', 'A3000001-0001-0001-0001-000000000008', 'A2000001-0001-0001-0001-000000000004', 'Sunday', '08:00:00', 60, 15, 'Yoga', 0),
    ('A5000001-0001-0001-0001-000000000012', N'Aqua Aerobics', N'Low-impact water-based fitness class.', 'A3000001-0001-0001-0001-000000000006', 'A2000001-0001-0001-0001-000000000001', 'Friday', '10:00:00', 50, 15, 'Swimming', 1)
GO

-- ClassBookings (20)
INSERT INTO [sample_fit].[ClassBooking] ([ID], [ClassID], [MemberID], [BookingDate], [Status], [CheckedIn], [CancelledAt]) VALUES
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
    ('A6000001-0001-0001-0001-000000000020', 'A5000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000014', '2025-01-13', 'Confirmed', 0, NULL)
GO

-- PersonalTrainingSessions (15)
INSERT INTO [sample_fit].[PersonalTrainingSession] ([ID], [TrainerID], [MemberID], [SessionDate], [StartTime], [DurationMinutes], [Status], [Notes], [Rating]) VALUES
    ('A7000001-0001-0001-0001-000000000001', 'A3000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000002', '2025-01-06', '08:00:00', 60, 'Completed', N'Focused on upper body strength. Increased bench press by 10lbs.', 5),
    ('A7000001-0001-0001-0001-000000000002', 'A3000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000004', '2025-01-06', '10:00:00', 60, 'Completed', N'Leg day with squats and deadlifts.', 4),
    ('A7000001-0001-0001-0001-000000000003', 'A3000001-0001-0001-0001-000000000002', 'A4000001-0001-0001-0001-000000000007', '2025-01-07', '09:00:00', 45, 'Completed', N'Modified poses for knee rehabilitation.', 5),
    ('A7000001-0001-0001-0001-000000000004', 'A3000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000004', '2025-01-07', '16:00:00', 60, 'Completed', N'Pad work and heavy bag combinations.', 4),
    ('A7000001-0001-0001-0001-000000000005', 'A3000001-0001-0001-0001-000000000003', 'A4000001-0001-0001-0001-000000000010', '2025-01-08', '07:00:00', 60, 'Completed', N'CrossFit skill work: muscle-ups and handstand walks.', 5),
    ('A7000001-0001-0001-0001-000000000006', 'A3000001-0001-0001-0001-000000000006', 'A4000001-0001-0001-0001-000000000009', '2025-01-08', '14:00:00', 45, 'Completed', N'Freestyle technique improvement.', 3),
    ('A7000001-0001-0001-0001-000000000007', 'A3000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000002', '2025-01-09', '08:00:00', 60, 'Completed', N'Core and conditioning circuit.', 5),
    ('A7000001-0001-0001-0001-000000000008', 'A3000001-0001-0001-0001-000000000004', 'A4000001-0001-0001-0001-000000000003', '2025-01-09', '11:00:00', 45, 'Completed', N'Reformer Pilates introduction.', 4),
    ('A7000001-0001-0001-0001-000000000009', 'A3000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000008', '2025-01-10', '17:00:00', 60, 'Cancelled', N'Member called in sick.', NULL),
    ('A7000001-0001-0001-0001-000000000010', 'A3000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000004', '2025-01-10', '10:00:00', 60, 'Completed', N'Olympic lifting technique: clean and jerk.', 4),
    ('A7000001-0001-0001-0001-000000000011', 'A3000001-0001-0001-0001-000000000003', 'A4000001-0001-0001-0001-000000000015', '2025-01-11', '08:00:00', 60, 'Completed', N'Triathlon-specific strength training.', 5),
    ('A7000001-0001-0001-0001-000000000012', 'A3000001-0001-0001-0001-000000000002', 'A4000001-0001-0001-0001-000000000001', '2025-01-11', '09:00:00', 60, 'NoShow', NULL, NULL),
    ('A7000001-0001-0001-0001-000000000013', 'A3000001-0001-0001-0001-000000000006', 'A4000001-0001-0001-0001-000000000009', '2025-01-13', '14:00:00', 45, 'Scheduled', NULL, NULL),
    ('A7000001-0001-0001-0001-000000000014', 'A3000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000002', '2025-01-13', '08:00:00', 60, 'Scheduled', NULL, NULL),
    ('A7000001-0001-0001-0001-000000000015', 'A3000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000014', '2025-01-14', '16:00:00', 60, 'Scheduled', NULL, NULL)
GO

-- MemberMeasurements (18)
INSERT INTO [sample_fit].[MemberMeasurement] ([ID], [MemberID], [MeasurementDate], [WeightLbs], [BodyFatPercent], [BMI], [Notes]) VALUES
    ('A8000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000001', '2024-01-15', 145.0, 22.5, 23.8, N'Initial assessment.'),
    ('A8000001-0001-0001-0001-000000000002', 'A4000001-0001-0001-0001-000000000001', '2024-07-15', 140.5, 21.0, 23.1, N'Six-month progress check.'),
    ('A8000001-0001-0001-0001-000000000003', 'A4000001-0001-0001-0001-000000000001', '2025-01-10', 138.0, 20.2, 22.7, N'One year milestone - great progress!'),
    ('A8000001-0001-0001-0001-000000000004', 'A4000001-0001-0001-0001-000000000002', '2023-06-01', 195.0, 18.5, 27.0, N'Initial assessment. Marathon training plan.'),
    ('A8000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000002', '2024-01-10', 188.0, 16.0, 26.0, N'Good progress, increasing cardio endurance.'),
    ('A8000001-0001-0001-0001-000000000006', 'A4000001-0001-0001-0001-000000000002', '2025-01-08', 182.5, 14.5, 25.2, N'Race weight target approaching.'),
    ('A8000001-0001-0001-0001-000000000007', 'A4000001-0001-0001-0001-000000000004', '2022-11-10', 210.0, 25.0, 28.5, N'Initial assessment.'),
    ('A8000001-0001-0001-0001-000000000008', 'A4000001-0001-0001-0001-000000000004', '2024-05-15', 198.0, 20.0, 26.9, N'Significant body composition improvement.'),
    ('A8000001-0001-0001-0001-000000000009', 'A4000001-0001-0001-0001-000000000004', '2025-01-06', 192.0, 18.0, 26.1, N'Continuing to build lean muscle.'),
    ('A8000001-0001-0001-0001-000000000010', 'A4000001-0001-0001-0001-000000000007', '2024-03-01', 155.0, 28.0, 25.5, NULL),
    ('A8000001-0001-0001-0001-000000000011', 'A4000001-0001-0001-0001-000000000007', '2025-01-07', 148.0, 24.5, 24.4, N'Post-rehab progress.'),
    ('A8000001-0001-0001-0001-000000000012', 'A4000001-0001-0001-0001-000000000010', '2023-09-15', 175.0, 15.0, 24.2, N'Already fit, focus on performance.'),
    ('A8000001-0001-0001-0001-000000000013', 'A4000001-0001-0001-0001-000000000010', '2025-01-09', 178.0, 13.5, 24.6, N'Muscle gain with low fat.'),
    ('A8000001-0001-0001-0001-000000000014', 'A4000001-0001-0001-0001-000000000015', '2023-08-22', 130.0, 19.0, 21.5, N'Triathlon baseline assessment.'),
    ('A8000001-0001-0001-0001-000000000015', 'A4000001-0001-0001-0001-000000000015', '2025-01-11', 128.5, 17.5, 21.2, N'Competition weight, strong performance.'),
    ('A8000001-0001-0001-0001-000000000016', 'A4000001-0001-0001-0001-000000000003', '2024-03-20', 135.0, 24.0, 22.3, NULL),
    ('A8000001-0001-0001-0001-000000000017', 'A4000001-0001-0001-0001-000000000005', '2024-01-05', 160.0, 30.0, 26.5, N'Starting fitness journey.'),
    ('A8000001-0001-0001-0001-000000000018', 'A4000001-0001-0001-0001-000000000009', '2024-10-01', 142.0, 21.0, 23.5, N'Baseline for swim training program.')
GO

-- Payments (25)
INSERT INTO [sample_fit].[Payment] ([ID], [MemberID], [Amount], [PaymentDate], [PaymentMethod], [Description], [ReferenceNumber], [IsRefund]) VALUES
    ('A9000001-0001-0001-0001-000000000001', 'A4000001-0001-0001-0001-000000000001', 79.99, '2025-01-01', 'Credit', N'Premium monthly membership - January 2025', 'TXN-2025-00001', 0),
    ('A9000001-0001-0001-0001-000000000002', 'A4000001-0001-0001-0001-000000000002', 119.99, '2025-01-01', 'Credit', N'Elite monthly membership - January 2025', 'TXN-2025-00002', 0),
    ('A9000001-0001-0001-0001-000000000003', 'A4000001-0001-0001-0001-000000000003', 49.99, '2025-01-01', 'Debit', N'Standard monthly membership - January 2025', 'TXN-2025-00003', 0),
    ('A9000001-0001-0001-0001-000000000004', 'A4000001-0001-0001-0001-000000000004', 119.99, '2025-01-01', 'ACH', N'Elite monthly membership - January 2025', 'TXN-2025-00004', 0),
    ('A9000001-0001-0001-0001-000000000005', 'A4000001-0001-0001-0001-000000000005', 29.99, '2025-01-01', 'Credit', N'Basic monthly membership - January 2025', 'TXN-2025-00005', 0),
    ('A9000001-0001-0001-0001-000000000006', 'A4000001-0001-0001-0001-000000000006', 19.99, '2025-01-01', 'Debit', N'Student monthly membership - January 2025', 'TXN-2025-00006', 0),
    ('A9000001-0001-0001-0001-000000000007', 'A4000001-0001-0001-0001-000000000007', 79.99, '2025-01-01', 'Credit', N'Premium monthly membership - January 2025', 'TXN-2025-00007', 0),
    ('A9000001-0001-0001-0001-000000000008', 'A4000001-0001-0001-0001-000000000008', 49.99, '2025-01-01', 'Cash', N'Standard monthly membership - January 2025', 'TXN-2025-00008', 0),
    ('A9000001-0001-0001-0001-000000000009', 'A4000001-0001-0001-0001-000000000009', 119.99, '2025-01-01', 'Credit', N'Elite monthly membership - January 2025', 'TXN-2025-00009', 0),
    ('A9000001-0001-0001-0001-000000000010', 'A4000001-0001-0001-0001-000000000010', 79.99, '2025-01-01', 'ACH', N'Premium monthly membership - January 2025', 'TXN-2025-00010', 0),
    ('A9000001-0001-0001-0001-000000000011', 'A4000001-0001-0001-0001-000000000011', 49.99, '2025-01-01', 'Credit', N'Standard monthly membership - January 2025', 'TXN-2025-00011', 0),
    ('A9000001-0001-0001-0001-000000000012', 'A4000001-0001-0001-0001-000000000012', 19.99, '2025-01-01', 'Debit', N'Student monthly membership - January 2025', 'TXN-2025-00012', 0),
    ('A9000001-0001-0001-0001-000000000013', 'A4000001-0001-0001-0001-000000000014', 79.99, '2025-01-01', 'Credit', N'Premium monthly membership - January 2025', 'TXN-2025-00013', 0),
    ('A9000001-0001-0001-0001-000000000014', 'A4000001-0001-0001-0001-000000000015', 119.99, '2025-01-01', 'Check', N'Elite monthly membership - January 2025', 'TXN-2025-00014', 0),
    ('A9000001-0001-0001-0001-000000000015', 'A4000001-0001-0001-0001-000000000002', 75.00, '2025-01-06', 'Credit', N'Personal training session - Carlos Rivera', 'TXN-2025-00015', 0),
    ('A9000001-0001-0001-0001-000000000016', 'A4000001-0001-0001-0001-000000000004', 75.00, '2025-01-06', 'Credit', N'Personal training session - Carlos Rivera', 'TXN-2025-00016', 0),
    ('A9000001-0001-0001-0001-000000000017', 'A4000001-0001-0001-0001-000000000007', 65.00, '2025-01-07', 'Debit', N'Personal training session - Maya Patel (yoga)', 'TXN-2025-00017', 0),
    ('A9000001-0001-0001-0001-000000000018', 'A4000001-0001-0001-0001-000000000004', 85.00, '2025-01-07', 'Credit', N'Personal training session - Derek Williams (boxing)', 'TXN-2025-00018', 0),
    ('A9000001-0001-0001-0001-000000000019', 'A4000001-0001-0001-0001-000000000010', 80.00, '2025-01-08', 'ACH', N'Personal training session - Jake Thompson (CrossFit)', 'TXN-2025-00019', 0),
    ('A9000001-0001-0001-0001-000000000020', 'A4000001-0001-0001-0001-000000000009', 70.00, '2025-01-08', 'Credit', N'Personal training session - Sophie Martin (swimming)', 'TXN-2025-00020', 0),
    ('A9000001-0001-0001-0001-000000000021', 'A4000001-0001-0001-0001-000000000002', 75.00, '2025-01-09', 'Credit', N'Personal training session - Carlos Rivera', 'TXN-2025-00021', 0),
    ('A9000001-0001-0001-0001-000000000022', 'A4000001-0001-0001-0001-000000000003', 70.00, '2025-01-09', 'Debit', N'Personal training session - Alicia Chen (Pilates)', 'TXN-2025-00022', 0),
    ('A9000001-0001-0001-0001-000000000023', 'A4000001-0001-0001-0001-000000000015', 80.00, '2025-01-11', 'Credit', N'Personal training session - Jake Thompson', 'TXN-2025-00023', 0),
    ('A9000001-0001-0001-0001-000000000024', 'A4000001-0001-0001-0001-000000000005', 29.99, '2024-12-01', 'Credit', N'Basic monthly membership - December 2024', 'TXN-2024-00024', 0),
    ('A9000001-0001-0001-0001-000000000025', 'A4000001-0001-0001-0001-000000000008', 49.99, '2024-12-15', 'Cash', N'Standard monthly membership - December 2024 (late)', NULL, 0)
GO
