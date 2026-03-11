-- ============================================================================
-- Sample HR Migration - T-SQL
-- Exercises all SQL Server constructs handled by the unified sql-convert tool
-- Schema: sample_hr
-- ============================================================================

-- Create schema
CREATE SCHEMA sample_hr
GO

-- ============================================================================
-- TABLES
-- ============================================================================

-- Department table
CREATE TABLE [sample_hr].[Department] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Code] VARCHAR(20) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_Department] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- Position table
CREATE TABLE [sample_hr].[Position] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Title] NVARCHAR(200) NOT NULL,
    [MinSalary] DECIMAL(12,2) NOT NULL,
    [MaxSalary] DECIMAL(12,2) NOT NULL,
    [IsExempt] BIT NOT NULL DEFAULT 0,
    [DepartmentID] UNIQUEIDENTIFIER NOT NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_Position] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- Employee table (self-referencing ManagerID)
CREATE TABLE [sample_hr].[Employee] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [FirstName] NVARCHAR(100) NOT NULL,
    [LastName] NVARCHAR(100) NOT NULL,
    [Email] NVARCHAR(255) NOT NULL,
    [Phone] VARCHAR(20) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [HireDate] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [TerminationDate] DATETIME NULL,
    [DepartmentID] UNIQUEIDENTIFIER NOT NULL,
    [PositionID] UNIQUEIDENTIFIER NOT NULL,
    [ManagerID] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_Employee] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Employee_Email] UNIQUE NONCLUSTERED ([Email])
)
GO

-- TimeOff table
CREATE TABLE [sample_hr].[TimeOff] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [EmployeeID] UNIQUEIDENTIFIER NOT NULL,
    [StartDate] DATE NOT NULL,
    [EndDate] DATE NOT NULL,
    [HoursRequested] DECIMAL(5,2) NOT NULL,
    [IsApproved] BIT NOT NULL DEFAULT 0,
    [ApprovedByID] UNIQUEIDENTIFIER NULL,
    [Reason] NVARCHAR(MAX) NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_TimeOff] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- PerformanceReview table
CREATE TABLE [sample_hr].[PerformanceReview] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [EmployeeID] UNIQUEIDENTIFIER NOT NULL,
    [ReviewerID] UNIQUEIDENTIFIER NOT NULL,
    [ReviewDate] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [Rating] INT NOT NULL,
    [Comments] NVARCHAR(MAX) NULL,
    [IsPublished] BIT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_PerformanceReview] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- SalaryHistory table
CREATE TABLE [sample_hr].[SalaryHistory] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [EmployeeID] UNIQUEIDENTIFIER NOT NULL,
    [EffectiveDate] DATE NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [Currency] VARCHAR(3) NOT NULL DEFAULT 'USD',
    [ChangeReason] NVARCHAR(500) NULL,
    [Notes] NVARCHAR(MAX) NULL,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_SalaryHistory] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- ============================================================================
-- CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE [sample_hr].[PerformanceReview]
    ADD CONSTRAINT [CK_PerformanceReview_Rating] CHECK ([Rating] BETWEEN 1 AND 5)
GO

ALTER TABLE [sample_hr].[Position]
    ADD CONSTRAINT [CK_Position_Salary] CHECK ([MaxSalary] >= [MinSalary])
GO

ALTER TABLE [sample_hr].[TimeOff]
    ADD CONSTRAINT [CK_TimeOff_Dates] CHECK ([EndDate] >= [StartDate])
GO

ALTER TABLE [sample_hr].[SalaryHistory]
    ADD CONSTRAINT [CK_SalaryHistory_Amount] CHECK ([Amount] > 0)
GO

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

ALTER TABLE [sample_hr].[Position]
    ADD CONSTRAINT [FK_Position_Department] FOREIGN KEY ([DepartmentID])
    REFERENCES [sample_hr].[Department] ([ID])
GO

ALTER TABLE [sample_hr].[Employee]
    ADD CONSTRAINT [FK_Employee_Department] FOREIGN KEY ([DepartmentID])
    REFERENCES [sample_hr].[Department] ([ID])
GO

ALTER TABLE [sample_hr].[Employee]
    ADD CONSTRAINT [FK_Employee_Position] FOREIGN KEY ([PositionID])
    REFERENCES [sample_hr].[Position] ([ID])
GO

ALTER TABLE [sample_hr].[Employee]
    ADD CONSTRAINT [FK_Employee_Manager] FOREIGN KEY ([ManagerID])
    REFERENCES [sample_hr].[Employee] ([ID])
GO

ALTER TABLE [sample_hr].[TimeOff]
    ADD CONSTRAINT [FK_TimeOff_Employee] FOREIGN KEY ([EmployeeID])
    REFERENCES [sample_hr].[Employee] ([ID])
