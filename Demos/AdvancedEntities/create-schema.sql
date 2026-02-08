-- =============================================================================================================
-- AdvancedEntities Demo Schema
-- MemberJunction Feature Demonstration: IS-A Type Relationships + Virtual Entities
--
-- This script creates a standalone schema with tables and sample data that demonstrate two key
-- MemberJunction features:
--
--   1. IS-A Type Relationships (Table-Per-Type Inheritance)
--      Product (root) -> Meeting (child) -> Webinar (grandchild)
--      Product (root) -> Publication (sibling child)
--
--   2. Virtual Entities (Read-Only Aggregation Views)
--      Customer + Order -> vwCustomerOrderSummary
--
-- USAGE:
--   Run this script against your SQL Server database. It creates the [AdvancedEntities] schema
--   and all tables/views/data within it. It does NOT touch the MJ metadata schema.
--   After running, follow the README for CodeGen integration steps.
--
-- IDEMPOTENT: This script drops and recreates everything. Safe to re-run.
-- =============================================================================================================

-- =============================================================================================================
-- PHASE 1: CREATE SCHEMA
-- =============================================================================================================
PRINT '=== Phase 1: Creating AdvancedEntities schema ===';

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'AdvancedEntities')
BEGIN
    EXEC('CREATE SCHEMA [AdvancedEntities]');
    PRINT '  Created schema [AdvancedEntities]';
END
ELSE
BEGIN
    PRINT '  Schema [AdvancedEntities] already exists, dropping existing objects...';

    -- Drop views first (depends on tables)
    IF OBJECT_ID('AdvancedEntities.vwCustomerOrdersByStatus', 'V') IS NOT NULL
        DROP VIEW [AdvancedEntities].[vwCustomerOrdersByStatus];
    IF OBJECT_ID('AdvancedEntities.vwOrderDetailsWithCustomer', 'V') IS NOT NULL
        DROP VIEW [AdvancedEntities].[vwOrderDetailsWithCustomer];
    IF OBJECT_ID('AdvancedEntities.vwProductCatalogOverview', 'V') IS NOT NULL
        DROP VIEW [AdvancedEntities].[vwProductCatalogOverview];
    IF OBJECT_ID('AdvancedEntities.vwCustomerOrderSummary', 'V') IS NOT NULL
        DROP VIEW [AdvancedEntities].[vwCustomerOrderSummary];

    -- Drop tables in reverse dependency order
    IF OBJECT_ID('AdvancedEntities.Webinar', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[Webinar];
    IF OBJECT_ID('AdvancedEntities.Publication', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[Publication];
    IF OBJECT_ID('AdvancedEntities.Meeting', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[Meeting];
    IF OBJECT_ID('AdvancedEntities.Product', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[Product];
    IF OBJECT_ID('AdvancedEntities.Order', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[Order];
    IF OBJECT_ID('AdvancedEntities.Customer', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[Customer];

    PRINT '  Dropped existing objects';
END
GO

-- =============================================================================================================
-- PHASE 2: IS-A HIERARCHY TABLES
--
-- The IS-A (Table-Per-Type) pattern uses a shared primary key across the inheritance chain.
-- Each child table's ID column is BOTH its primary key AND a foreign key to its parent's ID.
-- This means a Meeting record and its corresponding Product record share the exact same UUID.
--
-- Hierarchy:
--   Product (root)
--   +-- Meeting (IS-A Product)
--   |   +-- Webinar (IS-A Meeting IS-A Product)
--   +-- Publication (IS-A Product)
--
-- Key design rules:
--   - Child tables do NOT use DEFAULT NEWSEQUENTIALID() on their ID column
--   - The UUID is generated once at the root (Product) and shared down the chain
--   - Disjoint subtypes: a Product ID can appear in Meeting OR Publication, never both
-- =============================================================================================================
PRINT '=== Phase 2: Creating IS-A hierarchy tables ===';

-- ---------------------------------------------------------------------------
-- Product: Root entity in the IS-A hierarchy
-- All Meetings, Webinars, and Publications are also Products.
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[Product] (
    [ID]          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]        NVARCHAR(200)    NOT NULL,
    [Description] NVARCHAR(MAX)    NULL,
    [Price]       DECIMAL(18,2)    NOT NULL,
    [SKU]         NVARCHAR(50)     NOT NULL,
    [Category]    NVARCHAR(100)    NULL,
    [IsActive]    BIT              NOT NULL DEFAULT 1,
    CONSTRAINT [PK_AE_Product] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_AE_Product_SKU] UNIQUE ([SKU])
);
PRINT '  Created [AdvancedEntities].[Product]';

-- ---------------------------------------------------------------------------
-- Meeting: IS-A Product (child)
-- A meeting is a type of product (e.g., a conference session, workshop, training).
-- Its ID is the SAME UUID as the parent Product record.
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[Meeting] (
    [ID]              UNIQUEIDENTIFIER NOT NULL,  -- NO DEFAULT: shared PK from Product
    [StartTime]       DATETIME2        NOT NULL,
    [EndTime]         DATETIME2        NOT NULL,
    [Location]        NVARCHAR(500)    NULL,
    [MaxAttendees]    INT              NULL,
    [MeetingPlatform] NVARCHAR(100)    NULL,
    [OrganizerName]   NVARCHAR(200)    NOT NULL,
    CONSTRAINT [PK_AE_Meeting] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AE_Meeting_Product] FOREIGN KEY ([ID]) REFERENCES [AdvancedEntities].[Product]([ID])
);
PRINT '  Created [AdvancedEntities].[Meeting] (IS-A Product)';

-- ---------------------------------------------------------------------------
-- Webinar: IS-A Meeting (grandchild of Product)
-- A webinar is a specialized meeting. Its ID is the SAME UUID as the Meeting
-- record AND the Product record (three tables, one shared UUID).
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[Webinar] (
    [ID]                UNIQUEIDENTIFIER NOT NULL,  -- NO DEFAULT: shared PK from Meeting (and Product)
    [StreamingURL]      NVARCHAR(1000)   NULL,
    [IsRecorded]        BIT              NOT NULL DEFAULT 0,
    [WebinarProvider]   NVARCHAR(100)    NOT NULL,
    [RegistrationURL]   NVARCHAR(1000)   NULL,
    [ExpectedAttendees] INT              NULL,
    CONSTRAINT [PK_AE_Webinar] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AE_Webinar_Meeting] FOREIGN KEY ([ID]) REFERENCES [AdvancedEntities].[Meeting]([ID])
);
PRINT '  Created [AdvancedEntities].[Webinar] (IS-A Meeting IS-A Product)';

-- ---------------------------------------------------------------------------
-- Publication: IS-A Product (sibling to Meeting)
-- A publication is a type of product (book, eBook, audiobook, PDF guide).
-- Shares PK with Product but is a DIFFERENT branch than Meeting/Webinar.
-- Disjoint constraint: a Product ID cannot be both a Meeting and a Publication.
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[Publication] (
    [ID]          UNIQUEIDENTIFIER NOT NULL,  -- NO DEFAULT: shared PK from Product
    [ISBN]        NVARCHAR(20)     NULL,
    [PublishDate] DATE             NOT NULL,
    [Publisher]   NVARCHAR(200)    NOT NULL,
    [Format]      NVARCHAR(50)     NOT NULL,
    [PageCount]   INT              NULL,
    [Author]      NVARCHAR(200)    NOT NULL,
    CONSTRAINT [PK_AE_Publication] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AE_Publication_Product] FOREIGN KEY ([ID]) REFERENCES [AdvancedEntities].[Product]([ID]),
    CONSTRAINT [CK_AE_Publication_Format] CHECK ([Format] IN ('eBook', 'Print', 'AudioBook', 'PDF'))
);
PRINT '  Created [AdvancedEntities].[Publication] (IS-A Product)';
GO

-- =============================================================================================================
-- PHASE 3: VIRTUAL ENTITY TABLES
--
-- These tables support the Virtual Entity demo. The Customer and Order tables are regular
-- entities, but we'll create an aggregation view (vwCustomerOrderSummary) that becomes
-- a read-only Virtual Entity in MemberJunction.
-- =============================================================================================================
PRINT '=== Phase 3: Creating Virtual Entity tables ===';

-- ---------------------------------------------------------------------------
-- Customer: Base table for customer data
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[Customer] (
    [ID]            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [FirstName]     NVARCHAR(100)    NOT NULL,
    [LastName]      NVARCHAR(100)    NOT NULL,
    [Email]         NVARCHAR(255)    NOT NULL,
    [Phone]         NVARCHAR(50)     NULL,
    [Company]       NVARCHAR(200)    NULL,
    [City]          NVARCHAR(100)    NULL,
    [State]         NVARCHAR(50)     NULL,
    [Country]       NVARCHAR(100)    NOT NULL DEFAULT 'USA',
    [CustomerSince] DATE             NOT NULL,
    [Tier]          NVARCHAR(20)     NOT NULL,
    CONSTRAINT [PK_AE_Customer] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_AE_Customer_Email] UNIQUE ([Email]),
    CONSTRAINT [CK_AE_Customer_Tier] CHECK ([Tier] IN ('Bronze', 'Silver', 'Gold', 'Platinum'))
);
PRINT '  Created [AdvancedEntities].[Customer]';

