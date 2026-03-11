/* =============================================
   Sample CRM/Sales System
   Schema: sample_crm
   Pass 16 - SQL Converter Validation
   ============================================= */

-- Create schema
CREATE SCHEMA sample_crm;
GO

USE SampleCRM;
GO

PRINT 'Creating CRM/Sales tables...';
GO

-- Table 1: Account
CREATE TABLE sample_crm.Account (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Industry NVARCHAR(100) NULL,
    Website VARCHAR(300) NULL,
    Phone VARCHAR(20) NULL,
    AnnualRevenue DECIMAL(15,2) NULL,
    EmployeeCount INT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    Notes NVARCHAR(MAX) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Account PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_Account_Name UNIQUE (Name),
    CONSTRAINT CK_Account_Revenue CHECK (AnnualRevenue IS NULL OR AnnualRevenue >= 0),
    CONSTRAINT CK_Account_Employees CHECK (EmployeeCount IS NULL OR EmployeeCount >= 0)
);
GO

-- Table 2: Contact
CREATE TABLE sample_crm.Contact (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(50) NOT NULL,
    LastName NVARCHAR(50) NOT NULL,
    Email NVARCHAR(200) NOT NULL,
    Phone VARCHAR(20) NULL,
    Title NVARCHAR(100) NULL,
    AccountID UNIQUEIDENTIFIER NOT NULL,
    IsPrimary BIT NOT NULL DEFAULT 0,
    DateOfBirth DATE NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Contact PRIMARY KEY (ID),
    CONSTRAINT FK_Contact_Account FOREIGN KEY (AccountID) REFERENCES sample_crm.Account(ID),
    CONSTRAINT UQ_Contact_Email UNIQUE (Email)
);
GO

-- Table 3: SalesRep
CREATE TABLE sample_crm.SalesRep (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(50) NOT NULL,
    LastName NVARCHAR(50) NOT NULL,
    Email NVARCHAR(200) NOT NULL,
    Phone VARCHAR(20) NULL,
    HireDate DATE NOT NULL,
    CommissionRate DECIMAL(5,4) NOT NULL DEFAULT 0.0500,
    IsActive BIT NOT NULL DEFAULT 1,
    ManagerID UNIQUEIDENTIFIER NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_SalesRep PRIMARY KEY (ID),
    CONSTRAINT FK_SalesRep_Manager FOREIGN KEY (ManagerID) REFERENCES sample_crm.SalesRep(ID),
    CONSTRAINT UQ_SalesRep_Email UNIQUE (Email),
    CONSTRAINT CK_SalesRep_Commission CHECK (CommissionRate BETWEEN 0.0000 AND 0.5000)
);
GO

-- Table 4: Opportunity
CREATE TABLE sample_crm.Opportunity (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    AccountID UNIQUEIDENTIFIER NOT NULL,
    ContactID UNIQUEIDENTIFIER NULL,
    SalesRepID UNIQUEIDENTIFIER NOT NULL,
    Amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    Stage NVARCHAR(30) NOT NULL DEFAULT N'Prospecting',
    Probability SMALLINT NOT NULL DEFAULT 10,
    CloseDate DATE NOT NULL,
    Description NVARCHAR(MAX) NULL,
    IsWon BIT NOT NULL DEFAULT 0,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Opportunity PRIMARY KEY (ID),
    CONSTRAINT FK_Opportunity_Account FOREIGN KEY (AccountID) REFERENCES sample_crm.Account(ID),
    CONSTRAINT FK_Opportunity_Contact FOREIGN KEY (ContactID) REFERENCES sample_crm.Contact(ID),
    CONSTRAINT FK_Opportunity_SalesRep FOREIGN KEY (SalesRepID) REFERENCES sample_crm.SalesRep(ID),
    CONSTRAINT CK_Opportunity_Amount CHECK (Amount >= 0),
    CONSTRAINT CK_Opportunity_Probability CHECK (Probability BETWEEN 0 AND 100),
    CONSTRAINT CK_Opportunity_Stage CHECK (Stage IN (N'Prospecting', N'Qualification', N'Proposal', N'Negotiation', N'ClosedWon', N'ClosedLost'))
);
GO

