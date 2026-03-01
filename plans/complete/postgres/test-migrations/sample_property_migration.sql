/* =============================================
   Sample Property Management System
   Schema: sample_property
   Pass 17 - SQL Converter Validation
   ============================================= */

CREATE SCHEMA sample_property;
GO

USE SampleProperty;
GO

PRINT 'Creating Property Management tables...';
GO

-- Table 1: PropertyType
CREATE TABLE sample_property.PropertyType (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(50) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    IsResidential BIT NOT NULL DEFAULT 1,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_PropertyType PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_PropertyType_Name UNIQUE (Name)
);
GO

-- Table 2: Owner
CREATE TABLE sample_property.Owner (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(50) NOT NULL,
    LastName NVARCHAR(50) NOT NULL,
    Email NVARCHAR(200) NOT NULL,
    Phone VARCHAR(20) NULL,
    Address NVARCHAR(300) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Owner PRIMARY KEY (ID),
    CONSTRAINT UQ_Owner_Email UNIQUE (Email)
);
GO

-- Table 3: Property
CREATE TABLE sample_property.Property (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Address NVARCHAR(300) NOT NULL,
    City NVARCHAR(100) NOT NULL,
    State VARCHAR(2) NOT NULL,
    ZipCode VARCHAR(10) NOT NULL,
    PropertyTypeID UNIQUEIDENTIFIER NOT NULL,
    OwnerID UNIQUEIDENTIFIER NOT NULL,
    SquareFootage INT NOT NULL,
    Bedrooms SMALLINT NULL,
    Bathrooms DECIMAL(3,1) NULL,
    YearBuilt SMALLINT NOT NULL,
    PurchasePrice DECIMAL(12,2) NOT NULL,
    CurrentValue DECIMAL(12,2) NULL,
    IsAvailable BIT NOT NULL DEFAULT 1,
    Description NVARCHAR(MAX) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Property PRIMARY KEY (ID),
    CONSTRAINT FK_Property_Type FOREIGN KEY (PropertyTypeID) REFERENCES sample_property.PropertyType(ID),
    CONSTRAINT FK_Property_Owner FOREIGN KEY (OwnerID) REFERENCES sample_property.Owner(ID),
    CONSTRAINT CK_Property_SqFt CHECK (SquareFootage > 0),
    CONSTRAINT CK_Property_Year CHECK (YearBuilt BETWEEN 1800 AND 2030),
    CONSTRAINT CK_Property_Price CHECK (PurchasePrice > 0)
);
GO

-- Table 4: Tenant
CREATE TABLE sample_property.Tenant (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(50) NOT NULL,
    LastName NVARCHAR(50) NOT NULL,
    Email NVARCHAR(200) NOT NULL,
    Phone VARCHAR(20) NULL,
    DateOfBirth DATE NULL,
    CreditScore SMALLINT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    EmergencyContact NVARCHAR(100) NULL,
    EmergencyPhone VARCHAR(20) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Tenant PRIMARY KEY (ID),
    CONSTRAINT UQ_Tenant_Email UNIQUE (Email),
    CONSTRAINT CK_Tenant_Credit CHECK (CreditScore IS NULL OR CreditScore BETWEEN 300 AND 850)
);
GO

-- Table 5: Lease
CREATE TABLE sample_property.Lease (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PropertyID UNIQUEIDENTIFIER NOT NULL,
    TenantID UNIQUEIDENTIFIER NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NOT NULL,
    MonthlyRent DECIMAL(10,2) NOT NULL,
    SecurityDeposit DECIMAL(10,2) NOT NULL DEFAULT 0,
    Status NVARCHAR(20) NOT NULL DEFAULT N'Active',
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Lease PRIMARY KEY (ID),
    CONSTRAINT FK_Lease_Property FOREIGN KEY (PropertyID) REFERENCES sample_property.Property(ID),
    CONSTRAINT FK_Lease_Tenant FOREIGN KEY (TenantID) REFERENCES sample_property.Tenant(ID),
    CONSTRAINT CK_Lease_Rent CHECK (MonthlyRent > 0),
    CONSTRAINT CK_Lease_Deposit CHECK (SecurityDeposit >= 0),
    CONSTRAINT CK_Lease_Status CHECK (Status IN (N'Active', N'Expired', N'Terminated', N'Pending')),
    CONSTRAINT CK_Lease_Dates CHECK (EndDate > StartDate)
);
GO