-- ---------------------------------------------------------------------------
-- Order: Customer orders
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[Order] (
    [ID]              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [CustomerID]      UNIQUEIDENTIFIER NOT NULL,
    [OrderDate]       DATETIME2        NOT NULL,
    [TotalAmount]     DECIMAL(18,2)    NOT NULL,
    [Status]          NVARCHAR(20)     NOT NULL,
    [ItemCount]       INT              NOT NULL DEFAULT 1,
    [ShippingAddress] NVARCHAR(500)    NULL,
    [Notes]           NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_AE_Order] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AE_Order_Customer] FOREIGN KEY ([CustomerID]) REFERENCES [AdvancedEntities].[Customer]([ID]),
    CONSTRAINT [CK_AE_Order_Status] CHECK ([Status] IN ('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'))
);
PRINT '  Created [AdvancedEntities].[Order]';
GO

-- =============================================================================================================
-- PHASE 4: VIRTUAL ENTITY VIEW
--
-- This view aggregates Customer + Order data into a per-customer summary. In MemberJunction,
-- this view becomes a Virtual Entity: a read-only entity backed by a SQL view with no
-- physical base table. The CustomerID column serves as the primary key (soft PK) and is
-- also a foreign key to the Customer entity (soft FK).
--
-- Key design choices:
--   - LEFT JOIN ensures customers with zero orders still appear
--   - ISNULL wraps aggregates so zero-order customers get 0 instead of NULL
--   - DaysSinceLastOrder is computed for recency analysis
--   - Cancelled and Delivered counts enable fulfillment analytics
-- =============================================================================================================
PRINT '=== Phase 4: Creating Virtual Entity view ===';
GO

CREATE VIEW [AdvancedEntities].[vwCustomerOrderSummary]
AS
SELECT
    c.[ID]                                                              AS [CustomerID],
    c.[FirstName],
    c.[LastName],
    c.[Email],
    c.[Company],
    c.[City],
    c.[State],
    c.[Country],
    c.[Tier],
    c.[CustomerSince],
    COUNT(o.[ID])                                                       AS [TotalOrders],
    ISNULL(SUM(o.[TotalAmount]), 0)                                     AS [LifetimeSpend],
    ISNULL(AVG(o.[TotalAmount]), 0)                                     AS [AvgOrderValue],
    ISNULL(MIN(o.[TotalAmount]), 0)                                     AS [SmallestOrder],
    ISNULL(MAX(o.[TotalAmount]), 0)                                     AS [LargestOrder],
    MIN(o.[OrderDate])                                                  AS [FirstOrderDate],
    MAX(o.[OrderDate])                                                  AS [LastOrderDate],
    ISNULL(SUM(o.[ItemCount]), 0)                                       AS [TotalItemsPurchased],
    SUM(CASE WHEN o.[Status] = 'Cancelled' THEN 1 ELSE 0 END)          AS [CancelledOrders],
    SUM(CASE WHEN o.[Status] = 'Delivered'  THEN 1 ELSE 0 END)         AS [DeliveredOrders],
    DATEDIFF(DAY, MAX(o.[OrderDate]), GETUTCDATE())                     AS [DaysSinceLastOrder]
FROM
    [AdvancedEntities].[Customer] c
LEFT JOIN
    [AdvancedEntities].[Order] o ON c.[ID] = o.[CustomerID]
GROUP BY
    c.[ID], c.[FirstName], c.[LastName], c.[Email], c.[Company],
    c.[City], c.[State], c.[Country], c.[Tier], c.[CustomerSince];
GO

PRINT '  Created [AdvancedEntities].[vwCustomerOrderSummary]';
GO

-- ---------------------------------------------------------------------------
-- vwProductCatalogOverview: Flattened Product Catalog
-- Joins Product with its IS-A subtypes (Meeting, Webinar, Publication) to
-- produce a unified catalog view. Each row is one product with its
-- specialization columns filled in based on type. NULL columns indicate
-- the product is not that subtype.
--
-- This is a SECOND virtual entity for testing LLM-assisted field decoration.
-- The PK is aliased as ProductID (not "ID"), and the LLM must identify it.
-- The join pattern (shared PK across IS-A tables) is non-trivial.
-- ---------------------------------------------------------------------------
CREATE VIEW [AdvancedEntities].[vwProductCatalogOverview]
AS
SELECT
    p.[ID]                                              AS [ProductID],
    p.[Name]                                            AS [ProductName],
    p.[Description]                                     AS [ProductDescription],
    p.[Price],
    p.[SKU],
    p.[Category],
    p.[IsActive],
    CASE
        WHEN w.[ID] IS NOT NULL THEN 'Webinar'
        WHEN m.[ID] IS NOT NULL THEN 'Meeting'
        WHEN pub.[ID] IS NOT NULL THEN 'Publication'
        ELSE 'Standard'
    END                                                 AS [ProductType],
    -- Meeting fields (NULL for non-meetings)
    m.[StartTime]                                       AS [MeetingStartTime],
    m.[EndTime]                                         AS [MeetingEndTime],
    m.[Location]                                        AS [MeetingLocation],
    m.[MaxAttendees],
    m.[MeetingPlatform],
    m.[OrganizerName],
    -- Webinar fields (NULL for non-webinars)
    w.[StreamingURL],
    w.[IsRecorded],
    w.[WebinarProvider],
    w.[RegistrationURL],
    w.[ExpectedAttendees],
    -- Publication fields (NULL for non-publications)
    pub.[ISBN],
    pub.[PublishDate],
    pub.[Publisher],
    pub.[Format]                                        AS [PublicationFormat],
    pub.[PageCount],
    pub.[Author]
FROM
    [AdvancedEntities].[Product] p
LEFT JOIN
    [AdvancedEntities].[Meeting] m ON p.[ID] = m.[ID]
LEFT JOIN
    [AdvancedEntities].[Webinar] w ON m.[ID] = w.[ID]
LEFT JOIN
    [AdvancedEntities].[Publication] pub ON p.[ID] = pub.[ID];
GO

PRINT '  Created [AdvancedEntities].[vwProductCatalogOverview]';
GO

-- ---------------------------------------------------------------------------
-- vwOrderDetailsWithCustomer: Denormalized Order + Customer View
-- Joins Order with Customer to produce a flat view of every order with full
-- customer details inlined. Includes window-function computed columns:
--   - CustomerOrderNumber: sequence # of this order for the customer
--   - CustomerRunningTotal: cumulative spend up to and including this order
--   - DaysSinceSignup: days between customer signup and order date
--
-- This is a THIRD virtual entity for testing LLM-assisted field decoration.
-- The LLM should detect:
--   PK: OrderID (aliased from Order.ID)
--   FK: CustomerID -> Customer.ID (from the INNER JOIN)
-- ---------------------------------------------------------------------------
CREATE VIEW [AdvancedEntities].[vwOrderDetailsWithCustomer]
AS
SELECT
    o.[ID]                                                  AS [OrderID],
    o.[CustomerID],
    o.[OrderDate],
    o.[TotalAmount],
    o.[Status],
    o.[ItemCount],
    o.[ShippingAddress],
    o.[Notes]                                               AS [OrderNotes],
    -- Customer details
    c.[FirstName],
    c.[LastName],
    c.[FirstName] + ' ' + c.[LastName]                      AS [CustomerFullName],
    c.[Email],
    c.[Phone],
    c.[Company],
    c.[City],
    c.[State],
    c.[Country],
    c.[Tier]                                                AS [CustomerTier],
    c.[CustomerSince],
    -- Computed: days between customer signup and this order
    DATEDIFF(DAY, c.[CustomerSince], o.[OrderDate])         AS [DaysSinceSignup],
    -- Computed: order sequence number for this customer
    ROW_NUMBER() OVER (
        PARTITION BY o.[CustomerID]
        ORDER BY o.[OrderDate]
    )                                                       AS [CustomerOrderNumber],
    -- Computed: running spend total for this customer
    SUM(o.[TotalAmount]) OVER (
        PARTITION BY o.[CustomerID]
        ORDER BY o.[OrderDate]
        ROWS UNBOUNDED PRECEDING
    )                                                       AS [CustomerRunningTotal]
FROM
    [AdvancedEntities].[Order] o