-- Table 5: Activity
CREATE TABLE sample_crm.Activity (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Subject NVARCHAR(200) NOT NULL,
    ActivityType NVARCHAR(20) NOT NULL,
    ActivityDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    DurationMinutes INT NULL,
    ContactID UNIQUEIDENTIFIER NULL,
    OpportunityID UNIQUEIDENTIFIER NULL,
    SalesRepID UNIQUEIDENTIFIER NOT NULL,
    Notes NVARCHAR(MAX) NULL,
    IsCompleted BIT NOT NULL DEFAULT 0,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Activity PRIMARY KEY (ID),
    CONSTRAINT FK_Activity_Contact FOREIGN KEY (ContactID) REFERENCES sample_crm.Contact(ID),
    CONSTRAINT FK_Activity_Opportunity FOREIGN KEY (OpportunityID) REFERENCES sample_crm.Opportunity(ID),
    CONSTRAINT FK_Activity_SalesRep FOREIGN KEY (SalesRepID) REFERENCES sample_crm.SalesRep(ID),
    CONSTRAINT CK_Activity_Type CHECK (ActivityType IN (N'Call', N'Email', N'Meeting', N'Task', N'Note')),
    CONSTRAINT CK_Activity_Duration CHECK (DurationMinutes IS NULL OR DurationMinutes > 0)
);
GO

-- Table 6: Product
CREATE TABLE sample_crm.Product (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    ProductCode VARCHAR(20) NOT NULL,
    UnitPrice DECIMAL(12,2) NOT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    Description NVARCHAR(MAX) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Product PRIMARY KEY (ID),
    CONSTRAINT UQ_Product_Code UNIQUE (ProductCode),
    CONSTRAINT CK_Product_Price CHECK (UnitPrice > 0)
);
GO

-- Table 7: OpportunityProduct
CREATE TABLE sample_crm.OpportunityProduct (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OpportunityID UNIQUEIDENTIFIER NOT NULL,
    ProductID UNIQUEIDENTIFIER NOT NULL,
    Quantity INT NOT NULL DEFAULT 1,
    UnitPrice DECIMAL(12,2) NOT NULL,
    Discount DECIMAL(5,2) NOT NULL DEFAULT 0,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_OpportunityProduct PRIMARY KEY (ID),
    CONSTRAINT FK_OppProduct_Opportunity FOREIGN KEY (OpportunityID) REFERENCES sample_crm.Opportunity(ID),
    CONSTRAINT FK_OppProduct_Product FOREIGN KEY (ProductID) REFERENCES sample_crm.Product(ID),
    CONSTRAINT CK_OppProduct_Quantity CHECK (Quantity > 0),
    CONSTRAINT CK_OppProduct_Price CHECK (UnitPrice > 0),
    CONSTRAINT CK_OppProduct_Discount CHECK (Discount BETWEEN 0 AND 100)
);
GO

-- Table 8: Campaign
CREATE TABLE sample_crm.Campaign (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NULL,
    Budget DECIMAL(12,2) NOT NULL DEFAULT 0,
    ActualCost DECIMAL(12,2) NOT NULL DEFAULT 0,
    Status NVARCHAR(20) NOT NULL DEFAULT N'Planned',
    Description NVARCHAR(MAX) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Campaign PRIMARY KEY (ID),
    CONSTRAINT UQ_Campaign_Name UNIQUE (Name),
    CONSTRAINT CK_Campaign_Budget CHECK (Budget >= 0),
    CONSTRAINT CK_Campaign_Cost CHECK (ActualCost >= 0),
    CONSTRAINT CK_Campaign_Status CHECK (Status IN (N'Planned', N'Active', N'Completed', N'Cancelled'))
);
GO

-- Filtered indexes
CREATE INDEX IX_Opportunity_Open ON sample_crm.Opportunity(SalesRepID) WHERE Stage NOT IN (N'ClosedWon', N'ClosedLost');
GO

CREATE INDEX IX_Activity_Pending ON sample_crm.Activity(SalesRepID) WHERE IsCompleted = 0;
GO

-- ALTER TABLE CHECK constraints
ALTER TABLE sample_crm.Contact ADD CONSTRAINT CK_Contact_Email_Length CHECK (LEN(Email) >= 5);
GO

ALTER TABLE sample_crm.Campaign ADD CONSTRAINT CK_Campaign_Dates CHECK (EndDate IS NULL OR EndDate >= StartDate);
GO