-- Table 6: Payment
CREATE TABLE sample_property.Payment (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    LeaseID UNIQUEIDENTIFIER NOT NULL,
    PaymentDate DATE NOT NULL,
    Amount DECIMAL(10,2) NOT NULL,
    PaymentMethod NVARCHAR(20) NOT NULL DEFAULT N'Check',
    IsLatePayment BIT NOT NULL DEFAULT 0,
    LateFee DECIMAL(8,2) NOT NULL DEFAULT 0,
    Notes NVARCHAR(500) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Payment PRIMARY KEY (ID),
    CONSTRAINT FK_Payment_Lease FOREIGN KEY (LeaseID) REFERENCES sample_property.Lease(ID),
    CONSTRAINT CK_Payment_Amount CHECK (Amount > 0),
    CONSTRAINT CK_Payment_LateFee CHECK (LateFee >= 0),
    CONSTRAINT CK_Payment_Method CHECK (PaymentMethod IN (N'Check', N'ACH', N'CreditCard', N'Cash', N'Wire'))
);
GO

-- Table 7: MaintenanceRequest
CREATE TABLE sample_property.MaintenanceRequest (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PropertyID UNIQUEIDENTIFIER NOT NULL,
    TenantID UNIQUEIDENTIFIER NULL,
    Title NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Priority NVARCHAR(10) NOT NULL DEFAULT N'Medium',
    Status NVARCHAR(20) NOT NULL DEFAULT N'Open',
    RequestDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CompletedDate DATETIME NULL,
    EstimatedCost DECIMAL(10,2) NULL,
    ActualCost DECIMAL(10,2) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_MaintenanceRequest PRIMARY KEY (ID),
    CONSTRAINT FK_Maintenance_Property FOREIGN KEY (PropertyID) REFERENCES sample_property.Property(ID),
    CONSTRAINT FK_Maintenance_Tenant FOREIGN KEY (TenantID) REFERENCES sample_property.Tenant(ID),
    CONSTRAINT CK_Maintenance_Priority CHECK (Priority IN (N'Low', N'Medium', N'High', N'Emergency')),
    CONSTRAINT CK_Maintenance_Status CHECK (Status IN (N'Open', N'InProgress', N'Completed', N'Cancelled')),
    CONSTRAINT CK_Maintenance_Cost CHECK (EstimatedCost IS NULL OR EstimatedCost >= 0)
);
GO

-- Table 8: Inspection
CREATE TABLE sample_property.Inspection (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PropertyID UNIQUEIDENTIFIER NOT NULL,
    InspectionDate DATE NOT NULL,
    InspectionTime TIME NULL,
    InspectorName NVARCHAR(100) NOT NULL,
    OverallRating SMALLINT NOT NULL,
    Notes NVARCHAR(MAX) NULL,
    FollowUpRequired BIT NOT NULL DEFAULT 0,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Inspection PRIMARY KEY (ID),
    CONSTRAINT FK_Inspection_Property FOREIGN KEY (PropertyID) REFERENCES sample_property.Property(ID),
    CONSTRAINT CK_Inspection_Rating CHECK (OverallRating BETWEEN 1 AND 10)
);
GO

-- Filtered indexes
CREATE INDEX IX_Property_Available ON sample_property.Property(PropertyTypeID) WHERE IsAvailable = 1;
GO

CREATE INDEX IX_Maintenance_Open ON sample_property.MaintenanceRequest(PropertyID) WHERE Status IN (N'Open', N'InProgress');
GO