GO

ALTER TABLE [sample_hr].[TimeOff]
    ADD CONSTRAINT [FK_TimeOff_ApprovedBy] FOREIGN KEY ([ApprovedByID])
    REFERENCES [sample_hr].[Employee] ([ID])
GO

ALTER TABLE [sample_hr].[PerformanceReview]
    ADD CONSTRAINT [FK_PerformanceReview_Employee] FOREIGN KEY ([EmployeeID])
    REFERENCES [sample_hr].[Employee] ([ID])
GO

ALTER TABLE [sample_hr].[PerformanceReview]
    ADD CONSTRAINT [FK_PerformanceReview_Reviewer] FOREIGN KEY ([ReviewerID])
    REFERENCES [sample_hr].[Employee] ([ID])
GO

ALTER TABLE [sample_hr].[SalaryHistory]
    ADD CONSTRAINT [FK_SalaryHistory_Employee] FOREIGN KEY ([EmployeeID])
    REFERENCES [sample_hr].[Employee] ([ID])
GO

-- ============================================================================
-- VIEWS
-- ============================================================================

CREATE VIEW [sample_hr].[vwActiveEmployees]
AS
SELECT
    e.[ID],
    e.[FirstName],
    e.[LastName],
    e.[FirstName] + N' ' + e.[LastName] AS [FullName],
    e.[Email],
    e.[HireDate],
    d.[Name] AS [DepartmentName],
    p.[Title] AS [PositionTitle],
    m.[FirstName] + N' ' + m.[LastName] AS [ManagerName]
FROM
    [sample_hr].[Employee] e
    INNER JOIN [sample_hr].[Department] d ON e.[DepartmentID] = d.[ID]
    INNER JOIN [sample_hr].[Position] p ON e.[PositionID] = p.[ID]
    LEFT JOIN [sample_hr].[Employee] m ON e.[ManagerID] = m.[ID]
WHERE
    e.[IsActive] = 1
GO

CREATE VIEW [sample_hr].[vwDepartmentStats]
AS
SELECT
    d.[ID] AS [DepartmentID],
    d.[Name] AS [DepartmentName],
    COUNT(e.[ID]) AS [EmployeeCount],
    SUM(CASE WHEN e.[IsActive] = 1 THEN 1 ELSE 0 END) AS [ActiveCount],
    SUM(CASE WHEN e.[IsActive] = 0 THEN 1 ELSE 0 END) AS [InactiveCount],
    MIN(e.[HireDate]) AS [EarliestHire],
    MAX(e.[HireDate]) AS [LatestHire]
FROM
    [sample_hr].[Department] d
    LEFT JOIN [sample_hr].[Employee] e ON d.[ID] = e.[DepartmentID]
GROUP BY
    d.[ID], d.[Name]
GO

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE NONCLUSTERED INDEX [IX_Employee_DepartmentID]
    ON [sample_hr].[Employee] ([DepartmentID])
GO

CREATE NONCLUSTERED INDEX [IX_Employee_PositionID]
    ON [sample_hr].[Employee] ([PositionID])
GO

CREATE NONCLUSTERED INDEX [IX_Employee_ManagerID]
    ON [sample_hr].[Employee] ([ManagerID])
GO

CREATE NONCLUSTERED INDEX [IX_TimeOff_EmployeeID]
    ON [sample_hr].[TimeOff] ([EmployeeID])
GO

CREATE NONCLUSTERED INDEX [IX_PerformanceReview_EmployeeID]
    ON [sample_hr].[PerformanceReview] ([EmployeeID])
GO

CREATE NONCLUSTERED INDEX [IX_SalaryHistory_EmployeeID]
    ON [sample_hr].[SalaryHistory] ([EmployeeID])
GO

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Departments
INSERT INTO [sample_hr].[Department] ([ID], [Name], [Code], [Description], [IsActive])
VALUES ('A0000001-0000-0000-0000-000000000001', N'Engineering', N'ENG', N'Software Engineering Department', 1)
GO

INSERT INTO [sample_hr].[Department] ([ID], [Name], [Code], [Description], [IsActive])
VALUES ('A0000001-0000-0000-0000-000000000002', N'Human Resources', N'HR', N'Human Resources Department', 1)
GO

INSERT INTO [sample_hr].[Department] ([ID], [Name], [Code], [Description], [IsActive])
VALUES ('A0000001-0000-0000-0000-000000000003', N'Marketing', N'MKT', N'Marketing and Communications', 1)
GO

-- Positions
INSERT INTO [sample_hr].[Position] ([ID], [Title], [MinSalary], [MaxSalary], [IsExempt], [DepartmentID])
VALUES ('B0000001-0000-0000-0000-000000000001', N'Software Engineer', 80000.00, 150000.00, 1, 'A0000001-0000-0000-0000-000000000001')
GO