ALTER TABLE sample_crm.Opportunity ADD CONSTRAINT CK_Opportunity_Won CHECK (IsWon = 0 OR Stage = N'ClosedWon');
GO

-- View 1: Sales Pipeline
CREATE VIEW sample_crm.vwSalesPipeline AS
SELECT
    o.ID AS OpportunityID,
    o.Name AS OpportunityName,
    a.Name AS AccountName,
    sr.FirstName + N' ' + sr.LastName AS SalesRepName,
    o.Amount,
    o.Stage,
    o.Probability,
    ROUND(o.Amount * CAST(o.Probability AS DECIMAL(5,2)) / 100, 2) AS WeightedAmount,
    o.CloseDate,
    DATEDIFF(DAY, GETUTCDATE(), o.CloseDate) AS DaysToClose,
    IIF(o.IsWon = 1, N'Won', IIF(o.Stage = N'ClosedLost', N'Lost', N'Open')) AS DealStatus,
    ISNULL(c.FirstName + N' ' + c.LastName, N'No Contact') AS ContactName
FROM sample_crm.Opportunity o
LEFT JOIN sample_crm.Account a ON o.AccountID = a.ID
LEFT JOIN sample_crm.SalesRep sr ON o.SalesRepID = sr.ID
LEFT JOIN sample_crm.Contact c ON o.ContactID = c.ID;
GO

-- View 2: Rep Performance
CREATE VIEW sample_crm.vwRepPerformance AS
SELECT
    sr.ID AS SalesRepID,
    sr.FirstName + N' ' + sr.LastName AS RepName,
    COUNT(o.ID) AS TotalOpportunities,
    SUM(CASE WHEN o.IsWon = 1 THEN 1 ELSE 0 END) AS WonDeals,
    SUM(CASE WHEN o.Stage = N'ClosedLost' THEN 1 ELSE 0 END) AS LostDeals,
    COALESCE(SUM(CASE WHEN o.IsWon = 1 THEN o.Amount ELSE 0 END), 0) AS TotalRevenue,
    ROUND(AVG(CAST(o.Amount AS DECIMAL(15,2))), 2) AS AvgDealSize,
    ROUND(
        CAST(SUM(CASE WHEN o.IsWon = 1 THEN 1 ELSE 0 END) AS DECIMAL(5,2)) /
        IIF(COUNT(o.ID) = 0, 1, COUNT(o.ID)) * 100,
    2) AS WinRate,
    sr.CommissionRate,
    DATEDIFF(DAY, sr.HireDate, GETUTCDATE()) AS DaysSinceHire,
    YEAR(GETUTCDATE()) AS ReportYear
FROM sample_crm.SalesRep sr
LEFT JOIN sample_crm.Opportunity o ON sr.ID = o.SalesRepID
GROUP BY sr.ID, sr.FirstName, sr.LastName, sr.CommissionRate, sr.HireDate;
GO

-- View 3: Account Summary
CREATE VIEW sample_crm.vwAccountSummary AS
SELECT
    a.ID AS AccountID,
    a.Name AS AccountName,
    a.Industry,
    ISNULL(a.AnnualRevenue, 0) AS AnnualRevenue,
    COUNT(DISTINCT c.ID) AS ContactCount,
    COUNT(DISTINCT o.ID) AS OpportunityCount,
    COALESCE(SUM(CASE WHEN o.IsWon = 1 THEN o.Amount ELSE 0 END), 0) AS TotalWonAmount,
    COALESCE(SUM(o.Amount), 0) AS TotalPipelineAmount,
    ISNULL(a.EmployeeCount, 0) AS EmployeeCount,
    IIF(a.IsActive = 1, N'Active', N'Inactive') AS AccountStatus
FROM sample_crm.Account a
LEFT JOIN sample_crm.Contact c ON a.ID = c.AccountID
LEFT JOIN sample_crm.Opportunity o ON a.ID = o.AccountID
GROUP BY a.ID, a.Name, a.Industry, a.AnnualRevenue, a.EmployeeCount, a.IsActive;
GO

