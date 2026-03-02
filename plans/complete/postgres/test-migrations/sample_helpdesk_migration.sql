-- ============================================================================
-- Sample Help Desk Migration - T-SQL
-- Pass 6 converter validation: new domain, new schema
-- Schema: sample_hd (IT Help Desk / Ticketing System)
-- 9 tables, 4 views, DATEDIFF/ISNULL/GETDATE conversion,
-- inline CHECK constraints, hierarchical categories, self-ref FK, NVARCHAR(MAX)
-- ============================================================================

-- Create schema
CREATE SCHEMA sample_hd
GO

-- ============================================================================
-- TABLES
-- ============================================================================

-- Priority lookup table
CREATE TABLE [sample_hd].[Priority] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(50) NOT NULL,
    [SortOrder] INT NOT NULL DEFAULT 0,
    [ColorHex] VARCHAR(7) NULL,
    [SLAResponseMinutes] INT NULL,
    [SLAResolutionMinutes] INT NULL,
    CONSTRAINT [PK_Priority] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- Department table
CREATE TABLE [sample_hd].[Department] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(150) NOT NULL,
    [ManagerEmail] NVARCHAR(255) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_Department] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- SupportAgent table (inline CHECK on Tier)
CREATE TABLE [sample_hd].[SupportAgent] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [FirstName] NVARCHAR(100) NOT NULL,
    [LastName] NVARCHAR(100) NOT NULL,
    [Email] NVARCHAR(255) NOT NULL,
    [Phone] VARCHAR(20) NULL,
    [DepartmentID] UNIQUEIDENTIFIER NOT NULL,
    [Tier] SMALLINT NOT NULL DEFAULT 1 CHECK ([Tier] BETWEEN 1 AND 3),
    [IsAvailable] BIT NOT NULL DEFAULT 1,
    [HireDate] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_SupportAgent] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_SupportAgent_Email] UNIQUE NONCLUSTERED ([Email])
)
GO

-- Category table with self-referencing FK (hierarchical)
CREATE TABLE [sample_hd].[Category] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(150) NOT NULL,
    [ParentCategoryID] UNIQUEIDENTIFIER NULL,
    [DepartmentID] UNIQUEIDENTIFIER NULL,
    [Description] NVARCHAR(500) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_Category] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- Ticket table (inline CHECK on Status)
CREATE TABLE [sample_hd].[Ticket] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [TicketNumber] VARCHAR(20) NOT NULL,
    [Subject] NVARCHAR(300) NOT NULL,
    [Description] NVARCHAR(MAX) NOT NULL,
    [RequestorEmail] NVARCHAR(255) NOT NULL,
    [RequestorName] NVARCHAR(200) NOT NULL,
    [CategoryID] UNIQUEIDENTIFIER NOT NULL,
    [PriorityID] UNIQUEIDENTIFIER NOT NULL,
    [AssignedAgentID] UNIQUEIDENTIFIER NULL,
    [Status] VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK ([Status] IN ('Open', 'InProgress', 'Waiting', 'Resolved', 'Closed')),
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [ResolvedAt] DATETIME NULL,
    [ClosedAt] DATETIME NULL,
    [DueDate] DATETIME NULL,
    [IsEscalated] BIT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_Ticket] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Ticket_TicketNumber] UNIQUE NONCLUSTERED ([TicketNumber])
)
GO

-- TicketComment table
CREATE TABLE [sample_hd].[TicketComment] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [TicketID] UNIQUEIDENTIFIER NOT NULL,
    [AuthorEmail] NVARCHAR(255) NOT NULL,
    [AuthorName] NVARCHAR(200) NOT NULL,
    [Body] NVARCHAR(MAX) NOT NULL,
    [IsInternal] BIT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_TicketComment] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- TicketAttachment table (inline CHECK on FileSize)
CREATE TABLE [sample_hd].[TicketAttachment] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [TicketID] UNIQUEIDENTIFIER NOT NULL,
    [FileName] NVARCHAR(300) NOT NULL,
    [FileSize] INT NOT NULL CHECK ([FileSize] > 0),
    [MimeType] VARCHAR(100) NOT NULL,
    [StoragePath] NVARCHAR(500) NOT NULL,
    [UploadedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [UploadedBy] NVARCHAR(255) NOT NULL,
    CONSTRAINT [PK_TicketAttachment] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- KnowledgeArticle table (inline CHECK on ViewCount)
CREATE TABLE [sample_hd].[KnowledgeArticle] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Title] NVARCHAR(300) NOT NULL,
    [Slug] VARCHAR(300) NOT NULL,
    [Body] NVARCHAR(MAX) NOT NULL,
    [CategoryID] UNIQUEIDENTIFIER NULL,
    [AuthorAgentID] UNIQUEIDENTIFIER NOT NULL,
    [IsPublished] BIT NOT NULL DEFAULT 0,
    [ViewCount] INT NOT NULL DEFAULT 0 CHECK ([ViewCount] >= 0),
    [HelpfulCount] INT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_KnowledgeArticle] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_KnowledgeArticle_Slug] UNIQUE NONCLUSTERED ([Slug])
)
GO

-- TicketTag table
CREATE TABLE [sample_hd].[TicketTag] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [TicketID] UNIQUEIDENTIFIER NOT NULL,
    [TagName] NVARCHAR(50) NOT NULL,
    [AddedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_TicketTag] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

ALTER TABLE [sample_hd].[SupportAgent]
    ADD CONSTRAINT [FK_SupportAgent_Department] FOREIGN KEY ([DepartmentID]) REFERENCES [sample_hd].[Department] ([ID])
GO

ALTER TABLE [sample_hd].[Category]
    ADD CONSTRAINT [FK_Category_ParentCategory] FOREIGN KEY ([ParentCategoryID]) REFERENCES [sample_hd].[Category] ([ID])