INNER JOIN
    [AdvancedEntities].[Customer] c ON o.[CustomerID] = c.[ID];
GO

PRINT '  Created [AdvancedEntities].[vwOrderDetailsWithCustomer]';
GO

-- ---------------------------------------------------------------------------
-- vwCustomerOrdersByStatus: Simple aggregation of orders grouped by
-- customer and status. Composite PK of CustomerID + OrderStatus.
-- FK: CustomerID -> Customer.
-- ---------------------------------------------------------------------------
CREATE VIEW [AdvancedEntities].[vwCustomerOrdersByStatus]
AS
SELECT
    o.[CustomerID],
    o.[Status]                                              AS [OrderStatus],
    c.[FirstName] + ' ' + c.[LastName]                      AS [CustomerName],
    c.[Email]                                               AS [CustomerEmail],
    c.[Tier]                                                AS [CustomerTier],
    COUNT(*)                                                AS [OrderCount],
    SUM(o.[TotalAmount])                                    AS [TotalSpend],
    AVG(o.[TotalAmount])                                    AS [AvgOrderAmount],
    SUM(o.[ItemCount])                                      AS [TotalItems],
    MIN(o.[OrderDate])                                      AS [FirstOrderDate],
    MAX(o.[OrderDate])                                      AS [LastOrderDate]
FROM
    [AdvancedEntities].[Order] o
INNER JOIN
    [AdvancedEntities].[Customer] c ON o.[CustomerID] = c.[ID]
GROUP BY
    o.[CustomerID], o.[Status],
    c.[FirstName], c.[LastName], c.[Email], c.[Tier];
GO

PRINT '  Created [AdvancedEntities].[vwCustomerOrdersByStatus]';
GO

-- =============================================================================================================
-- PHASE 5: EXTENDED PROPERTIES
--
-- Extended properties provide documentation that CodeGen uses to populate entity and field
-- descriptions in MemberJunction metadata. They also appear in SSMS and other SQL tools.
-- =============================================================================================================
PRINT '=== Phase 5: Adding extended properties ===';

-- ---- Product ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Root entity in the IS-A hierarchy. All Meetings, Webinars, and Publications are also Products. Demonstrates Table-Per-Type inheritance with shared primary keys.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'Product';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for this product. Shared across the IS-A chain (same UUID in Product, Meeting/Publication, and Webinar tables).',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the product.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Detailed description of the product.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'Description';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Price in USD.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'Price';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stock Keeping Unit. Unique identifier for inventory and catalog purposes.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'SKU';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Product category for grouping and filtering.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'Category';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this product is currently active and available.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

-- ---- Meeting ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IS-A child of Product. Represents a meeting-type product (conference session, workshop, training). Shares the same primary key as its parent Product record.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'Meeting';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Shared primary key with Product. This is the same UUID as the parent Product.ID.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Meeting', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the meeting begins.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Meeting', @level2type=N'COLUMN', @level2name=N'StartTime';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the meeting ends.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Meeting', @level2type=N'COLUMN', @level2name=N'EndTime';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Physical address or virtual meeting room URL.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Meeting', @level2type=N'COLUMN', @level2name=N'Location';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum number of attendees allowed.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Meeting', @level2type=N'COLUMN', @level2name=N'MaxAttendees';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Platform used for virtual meetings (e.g., Zoom, Microsoft Teams, Google Meet).',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Meeting', @level2type=N'COLUMN', @level2name=N'MeetingPlatform';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Name of the person organizing this meeting.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Meeting', @level2type=N'COLUMN', @level2name=N'OrganizerName';
GO

-- ---- Webinar ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IS-A grandchild: Webinar IS-A Meeting IS-A Product. Represents a webinar-type meeting with streaming capabilities. Shares the same primary key as its parent Meeting and grandparent Product.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'Webinar';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Shared primary key with Meeting and Product. Same UUID across all three tables.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Webinar', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'URL for the live stream.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Webinar', @level2type=N'COLUMN', @level2name=N'StreamingURL';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this webinar will be recorded for later viewing.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Webinar', @level2type=N'COLUMN', @level2name=N'IsRecorded';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The webinar hosting platform (e.g., Zoom Webinars, GoToWebinar, Webex Events).',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Webinar', @level2type=N'COLUMN', @level2name=N'WebinarProvider';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'URL where attendees can register for the webinar.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Webinar', @level2type=N'COLUMN', @level2name=N'RegistrationURL';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Expected number of attendees for planning purposes.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Webinar', @level2type=N'COLUMN', @level2name=N'ExpectedAttendees';
GO

-- ---- Publication ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IS-A child of Product (sibling to Meeting). Represents a publication-type product such as a book, eBook, or guide. Shares the same primary key as its parent Product record. Disjoint from Meeting: a Product cannot be both a Meeting and a Publication.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'Publication';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Shared primary key with Product. This is the same UUID as the parent Product.ID.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Publication', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'International Standard Book Number.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Publication', @level2type=N'COLUMN', @level2name=N'ISBN';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the publication was released.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Publication', @level2type=N'COLUMN', @level2name=N'PublishDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Name of the publishing company.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Publication', @level2type=N'COLUMN', @level2name=N'Publisher';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Publication format: eBook, Print, AudioBook, or PDF.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Publication', @level2type=N'COLUMN', @level2name=N'Format';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total number of pages (for Print and PDF formats).',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Publication', @level2type=N'COLUMN', @level2name=N'PageCount';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Author of the publication.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Publication', @level2type=N'COLUMN', @level2name=N'Author';
GO

-- ---- Customer ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Customer records for the virtual entity demo. Combined with Order data to produce the vwCustomerOrderSummary virtual entity.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'Customer';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique customer identifier.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Customer', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Customer first name.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Customer', @level2type=N'COLUMN', @level2name=N'FirstName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Customer last name.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Customer', @level2type=N'COLUMN', @level2name=N'LastName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary email address (unique).',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Customer', @level2type=N'COLUMN', @level2name=N'Email';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Contact phone number.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Customer', @level2type=N'COLUMN', @level2name=N'Phone';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Company or organization name.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Customer', @level2type=N'COLUMN', @level2name=N'Company';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'City of the customer.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Customer', @level2type=N'COLUMN', @level2name=N'City';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'State or province.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Customer', @level2type=N'COLUMN', @level2name=N'State';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Country (defaults to USA).',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Customer', @level2type=N'COLUMN', @level2name=N'Country';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the customer account was created.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Customer', @level2type=N'COLUMN', @level2name=N'CustomerSince';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Loyalty tier: Bronze, Silver, Gold, or Platinum.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Customer', @level2type=N'COLUMN', @level2name=N'Tier';
GO

-- ---- Order ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Customer orders for the virtual entity demo. Aggregated with Customer data in vwCustomerOrderSummary.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'Order';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique order identifier.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to Customer. Each order belongs to exactly one customer.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'CustomerID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date and time the order was placed.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'OrderDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total monetary value of the order in USD.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'TotalAmount';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Order fulfillment status: Pending, Processing, Shipped, Delivered, or Cancelled.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'Status';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of items in this order.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'ItemCount';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Delivery address for physical shipments.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'ShippingAddress';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional notes or special instructions.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'Notes';
GO

-- ---- vwCustomerOrderSummary ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Virtual entity view: aggregates Customer and Order data into a per-customer summary. This view backs a read-only Virtual Entity in MemberJunction. CustomerID is the soft primary key and soft foreign key to Customer.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'VIEW',   @level1name = N'vwCustomerOrderSummary';
GO

-- ---- vwProductCatalogOverview ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Virtual entity view: flattened product catalog joining Product with its IS-A subtypes (Meeting, Webinar, Publication). Each row is one product with specialized columns filled in based on type. ProductID is the primary key.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'VIEW',   @level1name = N'vwProductCatalogOverview';
GO

-- ---- vwOrderDetailsWithCustomer ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Virtual entity view: denormalized order details with full customer information inlined. Includes window-function computed columns for order sequencing and running spend totals per customer. OrderID is the primary key, CustomerID is a foreign key to Customer.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'VIEW',   @level1name = N'vwOrderDetailsWithCustomer';
GO

-- ---- vwCustomerOrdersByStatus ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Virtual entity view: order counts and spend totals grouped by customer and order status. Composite primary key of CustomerID + OrderStatus. CustomerID is a foreign key to Customer.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'VIEW',   @level1name = N'vwCustomerOrdersByStatus';
GO

-- =============================================================================================================
-- PHASE 6: SAMPLE DATA - IS-A HIERARCHY
--
-- We insert Products first (root), then Meetings and Publications (children), then Webinars
-- (grandchildren). The shared PK pattern means the same UUID appears in Product AND in the
-- child table. No Product ID appears in both Meeting and Publication (disjoint subtypes).
--
-- Product IDs:
--   P01-P08: Plain products (not meetings or publications)
--   M01-M07: Meetings (also products)
--   W01-W04: Webinars (also meetings, also products) - subset of M01-M07
--   B01-B05: Publications (also products)
-- =============================================================================================================
PRINT '=== Phase 6: Inserting IS-A sample data ===';