-- View 4: Activity Dashboard
CREATE VIEW sample_crm.vwActivityDashboard AS
SELECT
    sr.FirstName + N' ' + sr.LastName AS RepName,
    act.ActivityType,
    COUNT(act.ID) AS ActivityCount,
    SUM(ISNULL(act.DurationMinutes, 0)) AS TotalMinutes,
    SUM(CASE WHEN act.IsCompleted = 1 THEN 1 ELSE 0 END) AS CompletedCount,
    ROUND(
        CAST(SUM(CASE WHEN act.IsCompleted = 1 THEN 1 ELSE 0 END) AS DECIMAL(5,2)) /
        IIF(COUNT(act.ID) = 0, 1, COUNT(act.ID)) * 100,
    2) AS CompletionRate,
    MONTH(GETUTCDATE()) AS ReportMonth,
    YEAR(GETUTCDATE()) AS ReportYear
FROM sample_crm.Activity act
LEFT JOIN sample_crm.SalesRep sr ON act.SalesRepID = sr.ID
GROUP BY sr.FirstName, sr.LastName, act.ActivityType
HAVING COUNT(act.ID) > 0;
GO

-- Extended Properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Company accounts', @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Account';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Contact persons at accounts', @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sales team members', @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'SalesRep';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sales opportunities', @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Opportunity';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sales activities and tasks', @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Product catalog', @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Product';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Products linked to opportunities', @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'OpportunityProduct';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Marketing campaigns', @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Campaign';
GO

-- Column-level
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Self-referencing manager hierarchy', @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'SalesRep', @level2type=N'COLUMN', @level2name=N'ManagerID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Commission percentage per deal', @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'SalesRep', @level2type=N'COLUMN', @level2name=N'CommissionRate';
GO

-- Role and Grant
CREATE ROLE [CRMReader];
GO
GRANT SELECT ON SCHEMA::sample_crm TO [CRMReader];
GO

-- Seed data
-- Accounts
INSERT INTO sample_crm.Account (ID, Name, Industry, Website, Phone, AnnualRevenue, EmployeeCount, IsActive, Notes) VALUES
(NEWID(), N'Acme Corporation', N'Technology', N'https://acme.com', N'555-4001', 5000000.00, 250, 1, N'Key enterprise account'),
(NEWID(), N'Global Industries', N'Manufacturing', N'https://globalind.com', N'555-4002', 12000000.00, 800, 1, N'Large manufacturing client'),
(NEWID(), N'Bright Solutions', N'Consulting', N'https://brightsol.com', N'555-4003', 2000000.00, 50, 1, NULL),
(NEWID(), N'Metro Healthcare', N'Healthcare', N'https://metrohc.com', N'555-4004', 8000000.00, 400, 1, N'Healthcare vertical target'),
(NEWID(), N'Summit Financial', N'Finance', N'https://summitfin.com', N'555-4005', 15000000.00, 600, 1, NULL),
(NEWID(), N'Green Energy Co', N'Energy', N'https://greenenergy.com', N'555-4006', 3500000.00, 120, 1, N'Renewable energy focus');
GO

-- Sales Reps
INSERT INTO sample_crm.SalesRep (ID, FirstName, LastName, Email, Phone, HireDate, CommissionRate, IsActive) VALUES
(NEWID(), N'Alice', N'Morgan', N'alice.morgan@company.com', N'555-5001', '2019-03-15', 0.0800, 1),
(NEWID(), N'Bob', N'Turner', N'bob.turner@company.com', N'555-5002', '2020-06-01', 0.0600, 1),
(NEWID(), N'Carol', N'Hayes', N'carol.hayes@company.com', N'555-5003', '2021-01-10', 0.0500, 1),
(NEWID(), N'Dan', N'Foster', N'dan.foster@company.com', N'555-5004', '2018-08-20', 0.1000, 1),
(NEWID(), N'Eve', N'Mitchell', N'eve.mitchell@company.com', N'555-5005', '2023-02-01', 0.0500, 1);
GO