-- ALTER TABLE CHECK constraints
ALTER TABLE sample_property.Owner ADD CONSTRAINT CK_Owner_Email_Length CHECK (LEN(Email) >= 5);
GO

ALTER TABLE sample_property.Property ADD CONSTRAINT CK_Property_State_Length CHECK (LEN(State) = 2);
GO

ALTER TABLE sample_property.MaintenanceRequest ADD CONSTRAINT CK_Maintenance_Completed CHECK (CompletedDate IS NULL OR CompletedDate >= RequestDate);
GO

-- View 1: Property Portfolio
CREATE VIEW sample_property.vwPropertyPortfolio AS
SELECT
    p.ID AS PropertyID,
    p.Name AS PropertyName,
    p.City,
    p.State,
    pt.Name AS PropertyType,
    o.FirstName + N' ' + o.LastName AS OwnerName,
    p.SquareFootage,
    ISNULL(p.Bedrooms, 0) AS Bedrooms,
    ISNULL(p.Bathrooms, 0) AS Bathrooms,
    p.PurchasePrice,
    ISNULL(p.CurrentValue, p.PurchasePrice) AS CurrentValue,
    ROUND(ISNULL(p.CurrentValue, p.PurchasePrice) - p.PurchasePrice, 2) AS Appreciation,
    IIF(p.IsAvailable = 1, N'Available', N'Occupied') AS AvailabilityStatus,
    p.YearBuilt,
    YEAR(GETUTCDATE()) - p.YearBuilt AS PropertyAge
FROM sample_property.Property p
LEFT JOIN sample_property.PropertyType pt ON p.PropertyTypeID = pt.ID
LEFT JOIN sample_property.Owner o ON p.OwnerID = o.ID;
GO

-- View 2: Lease Summary
CREATE VIEW sample_property.vwLeaseSummary AS
SELECT
    l.ID AS LeaseID,
    p.Name AS PropertyName,
    t.FirstName + N' ' + t.LastName AS TenantName,
    l.StartDate,
    l.EndDate,
    l.MonthlyRent,
    l.SecurityDeposit,
    l.Status,
    DATEDIFF(DAY, l.StartDate, l.EndDate) AS LeaseDurationDays,
    DATEDIFF(DAY, GETUTCDATE(), l.EndDate) AS DaysRemaining,
    ROUND(l.MonthlyRent * 12, 2) AS AnnualRent,
    CASE
        WHEN l.Status = N'Active' AND DATEDIFF(DAY, GETUTCDATE(), l.EndDate) <= 30 THEN N'Expiring Soon'
        WHEN l.Status = N'Active' THEN N'Current'
        ELSE l.Status
    END AS LeaseStatus
FROM sample_property.Lease l
LEFT JOIN sample_property.Property p ON l.PropertyID = p.ID
LEFT JOIN sample_property.Tenant t ON l.TenantID = t.ID;
GO

-- View 3: Revenue Report
CREATE VIEW sample_property.vwRevenueReport AS
SELECT
    p.Name AS PropertyName,
    o.FirstName + N' ' + o.LastName AS OwnerName,
    COUNT(pay.ID) AS PaymentCount,
    COALESCE(SUM(pay.Amount), 0) AS TotalPayments,
    COALESCE(SUM(pay.LateFee), 0) AS TotalLateFees,
    COALESCE(SUM(pay.Amount + pay.LateFee), 0) AS GrossRevenue,
    ROUND(AVG(CAST(pay.Amount AS DECIMAL(10,2))), 2) AS AvgPaymentAmount,
    SUM(CASE WHEN pay.IsLatePayment = 1 THEN 1 ELSE 0 END) AS LatePaymentCount,
    ROUND(
        CAST(SUM(CASE WHEN pay.IsLatePayment = 1 THEN 1 ELSE 0 END) AS DECIMAL(5,2)) /
        IIF(COUNT(pay.ID) = 0, 1, COUNT(pay.ID)) * 100,
    2) AS LatePaymentRate,
    YEAR(GETUTCDATE()) AS ReportYear,
    MONTH(GETUTCDATE()) AS ReportMonth