-- UUIDs for plain Products (not specialized)
DECLARE @P01 UNIQUEIDENTIFIER = 'A1000001-0001-4000-8000-000000000001';
DECLARE @P02 UNIQUEIDENTIFIER = 'A1000001-0001-4000-8000-000000000002';
DECLARE @P03 UNIQUEIDENTIFIER = 'A1000001-0001-4000-8000-000000000003';
DECLARE @P04 UNIQUEIDENTIFIER = 'A1000001-0001-4000-8000-000000000004';
DECLARE @P05 UNIQUEIDENTIFIER = 'A1000001-0001-4000-8000-000000000005';
DECLARE @P06 UNIQUEIDENTIFIER = 'A1000001-0001-4000-8000-000000000006';
DECLARE @P07 UNIQUEIDENTIFIER = 'A1000001-0001-4000-8000-000000000007';
DECLARE @P08 UNIQUEIDENTIFIER = 'A1000001-0001-4000-8000-000000000008';

-- UUIDs for Meetings (these are also Products)
DECLARE @M01 UNIQUEIDENTIFIER = 'A2000001-0002-4000-8000-000000000001';
DECLARE @M02 UNIQUEIDENTIFIER = 'A2000001-0002-4000-8000-000000000002';
DECLARE @M03 UNIQUEIDENTIFIER = 'A2000001-0002-4000-8000-000000000003';
DECLARE @M04 UNIQUEIDENTIFIER = 'A2000001-0002-4000-8000-000000000004';
DECLARE @M05 UNIQUEIDENTIFIER = 'A2000001-0002-4000-8000-000000000005';
DECLARE @M06 UNIQUEIDENTIFIER = 'A2000001-0002-4000-8000-000000000006';
DECLARE @M07 UNIQUEIDENTIFIER = 'A2000001-0002-4000-8000-000000000007';

-- UUIDs for Publications (these are also Products)
DECLARE @B01 UNIQUEIDENTIFIER = 'A3000001-0003-4000-8000-000000000001';
DECLARE @B02 UNIQUEIDENTIFIER = 'A3000001-0003-4000-8000-000000000002';
DECLARE @B03 UNIQUEIDENTIFIER = 'A3000001-0003-4000-8000-000000000003';
DECLARE @B04 UNIQUEIDENTIFIER = 'A3000001-0003-4000-8000-000000000004';
DECLARE @B05 UNIQUEIDENTIFIER = 'A3000001-0003-4000-8000-000000000005';

-- ---------------------------------------------------------------------------
-- Insert Products: Plain products (P01-P08)
-- These are standalone products, not specialized as Meetings or Publications
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[Product] ([ID], [Name], [Description], [Price], [SKU], [Category], [IsActive])
VALUES
    (@P01, 'MJ Platform License - Standard',    'Annual license for MemberJunction platform, standard tier with up to 50 entities.',                                                    2999.00, 'LIC-STD-001',  'Licenses',    1),
    (@P02, 'MJ Platform License - Enterprise',   'Annual license for MemberJunction platform, enterprise tier with unlimited entities and priority support.',                             9999.00, 'LIC-ENT-001',  'Licenses',    1),
    (@P03, 'MJ Support Package - Basic',         'Basic support package: email support during business hours, 48-hour response SLA.',                                                     499.00, 'SUP-BAS-001',  'Support',     1),
    (@P04, 'MJ Support Package - Premium',       'Premium support package: 24/7 phone and email support, 4-hour response SLA, dedicated account manager.',                              1999.00, 'SUP-PRM-001',  'Support',     1),
    (@P05, 'Custom Entity Development',          'Professional services: custom entity and business logic development. Priced per entity.',                                               750.00, 'SVC-ENT-001',  'Services',    1),
    (@P06, 'Data Migration Service',             'Full data migration from legacy system to MemberJunction. Includes schema mapping, data cleansing, and validation.',                   5000.00, 'SVC-MIG-001',  'Services',    1),
    (@P07, 'MJ Starter Kit - Hardware Bundle',   'Pre-configured development workstation with MJ dev tools, VS Code extensions, and sample databases.',                                 1299.00, 'HW-KIT-001',   'Hardware',    1),
    (@P08, 'API Integration Toolkit',            'Toolkit for integrating external systems with MemberJunction via GraphQL and REST APIs. Includes code samples and Postman collection.', 399.00, 'TLK-API-001',  'Toolkits',    1);

-- ---------------------------------------------------------------------------
-- Insert Products: Meeting-type products (M01-M07)
-- These will also have rows in the Meeting table (shared PK)
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[Product] ([ID], [Name], [Description], [Price], [SKU], [Category], [IsActive])
VALUES
    (@M01, 'MJ Developer Conference 2026',      'Three-day annual developer conference featuring hands-on workshops, keynotes, and networking events.',                                  599.00, 'EVT-CONF-001', 'Events',      1),
    (@M02, 'TypeScript Best Practices Workshop', 'Full-day workshop on TypeScript patterns, generics, and advanced type safety in MemberJunction.',                                       299.00, 'EVT-WRK-001',  'Workshops',   1),
    (@M03, 'AI Integration Masterclass',         'Half-day intensive session on integrating AI providers with MemberJunction using the AI Framework.',                                    199.00, 'EVT-WRK-002',  'Workshops',   1),
    (@M04, 'Monthly Community Standup',          'Free monthly community standup to discuss releases, roadmap, and community contributions.',                                               0.00, 'EVT-COM-001',  'Community',   1),
    (@M05, 'CodeGen Deep Dive',                  'Technical deep-dive into the MemberJunction code generation system: schema analysis, template engine, and customization.',              249.00, 'EVT-WRK-003',  'Workshops',   1),
    (@M06, 'Enterprise Architecture Review',     'Private meeting for enterprise customers to review their MJ architecture and get optimization recommendations.',                       1500.00, 'EVT-ENT-001',  'Consulting',  1),
    (@M07, 'Metadata-Driven Design Patterns',    'Workshop covering metadata-driven application patterns, entity inheritance, and virtual entities.',                                      349.00, 'EVT-WRK-004',  'Workshops',   1);

-- ---------------------------------------------------------------------------
-- Insert Products: Publication-type products (B01-B05)
-- These will also have rows in the Publication table (shared PK)
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[Product] ([ID], [Name], [Description], [Price], [SKU], [Category], [IsActive])
VALUES
    (@B01, 'MemberJunction: The Definitive Guide',       'Comprehensive reference covering all aspects of the MemberJunction platform from setup to advanced customization.',             79.99, 'PUB-BK-001',   'Books',       1),
    (@B02, 'Building AI Agents with MJ',                  'Practical guide to building intelligent agents using MemberJunction AI Framework, BaseAgent, and prompt management.',          49.99, 'PUB-BK-002',   'Books',       1),
    (@B03, 'Entity Modeling Patterns',                    'Design patterns for entity modeling in metadata-driven systems. Covers IS-A relationships, virtual entities, and more.',        39.99, 'PUB-BK-003',   'Books',       1),
    (@B04, 'MJ Quick Start Guide',                        'Concise PDF guide for getting started with MemberJunction in under 30 minutes.',                                               9.99, 'PUB-PDF-001',  'Guides',      1),
    (@B05, 'Advanced TypeScript for MJ Developers',       'Audio course covering advanced TypeScript techniques used throughout the MemberJunction codebase.',                            29.99, 'PUB-AUD-001',  'Courses',     1);

PRINT '  Inserted 20 Product records (8 plain + 7 meetings + 5 publications)';

-- ---------------------------------------------------------------------------
-- Insert Meetings: These share PKs with the Product records above
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[Meeting] ([ID], [StartTime], [EndTime], [Location], [MaxAttendees], [MeetingPlatform], [OrganizerName])
VALUES
    (@M01, '2026-06-15 09:00:00', '2026-06-17 17:00:00', 'Austin Convention Center, 500 E Cesar Chavez St, Austin TX',  500,  NULL,               'Sarah Chen'),
    (@M02, '2026-03-20 09:00:00', '2026-03-20 17:00:00', 'Online',                                                       100,  'Zoom',             'Marcus Johnson'),
    (@M03, '2026-04-10 13:00:00', '2026-04-10 17:00:00', 'Online',                                                       200,  'Microsoft Teams',  'Priya Patel'),
    (@M04, '2026-02-28 16:00:00', '2026-02-28 17:00:00', 'Online',                                                       NULL, 'Google Meet',      'Alex Rivera'),
    (@M05, '2026-05-05 10:00:00', '2026-05-05 16:00:00', 'Online',                                                        75,  'Zoom',             'Jordan Lee'),
    (@M06, '2026-03-15 10:00:00', '2026-03-15 12:00:00', 'MJ HQ, 100 Innovation Blvd, San Francisco CA',                   10,  NULL,               'David Kim'),
    (@M07, '2026-07-22 09:00:00', '2026-07-22 17:00:00', 'Online',                                                       150,  'Zoom',             'Emily Watson');