-- Contacts
INSERT INTO sample_crm.Contact (ID, FirstName, LastName, Email, Phone, Title, AccountID, IsPrimary, DateOfBirth) VALUES
(NEWID(), N'John', N'Smith', N'john.smith@acme.com', N'555-6001', N'CTO', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Acme Corporation'), 1, '1980-05-15'),
(NEWID(), N'Jane', N'Doe', N'jane.doe@acme.com', N'555-6002', N'VP Engineering', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Acme Corporation'), 0, '1985-11-22'),
(NEWID(), N'Mark', N'Johnson', N'mark.j@globalind.com', N'555-6003', N'Procurement Manager', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Global Industries'), 1, '1975-03-08'),
(NEWID(), N'Sara', N'Williams', N'sara.w@brightsol.com', N'555-6004', N'CEO', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Bright Solutions'), 1, '1982-07-30'),
(NEWID(), N'Tom', N'Brown', N'tom.b@metrohc.com', N'555-6005', N'IT Director', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Metro Healthcare'), 1, NULL),
(NEWID(), N'Lisa', N'Davis', N'lisa.d@summitfin.com', N'555-6006', N'CFO', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Summit Financial'), 1, '1978-09-12'),
(NEWID(), N'Chris', N'Wilson', N'chris.w@greenenergy.com', N'555-6007', N'Operations Director', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Green Energy Co'), 1, '1990-01-25'),
(NEWID(), N'Amy', N'Taylor', N'amy.t@globalind.com', N'555-6008', N'Plant Manager', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Global Industries'), 0, '1988-06-18');
GO

-- Products
INSERT INTO sample_crm.Product (ID, Name, ProductCode, UnitPrice, IsActive, Description) VALUES
(NEWID(), N'Enterprise Suite', N'ENT-001', 50000.00, 1, N'Full enterprise software suite'),
(NEWID(), N'Professional License', N'PRO-001', 15000.00, 1, N'Professional tier license'),
(NEWID(), N'Basic Package', N'BAS-001', 5000.00, 1, N'Basic starter package'),
(NEWID(), N'Support Premium', N'SUP-001', 10000.00, 1, N'Premium 24/7 support plan'),
(NEWID(), N'Training Package', N'TRN-001', 3000.00, 1, N'On-site training for 10 users'),
(NEWID(), N'API Access', N'API-001', 8000.00, 1, N'Annual API access license');
GO

-- Opportunities
INSERT INTO sample_crm.Opportunity (ID, Name, AccountID, ContactID, SalesRepID, Amount, Stage, Probability, CloseDate, Description, IsWon) VALUES
(NEWID(), N'Acme Enterprise Deal', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Acme Corporation'), (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'john.smith@acme.com'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'alice.morgan@company.com'), 75000.00, N'Negotiation', 70, '2024-12-15', N'Large enterprise deployment', 0),
(NEWID(), N'Global Ind Expansion', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Global Industries'), (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'mark.j@globalind.com'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'bob.turner@company.com'), 120000.00, N'Proposal', 50, '2025-01-30', N'Multi-site expansion project', 0),
(NEWID(), N'Bright Solutions Starter', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Bright Solutions'), (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'sara.w@brightsol.com'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'carol.hayes@company.com'), 8000.00, N'ClosedWon', 100, '2024-09-30', N'Starter package sale', 1),
(NEWID(), N'Metro HC Integration', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Metro Healthcare'), (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'tom.b@metrohc.com'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'dan.foster@company.com'), 95000.00, N'Qualification', 30, '2025-03-31', N'Healthcare integration project', 0),
(NEWID(), N'Summit Fin Platform', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Summit Financial'), (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'lisa.d@summitfin.com'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'alice.morgan@company.com'), 200000.00, N'Prospecting', 10, '2025-06-30', N'Enterprise platform for trading', 0),
(NEWID(), N'Green Energy Monitoring', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Green Energy Co'), (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'chris.w@greenenergy.com'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'eve.mitchell@company.com'), 35000.00, N'ClosedLost', 0, '2024-08-15', N'Lost to competitor', 0),
(NEWID(), N'Acme Support Renewal', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Acme Corporation'), (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'jane.doe@acme.com'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'alice.morgan@company.com'), 10000.00, N'ClosedWon', 100, '2024-10-01', N'Annual support renewal', 1),
(NEWID(), N'Global Ind Training', (SELECT TOP 1 ID FROM sample_crm.Account WHERE Name = N'Global Industries'), (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'amy.t@globalind.com'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'bob.turner@company.com'), 6000.00, N'ClosedWon', 100, '2024-09-15', N'Training for plant staff', 1);
GO

-- Activities
INSERT INTO sample_crm.Activity (ID, Subject, ActivityType, ActivityDate, DurationMinutes, ContactID, OpportunityID, SalesRepID, Notes, IsCompleted) VALUES
(NEWID(), N'Initial discovery call', N'Call', '2024-09-01', 30, (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'john.smith@acme.com'), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Acme Enterprise Deal'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'alice.morgan@company.com'), N'Discussed requirements', 1),
(NEWID(), N'Follow-up email', N'Email', '2024-09-05', NULL, (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'john.smith@acme.com'), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Acme Enterprise Deal'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'alice.morgan@company.com'), N'Sent proposal docs', 1),
(NEWID(), N'Demo meeting', N'Meeting', '2024-09-15', 60, (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'mark.j@globalind.com'), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Global Ind Expansion'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'bob.turner@company.com'), N'Product demonstration', 1),
(NEWID(), N'Contract review', N'Meeting', '2024-09-20', 45, (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'sara.w@brightsol.com'), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Bright Solutions Starter'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'carol.hayes@company.com'), N'Final contract discussion', 1),
(NEWID(), N'Needs analysis', N'Call', '2024-10-01', 45, (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'tom.b@metrohc.com'), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Metro HC Integration'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'dan.foster@company.com'), N'Understanding HC requirements', 1),
(NEWID(), N'Send pricing proposal', N'Task', '2024-10-10', NULL, NULL, (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Acme Enterprise Deal'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'alice.morgan@company.com'), N'Prepare and send formal pricing', 0),
(NEWID(), N'Schedule site visit', N'Task', '2024-10-12', NULL, (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'mark.j@globalind.com'), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Global Ind Expansion'), (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'bob.turner@company.com'), N'Arrange plant visit', 0),
(NEWID(), N'Quarterly check-in', N'Call', '2024-10-15', 20, (SELECT TOP 1 ID FROM sample_crm.Contact WHERE Email = N'lisa.d@summitfin.com'), NULL, (SELECT TOP 1 ID FROM sample_crm.SalesRep WHERE Email = N'alice.morgan@company.com'), N'Relationship maintenance', 1);
GO

-- Campaigns
INSERT INTO sample_crm.Campaign (ID, Name, StartDate, EndDate, Budget, ActualCost, Status, Description, IsActive) VALUES
(NEWID(), N'Q4 Product Launch', '2024-10-01', '2024-12-31', 50000.00, 12000.00, N'Active', N'Fourth quarter product launch campaign', 1),
(NEWID(), N'Spring Webinar Series', '2024-03-01', '2024-05-31', 15000.00, 14500.00, N'Completed', N'Educational webinar series', 0),
(NEWID(), N'Partner Referral Program', '2024-01-01', NULL, 30000.00, 8000.00, N'Active', N'Ongoing partner referral incentives', 1),
(NEWID(), N'Trade Show 2025', '2025-02-15', '2025-02-18', 75000.00, 0, N'Planned', N'Annual industry trade show', 1);
GO

-- Opportunity Products
INSERT INTO sample_crm.OpportunityProduct (ID, OpportunityID, ProductID, Quantity, UnitPrice, Discount) VALUES
(NEWID(), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Acme Enterprise Deal'), (SELECT TOP 1 ID FROM sample_crm.Product WHERE ProductCode = N'ENT-001'), 1, 50000.00, 5.00),
(NEWID(), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Acme Enterprise Deal'), (SELECT TOP 1 ID FROM sample_crm.Product WHERE ProductCode = N'SUP-001'), 1, 10000.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Acme Enterprise Deal'), (SELECT TOP 1 ID FROM sample_crm.Product WHERE ProductCode = N'TRN-001'), 5, 3000.00, 10.00),
(NEWID(), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Global Ind Expansion'), (SELECT TOP 1 ID FROM sample_crm.Product WHERE ProductCode = N'ENT-001'), 2, 50000.00, 8.00),
(NEWID(), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Global Ind Expansion'), (SELECT TOP 1 ID FROM sample_crm.Product WHERE ProductCode = N'API-001'), 2, 8000.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Bright Solutions Starter'), (SELECT TOP 1 ID FROM sample_crm.Product WHERE ProductCode = N'BAS-001'), 1, 5000.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Bright Solutions Starter'), (SELECT TOP 1 ID FROM sample_crm.Product WHERE ProductCode = N'TRN-001'), 1, 3000.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_crm.Opportunity WHERE Name = N'Acme Support Renewal'), (SELECT TOP 1 ID FROM sample_crm.Product WHERE ProductCode = N'SUP-001'), 1, 10000.00, 0);
GO