FROM sample_property.Property p
LEFT JOIN sample_property.Owner o ON p.OwnerID = o.ID
LEFT JOIN sample_property.Lease l ON p.ID = l.PropertyID
LEFT JOIN sample_property.Payment pay ON l.ID = pay.LeaseID
GROUP BY p.Name, o.FirstName, o.LastName
HAVING COUNT(pay.ID) > 0;
GO

-- View 4: Maintenance Dashboard
CREATE VIEW sample_property.vwMaintenanceDashboard AS
SELECT
    p.Name AS PropertyName,
    mr.Priority,
    COUNT(mr.ID) AS RequestCount,
    SUM(CASE WHEN mr.Status = N'Open' THEN 1 ELSE 0 END) AS OpenCount,
    SUM(CASE WHEN mr.Status = N'InProgress' THEN 1 ELSE 0 END) AS InProgressCount,
    SUM(CASE WHEN mr.Status = N'Completed' THEN 1 ELSE 0 END) AS CompletedCount,
    COALESCE(SUM(mr.ActualCost), 0) AS TotalCost,
    ROUND(AVG(CAST(ISNULL(mr.ActualCost, 0) AS DECIMAL(10,2))), 2) AS AvgCost,
    COALESCE(AVG(
        CASE WHEN mr.CompletedDate IS NOT NULL
        THEN DATEDIFF(DAY, mr.RequestDate, mr.CompletedDate)
        ELSE NULL END
    ), 0) AS AvgResolutionDays
FROM sample_property.MaintenanceRequest mr
LEFT JOIN sample_property.Property p ON mr.PropertyID = p.ID
GROUP BY p.Name, mr.Priority;
GO

-- Extended Properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Property type classifications', @level0type=N'SCHEMA', @level0name=N'sample_property', @level1type=N'TABLE', @level1name=N'PropertyType';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Property owners', @level0type=N'SCHEMA', @level0name=N'sample_property', @level1type=N'TABLE', @level1name=N'Owner';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Real estate properties', @level0type=N'SCHEMA', @level0name=N'sample_property', @level1type=N'TABLE', @level1name=N'Property';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Property tenants', @level0type=N'SCHEMA', @level0name=N'sample_property', @level1type=N'TABLE', @level1name=N'Tenant';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lease agreements', @level0type=N'SCHEMA', @level0name=N'sample_property', @level1type=N'TABLE', @level1name=N'Lease';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Rent payments', @level0type=N'SCHEMA', @level0name=N'sample_property', @level1type=N'TABLE', @level1name=N'Payment';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maintenance work requests', @level0type=N'SCHEMA', @level0name=N'sample_property', @level1type=N'TABLE', @level1name=N'MaintenanceRequest';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Property inspections', @level0type=N'SCHEMA', @level0name=N'sample_property', @level1type=N'TABLE', @level1name=N'Inspection';
GO

-- Column-level
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'FICO credit score', @level0type=N'SCHEMA', @level0name=N'sample_property', @level1type=N'TABLE', @level1name=N'Tenant', @level2type=N'COLUMN', @level2name=N'CreditScore';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of half-baths counted as 0.5', @level0type=N'SCHEMA', @level0name=N'sample_property', @level1type=N'TABLE', @level1name=N'Property', @level2type=N'COLUMN', @level2name=N'Bathrooms';
GO

-- Role and Grant
CREATE ROLE [PropertyReader];
GO
GRANT SELECT ON SCHEMA::sample_property TO [PropertyReader];
GO