GO

ALTER TABLE [sample_hd].[Category]
    ADD CONSTRAINT [FK_Category_Department] FOREIGN KEY ([DepartmentID]) REFERENCES [sample_hd].[Department] ([ID])
GO

ALTER TABLE [sample_hd].[Ticket]
    ADD CONSTRAINT [FK_Ticket_Category] FOREIGN KEY ([CategoryID]) REFERENCES [sample_hd].[Category] ([ID])
GO

ALTER TABLE [sample_hd].[Ticket]
    ADD CONSTRAINT [FK_Ticket_Priority] FOREIGN KEY ([PriorityID]) REFERENCES [sample_hd].[Priority] ([ID])
GO

ALTER TABLE [sample_hd].[Ticket]
    ADD CONSTRAINT [FK_Ticket_SupportAgent] FOREIGN KEY ([AssignedAgentID]) REFERENCES [sample_hd].[SupportAgent] ([ID])
GO

ALTER TABLE [sample_hd].[TicketComment]
    ADD CONSTRAINT [FK_TicketComment_Ticket] FOREIGN KEY ([TicketID]) REFERENCES [sample_hd].[Ticket] ([ID])
GO

ALTER TABLE [sample_hd].[TicketAttachment]
    ADD CONSTRAINT [FK_TicketAttachment_Ticket] FOREIGN KEY ([TicketID]) REFERENCES [sample_hd].[Ticket] ([ID])
GO

ALTER TABLE [sample_hd].[KnowledgeArticle]
    ADD CONSTRAINT [FK_KnowledgeArticle_Category] FOREIGN KEY ([CategoryID]) REFERENCES [sample_hd].[Category] ([ID])
GO

ALTER TABLE [sample_hd].[KnowledgeArticle]
    ADD CONSTRAINT [FK_KnowledgeArticle_AuthorAgent] FOREIGN KEY ([AuthorAgentID]) REFERENCES [sample_hd].[SupportAgent] ([ID])
GO

ALTER TABLE [sample_hd].[TicketTag]
    ADD CONSTRAINT [FK_TicketTag_Ticket] FOREIGN KEY ([TicketID]) REFERENCES [sample_hd].[Ticket] ([ID])
GO

-- ============================================================================
-- ALTER TABLE CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE [sample_hd].[KnowledgeArticle]
    ADD CONSTRAINT [CK_KnowledgeArticle_HelpfulCount] CHECK ([HelpfulCount] >= 0)
GO

ALTER TABLE [sample_hd].[TicketTag]
    ADD CONSTRAINT [CK_TicketTag_TagName_NotEmpty] CHECK (LEN([TagName]) > 0)
GO

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE NONCLUSTERED INDEX [IX_Ticket_Status] ON [sample_hd].[Ticket] ([Status])
GO

CREATE NONCLUSTERED INDEX [IX_Ticket_CreatedAt] ON [sample_hd].[Ticket] ([CreatedAt])
GO

CREATE NONCLUSTERED INDEX [IX_TicketComment_TicketID] ON [sample_hd].[TicketComment] ([TicketID])
GO

CREATE NONCLUSTERED INDEX [IX_TicketTag_TagName] ON [sample_hd].[TicketTag] ([TagName])
GO

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Open Tickets with category, priority, agent name, age in hours
CREATE VIEW [sample_hd].[vwOpenTickets]
AS
SELECT
    t.[ID],
    t.[TicketNumber],
    t.[Subject],
    t.[RequestorName],
    t.[RequestorEmail],
    t.[Status],
    t.[CreatedAt],
    t.[UpdatedAt],
    t.[DueDate],
    t.[IsEscalated],
    c.[Name] AS [CategoryName],
    p.[Name] AS [PriorityName],
    p.[ColorHex] AS [PriorityColor],
    p.[SLAResponseMinutes],
    ISNULL(sa.[FirstName] + N' ' + sa.[LastName], N'Unassigned') AS [AssignedAgent],
    ISNULL(sa.[Email], N'') AS [AgentEmail],
    DATEDIFF(hour, t.[CreatedAt], GETUTCDATE()) AS [AgeHours],
    DATEDIFF(minute, t.[CreatedAt], GETDATE()) AS [AgeMinutes],
    CASE
        WHEN p.[SLAResponseMinutes] IS NOT NULL
             AND DATEDIFF(minute, t.[CreatedAt], GETUTCDATE()) > p.[SLAResponseMinutes]
        THEN 1
        ELSE 0
    END AS [IsSLABreached]
FROM [sample_hd].[Ticket] t
INNER JOIN [sample_hd].[Category] c ON t.[CategoryID] = c.[ID]
INNER JOIN [sample_hd].[Priority] p ON t.[PriorityID] = p.[ID]
LEFT JOIN [sample_hd].[SupportAgent] sa ON t.[AssignedAgentID] = sa.[ID]
WHERE t.[Status] NOT IN ('Resolved', 'Closed')
GO

-- Agent Workload: agents with open ticket count, avg resolution hours
CREATE VIEW [sample_hd].[vwAgentWorkload]
AS
SELECT
    sa.[ID],
    sa.[FirstName],
    sa.[LastName],
    sa.[Email],
    sa.[Tier],
    sa.[IsAvailable],
    d.[Name] AS [DepartmentName],
    ISNULL((SELECT COUNT(*) FROM [sample_hd].[Ticket] t WHERE t.[AssignedAgentID] = sa.[ID] AND t.[Status] NOT IN ('Resolved', 'Closed')), 0) AS [OpenTicketCount],
    (SELECT COUNT(*) FROM [sample_hd].[Ticket] t WHERE t.[AssignedAgentID] = sa.[ID] AND t.[Status] IN ('Resolved', 'Closed')) AS [ResolvedTicketCount],
    (SELECT AVG(CAST(DATEDIFF(hour, t.[CreatedAt], ISNULL(t.[ResolvedAt], GETUTCDATE())) AS DECIMAL(10,2)))
     FROM [sample_hd].[Ticket] t
     WHERE t.[AssignedAgentID] = sa.[ID]
       AND t.[Status] IN ('Resolved', 'Closed')
       AND t.[ResolvedAt] IS NOT NULL) AS [AvgResolutionHours]
