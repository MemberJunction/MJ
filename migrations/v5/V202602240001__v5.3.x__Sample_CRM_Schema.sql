-- ============================================================================
-- Sample CRM Schema for PostgreSQL Parity Testing
-- ============================================================================
-- Purpose: Creates a realistic CRM application schema with 12 tables to
--          validate that MemberJunction produces identical results whether
--          backed by SQL Server or PostgreSQL.
-- Schema:  sample_crm
-- Tables:  Company, Contact, Deal, Activity, Product, DealProduct,
--          Tag, CompanyTag, ContactTag, DealTag, Pipeline, PipelineStage
-- ============================================================================

-- Register the schema
CREATE SCHEMA sample_crm;
GO

-- Register in SchemaInfo so CodeGen discovers it
INSERT INTO [${flyway:defaultSchema}].[SchemaInfo]
    ([ID], [SchemaName], [EntityIDMin], [EntityIDMax], [Comments], [Description])
VALUES
    ('A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
     'sample_crm',
     2000001,
     3000000,
     'Sample CRM schema for PostgreSQL parity testing',
     'A realistic CRM application schema used to validate cross-database parity between SQL Server and PostgreSQL.');
GO

-- ============================================================================
-- 1. Company
-- ============================================================================
CREATE TABLE [sample_crm].[Company] (
    [ID]                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]              NVARCHAR(200)    NOT NULL,
    [Industry]          NVARCHAR(100)    NULL,
    [Website]           NVARCHAR(500)    NULL,
    [Phone]             NVARCHAR(50)     NULL,
    [AnnualRevenue]     DECIMAL(18,2)    NULL,
    [EmployeeCount]     INT              NULL,
    [Status]            NVARCHAR(20)     NOT NULL CONSTRAINT [CK_Company_Status]
                        CHECK ([Status] IN ('Active','Inactive','Prospect','Churned')),
    [Notes]             NVARCHAR(MAX)    NULL,
    [CreatedByUserID]   UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Company_CreatedByUser] FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [PK_Company] PRIMARY KEY ([ID])
);
GO

-- Company extended properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Organizations that are customers, prospects, or partners',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Company';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key for the company record',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Company', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Legal or trading name of the company',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Company', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Industry vertical the company operates in',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Company', @level2type=N'COLUMN', @level2name=N'Industry';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Company website URL',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Company', @level2type=N'COLUMN', @level2name=N'Website';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Main phone number',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Company', @level2type=N'COLUMN', @level2name=N'Phone';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Estimated annual revenue in USD',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Company', @level2type=N'COLUMN', @level2name=N'AnnualRevenue';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Approximate number of employees',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Company', @level2type=N'COLUMN', @level2name=N'EmployeeCount';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current relationship status: Active, Inactive, Prospect, or Churned',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Company', @level2type=N'COLUMN', @level2name=N'Status';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Free-form notes about the company',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Company', @level2type=N'COLUMN', @level2name=N'Notes';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'User who created this company record',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Company', @level2type=N'COLUMN', @level2name=N'CreatedByUserID';
GO

-- ============================================================================
-- 2. Contact
-- ============================================================================
CREATE TABLE [sample_crm].[Contact] (
    [ID]                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [CompanyID]            UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_Contact_Company] FOREIGN KEY REFERENCES [sample_crm].[Company]([ID]),
    [FirstName]            NVARCHAR(100)    NOT NULL,
    [LastName]             NVARCHAR(100)    NOT NULL,
    [Email]                NVARCHAR(200)    NULL,
    [Phone]                NVARCHAR(50)     NULL,
    [Title]                NVARCHAR(100)    NULL,
    [Department]           NVARCHAR(100)    NULL,
    [ReportsToContactID]   UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Contact_ReportsTo] FOREIGN KEY REFERENCES [sample_crm].[Contact]([ID]),
    [IsPrimary]            BIT              NOT NULL DEFAULT 0,
    [Status]               NVARCHAR(20)     NOT NULL CONSTRAINT [CK_Contact_Status]
                           CHECK ([Status] IN ('Active','Inactive','Prospect','Churned')),
    [Notes]                NVARCHAR(MAX)    NULL,
    [CreatedByUserID]      UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Contact_CreatedByUser] FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [PK_Contact] PRIMARY KEY ([ID])
);
GO