-- Seed data
-- Property Types
INSERT INTO sample_property.PropertyType (ID, Name, Description, IsResidential) VALUES
(NEWID(), N'Apartment', N'Multi-unit residential apartment', 1),
(NEWID(), N'Single Family', N'Standalone single family home', 1),
(NEWID(), N'Condo', N'Condominium unit', 1),
(NEWID(), N'Commercial', N'Commercial office or retail space', 0),
(NEWID(), N'Duplex', N'Two-unit residential building', 1);
GO

-- Owners
INSERT INTO sample_property.Owner (ID, FirstName, LastName, Email, Phone, Address, IsActive) VALUES
(NEWID(), N'Robert', N'Sterling', N'robert.s@realty.com', N'555-7001', N'100 Investment Blvd, Suite 200', 1),
(NEWID(), N'Patricia', N'Wong', N'patricia.w@realty.com', N'555-7002', N'200 Capital Drive', 1),
(NEWID(), N'James', N'O''Brien', N'james.ob@realty.com', N'555-7003', N'300 Estate Lane', 1),
(NEWID(), N'Susan', N'Nakamura', N'susan.n@realty.com', N'555-7004', N'400 Realty Court', 1);
GO

-- Properties
INSERT INTO sample_property.Property (ID, Name, Address, City, State, ZipCode, PropertyTypeID, OwnerID, SquareFootage, Bedrooms, Bathrooms, YearBuilt, PurchasePrice, CurrentValue, IsAvailable, Description) VALUES
(NEWID(), N'Sunset Apartments', N'100 Sunset Blvd', N'Austin', N'TX', N'78701', (SELECT TOP 1 ID FROM sample_property.PropertyType WHERE Name = N'Apartment'), (SELECT TOP 1 ID FROM sample_property.Owner WHERE Email = N'robert.s@realty.com'), 12000, NULL, NULL, 2005, 800000.00, 1200000.00, 0, N'24-unit apartment complex'),
(NEWID(), N'Oak Street House', N'200 Oak Street', N'Portland', N'OR', N'97201', (SELECT TOP 1 ID FROM sample_property.PropertyType WHERE Name = N'Single Family'), (SELECT TOP 1 ID FROM sample_property.Owner WHERE Email = N'patricia.w@realty.com'), 2200, 4, 2.5, 1998, 350000.00, 520000.00, 0, N'Well-maintained family home'),
(NEWID(), N'Downtown Condo 5A', N'300 Main St, Unit 5A', N'Denver', N'CO', N'80202', (SELECT TOP 1 ID FROM sample_property.PropertyType WHERE Name = N'Condo'), (SELECT TOP 1 ID FROM sample_property.Owner WHERE Email = N'robert.s@realty.com'), 1100, 2, 2.0, 2015, 280000.00, 310000.00, 0, N'Modern downtown condo'),
(NEWID(), N'Commerce Plaza', N'400 Business Park', N'Seattle', N'WA', N'98101', (SELECT TOP 1 ID FROM sample_property.PropertyType WHERE Name = N'Commercial'), (SELECT TOP 1 ID FROM sample_property.Owner WHERE Email = N'james.ob@realty.com'), 5000, NULL, NULL, 2010, 950000.00, 1100000.00, 1, N'Office space with parking'),
(NEWID(), N'Maple Duplex', N'500 Maple Ave', N'Nashville', N'TN', N'37201', (SELECT TOP 1 ID FROM sample_property.PropertyType WHERE Name = N'Duplex'), (SELECT TOP 1 ID FROM sample_property.Owner WHERE Email = N'susan.n@realty.com'), 2800, 6, 4.0, 2000, 400000.00, 550000.00, 0, N'Side-by-side duplex'),
(NEWID(), N'River View Apt', N'600 River Road', N'Austin', N'TX', N'78702', (SELECT TOP 1 ID FROM sample_property.PropertyType WHERE Name = N'Apartment'), (SELECT TOP 1 ID FROM sample_property.Owner WHERE Email = N'patricia.w@realty.com'), 8000, NULL, NULL, 2018, 1200000.00, NULL, 1, N'16-unit riverside apartments'),
(NEWID(), N'Pine Street House', N'700 Pine Street', N'Portland', N'OR', N'97202', (SELECT TOP 1 ID FROM sample_property.PropertyType WHERE Name = N'Single Family'), (SELECT TOP 1 ID FROM sample_property.Owner WHERE Email = N'james.ob@realty.com'), 1800, 3, 2.0, 1985, 250000.00, 420000.00, 0, N'Charming craftsman home'),
(NEWID(), N'Tech Hub Office', N'800 Innovation Way', N'Seattle', N'WA', N'98102', (SELECT TOP 1 ID FROM sample_property.PropertyType WHERE Name = N'Commercial'), (SELECT TOP 1 ID FROM sample_property.Owner WHERE Email = N'susan.n@realty.com'), 3500, NULL, NULL, 2020, 750000.00, 780000.00, 1, N'Modern tech office space');
GO