FROM [sample_hd].[SupportAgent] sa
INNER JOIN [sample_hd].[Department] d ON sa.[DepartmentID] = d.[ID]
GO

-- Category Summary: categories with ticket count, avg resolution, parent name
CREATE VIEW [sample_hd].[vwCategorySummary]
AS
SELECT
    c.[ID],
    c.[Name] AS [CategoryName],
    ISNULL(pc.[Name], N'(Top Level)') AS [ParentCategoryName],
    c.[IsActive],
    ISNULL(d.[Name], N'(No Department)') AS [DepartmentName],
    (SELECT COUNT(*) FROM [sample_hd].[Ticket] t WHERE t.[CategoryID] = c.[ID]) AS [TotalTickets],
    (SELECT COUNT(*) FROM [sample_hd].[Ticket] t WHERE t.[CategoryID] = c.[ID] AND t.[Status] NOT IN ('Resolved', 'Closed')) AS [OpenTickets],
    (SELECT AVG(CAST(DATEDIFF(hour, t.[CreatedAt], t.[ResolvedAt]) AS DECIMAL(10,2)))
     FROM [sample_hd].[Ticket] t
     WHERE t.[CategoryID] = c.[ID]
       AND t.[ResolvedAt] IS NOT NULL) AS [AvgResolutionHours]
FROM [sample_hd].[Category] c
LEFT JOIN [sample_hd].[Category] pc ON c.[ParentCategoryID] = pc.[ID]
LEFT JOIN [sample_hd].[Department] d ON c.[DepartmentID] = d.[ID]
GO

-- Knowledge Base: published articles with category, author, helpful ratio
CREATE VIEW [sample_hd].[vwKnowledgeBase]
AS
SELECT
    ka.[ID],
    ka.[Title],
    ka.[Slug],
    ka.[Body],
    ka.[ViewCount],
    ka.[HelpfulCount],
    ka.[CreatedAt],
    ka.[UpdatedAt],
    ISNULL(c.[Name], N'Uncategorized') AS [CategoryName],
    sa.[FirstName] + N' ' + sa.[LastName] AS [AuthorName],
    sa.[Email] AS [AuthorEmail],
    CASE
        WHEN ka.[ViewCount] > 0
        THEN CAST(ka.[HelpfulCount] AS DECIMAL(5,2)) / CAST(ka.[ViewCount] AS DECIMAL(5,2)) * 100
        ELSE 0
    END AS [HelpfulPercent],
    DATEDIFF(day, ka.[CreatedAt], GETUTCDATE()) AS [AgeDays]
FROM [sample_hd].[KnowledgeArticle] ka
INNER JOIN [sample_hd].[SupportAgent] sa ON ka.[AuthorAgentID] = sa.[ID]
LEFT JOIN [sample_hd].[Category] c ON ka.[CategoryID] = c.[ID]
WHERE ka.[IsPublished] = 1
GO

-- ============================================================================
-- EXTENDED PROPERTIES (Metadata)
-- ============================================================================

-- Table descriptions
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Ticket priority levels with SLA thresholds', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'Priority'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Organizational departments for agent grouping', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'Department'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Help desk support agents and technicians', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'SupportAgent'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Hierarchical ticket categories for classification', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'Category'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Help desk support tickets from requestors', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'Ticket'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Comments and notes on support tickets', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'TicketComment'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'File attachments associated with tickets', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'TicketAttachment'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Self-service knowledge base articles', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'KnowledgeArticle'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Tags applied to tickets for flexible categorization', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'TicketTag'
GO

-- Column descriptions
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display order for priority listing (lower = higher priority)', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'Priority', @level2type = N'COLUMN', @level2name = N'SortOrder'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SLA target for initial response in minutes', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'Priority', @level2type = N'COLUMN', @level2name = N'SLAResponseMinutes'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SLA target for full resolution in minutes', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'Priority', @level2type = N'COLUMN', @level2name = N'SLAResolutionMinutes'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Support tier level: 1=Basic, 2=Advanced, 3=Expert', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'SupportAgent', @level2type = N'COLUMN', @level2name = N'Tier'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Self-referencing FK for category hierarchy', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'Category', @level2type = N'COLUMN', @level2name = N'ParentCategoryID'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Auto-generated human-readable ticket identifier', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'Ticket', @level2type = N'COLUMN', @level2name = N'TicketNumber'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current ticket lifecycle status', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'Ticket', @level2type = N'COLUMN', @level2name = N'Status'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this comment is internal-only (not visible to requestor)', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'TicketComment', @level2type = N'COLUMN', @level2name = N'IsInternal'
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL-friendly unique identifier for the article', @level0type = N'SCHEMA', @level0name = N'sample_hd', @level1type = N'TABLE', @level1name = N'KnowledgeArticle', @level2type = N'COLUMN', @level2name = N'Slug'
GO

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Create role if not exists
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'hd_reader' AND type = 'R')
    CREATE ROLE hd_reader
GO