PRINT '  Inserted 7 Meeting records (shared PK with Product)';

-- ---------------------------------------------------------------------------
-- Insert Webinars: These share PKs with their Meeting records (AND Product records)
-- M01, M02, M03, M05 are webinars (M04, M06, M07 are not)
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[Webinar] ([ID], [StreamingURL], [IsRecorded], [WebinarProvider], [RegistrationURL], [ExpectedAttendees])
VALUES
    (@M02, 'https://zoom.us/webinar/ts-best-practices-2026',   1, 'Zoom Webinars',   'https://events.memberjunction.org/ts-workshop',       80),
    (@M03, 'https://teams.live/mj-ai-masterclass',              1, 'Microsoft Teams',  'https://events.memberjunction.org/ai-masterclass',   150),
    (@M05, 'https://zoom.us/webinar/codegen-deep-dive',         1, 'Zoom Webinars',   'https://events.memberjunction.org/codegen-dive',      60),
    (@M07, 'https://zoom.us/webinar/metadata-patterns',         0, 'Zoom Webinars',   'https://events.memberjunction.org/metadata-patterns', 120);

PRINT '  Inserted 4 Webinar records (shared PK with Meeting and Product)';

-- ---------------------------------------------------------------------------
-- Insert Publications: These share PKs with the Product records above
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[Publication] ([ID], [ISBN], [PublishDate], [Publisher], [Format], [PageCount], [Author])
VALUES
    (@B01, '978-1-234567-01-0', '2025-09-15', 'TechPress Publishing',   'Print',     648, 'Dr. Sarah Chen'),
    (@B02, '978-1-234567-02-7', '2026-01-10', 'TechPress Publishing',   'eBook',     412, 'Marcus Johnson'),
    (@B03, '978-1-234567-03-4', '2025-11-20', 'O''Reilly Media',        'Print',     384, 'Priya Patel'),
    (@B04, NULL,                 '2025-06-01', 'MemberJunction Press',   'PDF',        42, 'Alex Rivera'),
    (@B05, NULL,                 '2026-02-01', 'MemberJunction Press',   'AudioBook', NULL, 'Jordan Lee');

PRINT '  Inserted 5 Publication records (shared PK with Product)';
GO

-- =============================================================================================================
-- PHASE 7: SAMPLE DATA - CUSTOMERS
-- =============================================================================================================
PRINT '=== Phase 7: Inserting Customer data ===';

DECLARE @C01 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000001';
DECLARE @C02 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000002';
DECLARE @C03 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000003';
DECLARE @C04 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000004';
DECLARE @C05 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000005';
DECLARE @C06 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000006';
DECLARE @C07 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000007';
DECLARE @C08 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000008';
DECLARE @C09 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000009';
DECLARE @C10 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000010';
DECLARE @C11 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000011';
DECLARE @C12 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000012';
DECLARE @C13 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000013';
DECLARE @C14 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000014';
DECLARE @C15 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000015';
DECLARE @C16 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000016';
DECLARE @C17 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000017';
DECLARE @C18 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000018';
DECLARE @C19 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000019';
DECLARE @C20 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000020';
DECLARE @C21 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000021';
DECLARE @C22 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000022';
DECLARE @C23 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000023';
DECLARE @C24 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000024';
DECLARE @C25 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000025';

INSERT INTO [AdvancedEntities].[Customer] ([ID], [FirstName], [LastName], [Email], [Phone], [Company], [City], [State], [Country], [CustomerSince], [Tier])
VALUES
    -- Platinum customers (high spenders, loyal)
    (@C01, 'Jennifer',  'Martinez',  'jennifer.martinez@acmecorp.com',      '(512) 555-0101', 'Acme Corporation',         'Austin',        'TX', 'USA', '2022-03-15', 'Platinum'),
    (@C02, 'Robert',    'Chen',      'robert.chen@globaltech.io',           '(415) 555-0102', 'GlobalTech Solutions',      'San Francisco', 'CA', 'USA', '2022-06-01', 'Platinum'),
    (@C03, 'Amanda',    'Singh',     'amanda.singh@enterprise.com',         '(212) 555-0103', 'Enterprise Systems Inc.',   'New York',      'NY', 'USA', '2021-11-20', 'Platinum'),

    -- Gold customers
    (@C04, 'Michael',   'O''Brien',  'michael.obrien@datadynamics.com',     '(312) 555-0104', 'Data Dynamics',             'Chicago',       'IL', 'USA', '2023-01-10', 'Gold'),
    (@C05, 'Lisa',      'Nakamura',  'lisa.nakamura@techforward.com',       '(206) 555-0105', 'TechForward Inc.',          'Seattle',       'WA', 'USA', '2023-04-22', 'Gold'),
    (@C06, 'David',     'Petrov',    'david.petrov@cloudnine.io',           '(303) 555-0106', 'CloudNine Solutions',       'Denver',        'CO', 'USA', '2023-02-14', 'Gold'),
    (@C07, 'Sarah',     'Williams',  'sarah.williams@innovateai.com',       '(617) 555-0107', 'InnovateAI',               'Boston',        'MA', 'USA', '2023-07-01', 'Gold'),
    (@C08, 'James',     'Okafor',    'james.okafor@nexgen.co',             '(404) 555-0108', 'NexGen Consulting',         'Atlanta',       'GA', 'USA', '2022-09-15', 'Gold'),

    -- Silver customers
    (@C09, 'Maria',     'Gonzalez',  'maria.gonzalez@brightpath.com',       '(305) 555-0109', 'BrightPath Analytics',      'Miami',         'FL', 'USA', '2024-01-05', 'Silver'),
    (@C10, 'Thomas',    'Andersen',  'thomas.andersen@nordicdata.eu',       '+45 55-0110',     'Nordic Data Group',         'Portland',      'OR', 'USA', '2024-03-18', 'Silver'),
    (@C11, 'Rachel',    'Kim',       'rachel.kim@startuphub.io',            '(650) 555-0111', 'StartupHub',                'Palo Alto',     'CA', 'USA', '2024-06-20', 'Silver'),
    (@C12, 'Daniel',    'Foster',    'daniel.foster@midwestsys.com',        '(614) 555-0112', 'Midwest Systems',           'Columbus',      'OH', 'USA', '2024-02-28', 'Silver'),
    (@C13, 'Emily',     'Tremblay',  'emily.tremblay@maplesoft.ca',         '(416) 555-0113', 'MapleSoft Technologies',    'Toronto',       'ON', 'Canada', '2024-04-10', 'Silver'),
    (@C14, 'Kevin',     'Jackson',   'kevin.jackson@sunbelt.com',           '(602) 555-0114', 'Sunbelt Industries',        'Phoenix',       'AZ', 'USA', '2023-11-15', 'Silver'),
    (@C15, 'Olivia',    'Müller',    'olivia.mueller@techberlin.de',        '+49 30-555-0115', 'TechBerlin GmbH',          'Austin',        'TX', 'USA', '2024-05-01', 'Silver'),

    -- Bronze customers (newer or lower activity)
    (@C16, 'Nathan',    'Park',      'nathan.park@freshstart.com',          '(919) 555-0116', 'FreshStart Labs',           'Raleigh',       'NC', 'USA', '2025-01-08', 'Bronze'),
    (@C17, 'Sofia',     'Romano',    'sofia.romano@pixelcraft.it',          '+39 06-555-0117', 'PixelCraft Studios',       'Los Angeles',   'CA', 'USA', '2025-02-14', 'Bronze'),
    (@C18, 'Andrew',    'Taylor',    'andrew.taylor@local.dev',             '(503) 555-0118', NULL,                         'Portland',      'OR', 'USA', '2025-03-20', 'Bronze'),
    (@C19, 'Fatima',    'Al-Rashid', 'fatima.alrashid@emergetech.com',      '(713) 555-0119', 'EmergeTech',                'Houston',       'TX', 'USA', '2025-04-01', 'Bronze'),
    (@C20, 'Chris',     'Douglas',   'chris.douglas@devshop.io',            '(202) 555-0120', 'DevShop LLC',               'Washington',    'DC', 'USA', '2025-05-10', 'Bronze'),
    (@C21, 'Laura',     'Bergström', 'laura.bergstrom@scandisys.se',       '+46 8-555-0121',  'ScandiSys AB',             'Minneapolis',   'MN', 'USA', '2025-06-15', 'Bronze'),
    (@C22, 'Ryan',      'Cooper',    'ryan.cooper@freelance.dev',           '(720) 555-0122', NULL,                         'Denver',        'CO', 'USA', '2025-07-01', 'Bronze'),
    (@C23, 'Megan',     'Pham',      'megan.pham@appforge.com',             '(408) 555-0123', 'AppForge Inc.',             'San Jose',      'CA', 'USA', '2025-08-20', 'Bronze'),

    -- New customers with no orders yet (for testing LEFT JOIN in virtual entity)
    (@C24, 'Trevor',    'Stone',     'trevor.stone@newclient.com',          '(818) 555-0124', 'NewClient Corp',            'Pasadena',      'CA', 'USA', '2026-01-15', 'Bronze'),
    (@C25, 'Aisha',     'Mbeki',     'aisha.mbeki@futureready.org',         '(469) 555-0125', 'FutureReady Foundation',    'Dallas',        'TX', 'USA', '2026-02-01', 'Bronze');