-- Tenants
INSERT INTO sample_property.Tenant (ID, FirstName, LastName, Email, Phone, DateOfBirth, CreditScore, IsActive, EmergencyContact, EmergencyPhone) VALUES
(NEWID(), N'Mike', N'Thompson', N'mike.t@email.com', N'555-8001', '1990-04-12', 720, 1, N'Karen Thompson', N'555-9001'),
(NEWID(), N'Sarah', N'Garcia', N'sarah.g@email.com', N'555-8002', '1988-09-25', 680, 1, N'Luis Garcia', N'555-9002'),
(NEWID(), N'David', N'Park', N'david.p@email.com', N'555-8003', '1992-01-15', 750, 1, N'Jin Park', N'555-9003'),
(NEWID(), N'Emily', N'Chen', N'emily.c@email.com', N'555-8004', '1995-06-30', 700, 1, N'Wei Chen', N'555-9004'),
(NEWID(), N'Jason', N'Miller', N'jason.m@email.com', N'555-8005', '1985-11-08', 650, 1, N'Linda Miller', N'555-9005'),
(NEWID(), N'Anna', N'Kowalski', N'anna.k@email.com', N'555-8006', '1993-03-20', 780, 1, N'Peter Kowalski', N'555-9006'),
(NEWID(), N'Brian', N'Davis', N'brian.d@email.com', N'555-8007', '1987-07-14', NULL, 0, NULL, NULL),
(NEWID(), N'Rachel', N'Kim', N'rachel.k@email.com', N'555-8008', '1991-12-05', 710, 1, N'Tom Kim', N'555-9008');
GO

-- Leases
INSERT INTO sample_property.Lease (ID, PropertyID, TenantID, StartDate, EndDate, MonthlyRent, SecurityDeposit, Status) VALUES
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Sunset Apartments'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'mike.t@email.com'), '2024-01-01', '2025-01-01', 1500.00, 1500.00, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Oak Street House'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'sarah.g@email.com'), '2023-06-01', '2024-06-01', 2200.00, 2200.00, N'Expired'),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Downtown Condo 5A'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'david.p@email.com'), '2024-03-01', '2025-03-01', 1800.00, 1800.00, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Maple Duplex'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'emily.c@email.com'), '2024-05-01', '2025-05-01', 1200.00, 1200.00, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Maple Duplex'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'jason.m@email.com'), '2024-05-01', '2025-05-01', 1200.00, 1200.00, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Sunset Apartments'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'anna.k@email.com'), '2024-02-01', '2025-02-01', 1600.00, 1600.00, N'Active'),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Pine Street House'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'rachel.k@email.com'), '2024-07-01', '2025-07-01', 1900.00, 1900.00, N'Active');
GO