GRANT SELECT ON SCHEMA::sample_hd TO hd_reader
GO

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Priorities (4)
INSERT INTO [sample_hd].[Priority] ([ID], [Name], [SortOrder], [ColorHex], [SLAResponseMinutes], [SLAResolutionMinutes])
VALUES ('D0000001-0000-0000-0000-000000000001', N'Critical', 1, '#FF0000', 15, 120)
GO
INSERT INTO [sample_hd].[Priority] ([ID], [Name], [SortOrder], [ColorHex], [SLAResponseMinutes], [SLAResolutionMinutes])
VALUES ('D0000001-0000-0000-0000-000000000002', N'High', 2, '#FF8800', 60, 480)
GO
INSERT INTO [sample_hd].[Priority] ([ID], [Name], [SortOrder], [ColorHex], [SLAResponseMinutes], [SLAResolutionMinutes])
VALUES ('D0000001-0000-0000-0000-000000000003', N'Medium', 3, '#FFCC00', 240, 1440)
GO
INSERT INTO [sample_hd].[Priority] ([ID], [Name], [SortOrder], [ColorHex], [SLAResponseMinutes], [SLAResolutionMinutes])
VALUES ('D0000001-0000-0000-0000-000000000004', N'Low', 4, '#00CC00', NULL, NULL)
GO

-- Departments (3)
INSERT INTO [sample_hd].[Department] ([ID], [Name], [ManagerEmail], [IsActive])
VALUES ('D0000002-0000-0000-0000-000000000001', N'IT Infrastructure', N'mgr.infra@example.com', 1)
GO
INSERT INTO [sample_hd].[Department] ([ID], [Name], [ManagerEmail], [IsActive])
VALUES ('D0000002-0000-0000-0000-000000000002', N'Application Support', N'mgr.apps@example.com', 1)
GO
INSERT INTO [sample_hd].[Department] ([ID], [Name], [ManagerEmail], [IsActive])
VALUES ('D0000002-0000-0000-0000-000000000003', N'Security Operations', N'mgr.security@example.com', 1)
GO

-- SupportAgents (8)
INSERT INTO [sample_hd].[SupportAgent] ([ID], [FirstName], [LastName], [Email], [Phone], [DepartmentID], [Tier], [IsAvailable], [HireDate])
VALUES ('D0000003-0000-0000-0000-000000000001', N'Alice', N'Chen', N'alice.chen@helpdesk.com', '555-0101', 'D0000002-0000-0000-0000-000000000001', 3, 1, '2021-03-15')
GO
INSERT INTO [sample_hd].[SupportAgent] ([ID], [FirstName], [LastName], [Email], [Phone], [DepartmentID], [Tier], [IsAvailable], [HireDate])
VALUES ('D0000003-0000-0000-0000-000000000002', N'Bob', N'Martinez', N'bob.martinez@helpdesk.com', '555-0102', 'D0000002-0000-0000-0000-000000000001', 2, 1, '2022-01-10')
GO
INSERT INTO [sample_hd].[SupportAgent] ([ID], [FirstName], [LastName], [Email], [Phone], [DepartmentID], [Tier], [IsAvailable], [HireDate])
VALUES ('D0000003-0000-0000-0000-000000000003', N'Carol', N'Okafor', N'carol.okafor@helpdesk.com', '555-0103', 'D0000002-0000-0000-0000-000000000002', 2, 1, '2022-06-20')
GO
INSERT INTO [sample_hd].[SupportAgent] ([ID], [FirstName], [LastName], [Email], [Phone], [DepartmentID], [Tier], [IsAvailable], [HireDate])
VALUES ('D0000003-0000-0000-0000-000000000004', N'David', N'Singh', N'david.singh@helpdesk.com', '555-0104', 'D0000002-0000-0000-0000-000000000002', 1, 1, '2023-02-14')
GO
INSERT INTO [sample_hd].[SupportAgent] ([ID], [FirstName], [LastName], [Email], [Phone], [DepartmentID], [Tier], [IsAvailable], [HireDate])
VALUES ('D0000003-0000-0000-0000-000000000005', N'Eva', N'Kowalski', N'eva.kowalski@helpdesk.com', NULL, 'D0000002-0000-0000-0000-000000000003', 3, 1, '2020-09-01')
GO
INSERT INTO [sample_hd].[SupportAgent] ([ID], [FirstName], [LastName], [Email], [Phone], [DepartmentID], [Tier], [IsAvailable], [HireDate])
VALUES ('D0000003-0000-0000-0000-000000000006', N'Frank', N'Yamamoto', N'frank.yamamoto@helpdesk.com', '555-0106', 'D0000002-0000-0000-0000-000000000003', 2, 0, '2022-11-05')
GO
INSERT INTO [sample_hd].[SupportAgent] ([ID], [FirstName], [LastName], [Email], [Phone], [DepartmentID], [Tier], [IsAvailable], [HireDate])
VALUES ('D0000003-0000-0000-0000-000000000007', N'Grace', N'Nkemelu', N'grace.nkemelu@helpdesk.com', '555-0107', 'D0000002-0000-0000-0000-000000000001', 1, 1, '2024-01-08')
GO
INSERT INTO [sample_hd].[SupportAgent] ([ID], [FirstName], [LastName], [Email], [Phone], [DepartmentID], [Tier], [IsAvailable], [HireDate])
VALUES ('D0000003-0000-0000-0000-000000000008', N'Hiro', N'Tanaka', N'hiro.tanaka@helpdesk.com', '555-0108', 'D0000002-0000-0000-0000-000000000002', 1, 1, '2024-06-15')
GO