PRINT '  Inserted 25 Customer records (3 Platinum, 5 Gold, 7 Silver, 10 Bronze)';
GO

-- =============================================================================================================
-- PHASE 8: SAMPLE DATA - ORDERS
--
-- 85 orders spread across customers with realistic patterns:
--   - Platinum customers: many orders, high values
--   - Gold customers: moderate activity
--   - Silver customers: some orders
--   - Bronze customers: few orders
--   - C24, C25: zero orders (tests LEFT JOIN in virtual entity)
-- =============================================================================================================
PRINT '=== Phase 8: Inserting Order data ===';

-- Re-declare customer IDs for this batch
DECLARE @C01 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000001';
DECLARE @C02 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000002';
DECLARE @C03 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000003';
DECLARE @C04 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000004';
DECLARE @C05 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000005';
DECLARE @C06 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000006';
DECLARE @C07 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000007';
DECLARE @C08 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000008';
DECLARE @C09 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000009';
DECLARE @C10 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000010';
DECLARE @C11 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000011';
DECLARE @C12 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000012';
DECLARE @C13 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000013';
DECLARE @C14 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000014';
DECLARE @C15 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000015';
DECLARE @C16 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000016';
DECLARE @C17 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000017';
DECLARE @C18 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000018';
DECLARE @C19 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000019';
DECLARE @C20 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000020';
DECLARE @C21 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000021';
DECLARE @C22 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000022';
DECLARE @C23 UNIQUEIDENTIFIER = 'B1000001-0001-4000-8000-000000000023';