-- Payments
INSERT INTO sample_property.Payment (ID, LeaseID, PaymentDate, Amount, PaymentMethod, IsLatePayment, LateFee, Notes) VALUES
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Lease WHERE MonthlyRent = 1500.00 AND Status = N'Active'), '2024-10-01', 1500.00, N'ACH', 0, 0, NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Lease WHERE MonthlyRent = 1500.00 AND Status = N'Active'), '2024-09-01', 1500.00, N'ACH', 0, 0, NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Lease WHERE MonthlyRent = 1500.00 AND Status = N'Active'), '2024-08-05', 1550.00, N'Check', 1, 50.00, N'Late payment penalty applied'),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Lease WHERE MonthlyRent = 1800.00), '2024-10-01', 1800.00, N'CreditCard', 0, 0, NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Lease WHERE MonthlyRent = 1800.00), '2024-09-01', 1800.00, N'CreditCard', 0, 0, NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Lease WHERE MonthlyRent = 1200.00 AND TenantID = (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'emily.c@email.com')), '2024-10-01', 1200.00, N'ACH', 0, 0, NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Lease WHERE MonthlyRent = 1200.00 AND TenantID = (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'jason.m@email.com')), '2024-10-03', 1250.00, N'Check', 1, 50.00, N'Late rent'),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Lease WHERE MonthlyRent = 1600.00), '2024-10-01', 1600.00, N'Wire', 0, 0, NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Lease WHERE MonthlyRent = 1900.00), '2024-10-01', 1900.00, N'ACH', 0, 0, NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Lease WHERE MonthlyRent = 1900.00), '2024-09-01', 1900.00, N'ACH', 0, 0, NULL);
GO

-- Maintenance Requests
INSERT INTO sample_property.MaintenanceRequest (ID, PropertyID, TenantID, Title, Description, Priority, Status, RequestDate, CompletedDate, EstimatedCost, ActualCost) VALUES
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Sunset Apartments'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'mike.t@email.com'), N'Leaky faucet', N'Kitchen faucet is dripping', N'Medium', N'Completed', '2024-09-15', '2024-09-18', 150.00, 120.00),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Oak Street House'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'sarah.g@email.com'), N'Broken window', N'Bedroom window cracked', N'High', N'Completed', '2024-09-20', '2024-09-22', 300.00, 350.00),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Downtown Condo 5A'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'david.p@email.com'), N'HVAC not cooling', N'AC unit not producing cold air', N'High', N'InProgress', '2024-10-05', NULL, 500.00, NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Maple Duplex'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'emily.c@email.com'), N'Paint peeling', N'Exterior paint peeling on front', N'Low', N'Open', '2024-10-08', NULL, 800.00, NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Pine Street House'), (SELECT TOP 1 ID FROM sample_property.Tenant WHERE Email = N'rachel.k@email.com'), N'Garage door stuck', N'Electric garage door not opening', N'Medium', N'Open', '2024-10-10', NULL, 250.00, NULL),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Sunset Apartments'), NULL, N'Parking lot repaving', N'Annual parking lot maintenance', N'Low', N'Completed', '2024-08-01', '2024-08-15', 5000.00, 4800.00);
GO

-- Inspections
INSERT INTO sample_property.Inspection (ID, PropertyID, InspectionDate, InspectionTime, InspectorName, OverallRating, Notes, FollowUpRequired) VALUES
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Sunset Apartments'), '2024-09-01', '09:00:00', N'Tom Henderson', 8, N'Good overall condition', 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Oak Street House'), '2024-09-05', '10:30:00', N'Tom Henderson', 7, N'Minor repairs needed', 1),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Downtown Condo 5A'), '2024-09-10', '14:00:00', N'Lisa Park', 9, N'Excellent condition', 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Commerce Plaza'), '2024-09-15', '11:00:00', N'Lisa Park', 6, N'HVAC system needs servicing', 1),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Maple Duplex'), '2024-09-20', '09:30:00', N'Tom Henderson', 7, N'Paint exterior needed', 1),
(NEWID(), (SELECT TOP 1 ID FROM sample_property.Property WHERE Name = N'Pine Street House'), '2024-10-01', '13:00:00', N'Lisa Park', 8, N'Well maintained by tenant', 0);
GO