-- Contact extended properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Individual people associated with companies',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key for the contact record',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Company this contact belongs to',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'CompanyID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Contact first name',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'FirstName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Contact last name',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'LastName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Email address',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'Email';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Direct phone number',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'Phone';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Job title',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'Title';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Department within the company',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'Department';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Self-referential FK to the contact this person reports to',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'ReportsToContactID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this is the primary contact for the company',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'IsPrimary';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current status: Active, Inactive, Prospect, or Churned',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'Status';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Free-form notes about the contact',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'Notes';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'User who created this contact record',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Contact', @level2type=N'COLUMN', @level2name=N'CreatedByUserID';
GO

-- ============================================================================
-- 3. Deal
-- ============================================================================
CREATE TABLE [sample_crm].[Deal] (
    [ID]                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [CompanyID]          UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_Deal_Company] FOREIGN KEY REFERENCES [sample_crm].[Company]([ID]),
    [ContactID]          UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_Deal_Contact] FOREIGN KEY REFERENCES [sample_crm].[Contact]([ID]),
    [Name]               NVARCHAR(200)    NOT NULL,
    [Amount]             DECIMAL(18,2)    NULL,
    [Stage]              NVARCHAR(50)     NOT NULL CONSTRAINT [CK_Deal_Stage]
                         CHECK ([Stage] IN ('Lead','Qualified','Proposal','Negotiation','Closed Won','Closed Lost')),
    [Probability]        INT              NULL CONSTRAINT [CK_Deal_Probability]
                         CHECK ([Probability] >= 0 AND [Probability] <= 100),
    [ExpectedCloseDate]  DATETIME         NULL,
    [ActualCloseDate]    DATETIME         NULL,
    [AssignedToUserID]   UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Deal_AssignedToUser] FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    [Notes]              NVARCHAR(MAX)    NULL,
    [CreatedByUserID]    UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Deal_CreatedByUser] FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [PK_Deal] PRIMARY KEY ([ID])
);
GO

-- Deal extended properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sales opportunities being pursued with companies',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key for the deal record',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Company this deal is associated with',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'CompanyID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary contact for this deal',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'ContactID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Short name or title of the deal',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total deal value in USD',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'Amount';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current sales stage: Lead, Qualified, Proposal, Negotiation, Closed Won, or Closed Lost',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'Stage';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Win probability percentage from 0 to 100',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'Probability';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Projected close date',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'ExpectedCloseDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the deal was actually closed, null if still open',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'ActualCloseDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sales rep assigned to this deal',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'AssignedToUserID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Free-form notes about the deal',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'Notes';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'User who created this deal record',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Deal', @level2type=N'COLUMN', @level2name=N'CreatedByUserID';
GO

-- ============================================================================
-- 4. Activity
-- ============================================================================
CREATE TABLE [sample_crm].[Activity] (
    [ID]               UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Type]             NVARCHAR(20)     NOT NULL CONSTRAINT [CK_Activity_Type]
                       CHECK ([Type] IN ('Call','Email','Meeting','Note','Task')),
    [Subject]          NVARCHAR(500)    NOT NULL,
    [Description]      NVARCHAR(MAX)    NULL,
    [ActivityDate]     DATETIME         NOT NULL DEFAULT GETUTCDATE(),
    [DurationMinutes]  INT              NULL,
    [CompanyID]        UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Activity_Company] FOREIGN KEY REFERENCES [sample_crm].[Company]([ID]),
    [ContactID]        UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Activity_Contact] FOREIGN KEY REFERENCES [sample_crm].[Contact]([ID]),
    [DealID]           UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Activity_Deal] FOREIGN KEY REFERENCES [sample_crm].[Deal]([ID]),
    [CompletedAt]      DATETIME         NULL,
    [CreatedByUserID]  UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Activity_CreatedByUser] FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [PK_Activity] PRIMARY KEY ([ID])
);
GO