-- Categories (6 with hierarchy)
INSERT INTO [sample_hd].[Category] ([ID], [Name], [ParentCategoryID], [DepartmentID], [Description], [IsActive])
VALUES ('D0000004-0000-0000-0000-000000000001', N'Hardware', NULL, 'D0000002-0000-0000-0000-000000000001', N'Physical hardware issues and requests', 1)
GO
INSERT INTO [sample_hd].[Category] ([ID], [Name], [ParentCategoryID], [DepartmentID], [Description], [IsActive])
VALUES ('D0000004-0000-0000-0000-000000000002', N'Software', NULL, 'D0000002-0000-0000-0000-000000000002', N'Software installation, licensing, and bugs', 1)
GO
INSERT INTO [sample_hd].[Category] ([ID], [Name], [ParentCategoryID], [DepartmentID], [Description], [IsActive])
VALUES ('D0000004-0000-0000-0000-000000000003', N'Network', NULL, 'D0000002-0000-0000-0000-000000000001', N'Network connectivity and VPN issues', 1)
GO
INSERT INTO [sample_hd].[Category] ([ID], [Name], [ParentCategoryID], [DepartmentID], [Description], [IsActive])
VALUES ('D0000004-0000-0000-0000-000000000004', N'Laptop Issues', 'D0000004-0000-0000-0000-000000000001', 'D0000002-0000-0000-0000-000000000001', N'Laptop-specific hardware problems', 1)
GO
INSERT INTO [sample_hd].[Category] ([ID], [Name], [ParentCategoryID], [DepartmentID], [Description], [IsActive])
VALUES ('D0000004-0000-0000-0000-000000000005', N'Email & Calendar', 'D0000004-0000-0000-0000-000000000002', 'D0000002-0000-0000-0000-000000000002', N'Email client and calendar sync issues', 1)
GO
INSERT INTO [sample_hd].[Category] ([ID], [Name], [ParentCategoryID], [DepartmentID], [Description], [IsActive])
VALUES ('D0000004-0000-0000-0000-000000000006', N'Security Incidents', NULL, 'D0000002-0000-0000-0000-000000000003', N'Security breach reports and access issues', 1)
GO

-- Tickets (15)
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000001', N'HD-2024-0001', N'Laptop won''t power on', N'My ThinkPad X1 Carbon won''t turn on after the weekend. Tried holding power button for 30 seconds, no response. Charging light is off.', N'jsmith@company.com', N'John Smith', 'D0000004-0000-0000-0000-000000000004', 'D0000001-0000-0000-0000-000000000002', 'D0000003-0000-0000-0000-000000000001', 'InProgress', '2024-11-01 08:30:00', '2024-11-01 09:15:00', NULL, NULL, '2024-11-02 08:30:00', 0)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000002', N'HD-2024-0002', N'Cannot connect to VPN', N'VPN client shows "Connection timed out" error when trying to connect from home. Was working fine last week. Running Windows 11.', N'mjones@company.com', N'Mary Jones', 'D0000004-0000-0000-0000-000000000003', 'D0000001-0000-0000-0000-000000000002', 'D0000003-0000-0000-0000-000000000002', 'Resolved', '2024-10-28 14:20:00', '2024-10-29 10:00:00', '2024-10-29 10:00:00', NULL, '2024-10-29 14:20:00', 0)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000003', N'HD-2024-0003', N'Outlook keeps crashing', N'Outlook 365 crashes every time I try to open a calendar invite. Error code 0x80040154. Reinstall did not help.', N'rpatel@company.com', N'Raj Patel', 'D0000004-0000-0000-0000-000000000005', 'D0000001-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000003', 'Waiting', '2024-11-02 09:00:00', '2024-11-03 11:30:00', NULL, NULL, '2024-11-03 09:00:00', 0)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000004', N'HD-2024-0004', N'Suspected phishing email received', N'Received an email from "IT Department" asking me to click a link to verify my password. The sender address looks suspicious: it-dept@c0mpany-secure.net', N'lwilson@company.com', N'Lisa Wilson', 'D0000004-0000-0000-0000-000000000006', 'D0000001-0000-0000-0000-000000000001', 'D0000003-0000-0000-0000-000000000005', 'Closed', '2024-10-25 16:45:00', '2024-10-26 09:00:00', '2024-10-25 18:00:00', '2024-10-26 09:00:00', '2024-10-25 17:00:00', 1)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000005', N'HD-2024-0005', N'New software installation request', N'Need Adobe Creative Suite installed on my workstation for the marketing campaign. Manager approved budget code MC-2024-Q4.', N'kgarcia@company.com', N'Karen Garcia', 'D0000004-0000-0000-0000-000000000002', 'D0000001-0000-0000-0000-000000000004', 'D0000003-0000-0000-0000-000000000004', 'Open', '2024-11-04 10:00:00', '2024-11-04 10:00:00', NULL, NULL, NULL, 0)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000006', N'HD-2024-0006', N'Server room UPS alarm', N'UPS unit 3 in server room B is showing a battery fault alarm. Backup power may be compromised.', N'ops@company.com', N'Operations Team', 'D0000004-0000-0000-0000-000000000001', 'D0000001-0000-0000-0000-000000000001', 'D0000003-0000-0000-0000-000000000001', 'InProgress', '2024-11-04 06:15:00', '2024-11-04 06:30:00', NULL, NULL, '2024-11-04 08:15:00', 1)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000007', N'HD-2024-0007', N'Printer not working on 3rd floor', N'The HP LaserJet on the 3rd floor near conference room C is showing "Paper Jam" but there is no paper stuck. Power cycling did not help.', N'tlee@company.com', N'Tom Lee', 'D0000004-0000-0000-0000-000000000001', 'D0000001-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000007', 'Open', '2024-11-04 11:30:00', '2024-11-04 11:30:00', NULL, NULL, '2024-11-05 11:30:00', 0)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000008', N'HD-2024-0008', N'Password reset needed', N'I am locked out of my Active Directory account after too many failed attempts. Need immediate reset.', N'scohen@company.com', N'Sarah Cohen', 'D0000004-0000-0000-0000-000000000006', 'D0000001-0000-0000-0000-000000000002', 'D0000003-0000-0000-0000-000000000006', 'Resolved', '2024-10-30 07:45:00', '2024-10-30 08:10:00', '2024-10-30 08:10:00', '2024-10-30 08:30:00', '2024-10-30 08:45:00', 0)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000009', N'HD-2024-0009', N'WiFi dropping intermittently in Building A', N'Multiple users in Building A reporting WiFi disconnects every 10-15 minutes. Started after the firmware update on Friday.', N'netops@company.com', N'Network Ops', 'D0000004-0000-0000-0000-000000000003', 'D0000001-0000-0000-0000-000000000002', 'D0000003-0000-0000-0000-000000000002', 'InProgress', '2024-11-04 08:00:00', '2024-11-04 10:00:00', NULL, NULL, '2024-11-04 16:00:00', 1)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000010', N'HD-2024-0010', N'Request for second monitor', N'Would like a second monitor for my desk in cubicle 4B. Current setup is a single 24-inch display.', N'azhang@company.com', N'Amy Zhang', 'D0000004-0000-0000-0000-000000000001', 'D0000001-0000-0000-0000-000000000004', NULL, 'Open', '2024-11-04 13:00:00', '2024-11-04 13:00:00', NULL, NULL, NULL, 0)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000011', N'HD-2024-0011', N'Calendar sync issue between phone and desktop', N'My iPhone calendar is not syncing with Outlook desktop. Last sync was 3 days ago. Phone is on iOS 17.', N'bfreeman@company.com', N'Brian Freeman', 'D0000004-0000-0000-0000-000000000005', 'D0000001-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000008', 'Open', '2024-11-04 14:30:00', '2024-11-04 14:30:00', NULL, NULL, '2024-11-05 14:30:00', 0)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000012', N'HD-2024-0012', N'Malware detected on workstation', N'Antivirus flagged trojan activity on WS-3F-012. Machine has been isolated from the network per protocol.', N'security@company.com', N'Security Team', 'D0000004-0000-0000-0000-000000000006', 'D0000001-0000-0000-0000-000000000001', 'D0000003-0000-0000-0000-000000000005', 'InProgress', '2024-11-04 15:00:00', '2024-11-04 15:15:00', NULL, NULL, '2024-11-04 17:00:00', 1)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000013', N'HD-2024-0013', N'Slow application performance', N'Our internal CRM application is extremely slow today. Page loads taking 15-20 seconds. Other websites are fine.', N'dmiller@company.com', N'Diana Miller', 'D0000004-0000-0000-0000-000000000002', 'D0000001-0000-0000-0000-000000000002', 'D0000003-0000-0000-0000-000000000003', 'Waiting', '2024-11-04 09:30:00', '2024-11-04 11:00:00', NULL, NULL, '2024-11-04 17:30:00', 0)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000014', N'HD-2024-0014', N'New employee onboarding - IT setup', N'New hire starting Monday 11/11. Need laptop, monitor, dock, AD account, email, and VPN access. See attached onboarding form.', N'hr@company.com', N'HR Department', 'D0000004-0000-0000-0000-000000000001', 'D0000001-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000004', 'Open', '2024-11-04 16:00:00', '2024-11-04 16:00:00', NULL, NULL, '2024-11-08 17:00:00', 0)
GO
INSERT INTO [sample_hd].[Ticket] ([ID], [TicketNumber], [Subject], [Description], [RequestorEmail], [RequestorName], [CategoryID], [PriorityID], [AssignedAgentID], [Status], [CreatedAt], [UpdatedAt], [ResolvedAt], [ClosedAt], [DueDate], [IsEscalated])
VALUES ('D0000005-0000-0000-0000-000000000015', N'HD-2024-0015', N'License renewal for Visual Studio', N'Visual Studio Enterprise license expires next week. Need renewal for development team (12 seats). PO attached.', N'devlead@company.com', N'Dev Lead', 'D0000004-0000-0000-0000-000000000002', 'D0000001-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000003', 'Resolved', '2024-10-20 10:00:00', '2024-10-22 14:00:00', '2024-10-22 14:00:00', '2024-10-23 09:00:00', '2024-10-27 10:00:00', 0)
GO