INSERT INTO [AdvancedEntities].[Order] ([ID], [CustomerID], [OrderDate], [TotalAmount], [Status], [ItemCount], [ShippingAddress], [Notes])
VALUES
    -- ==============================
    -- Jennifer Martinez (C01) - Platinum, 10 orders
    -- ==============================
    ('C1000001-0001-4000-8000-000000000001', @C01, '2023-01-15 10:30:00',  2999.00, 'Delivered',  1, '100 Congress Ave, Austin TX 78701',          'Platform license - initial purchase'),
    ('C1000001-0001-4000-8000-000000000002', @C01, '2023-03-20 14:15:00',  1999.00, 'Delivered',  1, '100 Congress Ave, Austin TX 78701',          'Premium support'),
    ('C1000001-0001-4000-8000-000000000003', @C01, '2023-06-10 09:00:00',   599.00, 'Delivered',  2, NULL,                                          'Conference tickets x2'),
    ('C1000001-0001-4000-8000-000000000004', @C01, '2023-09-05 11:45:00',   750.00, 'Delivered',  1, NULL,                                          'Custom entity development'),
    ('C1000001-0001-4000-8000-000000000005', @C01, '2024-01-10 08:30:00',  2999.00, 'Delivered',  1, '100 Congress Ave, Austin TX 78701',          'License renewal'),
    ('C1000001-0001-4000-8000-000000000006', @C01, '2024-05-22 16:00:00',   299.00, 'Delivered',  1, NULL,                                          'TypeScript workshop'),
    ('C1000001-0001-4000-8000-000000000007', @C01, '2024-08-15 13:20:00',   129.98, 'Delivered',  2, '100 Congress Ave, Austin TX 78701',          'Two books'),
    ('C1000001-0001-4000-8000-000000000008', @C01, '2025-01-08 09:00:00',  2999.00, 'Delivered',  1, '100 Congress Ave, Austin TX 78701',          'License renewal Y3'),
    ('C1000001-0001-4000-8000-000000000009', @C01, '2025-07-12 10:30:00',  5000.00, 'Delivered',  1, NULL,                                          'Data migration service'),
    ('C1000001-0001-4000-8000-000000000010', @C01, '2026-01-05 08:00:00',  9999.00, 'Processing', 1, '100 Congress Ave, Austin TX 78701',          'Upgrade to enterprise license'),

    -- ==============================
    -- Robert Chen (C02) - Platinum, 9 orders
    -- ==============================
    ('C1000001-0002-4000-8000-000000000001', @C02, '2022-07-01 09:00:00',  9999.00, 'Delivered',  1, '500 Market St, San Francisco CA 94105',      'Enterprise license'),
    ('C1000001-0002-4000-8000-000000000002', @C02, '2022-09-15 14:00:00',  1999.00, 'Delivered',  1, NULL,                                          'Premium support package'),
    ('C1000001-0002-4000-8000-000000000003', @C02, '2023-02-28 10:30:00',  5000.00, 'Delivered',  1, NULL,                                          'Data migration'),
    ('C1000001-0002-4000-8000-000000000004', @C02, '2023-06-15 08:45:00',  1198.00, 'Delivered',  2, NULL,                                          'Conference + workshop'),
    ('C1000001-0002-4000-8000-000000000005', @C02, '2023-11-20 16:30:00',  3750.00, 'Delivered',  5, NULL,                                          'Custom entity dev x5'),
    ('C1000001-0002-4000-8000-000000000006', @C02, '2024-04-10 11:15:00',   199.00, 'Delivered',  1, NULL,                                          'AI masterclass'),
    ('C1000001-0002-4000-8000-000000000007', @C02, '2024-08-01 09:30:00',  9999.00, 'Delivered',  1, '500 Market St, San Francisco CA 94105',      'License renewal'),
    ('C1000001-0002-4000-8000-000000000008', @C02, '2025-03-10 14:00:00',    79.99, 'Delivered',  1, '500 Market St, San Francisco CA 94105',      'Definitive Guide book'),
    ('C1000001-0002-4000-8000-000000000009', @C02, '2025-12-20 08:00:00',  1500.00, 'Delivered',  1, NULL,                                          'Architecture review'),

    -- ==============================
    -- Amanda Singh (C03) - Platinum, 8 orders
    -- ==============================
    ('C1000001-0003-4000-8000-000000000001', @C03, '2022-01-20 10:00:00',  9999.00, 'Delivered',  1, '350 5th Ave, New York NY 10118',             'Enterprise license'),
    ('C1000001-0003-4000-8000-000000000002', @C03, '2022-04-15 13:30:00',  1999.00, 'Delivered',  1, NULL,                                          'Premium support'),
    ('C1000001-0003-4000-8000-000000000003', @C03, '2022-10-05 09:15:00',  5000.00, 'Delivered',  1, NULL,                                          'Full data migration'),
    ('C1000001-0003-4000-8000-000000000004', @C03, '2023-03-22 15:45:00',  7500.00, 'Delivered', 10, NULL,                                          'Bulk entity development'),
    ('C1000001-0003-4000-8000-000000000005', @C03, '2023-09-18 08:00:00',  9999.00, 'Delivered',  1, '350 5th Ave, New York NY 10118',             'License renewal'),
    ('C1000001-0003-4000-8000-000000000006', @C03, '2024-06-01 11:00:00',  1198.00, 'Delivered',  2, NULL,                                          'Conference + AI masterclass'),
    ('C1000001-0003-4000-8000-000000000007', @C03, '2025-01-15 09:30:00',  9999.00, 'Delivered',  1, '350 5th Ave, New York NY 10118',             'License renewal Y3'),
    ('C1000001-0003-4000-8000-000000000008', @C03, '2025-11-30 14:00:00',  1999.00, 'Shipped',   1, NULL,                                          'Premium support renewal'),

    -- ==============================
    -- Michael O'Brien (C04) - Gold, 7 orders
    -- ==============================
    ('C1000001-0004-4000-8000-000000000001', @C04, '2023-02-10 10:00:00',  2999.00, 'Delivered',  1, '233 S Wacker Dr, Chicago IL 60606',          'Standard license'),
    ('C1000001-0004-4000-8000-000000000002', @C04, '2023-05-15 14:30:00',   499.00, 'Delivered',  1, NULL,                                          'Basic support'),
    ('C1000001-0004-4000-8000-000000000003', @C04, '2023-08-20 09:00:00',   599.00, 'Delivered',  1, NULL,                                          'Developer conference'),
    ('C1000001-0004-4000-8000-000000000004', @C04, '2024-01-25 11:15:00',  2999.00, 'Delivered',  1, '233 S Wacker Dr, Chicago IL 60606',          'License renewal'),
    ('C1000001-0004-4000-8000-000000000005', @C04, '2024-07-10 16:00:00',   349.00, 'Delivered',  1, NULL,                                          'Metadata patterns workshop'),
    ('C1000001-0004-4000-8000-000000000006', @C04, '2025-02-01 08:30:00',  2999.00, 'Delivered',  1, '233 S Wacker Dr, Chicago IL 60606',          'License renewal Y3'),
    ('C1000001-0004-4000-8000-000000000007', @C04, '2025-10-15 13:00:00',   249.00, 'Delivered',  1, NULL,                                          'CodeGen deep dive'),

    -- ==============================
    -- Lisa Nakamura (C05) - Gold, 6 orders
    -- ==============================
    ('C1000001-0005-4000-8000-000000000001', @C05, '2023-05-01 09:00:00',  2999.00, 'Delivered',  1, '400 Broad St, Seattle WA 98109',             'Standard license'),
    ('C1000001-0005-4000-8000-000000000002', @C05, '2023-08-10 14:00:00',   299.00, 'Delivered',  1, NULL,                                          'TypeScript workshop'),
    ('C1000001-0005-4000-8000-000000000003', @C05, '2024-01-20 10:30:00',  1500.00, 'Delivered',  2, NULL,                                          'Entity dev x2'),
    ('C1000001-0005-4000-8000-000000000004', @C05, '2024-06-15 08:00:00',   599.00, 'Delivered',  1, NULL,                                          'Conference ticket'),
    ('C1000001-0005-4000-8000-000000000005', @C05, '2025-01-10 09:00:00',  2999.00, 'Delivered',  1, '400 Broad St, Seattle WA 98109',             'License renewal'),
    ('C1000001-0005-4000-8000-000000000006', @C05, '2025-09-05 15:30:00',    49.99, 'Delivered',  1, '400 Broad St, Seattle WA 98109',             'AI Agents book'),

    -- ==============================
    -- David Petrov (C06) - Gold, 5 orders
    -- ==============================
    ('C1000001-0006-4000-8000-000000000001', @C06, '2023-03-15 10:00:00',  2999.00, 'Delivered',  1, '1600 Stout St, Denver CO 80202',             'Standard license'),
    ('C1000001-0006-4000-8000-000000000002', @C06, '2023-09-20 13:45:00',  1999.00, 'Delivered',  1, NULL,                                          'Premium support'),
    ('C1000001-0006-4000-8000-000000000003', @C06, '2024-04-05 08:30:00',   199.00, 'Delivered',  1, NULL,                                          'AI masterclass'),
    ('C1000001-0006-4000-8000-000000000004', @C06, '2024-10-12 11:00:00',  2999.00, 'Delivered',  1, '1600 Stout St, Denver CO 80202',             'License renewal'),
    ('C1000001-0006-4000-8000-000000000005', @C06, '2025-08-20 09:15:00',   399.00, 'Delivered',  1, '1600 Stout St, Denver CO 80202',             'API integration toolkit'),

    -- ==============================
    -- Sarah Williams (C07) - Gold, 5 orders
    -- ==============================
    ('C1000001-0007-4000-8000-000000000001', @C07, '2023-08-01 09:00:00',  9999.00, 'Delivered',  1, '1 Federal St, Boston MA 02110',              'Enterprise license'),
    ('C1000001-0007-4000-8000-000000000002', @C07, '2023-11-15 14:00:00',  5000.00, 'Delivered',  1, NULL,                                          'Data migration'),
    ('C1000001-0007-4000-8000-000000000003', @C07, '2024-03-10 10:00:00',   299.00, 'Delivered',  1, NULL,                                          'TypeScript workshop'),
    ('C1000001-0007-4000-8000-000000000004', @C07, '2024-09-25 16:30:00',  9999.00, 'Delivered',  1, '1 Federal St, Boston MA 02110',              'License renewal'),
    ('C1000001-0007-4000-8000-000000000005', @C07, '2025-06-10 08:45:00',  1500.00, 'Shipped',   1, NULL,                                          'Architecture review'),

    -- ==============================
    -- James Okafor (C08) - Gold, 4 orders
    -- ==============================
    ('C1000001-0008-4000-8000-000000000001', @C08, '2022-10-01 10:00:00',  2999.00, 'Delivered',  1, '191 Peachtree St NE, Atlanta GA 30303',     'Standard license'),
    ('C1000001-0008-4000-8000-000000000002', @C08, '2023-04-15 13:00:00',   750.00, 'Delivered',  1, NULL,                                          'Entity development'),
    ('C1000001-0008-4000-8000-000000000003', @C08, '2024-01-08 09:30:00',  2999.00, 'Delivered',  1, '191 Peachtree St NE, Atlanta GA 30303',     'License renewal'),
    ('C1000001-0008-4000-8000-000000000004', @C08, '2025-01-05 08:00:00',  2999.00, 'Delivered',  1, '191 Peachtree St NE, Atlanta GA 30303',     'License renewal Y3'),

    -- ==============================
    -- Maria Gonzalez (C09) - Silver, 4 orders
    -- ==============================
    ('C1000001-0009-4000-8000-000000000001', @C09, '2024-02-10 09:00:00',  2999.00, 'Delivered',  1, '1395 Brickell Ave, Miami FL 33131',          'Standard license'),
    ('C1000001-0009-4000-8000-000000000002', @C09, '2024-05-20 14:30:00',   499.00, 'Delivered',  1, NULL,                                          'Basic support'),
    ('C1000001-0009-4000-8000-000000000003', @C09, '2024-09-10 10:00:00',    79.99, 'Delivered',  1, '1395 Brickell Ave, Miami FL 33131',          'Definitive Guide'),
    ('C1000001-0009-4000-8000-000000000004', @C09, '2025-06-01 11:15:00',   599.00, 'Shipped',   1, NULL,                                          'Conference ticket'),

    -- ==============================
    -- Thomas Andersen (C10) - Silver, 3 orders
    -- ==============================
    ('C1000001-0010-4000-8000-000000000001', @C10, '2024-04-01 10:00:00',  2999.00, 'Delivered',  1, '1000 SW Broadway, Portland OR 97205',       'Standard license'),
    ('C1000001-0010-4000-8000-000000000002', @C10, '2024-08-15 09:30:00',   249.00, 'Delivered',  1, NULL,                                          'CodeGen workshop'),
    ('C1000001-0010-4000-8000-000000000003', @C10, '2025-04-01 08:00:00',  2999.00, 'Delivered',  1, '1000 SW Broadway, Portland OR 97205',       'License renewal'),

    -- ==============================
    -- Rachel Kim (C11) - Silver, 3 orders
    -- ==============================
    ('C1000001-0011-4000-8000-000000000001', @C11, '2024-07-15 09:00:00',  2999.00, 'Delivered',  1, '530 Lytton Ave, Palo Alto CA 94301',        'Standard license'),
    ('C1000001-0011-4000-8000-000000000002', @C11, '2024-11-01 14:00:00',   199.00, 'Delivered',  1, NULL,                                          'AI masterclass'),
    ('C1000001-0011-4000-8000-000000000003', @C11, '2025-07-15 09:00:00',  2999.00, 'Processing', 1, '530 Lytton Ave, Palo Alto CA 94301',        'License renewal'),

    -- ==============================
    -- Daniel Foster (C12) - Silver, 2 orders
    -- ==============================
    ('C1000001-0012-4000-8000-000000000001', @C12, '2024-03-15 10:30:00',  2999.00, 'Delivered',  1, '65 E State St, Columbus OH 43215',          'Standard license'),
    ('C1000001-0012-4000-8000-000000000002', @C12, '2024-09-20 15:00:00',   399.00, 'Delivered',  1, '65 E State St, Columbus OH 43215',          'API toolkit'),

    -- ==============================
    -- Emily Tremblay (C13) - Silver, 3 orders (1 cancelled)
    -- ==============================
    ('C1000001-0013-4000-8000-000000000001', @C13, '2024-05-10 09:00:00',  2999.00, 'Delivered',  1, '100 King St W, Toronto ON M5X 1A9',        'Standard license'),
    ('C1000001-0013-4000-8000-000000000002', @C13, '2024-08-01 11:30:00',   599.00, 'Cancelled',  1, NULL,                                          'Conference - cancelled due to travel'),
    ('C1000001-0013-4000-8000-000000000003', @C13, '2025-05-10 08:00:00',  2999.00, 'Delivered',  1, '100 King St W, Toronto ON M5X 1A9',        'License renewal'),

    -- ==============================
    -- Kevin Jackson (C14) - Silver, 2 orders
    -- ==============================
    ('C1000001-0014-4000-8000-000000000001', @C14, '2023-12-01 10:00:00',  2999.00, 'Delivered',  1, '2 N Central Ave, Phoenix AZ 85004',         'Standard license'),
    ('C1000001-0014-4000-8000-000000000002', @C14, '2024-12-01 09:00:00',  2999.00, 'Delivered',  1, '2 N Central Ave, Phoenix AZ 85004',         'License renewal'),

    -- ==============================
    -- Olivia Müller (C15) - Silver, 2 orders
    -- ==============================
    ('C1000001-0015-4000-8000-000000000001', @C15, '2024-06-01 10:00:00',  2999.00, 'Delivered',  1, '600 Congress Ave, Austin TX 78701',          'Standard license'),
    ('C1000001-0015-4000-8000-000000000002', @C15, '2025-02-15 14:00:00',    39.99, 'Delivered',  1, '600 Congress Ave, Austin TX 78701',          'Entity Modeling book'),

    -- ==============================
    -- Nathan Park (C16) - Bronze, 2 orders
    -- ==============================
    ('C1000001-0016-4000-8000-000000000001', @C16, '2025-02-01 09:00:00',  2999.00, 'Delivered',  1, '150 Fayetteville St, Raleigh NC 27601',     'Standard license'),
    ('C1000001-0016-4000-8000-000000000002', @C16, '2025-08-10 13:30:00',   299.00, 'Delivered',  1, NULL,                                          'TypeScript workshop'),

    -- ==============================
    -- Sofia Romano (C17) - Bronze, 2 orders (1 cancelled)
    -- ==============================
    ('C1000001-0017-4000-8000-000000000001', @C17, '2025-03-01 10:00:00',  2999.00, 'Delivered',  1, '6922 Hollywood Blvd, Los Angeles CA 90028', 'Standard license'),
    ('C1000001-0017-4000-8000-000000000002', @C17, '2025-06-15 15:00:00',  5000.00, 'Cancelled',  1, NULL,                                          'Migration service - cancelled, did it themselves'),

    -- ==============================
    -- Andrew Taylor (C18) - Bronze, 1 order
    -- ==============================
    ('C1000001-0018-4000-8000-000000000001', @C18, '2025-04-10 09:30:00',  2999.00, 'Delivered',  1, '111 SW 5th Ave, Portland OR 97204',         'Standard license'),

    -- ==============================
    -- Fatima Al-Rashid (C19) - Bronze, 2 orders
    -- ==============================
    ('C1000001-0019-4000-8000-000000000001', @C19, '2025-05-01 10:00:00',  2999.00, 'Shipped',   1, '1000 Main St, Houston TX 77002',            'Standard license'),
    ('C1000001-0019-4000-8000-000000000002', @C19, '2025-09-20 08:45:00',    49.99, 'Pending',   1, '1000 Main St, Houston TX 77002',            'AI Agents book'),

    -- ==============================
    -- Chris Douglas (C20) - Bronze, 1 order
    -- ==============================
    ('C1000001-0020-4000-8000-000000000001', @C20, '2025-06-01 11:00:00',  2999.00, 'Delivered',  1, '1100 Pennsylvania Ave, Washington DC 20004', 'Standard license'),

    -- ==============================
    -- Laura Bergström (C21) - Bronze, 1 order
    -- ==============================
    ('C1000001-0021-4000-8000-000000000001', @C21, '2025-07-15 09:00:00',  2999.00, 'Processing', 1, '250 Marquette Ave, Minneapolis MN 55401',   'Standard license'),

    -- ==============================
    -- Ryan Cooper (C22) - Bronze, 1 order
    -- ==============================
    ('C1000001-0022-4000-8000-000000000001', @C22, '2025-08-01 10:30:00',   399.00, 'Delivered',  1, '1660 Lincoln St, Denver CO 80264',          'API integration toolkit'),

    -- ==============================
    -- Megan Pham (C23) - Bronze, 2 orders
    -- ==============================
    ('C1000001-0023-4000-8000-000000000001', @C23, '2025-09-01 09:00:00',  2999.00, 'Pending',   1, '2570 N 1st St, San Jose CA 95131',          'Standard license'),
    ('C1000001-0023-4000-8000-000000000002', @C23, '2025-10-15 14:00:00',     9.99, 'Pending',   1, '2570 N 1st St, San Jose CA 95131',          'Quick start guide');

    -- Note: C24 (Trevor Stone) and C25 (Aisha Mbeki) have ZERO orders.
    -- This tests the LEFT JOIN in vwCustomerOrderSummary — they should appear
    -- with TotalOrders=0, LifetimeSpend=0, and NULL date fields.