INSERT INTO [sample_hr].[Position] ([ID], [Title], [MinSalary], [MaxSalary], [IsExempt], [DepartmentID])
VALUES ('B0000001-0000-0000-0000-000000000002', N'Engineering Manager', 120000.00, 200000.00, 1, 'A0000001-0000-0000-0000-000000000001')
GO

INSERT INTO [sample_hr].[Position] ([ID], [Title], [MinSalary], [MaxSalary], [IsExempt], [DepartmentID])
VALUES ('B0000001-0000-0000-0000-000000000003', N'HR Specialist', 55000.00, 90000.00, 0, 'A0000001-0000-0000-0000-000000000002')
GO

INSERT INTO [sample_hr].[Position] ([ID], [Title], [MinSalary], [MaxSalary], [IsExempt], [DepartmentID])
VALUES ('B0000001-0000-0000-0000-000000000004', N'Marketing Coordinator', 50000.00, 80000.00, 0, 'A0000001-0000-0000-0000-000000000003')
GO

-- Employees (manager first, then reports)
INSERT INTO [sample_hr].[Employee] ([ID], [FirstName], [LastName], [Email], [Phone], [IsActive], [HireDate], [DepartmentID], [PositionID], [ManagerID])
VALUES ('C0000001-0000-0000-0000-000000000001', N'Alice', N'Johnson', N'alice.johnson@example.com', '555-0101', 1, '2020-03-15', 'A0000001-0000-0000-0000-000000000001', 'B0000001-0000-0000-0000-000000000002', NULL)
GO

INSERT INTO [sample_hr].[Employee] ([ID], [FirstName], [LastName], [Email], [Phone], [IsActive], [HireDate], [DepartmentID], [PositionID], [ManagerID])
VALUES ('C0000001-0000-0000-0000-000000000002', N'Bob', N'Smith', N'bob.smith@example.com', '555-0102', 1, '2021-06-01', 'A0000001-0000-0000-0000-000000000001', 'B0000001-0000-0000-0000-000000000001', 'C0000001-0000-0000-0000-000000000001')
GO

INSERT INTO [sample_hr].[Employee] ([ID], [FirstName], [LastName], [Email], [Phone], [IsActive], [HireDate], [DepartmentID], [PositionID], [ManagerID])
VALUES ('C0000001-0000-0000-0000-000000000003', N'Carol', N'Williams', N'carol.williams@example.com', '555-0103', 1, '2022-01-10', 'A0000001-0000-0000-0000-000000000002', 'B0000001-0000-0000-0000-000000000003', NULL)
GO

INSERT INTO [sample_hr].[Employee] ([ID], [FirstName], [LastName], [Email], [Phone], [IsActive], [HireDate], [DepartmentID], [PositionID], [ManagerID])
VALUES ('C0000001-0000-0000-0000-000000000004', N'Dave', N'Brown', N'dave.brown@example.com', '555-0104', 0, '2019-11-20', 'A0000001-0000-0000-0000-000000000001', 'B0000001-0000-0000-0000-000000000001', 'C0000001-0000-0000-0000-000000000001')
GO

INSERT INTO [sample_hr].[Employee] ([ID], [FirstName], [LastName], [Email], [Phone], [IsActive], [HireDate], [DepartmentID], [PositionID], [ManagerID])
VALUES ('C0000001-0000-0000-0000-000000000005', N'Eve', N'Davis', N'eve.davis@example.com', NULL, 1, '2023-04-05', 'A0000001-0000-0000-0000-000000000003', 'B0000001-0000-0000-0000-000000000004', NULL)
GO

-- TimeOff requests
INSERT INTO [sample_hr].[TimeOff] ([ID], [EmployeeID], [StartDate], [EndDate], [HoursRequested], [IsApproved], [ApprovedByID], [Reason])
VALUES ('D0000001-0000-0000-0000-000000000001', 'C0000001-0000-0000-0000-000000000002', '2024-07-01', '2024-07-05', 40.00, 1, 'C0000001-0000-0000-0000-000000000001', N'Summer vacation')
GO

INSERT INTO [sample_hr].[TimeOff] ([ID], [EmployeeID], [StartDate], [EndDate], [HoursRequested], [IsApproved], [Reason])
VALUES ('D0000001-0000-0000-0000-000000000002', 'C0000001-0000-0000-0000-000000000003', '2024-08-15', '2024-08-16', 16.00, 0, N'Personal day')
GO