-- Activity extended properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Interactions and tasks related to CRM entities such as calls, emails, meetings, notes, and tasks',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key for the activity record',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Activity type: Call, Email, Meeting, Note, or Task',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity', @level2type=N'COLUMN', @level2name=N'Type';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Brief subject line for the activity',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity', @level2type=N'COLUMN', @level2name=N'Subject';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Detailed description or body of the activity',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity', @level2type=N'COLUMN', @level2name=N'Description';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the activity occurred or is scheduled',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity', @level2type=N'COLUMN', @level2name=N'ActivityDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Duration of the activity in minutes',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity', @level2type=N'COLUMN', @level2name=N'DurationMinutes';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional link to a company',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity', @level2type=N'COLUMN', @level2name=N'CompanyID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional link to a contact',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity', @level2type=N'COLUMN', @level2name=N'ContactID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional link to a deal',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity', @level2type=N'COLUMN', @level2name=N'DealID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp when the activity was completed, null if pending',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity', @level2type=N'COLUMN', @level2name=N'CompletedAt';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'User who created this activity record',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Activity', @level2type=N'COLUMN', @level2name=N'CreatedByUserID';
GO

-- ============================================================================
-- 5. Product
-- ============================================================================
CREATE TABLE [sample_crm].[Product] (
    [ID]          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]        NVARCHAR(200)    NOT NULL,
    [SKU]         NVARCHAR(50)     NULL,
    [Description] NVARCHAR(MAX)    NULL,
    [UnitPrice]   DECIMAL(18,2)    NOT NULL,
    [IsActive]    BIT              NOT NULL DEFAULT 1,
    [Category]    NVARCHAR(100)    NULL,
    CONSTRAINT [PK_Product] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_Product_SKU] UNIQUE ([SKU])
);
GO

-- Product extended properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Products and services available for sale in deals',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Product';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key for the product record',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Product display name',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stock keeping unit, unique product identifier',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'SKU';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Detailed product description',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'Description';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Standard unit price in USD',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'UnitPrice';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the product is currently available for sale',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'IsActive';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Product category for grouping and filtering',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'Category';
GO

-- ============================================================================
-- 6. DealProduct
-- ============================================================================
CREATE TABLE [sample_crm].[DealProduct] (
    [ID]        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [DealID]    UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_DealProduct_Deal] FOREIGN KEY REFERENCES [sample_crm].[Deal]([ID]),
    [ProductID] UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_DealProduct_Product] FOREIGN KEY REFERENCES [sample_crm].[Product]([ID]),
    [Quantity]  INT              NOT NULL DEFAULT 1,
    [UnitPrice] DECIMAL(18,2)    NOT NULL,
    [Discount]  DECIMAL(5,2)     NOT NULL DEFAULT 0 CONSTRAINT [CK_DealProduct_Discount]
                CHECK ([Discount] >= 0 AND [Discount] <= 100),
    CONSTRAINT [PK_DealProduct] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_DealProduct] UNIQUE ([DealID], [ProductID])
);
GO

-- DealProduct extended properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Junction table linking products to deals with pricing and quantity details',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'DealProduct';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key for the deal-product link',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'DealProduct', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Deal this product is part of',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'DealProduct', @level2type=N'COLUMN', @level2name=N'DealID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Product being sold in this deal',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'DealProduct', @level2type=N'COLUMN', @level2name=N'ProductID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of units included in the deal',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'DealProduct', @level2type=N'COLUMN', @level2name=N'Quantity';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Price per unit for this deal, may differ from catalog price',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'DealProduct', @level2type=N'COLUMN', @level2name=N'UnitPrice';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Discount percentage from 0 to 100',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'DealProduct', @level2type=N'COLUMN', @level2name=N'Discount';
GO

-- ============================================================================
-- 7. Tag
-- ============================================================================
CREATE TABLE [sample_crm].[Tag] (
    [ID]    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]  NVARCHAR(100)    NOT NULL,
    [Color] NVARCHAR(7)      NULL,
    CONSTRAINT [PK_Tag] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_Tag_Name] UNIQUE ([Name])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Labels for categorizing and filtering CRM records',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Tag';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key for the tag',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Tag', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the tag, must be unique',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Tag', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Hex color code for visual display, e.g. #FF5733',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Tag', @level2type=N'COLUMN', @level2name=N'Color';
GO