-- TicketComments (various)
INSERT INTO [sample_hd].[TicketComment] ([ID], [TicketID], [AuthorEmail], [AuthorName], [Body], [IsInternal], [CreatedAt])
VALUES ('D0000006-0000-0000-0000-000000000001', 'D0000005-0000-0000-0000-000000000001', N'alice.chen@helpdesk.com', N'Alice Chen', N'Checked power supply and battery. Battery is completely dead. Ordering replacement battery under warranty.', 1, '2024-11-01 09:15:00')
GO
INSERT INTO [sample_hd].[TicketComment] ([ID], [TicketID], [AuthorEmail], [AuthorName], [Body], [IsInternal], [CreatedAt])
VALUES ('D0000006-0000-0000-0000-000000000002', 'D0000005-0000-0000-0000-000000000001', N'alice.chen@helpdesk.com', N'Alice Chen', N'Hi John, we''ve identified a dead battery. A replacement has been ordered and should arrive in 1-2 business days.', 0, '2024-11-01 09:20:00')
GO
INSERT INTO [sample_hd].[TicketComment] ([ID], [TicketID], [AuthorEmail], [AuthorName], [Body], [IsInternal], [CreatedAt])
VALUES ('D0000006-0000-0000-0000-000000000003', 'D0000005-0000-0000-0000-000000000002', N'bob.martinez@helpdesk.com', N'Bob Martinez', N'VPN certificate had expired. Renewed the certificate and pushed updated config to the client. User confirmed connectivity restored.', 0, '2024-10-29 10:00:00')
GO
INSERT INTO [sample_hd].[TicketComment] ([ID], [TicketID], [AuthorEmail], [AuthorName], [Body], [IsInternal], [CreatedAt])
VALUES ('D0000006-0000-0000-0000-000000000004', 'D0000005-0000-0000-0000-000000000003', N'carol.okafor@helpdesk.com', N'Carol Okafor', N'Reproduced the crash. Appears to be a known Outlook bug with KB5031354. Waiting for Microsoft patch.', 1, '2024-11-03 11:30:00')
GO
INSERT INTO [sample_hd].[TicketComment] ([ID], [TicketID], [AuthorEmail], [AuthorName], [Body], [IsInternal], [CreatedAt])
VALUES ('D0000006-0000-0000-0000-000000000005', 'D0000005-0000-0000-0000-000000000004', N'eva.kowalski@helpdesk.com', N'Eva Kowalski', N'Confirmed phishing attempt. Email originated from external server. Added sender domain to block list and sent company-wide alert.', 0, '2024-10-25 18:00:00')
GO
INSERT INTO [sample_hd].[TicketComment] ([ID], [TicketID], [AuthorEmail], [AuthorName], [Body], [IsInternal], [CreatedAt])
VALUES ('D0000006-0000-0000-0000-000000000006', 'D0000005-0000-0000-0000-000000000006', N'alice.chen@helpdesk.com', N'Alice Chen', N'UPS vendor contacted. Technician scheduled for today. Backup generator is covering load in the meantime.', 1, '2024-11-04 06:30:00')
GO
INSERT INTO [sample_hd].[TicketComment] ([ID], [TicketID], [AuthorEmail], [AuthorName], [Body], [IsInternal], [CreatedAt])
VALUES ('D0000006-0000-0000-0000-000000000007', 'D0000005-0000-0000-0000-000000000009', N'bob.martinez@helpdesk.com', N'Bob Martinez', N'Identified rogue AP causing channel interference. Firmware rollback in progress on affected access points.', 1, '2024-11-04 10:00:00')
GO
INSERT INTO [sample_hd].[TicketComment] ([ID], [TicketID], [AuthorEmail], [AuthorName], [Body], [IsInternal], [CreatedAt])
VALUES ('D0000006-0000-0000-0000-000000000008', 'D0000005-0000-0000-0000-000000000012', N'eva.kowalski@helpdesk.com', N'Eva Kowalski', N'Forensic image taken of the disk. Running full analysis. Initial indicators point to drive-by download from compromised ad network.', 1, '2024-11-04 15:15:00')
GO
INSERT INTO [sample_hd].[TicketComment] ([ID], [TicketID], [AuthorEmail], [AuthorName], [Body], [IsInternal], [CreatedAt])
VALUES ('D0000006-0000-0000-0000-000000000009', 'D0000005-0000-0000-0000-000000000013', N'carol.okafor@helpdesk.com', N'Carol Okafor', N'CRM app server logs show high CPU on database tier. Escalated to DBA team for query optimization. Waiting on their response.', 1, '2024-11-04 11:00:00')
GO
INSERT INTO [sample_hd].[TicketComment] ([ID], [TicketID], [AuthorEmail], [AuthorName], [Body], [IsInternal], [CreatedAt])
VALUES ('D0000006-0000-0000-0000-000000000010', 'D0000005-0000-0000-0000-000000000015', N'carol.okafor@helpdesk.com', N'Carol Okafor', N'License renewal processed through Microsoft VLSC. New keys distributed to dev team leads via secure channel.', 0, '2024-10-22 14:00:00')
GO