-- Performance Reviews
INSERT INTO [sample_hr].[PerformanceReview] ([ID], [EmployeeID], [ReviewerID], [ReviewDate], [Rating], [Comments], [IsPublished])
VALUES ('E0000001-0000-0000-0000-000000000001', 'C0000001-0000-0000-0000-000000000002', 'C0000001-0000-0000-0000-000000000001', '2024-01-15', 4, N'Excellent performance, consistently delivers quality code', 1)
GO

INSERT INTO [sample_hr].[PerformanceReview] ([ID], [EmployeeID], [ReviewerID], [ReviewDate], [Rating], [Comments], [IsPublished])
VALUES ('E0000001-0000-0000-0000-000000000002', 'C0000001-0000-0000-0000-000000000003', 'C0000001-0000-0000-0000-000000000001', '2024-01-20', 3, N'Meets expectations, room for growth in process improvement', 0)
GO

-- Salary History
INSERT INTO [sample_hr].[SalaryHistory] ([ID], [EmployeeID], [EffectiveDate], [Amount], [Currency], [ChangeReason])
VALUES ('F0000001-0000-0000-0000-000000000001', 'C0000001-0000-0000-0000-000000000001', '2020-03-15', 140000.00, 'USD', N'Initial hire')
GO

INSERT INTO [sample_hr].[SalaryHistory] ([ID], [EmployeeID], [EffectiveDate], [Amount], [Currency], [ChangeReason])
VALUES ('F0000001-0000-0000-0000-000000000002', 'C0000001-0000-0000-0000-000000000002', '2021-06-01', 95000.00, 'USD', N'Initial hire')
GO

INSERT INTO [sample_hr].[SalaryHistory] ([ID], [EmployeeID], [EffectiveDate], [Amount], [Currency], [ChangeReason])
VALUES ('F0000001-0000-0000-0000-000000000003', 'C0000001-0000-0000-0000-000000000002', '2022-06-01', 110000.00, 'USD', N'Annual merit increase')
GO

INSERT INTO [sample_hr].[SalaryHistory] ([ID], [EmployeeID], [EffectiveDate], [Amount], [Currency], [ChangeReason])
VALUES ('F0000001-0000-0000-0000-000000000004', 'C0000001-0000-0000-0000-000000000003', '2022-01-10', 62000.00, 'USD', N'Initial hire')
GO

-- ============================================================================
-- EXTENDED PROPERTIES (table and column descriptions)
-- ============================================================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Core organizational units',
    @level0type = N'SCHEMA', @level0name = N'sample_hr',
    @level1type = N'TABLE', @level1name = N'Department'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique department identifier',
    @level0type = N'SCHEMA', @level0name = N'sample_hr',
    @level1type = N'TABLE', @level1name = N'Department',
    @level2type = N'COLUMN', @level2name = N'ID'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Department display name',
    @level0type = N'SCHEMA', @level0name = N'sample_hr',
    @level1type = N'TABLE', @level1name = N'Department',
    @level2type = N'COLUMN', @level2name = N'Name'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Job positions with salary ranges',
    @level0type = N'SCHEMA', @level0name = N'sample_hr',
    @level1type = N'TABLE', @level1name = N'Position'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Employee records including reporting hierarchy',
    @level0type = N'SCHEMA', @level0name = N'sample_hr',
    @level1type = N'TABLE', @level1name = N'Employee'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the employee is currently active',
    @level0type = N'SCHEMA', @level0name = N'sample_hr',
    @level1type = N'TABLE', @level1name = N'Employee',
    @level2type = N'COLUMN', @level2name = N'IsActive'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Time off and leave requests',
    @level0type = N'SCHEMA', @level0name = N'sample_hr',
    @level1type = N'TABLE', @level1name = N'TimeOff'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Annual and periodic performance evaluations',
    @level0type = N'SCHEMA', @level0name = N'sample_hr',
    @level1type = N'TABLE', @level1name = N'PerformanceReview'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Rating must be between 1 (lowest) and 5 (highest)',
    @level0type = N'SCHEMA', @level0name = N'sample_hr',
    @level1type = N'TABLE', @level1name = N'PerformanceReview',
    @level2type = N'COLUMN', @level2name = N'Rating'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Historical salary changes for audit and analytics',
    @level0type = N'SCHEMA', @level0name = N'sample_hr',
    @level1type = N'TABLE', @level1name = N'SalaryHistory'
GO

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON [sample_hr].[vwActiveEmployees] TO [cdp_UI]
GO

GRANT SELECT ON [sample_hr].[vwDepartmentStats] TO [cdp_UI]
GO

GRANT SELECT, INSERT, UPDATE ON [sample_hr].[Department] TO [cdp_Developer]
GO

GRANT SELECT, INSERT, UPDATE ON [sample_hr].[Employee] TO [cdp_Developer]
GO

GRANT SELECT ON [sample_hr].[SalaryHistory] TO [cdp_UI]
GO