PRINT '  Inserted 85 Order records across 23 customers (C24, C25 have 0 orders)';
GO

-- =============================================================================================================
-- PHASE 9: VERIFICATION QUERIES
-- =============================================================================================================
PRINT '=== Phase 9: Running verification queries ===';
PRINT '';

-- Verify row counts
PRINT '--- Row Counts ---';
SELECT 'Product'     AS [Table], COUNT(*) AS [Rows] FROM [AdvancedEntities].[Product]
UNION ALL
SELECT 'Meeting',     COUNT(*) FROM [AdvancedEntities].[Meeting]
UNION ALL
SELECT 'Webinar',     COUNT(*) FROM [AdvancedEntities].[Webinar]
UNION ALL
SELECT 'Publication', COUNT(*) FROM [AdvancedEntities].[Publication]
UNION ALL
SELECT 'Customer',    COUNT(*) FROM [AdvancedEntities].[Customer]
UNION ALL
SELECT 'Order',       COUNT(*) FROM [AdvancedEntities].[Order]
ORDER BY [Table];

-- Verify IS-A shared PK: every Meeting ID exists in Product
PRINT '--- IS-A PK Verification: Meetings ---';
SELECT
    m.[ID],
    p.[Name] AS [ProductName],
    m.[OrganizerName],
    m.[MeetingPlatform],
    'Meeting IS-A Product' AS [Relationship]
FROM [AdvancedEntities].[Meeting] m
INNER JOIN [AdvancedEntities].[Product] p ON m.[ID] = p.[ID];

-- Verify IS-A shared PK: every Webinar ID exists in Meeting AND Product
PRINT '--- IS-A PK Verification: Webinars (3-level chain) ---';
SELECT
    w.[ID],
    p.[Name] AS [ProductName],
    m.[OrganizerName],
    m.[MeetingPlatform],
    w.[WebinarProvider],
    w.[IsRecorded],
    'Webinar IS-A Meeting IS-A Product' AS [Relationship]
FROM [AdvancedEntities].[Webinar] w
INNER JOIN [AdvancedEntities].[Meeting] m ON w.[ID] = m.[ID]
INNER JOIN [AdvancedEntities].[Product] p ON m.[ID] = p.[ID];

-- Verify disjoint subtypes: no Product ID appears in both Meeting and Publication
PRINT '--- Disjoint Subtype Verification ---';
SELECT
    'VIOLATION' AS [Status],
    m.[ID] AS [SharedID]
FROM [AdvancedEntities].[Meeting] m
INNER JOIN [AdvancedEntities].[Publication] pub ON m.[ID] = pub.[ID];
-- Expected: 0 rows (no violations)

-- Verify virtual entity view
PRINT '--- Virtual Entity View: Customer Order Summary ---';
SELECT
    [CustomerID],
    [FirstName] + ' ' + [LastName] AS [CustomerName],
    [Tier],
    [TotalOrders],
    [LifetimeSpend],
    [AvgOrderValue],
    [FirstOrderDate],
    [LastOrderDate],
    [DaysSinceLastOrder],
    [CancelledOrders],
    [DeliveredOrders]
FROM [AdvancedEntities].[vwCustomerOrderSummary]
ORDER BY [LifetimeSpend] DESC;

-- Verify zero-order customers appear in the view
PRINT '--- Zero-Order Customer Verification ---';
SELECT
    [CustomerID],
    [FirstName] + ' ' + [LastName] AS [CustomerName],
    [TotalOrders],
    [LifetimeSpend],
    [FirstOrderDate],
    [LastOrderDate]
FROM [AdvancedEntities].[vwCustomerOrderSummary]
WHERE [TotalOrders] = 0;
-- Expected: 2 rows (Trevor Stone, Aisha Mbeki)

PRINT '';
PRINT '=== AdvancedEntities demo schema created successfully! ===';
PRINT 'See Demos/AdvancedEntities/README.md for CodeGen integration steps.';
GO