-- TicketAttachments
INSERT INTO [sample_hd].[TicketAttachment] ([ID], [TicketID], [FileName], [FileSize], [MimeType], [StoragePath], [UploadedAt], [UploadedBy])
VALUES ('D0000007-0000-0000-0000-000000000001', 'D0000005-0000-0000-0000-000000000001', N'laptop-photo.jpg', 245760, 'image/jpeg', N'/attachments/2024/11/01/laptop-photo.jpg', '2024-11-01 08:31:00', N'jsmith@company.com')
GO
INSERT INTO [sample_hd].[TicketAttachment] ([ID], [TicketID], [FileName], [FileSize], [MimeType], [StoragePath], [UploadedAt], [UploadedBy])
VALUES ('D0000007-0000-0000-0000-000000000002', 'D0000005-0000-0000-0000-000000000003', N'outlook-error-screenshot.png', 182400, 'image/png', N'/attachments/2024/11/02/outlook-error.png', '2024-11-02 09:01:00', N'rpatel@company.com')
GO
INSERT INTO [sample_hd].[TicketAttachment] ([ID], [TicketID], [FileName], [FileSize], [MimeType], [StoragePath], [UploadedAt], [UploadedBy])
VALUES ('D0000007-0000-0000-0000-000000000003', 'D0000005-0000-0000-0000-000000000004', N'suspicious-email-header.txt', 4096, 'text/plain', N'/attachments/2024/10/25/email-header.txt', '2024-10-25 16:46:00', N'lwilson@company.com')
GO
INSERT INTO [sample_hd].[TicketAttachment] ([ID], [TicketID], [FileName], [FileSize], [MimeType], [StoragePath], [UploadedAt], [UploadedBy])
VALUES ('D0000007-0000-0000-0000-000000000004', 'D0000005-0000-0000-0000-000000000014', N'onboarding-form.pdf', 524288, 'application/pdf', N'/attachments/2024/11/04/onboarding.pdf', '2024-11-04 16:01:00', N'hr@company.com')
GO
INSERT INTO [sample_hd].[TicketAttachment] ([ID], [TicketID], [FileName], [FileSize], [MimeType], [StoragePath], [UploadedAt], [UploadedBy])
VALUES ('D0000007-0000-0000-0000-000000000005', 'D0000005-0000-0000-0000-000000000015', N'purchase-order-VS2024.pdf', 102400, 'application/pdf', N'/attachments/2024/10/20/po-vs2024.pdf', '2024-10-20 10:01:00', N'devlead@company.com')
GO