-- ============================================================================
-- 8. CompanyTag
-- ============================================================================
CREATE TABLE [sample_crm].[CompanyTag] (
    [ID]        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [CompanyID] UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_CompanyTag_Company] FOREIGN KEY REFERENCES [sample_crm].[Company]([ID]),
    [TagID]     UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_CompanyTag_Tag] FOREIGN KEY REFERENCES [sample_crm].[Tag]([ID]),
    CONSTRAINT [PK_CompanyTag] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_CompanyTag] UNIQUE ([CompanyID], [TagID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Junction table linking tags to companies',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'CompanyTag';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'CompanyTag', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The company being tagged',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'CompanyTag', @level2type=N'COLUMN', @level2name=N'CompanyID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The tag applied to the company',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'CompanyTag', @level2type=N'COLUMN', @level2name=N'TagID';
GO

-- ============================================================================
-- 9. ContactTag
-- ============================================================================
CREATE TABLE [sample_crm].[ContactTag] (
    [ID]        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ContactID] UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_ContactTag_Contact] FOREIGN KEY REFERENCES [sample_crm].[Contact]([ID]),
    [TagID]     UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_ContactTag_Tag] FOREIGN KEY REFERENCES [sample_crm].[Tag]([ID]),
    CONSTRAINT [PK_ContactTag] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_ContactTag] UNIQUE ([ContactID], [TagID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Junction table linking tags to contacts',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'ContactTag';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'ContactTag', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The contact being tagged',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'ContactTag', @level2type=N'COLUMN', @level2name=N'ContactID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The tag applied to the contact',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'ContactTag', @level2type=N'COLUMN', @level2name=N'TagID';
GO

-- ============================================================================
-- 10. DealTag
-- ============================================================================
CREATE TABLE [sample_crm].[DealTag] (
    [ID]     UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [DealID] UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_DealTag_Deal] FOREIGN KEY REFERENCES [sample_crm].[Deal]([ID]),
    [TagID]  UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_DealTag_Tag] FOREIGN KEY REFERENCES [sample_crm].[Tag]([ID]),
    CONSTRAINT [PK_DealTag] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_DealTag] UNIQUE ([DealID], [TagID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Junction table linking tags to deals',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'DealTag';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'DealTag', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The deal being tagged',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'DealTag', @level2type=N'COLUMN', @level2name=N'DealID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The tag applied to the deal',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'DealTag', @level2type=N'COLUMN', @level2name=N'TagID';
GO

-- ============================================================================
-- 11. Pipeline
-- ============================================================================
CREATE TABLE [sample_crm].[Pipeline] (
    [ID]          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]        NVARCHAR(200)    NOT NULL,
    [Description] NVARCHAR(MAX)    NULL,
    [IsDefault]   BIT              NOT NULL DEFAULT 0,
    CONSTRAINT [PK_Pipeline] PRIMARY KEY ([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sales pipelines defining the stages deals progress through',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Pipeline';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key for the pipeline',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Pipeline', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the pipeline',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Pipeline', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Description of the pipeline purpose and usage',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Pipeline', @level2type=N'COLUMN', @level2name=N'Description';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this is the default pipeline for new deals',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'Pipeline', @level2type=N'COLUMN', @level2name=N'IsDefault';
GO

-- ============================================================================
-- 12. PipelineStage
-- ============================================================================
CREATE TABLE [sample_crm].[PipelineStage] (
    [ID]           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PipelineID]   UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [FK_PipelineStage_Pipeline] FOREIGN KEY REFERENCES [sample_crm].[Pipeline]([ID]),
    [Name]         NVARCHAR(100)    NOT NULL,
    [DisplayOrder] INT              NOT NULL,
    [Probability]  INT              NOT NULL DEFAULT 0 CONSTRAINT [CK_PipelineStage_Probability]
                   CHECK ([Probability] >= 0 AND [Probability] <= 100),
    CONSTRAINT [PK_PipelineStage] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_PipelineStage] UNIQUE ([PipelineID], [Name])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Ordered stages within a sales pipeline',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'PipelineStage';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key for the pipeline stage',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'PipelineStage', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pipeline this stage belongs to',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'PipelineStage', @level2type=N'COLUMN', @level2name=N'PipelineID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stage display name',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'PipelineStage', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Ordering position within the pipeline, lower numbers appear first',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'PipelineStage', @level2type=N'COLUMN', @level2name=N'DisplayOrder';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default win probability percentage for deals entering this stage',
    @level0type=N'SCHEMA', @level0name=N'sample_crm', @level1type=N'TABLE', @level1name=N'PipelineStage', @level2type=N'COLUMN', @level2name=N'Probability';
GO

-- ============================================================================
-- SEED DATA
-- ============================================================================
-- All UUIDs are hardcoded for deterministic, reproducible testing.

-- Companies (5)
INSERT INTO [sample_crm].[Company] ([ID], [Name], [Industry], [Website], [Phone], [AnnualRevenue], [EmployeeCount], [Status], [Notes])
VALUES
    ('10000001-0001-0001-0001-000000000001', N'Acme Corporation',    N'Manufacturing',  N'https://acme.example.com',    N'+1-555-0101', 50000000.00,  500, N'Active',   N'Long-standing customer since 2018'),
    ('10000001-0001-0001-0001-000000000002', N'Globex Industries',   N'Technology',     N'https://globex.example.com',  N'+1-555-0102', 120000000.00, 2000, N'Active',  N'Enterprise account, multi-year contract'),
    ('10000001-0001-0001-0001-000000000003', N'Initech Solutions',   N'Consulting',     N'https://initech.example.com', N'+1-555-0103', 15000000.00,  150, N'Prospect', N'Initial discovery call completed'),
    ('10000001-0001-0001-0001-000000000004', N'Umbrella Health',     N'Healthcare',     N'https://umbrella.example.com',N'+1-555-0104', 80000000.00,  1200, N'Active',  N'Key account in healthcare vertical'),
    ('10000001-0001-0001-0001-000000000005', N'Stark Renewable',     N'Energy',         N'https://stark.example.com',   N'+1-555-0105', 200000000.00, 5000, N'Inactive',N'Paused engagement, revisit Q3');
GO

-- Contacts (10)
INSERT INTO [sample_crm].[Contact] ([ID], [CompanyID], [FirstName], [LastName], [Email], [Phone], [Title], [Department], [ReportsToContactID], [IsPrimary], [Status])
VALUES
    ('20000001-0001-0001-0001-000000000001', '10000001-0001-0001-0001-000000000001', N'Alice',   N'Johnson',  N'alice.johnson@acme.example.com',    N'+1-555-1001', N'VP of Engineering',    N'Engineering',  NULL,                                        1, N'Active'),
    ('20000001-0001-0001-0001-000000000002', '10000001-0001-0001-0001-000000000001', N'Bob',     N'Smith',    N'bob.smith@acme.example.com',        N'+1-555-1002', N'Director of IT',       N'IT',           '20000001-0001-0001-0001-000000000001',      0, N'Active'),
    ('20000001-0001-0001-0001-000000000003', '10000001-0001-0001-0001-000000000002', N'Carol',   N'Williams', N'carol.williams@globex.example.com', N'+1-555-1003', N'CTO',                  N'Technology',   NULL,                                        1, N'Active'),
    ('20000001-0001-0001-0001-000000000004', '10000001-0001-0001-0001-000000000002', N'David',   N'Brown',    N'david.brown@globex.example.com',    N'+1-555-1004', N'Senior Architect',     N'Technology',   '20000001-0001-0001-0001-000000000003',      0, N'Active'),
    ('20000001-0001-0001-0001-000000000005', '10000001-0001-0001-0001-000000000002', N'Emma',    N'Davis',    N'emma.davis@globex.example.com',     N'+1-555-1005', N'Procurement Manager',  N'Procurement',  NULL,                                        0, N'Active'),
    ('20000001-0001-0001-0001-000000000006', '10000001-0001-0001-0001-000000000003', N'Frank',   N'Miller',   N'frank.miller@initech.example.com',  N'+1-555-1006', N'CEO',                  N'Executive',    NULL,                                        1, N'Prospect'),
    ('20000001-0001-0001-0001-000000000007', '10000001-0001-0001-0001-000000000003', N'Grace',   N'Wilson',   N'grace.wilson@initech.example.com',  N'+1-555-1007', N'Head of Operations',   N'Operations',   '20000001-0001-0001-0001-000000000006',      0, N'Prospect'),
    ('20000001-0001-0001-0001-000000000008', '10000001-0001-0001-0001-000000000004', N'Henry',   N'Taylor',   N'henry.taylor@umbrella.example.com', N'+1-555-1008', N'Chief Medical Officer', N'Medical',     NULL,                                        1, N'Active'),
    ('20000001-0001-0001-0001-000000000009', '10000001-0001-0001-0001-000000000004', N'Ivy',     N'Anderson', N'ivy.anderson@umbrella.example.com', N'+1-555-1009', N'IT Director',          N'IT',           NULL,                                        0, N'Active'),
    ('20000001-0001-0001-0001-000000000010', '10000001-0001-0001-0001-000000000005', N'Jack',    N'Thomas',   N'jack.thomas@stark.example.com',     N'+1-555-1010', N'VP of Partnerships',   N'Business Dev', NULL,                                        1, N'Inactive');
GO

-- Deals (6)
INSERT INTO [sample_crm].[Deal] ([ID], [CompanyID], [ContactID], [Name], [Amount], [Stage], [Probability], [ExpectedCloseDate], [ActualCloseDate], [Notes])
VALUES
    ('30000001-0001-0001-0001-000000000001', '10000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', N'Acme Platform Upgrade',        250000.00,  N'Negotiation',  75,  '2026-04-15', NULL,          N'Final pricing under review'),
    ('30000001-0001-0001-0001-000000000002', '10000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000003', N'Globex Enterprise License',    1200000.00, N'Closed Won',   100, '2026-01-30', '2026-01-28', N'Multi-year enterprise agreement signed'),
    ('30000001-0001-0001-0001-000000000003', '10000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000005', N'Globex Add-On Services',       180000.00,  N'Proposal',     50,  '2026-05-01', NULL,          N'Scope being finalized'),
    ('30000001-0001-0001-0001-000000000004', '10000001-0001-0001-0001-000000000003', '20000001-0001-0001-0001-000000000006', N'Initech Discovery Package',    75000.00,   N'Qualified',    30,  '2026-06-30', NULL,          N'Initial assessment phase'),
    ('30000001-0001-0001-0001-000000000005', '10000001-0001-0001-0001-000000000004', '20000001-0001-0001-0001-000000000008', N'Umbrella Data Integration',    500000.00,  N'Proposal',     60,  '2026-03-31', NULL,          N'Technical POC in progress'),
    ('30000001-0001-0001-0001-000000000006', '10000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000010', N'Stark Renewal FY2026',         350000.00,  N'Closed Lost',  0,   '2026-02-01', '2026-02-05', N'Lost to competitor, price sensitivity');
GO

-- Products (5)
INSERT INTO [sample_crm].[Product] ([ID], [Name], [SKU], [Description], [UnitPrice], [IsActive], [Category])
VALUES
    ('40000001-0001-0001-0001-000000000001', N'Platform License',    N'PLT-001', N'Annual platform subscription license',    50000.00,  1, N'Software'),
    ('40000001-0001-0001-0001-000000000002', N'Professional Services',N'SVC-001', N'Implementation and consulting services',  200.00,    1, N'Services'),
    ('40000001-0001-0001-0001-000000000003', N'Data Integration',    N'INT-001', N'Data integration module add-on',          25000.00,  1, N'Software'),
    ('40000001-0001-0001-0001-000000000004', N'Training Package',    N'TRN-001', N'5-day on-site training for up to 20 users',15000.00, 1, N'Services'),
    ('40000001-0001-0001-0001-000000000005', N'Premium Support',     N'SUP-001', N'24/7 premium support plan',               10000.00,  1, N'Support');
GO

-- DealProducts (8)
INSERT INTO [sample_crm].[DealProduct] ([ID], [DealID], [ProductID], [Quantity], [UnitPrice], [Discount])
VALUES
    ('50000001-0001-0001-0001-000000000001', '30000001-0001-0001-0001-000000000001', '40000001-0001-0001-0001-000000000001', 3,   50000.00,  10.00),
    ('50000001-0001-0001-0001-000000000002', '30000001-0001-0001-0001-000000000001', '40000001-0001-0001-0001-000000000002', 100, 200.00,    0.00),
    ('50000001-0001-0001-0001-000000000003', '30000001-0001-0001-0001-000000000002', '40000001-0001-0001-0001-000000000001', 20,  50000.00,  15.00),
    ('50000001-0001-0001-0001-000000000004', '30000001-0001-0001-0001-000000000002', '40000001-0001-0001-0001-000000000003', 5,   25000.00,  5.00),
    ('50000001-0001-0001-0001-000000000005', '30000001-0001-0001-0001-000000000002', '40000001-0001-0001-0001-000000000005', 1,   10000.00,  0.00),
    ('50000001-0001-0001-0001-000000000006', '30000001-0001-0001-0001-000000000003', '40000001-0001-0001-0001-000000000002', 50,  200.00,    0.00),
    ('50000001-0001-0001-0001-000000000007', '30000001-0001-0001-0001-000000000004', '40000001-0001-0001-0001-000000000004', 1,   15000.00,  0.00),
    ('50000001-0001-0001-0001-000000000008', '30000001-0001-0001-0001-000000000005', '40000001-0001-0001-0001-000000000003', 10,  25000.00,  8.00);
GO

-- Activities (8)
INSERT INTO [sample_crm].[Activity] ([ID], [Type], [Subject], [Description], [ActivityDate], [DurationMinutes], [CompanyID], [ContactID], [DealID], [CompletedAt])
VALUES
    ('60000001-0001-0001-0001-000000000001', N'Call',    N'Initial discovery call with Acme',           N'Discussed platform needs and timeline',         '2026-01-10 14:00:00', 45,  '10000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', '30000001-0001-0001-0001-000000000001', '2026-01-10 14:45:00'),
    ('60000001-0001-0001-0001-000000000002', N'Email',   N'Proposal sent to Globex',                   N'Attached enterprise license proposal v3',       '2026-01-15 09:00:00', NULL,'10000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000003', '30000001-0001-0001-0001-000000000002', '2026-01-15 09:05:00'),
    ('60000001-0001-0001-0001-000000000003', N'Meeting', N'Technical deep-dive with Globex engineering',N'Reviewed architecture and integration points',  '2026-01-20 10:00:00', 120, '10000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000004', '30000001-0001-0001-0001-000000000002', '2026-01-20 12:00:00'),
    ('60000001-0001-0001-0001-000000000004', N'Note',    N'Initech CEO interested in pilot program',    N'Frank mentioned budget approval expected by Q2', '2026-02-01 16:00:00', NULL,'10000001-0001-0001-0001-000000000003', '20000001-0001-0001-0001-000000000006', '30000001-0001-0001-0001-000000000004', NULL),
    ('60000001-0001-0001-0001-000000000005', N'Task',    N'Prepare Umbrella POC environment',           N'Set up sandbox with sample health data',        '2026-02-05 08:00:00', NULL,'10000001-0001-0001-0001-000000000004', '20000001-0001-0001-0001-000000000009', '30000001-0001-0001-0001-000000000005', NULL),
    ('60000001-0001-0001-0001-000000000006', N'Call',    N'Stark renewal negotiation',                  N'Discussed pricing concerns with Jack',          '2026-01-25 11:00:00', 30,  '10000001-0001-0001-0001-000000000005', '20000001-0001-0001-0001-000000000010', '30000001-0001-0001-0001-000000000006', '2026-01-25 11:30:00'),
    ('60000001-0001-0001-0001-000000000007', N'Email',   N'Follow-up with Acme on pricing',             N'Sent revised pricing sheet per Alices request', '2026-02-10 13:00:00', NULL,'10000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', '30000001-0001-0001-0001-000000000001', '2026-02-10 13:02:00'),
    ('60000001-0001-0001-0001-000000000008', N'Meeting', N'Quarterly business review with Umbrella',    N'Reviewed engagement metrics and roadmap',       '2026-02-15 14:00:00', 90,  '10000001-0001-0001-0001-000000000004', '20000001-0001-0001-0001-000000000008', NULL,                                   '2026-02-15 15:30:00');
GO

-- Tags (4)
INSERT INTO [sample_crm].[Tag] ([ID], [Name], [Color])
VALUES
    ('70000001-0001-0001-0001-000000000001', N'Enterprise',  N'#1E90FF'),
    ('70000001-0001-0001-0001-000000000002', N'Strategic',   N'#FF4500'),
    ('70000001-0001-0001-0001-000000000003', N'Healthcare',  N'#32CD32'),
    ('70000001-0001-0001-0001-000000000004', N'At Risk',     N'#FFD700');
GO

-- CompanyTags (5)
INSERT INTO [sample_crm].[CompanyTag] ([ID], [CompanyID], [TagID])
VALUES
    ('80000001-0001-0001-0001-000000000001', '10000001-0001-0001-0001-000000000001', '70000001-0001-0001-0001-000000000001'),
    ('80000001-0001-0001-0001-000000000002', '10000001-0001-0001-0001-000000000002', '70000001-0001-0001-0001-000000000001'),
    ('80000001-0001-0001-0001-000000000003', '10000001-0001-0001-0001-000000000002', '70000001-0001-0001-0001-000000000002'),
    ('80000001-0001-0001-0001-000000000004', '10000001-0001-0001-0001-000000000004', '70000001-0001-0001-0001-000000000003'),
    ('80000001-0001-0001-0001-000000000005', '10000001-0001-0001-0001-000000000005', '70000001-0001-0001-0001-000000000004');
GO

-- ContactTags (4)
INSERT INTO [sample_crm].[ContactTag] ([ID], [ContactID], [TagID])
VALUES
    ('81000001-0001-0001-0001-000000000001', '20000001-0001-0001-0001-000000000001', '70000001-0001-0001-0001-000000000001'),
    ('81000001-0001-0001-0001-000000000002', '20000001-0001-0001-0001-000000000003', '70000001-0001-0001-0001-000000000002'),
    ('81000001-0001-0001-0001-000000000003', '20000001-0001-0001-0001-000000000008', '70000001-0001-0001-0001-000000000003'),
    ('81000001-0001-0001-0001-000000000004', '20000001-0001-0001-0001-000000000010', '70000001-0001-0001-0001-000000000004');
GO

-- DealTags (4)
INSERT INTO [sample_crm].[DealTag] ([ID], [DealID], [TagID])
VALUES
    ('82000001-0001-0001-0001-000000000001', '30000001-0001-0001-0001-000000000001', '70000001-0001-0001-0001-000000000001'),
    ('82000001-0001-0001-0001-000000000002', '30000001-0001-0001-0001-000000000002', '70000001-0001-0001-0001-000000000002'),
    ('82000001-0001-0001-0001-000000000003', '30000001-0001-0001-0001-000000000005', '70000001-0001-0001-0001-000000000003'),
    ('82000001-0001-0001-0001-000000000004', '30000001-0001-0001-0001-000000000006', '70000001-0001-0001-0001-000000000004');
GO

-- Pipelines (2)
INSERT INTO [sample_crm].[Pipeline] ([ID], [Name], [Description], [IsDefault])
VALUES
    ('90000001-0001-0001-0001-000000000001', N'Standard Sales',   N'Default pipeline for standard B2B sales cycles',  1),
    ('90000001-0001-0001-0001-000000000002', N'Enterprise Sales', N'Extended pipeline for large enterprise engagements', 0);
GO

-- PipelineStages (10 = 5 per pipeline)
INSERT INTO [sample_crm].[PipelineStage] ([ID], [PipelineID], [Name], [DisplayOrder], [Probability])
VALUES
    ('91000001-0001-0001-0001-000000000001', '90000001-0001-0001-0001-000000000001', N'Lead',          1,  10),
    ('91000001-0001-0001-0001-000000000002', '90000001-0001-0001-0001-000000000001', N'Qualified',     2,  25),
    ('91000001-0001-0001-0001-000000000003', '90000001-0001-0001-0001-000000000001', N'Proposal',      3,  50),
    ('91000001-0001-0001-0001-000000000004', '90000001-0001-0001-0001-000000000001', N'Negotiation',   4,  75),
    ('91000001-0001-0001-0001-000000000005', '90000001-0001-0001-0001-000000000001', N'Closed',        5, 100),
    ('91000001-0001-0001-0001-000000000006', '90000001-0001-0001-0001-000000000002', N'Discovery',     1,   5),
    ('91000001-0001-0001-0001-000000000007', '90000001-0001-0001-0001-000000000002', N'Solution Design',2, 20),
    ('91000001-0001-0001-0001-000000000008', '90000001-0001-0001-0001-000000000002', N'Proof of Concept',3, 40),
    ('91000001-0001-0001-0001-000000000009', '90000001-0001-0001-0001-000000000002', N'Procurement',   4,  70),
    ('91000001-0001-0001-0001-000000000010', '90000001-0001-0001-0001-000000000002', N'Contract',      5,  90);
GO

PRINT N'Sample CRM schema created successfully with 12 tables and seed data.';
GO