-- KnowledgeArticles (5)
INSERT INTO [sample_hd].[KnowledgeArticle] ([ID], [Title], [Slug], [Body], [CategoryID], [AuthorAgentID], [IsPublished], [ViewCount], [HelpfulCount], [CreatedAt], [UpdatedAt])
VALUES ('D0000008-0000-0000-0000-000000000001', N'How to Connect to VPN from Home', N'how-to-connect-vpn-from-home', N'Step 1: Open the GlobalProtect VPN client. Step 2: Enter the portal address vpn.company.com. Step 3: Log in with your Active Directory credentials. Step 4: Click Connect. If you experience issues, check that your internet connection is stable and try restarting the VPN client.', 'D0000004-0000-0000-0000-000000000003', 'D0000003-0000-0000-0000-000000000002', 1, 342, 287, '2024-06-15 10:00:00', '2024-09-20 14:30:00')
GO
INSERT INTO [sample_hd].[KnowledgeArticle] ([ID], [Title], [Slug], [Body], [CategoryID], [AuthorAgentID], [IsPublished], [ViewCount], [HelpfulCount], [CreatedAt], [UpdatedAt])
VALUES ('D0000008-0000-0000-0000-000000000002', N'Password Reset Self-Service Guide', N'password-reset-self-service', N'You can reset your own password using the self-service portal at https://passwordreset.company.com. You will need your registered mobile phone for MFA verification. If you are fully locked out, contact the help desk at ext. 4357.', 'D0000004-0000-0000-0000-000000000006', 'D0000003-0000-0000-0000-000000000005', 1, 891, 756, '2024-03-10 08:00:00', '2024-08-15 11:00:00')
GO
INSERT INTO [sample_hd].[KnowledgeArticle] ([ID], [Title], [Slug], [Body], [CategoryID], [AuthorAgentID], [IsPublished], [ViewCount], [HelpfulCount], [CreatedAt], [UpdatedAt])
VALUES ('D0000008-0000-0000-0000-000000000003', N'Setting Up Your New Laptop', N'setting-up-new-laptop', N'Welcome to the company! This guide walks you through initial laptop setup. Step 1: Power on and connect to WiFi network "CORP-SETUP". Step 2: Sign in with the temporary credentials from your welcome email. Step 3: Run Windows Update. Step 4: Install required software from the Software Center.', 'D0000004-0000-0000-0000-000000000004', 'D0000003-0000-0000-0000-000000000001', 1, 156, 134, '2024-07-01 09:00:00', '2024-10-01 13:00:00')
GO
INSERT INTO [sample_hd].[KnowledgeArticle] ([ID], [Title], [Slug], [Body], [CategoryID], [AuthorAgentID], [IsPublished], [ViewCount], [HelpfulCount], [CreatedAt], [UpdatedAt])
VALUES ('D0000008-0000-0000-0000-000000000004', N'Reporting a Security Incident', N'reporting-security-incident', N'If you suspect a security breach, phishing, or unauthorized access: 1. Do NOT click suspicious links. 2. Forward phishing emails to security@company.com. 3. Call the security hotline at ext. 9111 for urgent incidents. 4. Disconnect from the network if instructed. All reports are treated confidentially.', 'D0000004-0000-0000-0000-000000000006', 'D0000003-0000-0000-0000-000000000005', 1, 203, 178, '2024-04-20 15:00:00', '2024-10-25 19:00:00')
GO
INSERT INTO [sample_hd].[KnowledgeArticle] ([ID], [Title], [Slug], [Body], [CategoryID], [AuthorAgentID], [IsPublished], [ViewCount], [HelpfulCount], [CreatedAt], [UpdatedAt])
VALUES ('D0000008-0000-0000-0000-000000000005', N'Troubleshooting Outlook Calendar Sync (Draft)', N'troubleshooting-outlook-calendar-sync', N'Common fixes for Outlook calendar synchronization issues: 1. Check that your Exchange account is properly configured. 2. Clear the Outlook cache folder. 3. Remove and re-add the Exchange account. 4. Ensure your mobile device has the latest OS updates.', 'D0000004-0000-0000-0000-000000000005', 'D0000003-0000-0000-0000-000000000003', 0, 0, 0, '2024-11-03 12:00:00', '2024-11-03 12:00:00')
GO

-- TicketTags
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000001', 'D0000005-0000-0000-0000-000000000001', N'hardware', '2024-11-01 08:30:00')
GO
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000002', 'D0000005-0000-0000-0000-000000000001', N'warranty', '2024-11-01 09:15:00')
GO
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000003', 'D0000005-0000-0000-0000-000000000002', N'vpn', '2024-10-28 14:20:00')
GO
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000004', 'D0000005-0000-0000-0000-000000000002', N'remote-access', '2024-10-28 14:20:00')
GO
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000005', 'D0000005-0000-0000-0000-000000000004', N'phishing', '2024-10-25 16:45:00')
GO
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000006', 'D0000005-0000-0000-0000-000000000004', N'security-incident', '2024-10-25 16:45:00')
GO
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000007', 'D0000005-0000-0000-0000-000000000006', N'critical-infrastructure', '2024-11-04 06:15:00')
GO
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000008', 'D0000005-0000-0000-0000-000000000009', N'wifi', '2024-11-04 08:00:00')
GO
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000009', 'D0000005-0000-0000-0000-000000000009', N'building-a', '2024-11-04 08:00:00')
GO
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000010', 'D0000005-0000-0000-0000-000000000012', N'malware', '2024-11-04 15:00:00')
GO
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000011', 'D0000005-0000-0000-0000-000000000012', N'security-incident', '2024-11-04 15:00:00')
GO
INSERT INTO [sample_hd].[TicketTag] ([ID], [TicketID], [TagName], [AddedAt])
VALUES ('D0000009-0000-0000-0000-000000000012', 'D0000005-0000-0000-0000-000000000014', N'onboarding', '2024-11-04 16:00:00')
GO
