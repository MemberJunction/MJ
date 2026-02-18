-- =============================================================================================================
-- AdvancedEntities Demo Schema
-- MemberJunction Feature Demonstration: IS-A Type Relationships + Virtual Entities
--
-- This script creates a standalone schema with tables and sample data that demonstrate three key
-- MemberJunction features:
--
--   1. IS-A Type Relationships — Disjoint Subtypes (Table-Per-Type Inheritance)
--      Product (root) -> Meeting (child) -> Webinar (grandchild)
--      Product (root) -> Publication (sibling child)
--      A Product can be a Meeting OR a Publication, never both.
--
--   2. IS-A Type Relationships — Overlapping Subtypes (AllowMultipleSubtypes = true)
--      Person (root, overlapping) -> Member -> GoldMember
--      Person (root, overlapping) -> Speaker
--      Organization (root, overlapping) -> Vendor
--      A Person can be BOTH a Member AND a Speaker simultaneously.
--
--   3. Virtual Entities (Read-Only Aggregation Views)
--      Customer + Order -> vwCustomerOrderSummary + 3 more views
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

    -- Drop overlapping IS-A subtype tables (reverse dependency order)
    IF OBJECT_ID('AdvancedEntities.GoldMember', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[GoldMember];
    IF OBJECT_ID('AdvancedEntities.Speaker', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[Speaker];
    IF OBJECT_ID('AdvancedEntities.Member', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[Member];
    IF OBJECT_ID('AdvancedEntities.Person', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[Person];
    IF OBJECT_ID('AdvancedEntities.Vendor', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[Vendor];
    IF OBJECT_ID('AdvancedEntities.Organization', 'U') IS NOT NULL
        DROP TABLE [AdvancedEntities].[Organization];

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
    [StartTime]       DATETIMEOFFSET   NOT NULL,
    [EndTime]         DATETIMEOFFSET   NOT NULL,
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
    [OrderDate]       DATETIMEOFFSET   NOT NULL,
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
PRINT '=== Disjoint IS-A + Virtual Entity tables verified. Continuing to Overlapping IS-A tables... ===';
GO
-- =============================================================================================================
-- PHASE 2B: OVERLAPPING IS-A HIERARCHY TABLES
--
-- The OVERLAPPING IS-A pattern uses the same shared-PK mechanism as the disjoint pattern,
-- but ALLOWS a single parent record to appear in MULTIPLE child tables simultaneously.
--
-- Person Hierarchy (overlapping):
--   Person (root)
--   +-- Member (IS-A Person) — a person who has a membership
--   |   +-- GoldMember (IS-A Member) — a member with gold-tier benefits
--   +-- Speaker (IS-A Person) — a person who speaks at events
--
-- A Person can be:
--   - Just a Person (no rows in Member or Speaker)
--   - A Member only
--   - A Speaker only
--   - BOTH a Member AND a Speaker (overlapping!)
--   - A Member who is also a GoldMember (deeper specialization)
--
-- Organization Hierarchy:
--   Organization (root)
--   +-- Vendor (IS-A Organization) — an organization that supplies goods/services
-- =============================================================================================================
PRINT '=== Phase 2B: Creating overlapping IS-A hierarchy tables ===';

-- ---------------------------------------------------------------------------
-- Person: Root entity in the overlapping IS-A hierarchy
-- All Members, GoldMembers, and Speakers are also Persons.
-- Unlike Product (which uses disjoint subtypes), Person allows overlapping:
-- a single Person can be BOTH a Member and a Speaker.
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[Person] (
    [ID]          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [FirstName]   NVARCHAR(100)    NOT NULL,
    [LastName]    NVARCHAR(100)    NOT NULL,
    [Email]       NVARCHAR(255)    NOT NULL,
    [DateOfBirth] DATE             NULL,
    [Phone]       NVARCHAR(50)     NULL,
    CONSTRAINT [PK_AE_Person] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_AE_Person_Email] UNIQUE ([Email])
);
PRINT '  Created [AdvancedEntities].[Person]';

-- ---------------------------------------------------------------------------
-- Member: IS-A Person (overlapping child)
-- A member is a person with an active membership. A person can be BOTH a
-- Member AND a Speaker — this is the overlapping subtype pattern.
-- Its ID is the SAME UUID as the parent Person record.
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[Member] (
    [ID]              UNIQUEIDENTIFIER NOT NULL,  -- NO DEFAULT: shared PK from Person
    [MembershipDate]  DATE             NOT NULL,
    [MembershipLevel] NVARCHAR(50)     NOT NULL,
    [DuesAmount]      DECIMAL(18,2)    NOT NULL,
    [IsActive]        BIT              NOT NULL DEFAULT 1,
    CONSTRAINT [PK_AE_Member] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AE_Member_Person] FOREIGN KEY ([ID]) REFERENCES [AdvancedEntities].[Person]([ID]),
    CONSTRAINT [CK_AE_Member_Level] CHECK ([MembershipLevel] IN ('Basic', 'Standard', 'Premium', 'Elite'))
);
PRINT '  Created [AdvancedEntities].[Member] (IS-A Person, overlapping)';

-- ---------------------------------------------------------------------------
-- GoldMember: IS-A Member (deeper specialization)
-- A gold member is a member with additional benefits. Its ID is the SAME UUID
-- as the Member record AND the Person record (three tables, one shared UUID).
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[GoldMember] (
    [ID]                 UNIQUEIDENTIFIER NOT NULL,  -- NO DEFAULT: shared PK from Member
    [GoldSince]          DATE             NOT NULL,
    [PersonalAdvisor]    NVARCHAR(200)    NULL,
    [AnnualBenefitLimit] DECIMAL(18,2)    NOT NULL DEFAULT 50000.00,
    [PointsBalance]      INT              NOT NULL DEFAULT 0,
    CONSTRAINT [PK_AE_GoldMember] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AE_GoldMember_Member] FOREIGN KEY ([ID]) REFERENCES [AdvancedEntities].[Member]([ID])
);
PRINT '  Created [AdvancedEntities].[GoldMember] (IS-A Member IS-A Person)';

-- ---------------------------------------------------------------------------
-- Speaker: IS-A Person (overlapping child, sibling to Member)
-- A speaker is a person who presents at events. Unlike the disjoint
-- Product -> Meeting/Publication pattern, a Person CAN appear in both
-- Member and Speaker tables simultaneously.
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[Speaker] (
    [ID]                  UNIQUEIDENTIFIER NOT NULL,  -- NO DEFAULT: shared PK from Person
    [Bio]                 NVARCHAR(MAX)    NULL,
    [Expertise]           NVARCHAR(200)    NOT NULL,
    [HourlyRate]          DECIMAL(18,2)    NOT NULL,
    [AvailableForBooking] BIT              NOT NULL DEFAULT 1,
    CONSTRAINT [PK_AE_Speaker] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AE_Speaker_Person] FOREIGN KEY ([ID]) REFERENCES [AdvancedEntities].[Person]([ID])
);
PRINT '  Created [AdvancedEntities].[Speaker] (IS-A Person, overlapping)';

-- ---------------------------------------------------------------------------
-- Organization: Root entity for a second overlapping IS-A hierarchy
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[Organization] (
    [ID]            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]          NVARCHAR(200)    NOT NULL,
    [Website]       NVARCHAR(500)    NULL,
    [Industry]      NVARCHAR(100)    NULL,
    [FoundedYear]   INT              NULL,
    [EmployeeCount] INT              NULL,
    CONSTRAINT [PK_AE_Organization] PRIMARY KEY CLUSTERED ([ID])
);
PRINT '  Created [AdvancedEntities].[Organization]';

-- ---------------------------------------------------------------------------
-- Vendor: IS-A Organization
-- A vendor is an organization that supplies goods or services.
-- Its ID is the SAME UUID as the parent Organization record.
-- ---------------------------------------------------------------------------
CREATE TABLE [AdvancedEntities].[Vendor] (
    [ID]                UNIQUEIDENTIFIER NOT NULL,  -- NO DEFAULT: shared PK from Organization
    [VendorCode]        NVARCHAR(20)     NOT NULL,
    [PaymentTerms]      NVARCHAR(50)     NOT NULL,
    [TaxID]             NVARCHAR(50)     NULL,
    [PreferredCurrency] NVARCHAR(10)     NOT NULL DEFAULT 'USD',
    [Rating]            DECIMAL(3,1)     NULL,
    CONSTRAINT [PK_AE_Vendor] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AE_Vendor_Organization] FOREIGN KEY ([ID]) REFERENCES [AdvancedEntities].[Organization]([ID]),
    CONSTRAINT [UQ_AE_Vendor_Code] UNIQUE ([VendorCode]),
    CONSTRAINT [CK_AE_Vendor_Rating] CHECK ([Rating] >= 0.0 AND [Rating] <= 5.0),
    CONSTRAINT [CK_AE_Vendor_PaymentTerms] CHECK ([PaymentTerms] IN ('Net-15', 'Net-30', 'Net-45', 'Net-60', 'Prepaid'))
);
PRINT '  Created [AdvancedEntities].[Vendor] (IS-A Organization)';
GO

-- =============================================================================================================
-- PHASE 3B: EXTENDED PROPERTIES FOR OVERLAPPING SUBTYPE TABLES
-- =============================================================================================================
PRINT '=== Phase 3B: Adding extended properties for overlapping subtype tables ===';

-- ---- Person ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Root entity in the overlapping IS-A hierarchy. Members, GoldMembers, and Speakers are all Persons. Unlike the Product hierarchy (disjoint subtypes), a Person can appear in BOTH the Member and Speaker tables simultaneously.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'Person';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for this person. Shared across the IS-A chain (same UUID in Person, Member/Speaker, and GoldMember tables).',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Person', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'First name of the person.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Person', @level2type=N'COLUMN', @level2name=N'FirstName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Last name of the person.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Person', @level2type=N'COLUMN', @level2name=N'LastName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary email address (unique).',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Person', @level2type=N'COLUMN', @level2name=N'Email';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date of birth.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Person', @level2type=N'COLUMN', @level2name=N'DateOfBirth';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Contact phone number.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Person', @level2type=N'COLUMN', @level2name=N'Phone';
GO

-- ---- Member ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IS-A child of Person (overlapping). Represents a person with an active membership. A person can be BOTH a Member and a Speaker — this is the overlapping subtype pattern. Shares the same primary key as its parent Person record.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'Member';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Shared primary key with Person. This is the same UUID as the parent Person.ID.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Member', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date when the person became a member.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Member', @level2type=N'COLUMN', @level2name=N'MembershipDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Membership tier level: Basic, Standard, Premium, or Elite.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Member', @level2type=N'COLUMN', @level2name=N'MembershipLevel';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Annual membership dues amount in USD.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Member', @level2type=N'COLUMN', @level2name=N'DuesAmount';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this membership is currently active.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Member', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

-- ---- GoldMember ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IS-A grandchild: GoldMember IS-A Member IS-A Person. Represents a member with gold-tier benefits including a personal advisor and points balance. Shares the same primary key as its parent Member and grandparent Person.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'GoldMember';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Shared primary key with Member and Person. Same UUID across all three tables.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'GoldMember', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date when this member was upgraded to gold tier.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'GoldMember', @level2type=N'COLUMN', @level2name=N'GoldSince';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Name of the dedicated personal advisor assigned to this gold member.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'GoldMember', @level2type=N'COLUMN', @level2name=N'PersonalAdvisor';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum annual benefit limit in USD. Defaults to 50000.00.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'GoldMember', @level2type=N'COLUMN', @level2name=N'AnnualBenefitLimit';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current loyalty points balance.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'GoldMember', @level2type=N'COLUMN', @level2name=N'PointsBalance';
GO

-- ---- Speaker ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IS-A child of Person (overlapping, sibling to Member). Represents a person who speaks at events. Unlike the Product -> Meeting/Publication (disjoint) pattern, a Person CAN appear in both the Member and Speaker tables simultaneously. Shares the same primary key as its parent Person record.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'Speaker';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Shared primary key with Person. This is the same UUID as the parent Person.ID.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Speaker', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Biographical information about the speaker.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Speaker', @level2type=N'COLUMN', @level2name=N'Bio';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary area of expertise or speaking topic.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Speaker', @level2type=N'COLUMN', @level2name=N'Expertise';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Standard hourly speaking rate in USD.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Speaker', @level2type=N'COLUMN', @level2name=N'HourlyRate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this speaker is currently available for booking.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Speaker', @level2type=N'COLUMN', @level2name=N'AvailableForBooking';
GO

-- ---- Organization ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Root entity for a second IS-A hierarchy. Organizations can be specialized as Vendors. Demonstrates the IS-A pattern in a non-person context.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'Organization';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for this organization. Shared across the IS-A chain (same UUID in Organization and Vendor tables).',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Organization', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Name of the organization.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Organization', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Organization website URL.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Organization', @level2type=N'COLUMN', @level2name=N'Website';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Industry sector or vertical.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Organization', @level2type=N'COLUMN', @level2name=N'Industry';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Year the organization was founded.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Organization', @level2type=N'COLUMN', @level2name=N'FoundedYear';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Approximate number of employees.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Organization', @level2type=N'COLUMN', @level2name=N'EmployeeCount';
GO

-- ---- Vendor ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IS-A child of Organization. Represents an organization that supplies goods or services. Shares the same primary key as its parent Organization record.',
    @level0type = N'SCHEMA', @level0name = N'AdvancedEntities',
    @level1type = N'TABLE',  @level1name = N'Vendor';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Shared primary key with Organization. This is the same UUID as the parent Organization.ID.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Vendor', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique vendor code for purchase order reference.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Vendor', @level2type=N'COLUMN', @level2name=N'VendorCode';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Payment terms: Net-15, Net-30, Net-45, Net-60, or Prepaid.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Vendor', @level2type=N'COLUMN', @level2name=N'PaymentTerms';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tax identification number.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Vendor', @level2type=N'COLUMN', @level2name=N'TaxID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Preferred currency for invoicing. Defaults to USD.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Vendor', @level2type=N'COLUMN', @level2name=N'PreferredCurrency';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Vendor quality rating from 0.0 to 5.0.',
    @level0type=N'SCHEMA', @level0name=N'AdvancedEntities', @level1type=N'TABLE', @level1name=N'Vendor', @level2type=N'COLUMN', @level2name=N'Rating';
GO

-- =============================================================================================================
-- PHASE 5B: SAMPLE DATA - PERSONS (100 records)
--
-- Distribution:
--   @PE001-@PE030: Member ONLY (of which @PE001-@PE020 are also GoldMember)
--   @PE031-@PE060: BOTH Member AND Speaker (overlapping!)
--   @PE061-@PE080: Speaker ONLY
--   @PE081-@PE100: Neither Member nor Speaker (standalone persons)
-- =============================================================================================================
PRINT '=== Phase 5B: Inserting overlapping IS-A sample data ===';

-- Person UUIDs
DECLARE @PE001 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000001';
DECLARE @PE002 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000002';
DECLARE @PE003 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000003';
DECLARE @PE004 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000004';
DECLARE @PE005 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000005';
DECLARE @PE006 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000006';
DECLARE @PE007 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000007';
DECLARE @PE008 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000008';
DECLARE @PE009 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000009';
DECLARE @PE010 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000010';
DECLARE @PE011 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000011';
DECLARE @PE012 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000012';
DECLARE @PE013 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000013';
DECLARE @PE014 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000014';
DECLARE @PE015 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000015';
DECLARE @PE016 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000016';
DECLARE @PE017 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000017';
DECLARE @PE018 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000018';
DECLARE @PE019 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000019';
DECLARE @PE020 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000020';
DECLARE @PE021 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000021';
DECLARE @PE022 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000022';
DECLARE @PE023 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000023';
DECLARE @PE024 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000024';
DECLARE @PE025 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000025';
DECLARE @PE026 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000026';
DECLARE @PE027 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000027';
DECLARE @PE028 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000028';
DECLARE @PE029 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000029';
DECLARE @PE030 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000030';
DECLARE @PE031 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000031';
DECLARE @PE032 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000032';
DECLARE @PE033 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000033';
DECLARE @PE034 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000034';
DECLARE @PE035 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000035';
DECLARE @PE036 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000036';
DECLARE @PE037 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000037';
DECLARE @PE038 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000038';
DECLARE @PE039 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000039';
DECLARE @PE040 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000040';
DECLARE @PE041 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000041';
DECLARE @PE042 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000042';
DECLARE @PE043 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000043';
DECLARE @PE044 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000044';
DECLARE @PE045 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000045';
DECLARE @PE046 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000046';
DECLARE @PE047 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000047';
DECLARE @PE048 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000048';
DECLARE @PE049 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000049';
DECLARE @PE050 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000050';
DECLARE @PE051 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000051';
DECLARE @PE052 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000052';
DECLARE @PE053 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000053';
DECLARE @PE054 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000054';
DECLARE @PE055 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000055';
DECLARE @PE056 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000056';
DECLARE @PE057 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000057';
DECLARE @PE058 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000058';
DECLARE @PE059 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000059';
DECLARE @PE060 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000060';
DECLARE @PE061 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000061';
DECLARE @PE062 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000062';
DECLARE @PE063 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000063';
DECLARE @PE064 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000064';
DECLARE @PE065 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000065';
DECLARE @PE066 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000066';
DECLARE @PE067 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000067';
DECLARE @PE068 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000068';
DECLARE @PE069 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000069';
DECLARE @PE070 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000070';
DECLARE @PE071 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000071';
DECLARE @PE072 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000072';
DECLARE @PE073 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000073';
DECLARE @PE074 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000074';
DECLARE @PE075 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000075';
DECLARE @PE076 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000076';
DECLARE @PE077 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000077';
DECLARE @PE078 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000078';
DECLARE @PE079 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000079';
DECLARE @PE080 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000080';
DECLARE @PE081 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000081';
DECLARE @PE082 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000082';
DECLARE @PE083 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000083';
DECLARE @PE084 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000084';
DECLARE @PE085 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000085';
DECLARE @PE086 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000086';
DECLARE @PE087 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000087';
DECLARE @PE088 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000088';
DECLARE @PE089 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000089';
DECLARE @PE090 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000090';
DECLARE @PE091 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000091';
DECLARE @PE092 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000092';
DECLARE @PE093 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000093';
DECLARE @PE094 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000094';
DECLARE @PE095 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000095';
DECLARE @PE096 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000096';
DECLARE @PE097 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000097';
DECLARE @PE098 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000098';
DECLARE @PE099 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000099';
DECLARE @PE100 UNIQUEIDENTIFIER = 'D1000001-0001-4000-8000-000000000100';

-- ---------------------------------------------------------------------------
-- Insert Persons: 100 records with diverse, realistic names
-- PE001-PE030: Will become Members (PE001-PE020 also GoldMembers)
-- PE031-PE060: Will become BOTH Members AND Speakers (overlapping!)
-- PE061-PE080: Will become Speakers only
-- PE081-PE100: Standalone persons (neither Member nor Speaker)
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[Person] ([ID], [FirstName], [LastName], [Email], [DateOfBirth], [Phone])
VALUES
    -- ==============================
    -- PE001-PE010: Member ONLY (also GoldMember)
    -- ==============================
    (@PE001, 'Akiko',      'Tanaka',       'akiko.tanaka@example.com',         '1985-03-14', '(512) 555-1001'),
    (@PE002, 'Carlos',     'Mendoza',      'carlos.mendoza@example.com',       '1978-07-22', '(415) 555-1002'),
    (@PE003, 'Ingrid',     'Bjornsson',    'ingrid.bjornsson@example.com',     '1990-11-05', '(206) 555-1003'),
    (@PE004, 'Kwame',      'Asante',       'kwame.asante@example.com',         '1982-01-30', '(312) 555-1004'),
    (@PE005, 'Elena',      'Volkov',       'elena.volkov@example.com',         '1988-06-18', '(617) 555-1005'),
    (@PE006, 'Rajesh',     'Krishnamurthy','rajesh.krishnamurthy@example.com', '1975-09-12', '(404) 555-1006'),
    (@PE007, 'Siobhan',    'O''Malley',    'siobhan.omalley@example.com',      '1992-04-25', '(303) 555-1007'),
    (@PE008, 'Wei',        'Zhang',        'wei.zhang@example.com',            '1980-12-01', '(713) 555-1008'),
    (@PE009, 'Fatou',      'Diallo',       'fatou.diallo@example.com',         '1987-08-15', '(202) 555-1009'),
    (@PE010, 'Alejandro',  'Rivera',       'alejandro.rivera@example.com',     '1983-02-28', '(305) 555-1010'),

    -- ==============================
    -- PE011-PE020: Member ONLY (also GoldMember)
    -- ==============================
    (@PE011, 'Yuki',       'Sato',         'yuki.sato@example.com',            '1991-05-07', '(650) 555-1011'),
    (@PE012, 'Dmitri',     'Petrov',       'dmitri.petrov@example.com',        '1979-10-19', '(503) 555-1012'),
    (@PE013, 'Amara',      'Okafor',       'amara.okafor@example.com',         '1986-03-23', '(919) 555-1013'),
    (@PE014, 'Lars',       'Andersen',     'lars.andersen@example.com',        '1977-07-11', '(720) 555-1014'),
    (@PE015, 'Priya',      'Sharma',       'priya.sharma@example.com',         '1993-01-09', '(408) 555-1015'),
    (@PE016, 'Hassan',     'El-Amin',      'hassan.elamin@example.com',        '1984-11-27', '(469) 555-1016'),
    (@PE017, 'Brigitte',   'Dupont',       'brigitte.dupont@example.com',      '1989-06-14', '(614) 555-1017'),
    (@PE018, 'Takeshi',    'Yamamoto',     'takeshi.yamamoto@example.com',     '1976-08-30', '(818) 555-1018'),
    (@PE019, 'Nneka',      'Adeyemi',      'nneka.adeyemi@example.com',        '1994-04-02', '(602) 555-1019'),
    (@PE020, 'Marco',      'Rossi',        'marco.rossi@example.com',          '1981-12-16', '(512) 555-1020'),

    -- ==============================
    -- PE021-PE030: Member ONLY (not GoldMember)
    -- ==============================
    (@PE021, 'Soren',      'Vestergaard',  'soren.vestergaard@example.com',    '1990-02-14', '(415) 555-1021'),
    (@PE022, 'Mei-Lin',    'Chen',         'meilin.chen@example.com',          '1985-08-08', '(206) 555-1022'),
    (@PE023, 'Olumide',    'Bakare',       'olumide.bakare@example.com',       '1978-05-20', '(312) 555-1023'),
    (@PE024, 'Katarina',   'Novak',        'katarina.novak@example.com',       '1992-10-31', '(617) 555-1024'),
    (@PE025, 'Roberto',    'Fernandez',    'roberto.fernandez@example.com',    '1983-03-17', '(404) 555-1025'),
    (@PE026, 'Ananya',     'Desai',        'ananya.desai@example.com',         '1987-07-04', '(303) 555-1026'),
    (@PE027, 'Patrick',    'O''Sullivan',  'patrick.osullivan@example.com',    '1980-01-22', '(713) 555-1027'),
    (@PE028, 'Sakura',     'Watanabe',     'sakura.watanabe@example.com',      '1995-09-09', '(202) 555-1028'),
    (@PE029, 'Emmanuel',   'Nkrumah',      'emmanuel.nkrumah@example.com',     '1982-06-13', '(305) 555-1029'),
    (@PE030, 'Lena',       'Hoffman',      'lena.hoffman@example.com',         '1988-11-25', '(650) 555-1030'),

    -- ==============================
    -- PE031-PE060: BOTH Member AND Speaker (overlapping!)
    -- ==============================
    (@PE031, 'Arjun',      'Mehta',        'arjun.mehta@example.com',          '1984-04-10', '(503) 555-1031'),
    (@PE032, 'Camille',    'Leroy',        'camille.leroy@example.com',        '1991-08-22', '(919) 555-1032'),
    (@PE033, 'Kofi',       'Mensah',       'kofi.mensah@example.com',          '1979-12-05', '(720) 555-1033'),
    (@PE034, 'Astrid',     'Lindgren',     'astrid.lindgren@example.com',      '1986-02-18', '(408) 555-1034'),
    (@PE035, 'Chen',       'Weiming',      'chen.weiming@example.com',         '1993-06-30', '(469) 555-1035'),
    (@PE036, 'Nadia',      'Khoury',       'nadia.khoury@example.com',         '1980-10-14', '(614) 555-1036'),
    (@PE037, 'Tomasz',     'Kowalski',     'tomasz.kowalski@example.com',      '1977-05-26', '(818) 555-1037'),
    (@PE038, 'Aisha',      'Mohammed',     'aisha.mohammed@example.com',       '1989-01-08', '(602) 555-1038'),
    (@PE039, 'Luca',       'Bianchi',      'luca.bianchi@example.com',         '1983-07-21', '(512) 555-1039'),
    (@PE040, 'Yoon-Hee',   'Park',         'yoonhee.park@example.com',         '1994-03-03', '(415) 555-1040'),
    (@PE041, 'Svetlana',   'Ivanova',      'svetlana.ivanova@example.com',     '1981-09-17', '(206) 555-1041'),
    (@PE042, 'Diego',      'Herrera',      'diego.herrera@example.com',        '1988-11-29', '(312) 555-1042'),
    (@PE043, 'Freya',      'Magnusdottir', 'freya.magnusdottir@example.com',   '1992-05-11', '(617) 555-1043'),
    (@PE044, 'Chinedu',    'Eze',          'chinedu.eze@example.com',          '1976-08-24', '(404) 555-1044'),
    (@PE045, 'Marta',      'Gonzalez',     'marta.gonzalez@example.com',       '1990-12-06', '(303) 555-1045'),
    (@PE046, 'Ravi',       'Patel',        'ravi.patel@example.com',           '1985-04-19', '(713) 555-1046'),
    (@PE047, 'Sonja',      'Eriksen',      'sonja.eriksen@example.com',        '1982-10-01', '(202) 555-1047'),
    (@PE048, 'Moussa',     'Traore',       'moussa.traore@example.com',        '1987-02-13', '(305) 555-1048'),
    (@PE049, 'Hana',       'Kimura',       'hana.kimura@example.com',          '1993-07-26', '(650) 555-1049'),
    (@PE050, 'Andrei',     'Popescu',      'andrei.popescu@example.com',       '1978-01-08', '(503) 555-1050'),
    (@PE051, 'Zara',       'Hussain',      'zara.hussain@example.com',         '1991-06-20', '(919) 555-1051'),
    (@PE052, 'Gustav',     'Johansson',    'gustav.johansson@example.com',     '1984-12-02', '(720) 555-1052'),
    (@PE053, 'Adaeze',     'Obiora',       'adaeze.obiora@example.com',        '1989-03-15', '(408) 555-1053'),
    (@PE054, 'Philippe',   'Moreau',       'philippe.moreau@example.com',      '1977-09-28', '(469) 555-1054'),
    (@PE055, 'Sunita',     'Rao',          'sunita.rao@example.com',           '1986-05-10', '(614) 555-1055'),
    (@PE056, 'Javier',     'Cruz',         'javier.cruz@example.com',          '1992-11-22', '(818) 555-1056'),
    (@PE057, 'Olga',       'Sokolova',     'olga.sokolova@example.com',        '1980-07-04', '(602) 555-1057'),
    (@PE058, 'Ibrahim',    'Sesay',        'ibrahim.sesay@example.com',        '1988-01-17', '(512) 555-1058'),
    (@PE059, 'Minji',      'Lee',          'minji.lee@example.com',            '1994-08-29', '(415) 555-1059'),
    (@PE060, 'Eoin',       'Murphy',       'eoin.murphy@example.com',          '1983-04-11', '(206) 555-1060'),

    -- ==============================
    -- PE061-PE080: Speaker ONLY
    -- ==============================
    (@PE061, 'Amina',      'Jibril',       'amina.jibril@example.com',         '1987-06-23', '(312) 555-1061'),
    (@PE062, 'Sebastian',  'Keller',       'sebastian.keller@example.com',     '1981-10-05', '(617) 555-1062'),
    (@PE063, 'Thandiwe',   'Moyo',         'thandiwe.moyo@example.com',        '1990-02-17', '(404) 555-1063'),
    (@PE064, 'Kenji',      'Nakamura',     'kenji.nakamura@example.com',       '1976-08-01', '(303) 555-1064'),
    (@PE065, 'Isabella',   'Moretti',      'isabella.moretti@example.com',     '1993-12-13', '(713) 555-1065'),
    (@PE066, 'Osei',       'Boateng',      'osei.boateng@example.com',         '1985-04-25', '(202) 555-1066'),
    (@PE067, 'Maja',       'Wojcik',       'maja.wojcik@example.com',          '1989-09-07', '(305) 555-1067'),
    (@PE068, 'Tariq',      'Rahman',       'tariq.rahman@example.com',         '1982-01-19', '(650) 555-1068'),
    (@PE069, 'Linnea',     'Strand',       'linnea.strand@example.com',        '1991-07-31', '(503) 555-1069'),
    (@PE070, 'Emeka',      'Onyekachi',    'emeka.onyekachi@example.com',      '1978-03-13', '(919) 555-1070'),
    (@PE071, 'Valentina',  'Sousa',        'valentina.sousa@example.com',      '1986-11-26', '(720) 555-1071'),
    (@PE072, 'Hiroshi',    'Ito',          'hiroshi.ito@example.com',          '1980-05-08', '(408) 555-1072'),
    (@PE073, 'Celine',     'Bonnet',       'celine.bonnet@example.com',        '1992-09-20', '(469) 555-1073'),
    (@PE074, 'Babatunde',  'Adesanya',     'babatunde.adesanya@example.com',   '1977-02-02', '(614) 555-1074'),
    (@PE075, 'Elif',       'Yilmaz',       'elif.yilmaz@example.com',          '1988-06-14', '(818) 555-1075'),
    (@PE076, 'Nikolai',    'Volkov',       'nikolai.volkov@example.com',       '1984-12-27', '(602) 555-1076'),
    (@PE077, 'Ximena',     'Castillo',     'ximena.castillo@example.com',      '1990-04-09', '(512) 555-1077'),
    (@PE078, 'Dae-Jung',   'Kim',          'daejung.kim@example.com',          '1979-08-21', '(415) 555-1078'),
    (@PE079, 'Fiona',      'MacLeod',      'fiona.macleod@example.com',        '1987-01-03', '(206) 555-1079'),
    (@PE080, 'Uche',       'Okwu',         'uche.okwu@example.com',            '1993-10-15', '(312) 555-1080'),

    -- ==============================
    -- PE081-PE100: Standalone persons (neither Member nor Speaker)
    -- ==============================
    (@PE081, 'Mateo',      'Vargas',       'mateo.vargas@example.com',         '1986-05-27', '(617) 555-1081'),
    (@PE082, 'Ayumi',      'Kobayashi',    'ayumi.kobayashi@example.com',      '1991-11-09', '(404) 555-1082'),
    (@PE083, 'Cedric',     'Dubois',       'cedric.dubois@example.com',        '1978-03-21', '(303) 555-1083'),
    (@PE084, 'Wanjiku',    'Kamau',        'wanjiku.kamau@example.com',        '1989-07-14', '(713) 555-1084'),
    (@PE085, 'Oscar',      'Lindqvist',    'oscar.lindqvist@example.com',      '1983-01-06', '(202) 555-1085'),
    (@PE086, 'Deepika',    'Nair',         'deepika.nair@example.com',         '1992-09-18', '(305) 555-1086'),
    (@PE087, 'Brendan',    'Gallagher',    'brendan.gallagher@example.com',    '1980-04-30', '(650) 555-1087'),
    (@PE088, 'Yoko',       'Mori',         'yoko.mori@example.com',            '1987-12-12', '(503) 555-1088'),
    (@PE089, 'Aboubacar',  'Camara',       'aboubacar.camara@example.com',     '1985-06-24', '(919) 555-1089'),
    (@PE090, 'Petra',      'Svoboda',      'petra.svoboda@example.com',        '1990-10-06', '(720) 555-1090'),
    (@PE091, 'Rohan',      'Gupta',        'rohan.gupta@example.com',          '1982-02-19', '(408) 555-1091'),
    (@PE092, 'Giulia',     'Conti',        'giulia.conti@example.com',         '1994-08-01', '(469) 555-1092'),
    (@PE093, 'Kwesi',      'Appiah',       'kwesi.appiah@example.com',         '1977-04-13', '(614) 555-1093'),
    (@PE094, 'Helena',     'Reis',         'helena.reis@example.com',          '1988-10-25', '(818) 555-1094'),
    (@PE095, 'Vinh',       'Nguyen',       'vinh.nguyen@example.com',          '1981-06-07', '(602) 555-1095'),
    (@PE096, 'Miriam',     'Stein',        'miriam.stein@example.com',         '1993-12-19', '(512) 555-1096'),
    (@PE097, 'Felix',      'Bauer',        'felix.bauer@example.com',          '1986-03-02', '(415) 555-1097'),
    (@PE098, 'Nkechi',     'Obi',          'nkechi.obi@example.com',           '1979-09-14', '(206) 555-1098'),
    (@PE099, 'Tomas',      'Dvorak',       'tomas.dvorak@example.com',         '1991-01-27', '(312) 555-1099'),
    (@PE100, 'Suki',       'Phan',         'suki.phan@example.com',            '1984-07-09', '(617) 555-1100');

PRINT '  Inserted 100 Person records';

-- ---------------------------------------------------------------------------
-- Insert Members: 60 records (PE001-PE060)
-- PE001-PE020 are Elite/Premium (will also be GoldMembers)
-- PE021-PE030 are Standard/Basic (Member only, not GoldMember)
-- PE031-PE060 are mixed levels (ALSO Speakers — overlapping!)
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[Member] ([ID], [MembershipDate], [MembershipLevel], [DuesAmount], [IsActive])
VALUES
    -- PE001-PE010: Elite members (also GoldMembers)
    (@PE001, '2020-01-15', 'Elite',    2500.00, 1),
    (@PE002, '2019-06-01', 'Elite',    2500.00, 1),
    (@PE003, '2021-03-10', 'Elite',    2500.00, 1),
    (@PE004, '2018-09-22', 'Elite',    2500.00, 1),
    (@PE005, '2020-11-05', 'Elite',    2500.00, 1),
    (@PE006, '2017-04-18', 'Elite',    2500.00, 1),
    (@PE007, '2022-01-20', 'Elite',    2500.00, 1),
    (@PE008, '2019-08-14', 'Elite',    2500.00, 1),
    (@PE009, '2020-05-30', 'Elite',    2500.00, 1),
    (@PE010, '2018-12-01', 'Elite',    2500.00, 1),

    -- PE011-PE020: Premium members (also GoldMembers)
    (@PE011, '2021-07-15', 'Premium',  1500.00, 1),
    (@PE012, '2020-02-28', 'Premium',  1500.00, 1),
    (@PE013, '2022-04-10', 'Premium',  1500.00, 1),
    (@PE014, '2019-10-20', 'Premium',  1500.00, 1),
    (@PE015, '2021-01-05', 'Premium',  1500.00, 1),
    (@PE016, '2020-08-17', 'Premium',  1500.00, 1),
    (@PE017, '2022-06-22', 'Premium',  1500.00, 1),
    (@PE018, '2018-03-14', 'Premium',  1500.00, 1),
    (@PE019, '2021-11-30', 'Premium',  1500.00, 1),
    (@PE020, '2019-05-08', 'Premium',  1500.00, 1),

    -- PE021-PE030: Standard/Basic members (Member ONLY, not GoldMember)
    (@PE021, '2023-02-14', 'Standard',  750.00, 1),
    (@PE022, '2022-09-01', 'Standard',  750.00, 1),
    (@PE023, '2024-01-10', 'Basic',     250.00, 1),
    (@PE024, '2023-06-18', 'Standard',  750.00, 1),
    (@PE025, '2024-03-22', 'Basic',     250.00, 1),
    (@PE026, '2023-11-05', 'Standard',  750.00, 0),  -- inactive
    (@PE027, '2022-07-30', 'Standard',  750.00, 1),
    (@PE028, '2024-05-12', 'Basic',     250.00, 1),
    (@PE029, '2023-08-25', 'Standard',  750.00, 1),
    (@PE030, '2024-02-01', 'Basic',     250.00, 0),  -- inactive

    -- PE031-PE060: Mixed-level members (ALSO Speakers — overlapping!)
    (@PE031, '2021-04-15', 'Premium',  1500.00, 1),
    (@PE032, '2022-08-01', 'Standard',  750.00, 1),
    (@PE033, '2020-12-10', 'Elite',    2500.00, 1),
    (@PE034, '2023-03-22', 'Standard',  750.00, 1),
    (@PE035, '2021-09-05', 'Premium',  1500.00, 1),
    (@PE036, '2019-11-18', 'Elite',    2500.00, 1),
    (@PE037, '2022-05-30', 'Standard',  750.00, 1),
    (@PE038, '2023-07-14', 'Basic',     250.00, 1),
    (@PE039, '2020-03-01', 'Premium',  1500.00, 1),
    (@PE040, '2024-01-20', 'Basic',     250.00, 1),
    (@PE041, '2021-06-08', 'Premium',  1500.00, 0),  -- inactive
    (@PE042, '2022-10-25', 'Standard',  750.00, 1),
    (@PE043, '2023-01-15', 'Standard',  750.00, 1),
    (@PE044, '2019-07-04', 'Elite',    2500.00, 1),
    (@PE045, '2024-04-18', 'Basic',     250.00, 1),
    (@PE046, '2020-09-22', 'Premium',  1500.00, 1),
    (@PE047, '2022-02-14', 'Standard',  750.00, 1),
    (@PE048, '2021-08-30', 'Premium',  1500.00, 1),
    (@PE049, '2023-05-10', 'Standard',  750.00, 1),
    (@PE050, '2019-01-25', 'Elite',    2500.00, 0),  -- inactive
    (@PE051, '2022-11-08', 'Standard',  750.00, 1),
    (@PE052, '2024-06-01', 'Basic',     250.00, 1),
    (@PE053, '2021-03-17', 'Premium',  1500.00, 1),
    (@PE054, '2020-07-22', 'Premium',  1500.00, 1),
    (@PE055, '2023-09-14', 'Standard',  750.00, 1),
    (@PE056, '2024-02-28', 'Basic',     250.00, 1),
    (@PE057, '2019-12-05', 'Elite',    2500.00, 1),
    (@PE058, '2022-04-18', 'Standard',  750.00, 1),
    (@PE059, '2023-10-30', 'Standard',  750.00, 1),
    (@PE060, '2021-01-12', 'Premium',  1500.00, 1);

PRINT '  Inserted 60 Member records (shared PK with Person)';

-- ---------------------------------------------------------------------------
-- Insert GoldMembers: 20 records (PE001-PE020)
-- These are the top-tier members with additional benefits.
-- Their IDs exist in Person, Member, AND GoldMember (3-level chain).
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[GoldMember] ([ID], [GoldSince], [PersonalAdvisor], [AnnualBenefitLimit], [PointsBalance])
VALUES
    (@PE001, '2021-06-01', 'Victoria Sterling',    75000.00, 24500),
    (@PE002, '2020-09-15', 'Jonathan Blake',        75000.00, 31200),
    (@PE003, '2022-01-10', 'Victoria Sterling',    50000.00, 12800),
    (@PE004, '2019-12-01', 'Margaret Chen',         100000.00, 45600),
    (@PE005, '2021-08-20', 'Jonathan Blake',        75000.00, 18900),
    (@PE006, '2018-07-01', 'Margaret Chen',         100000.00, 67300),
    (@PE007, '2023-03-15', 'David Okonkwo',         50000.00,  8400),
    (@PE008, '2020-11-01', 'Victoria Sterling',    75000.00, 29100),
    (@PE009, '2021-04-10', 'David Okonkwo',         50000.00, 15700),
    (@PE010, '2019-06-22', 'Margaret Chen',         100000.00, 52400),
    (@PE011, '2022-09-01', 'Jonathan Blake',        50000.00, 11300),
    (@PE012, '2021-05-15', 'David Okonkwo',         50000.00, 19800),
    (@PE013, '2023-06-20', 'Victoria Sterling',    50000.00,  6200),
    (@PE014, '2020-03-01', 'Margaret Chen',         75000.00, 38500),
    (@PE015, '2022-04-10', 'Jonathan Blake',        50000.00,  9700),
    (@PE016, '2021-10-05', 'David Okonkwo',         50000.00, 14200),
    (@PE017, '2023-09-01', 'Victoria Sterling',    50000.00,  3800),
    (@PE018, '2019-08-14', 'Margaret Chen',         100000.00, 58100),
    (@PE019, '2022-12-20', 'Jonathan Blake',        50000.00,  7500),
    (@PE020, '2020-07-08', 'David Okonkwo',         75000.00, 33600);

PRINT '  Inserted 20 GoldMember records (shared PK with Member and Person)';

-- ---------------------------------------------------------------------------
-- Insert Speakers: 50 records (PE031-PE080)
-- PE031-PE060 are ALSO Members (overlapping!)
-- PE061-PE080 are Speaker ONLY
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[Speaker] ([ID], [Bio], [Expertise], [HourlyRate], [AvailableForBooking])
VALUES
    -- PE031-PE060: BOTH Member AND Speaker (overlapping!)
    (@PE031, 'Cloud architect with 15 years of experience building scalable distributed systems.',                    'Cloud Architecture',          350.00, 1),
    (@PE032, 'Data scientist specializing in NLP and large language model applications.',                              'Natural Language Processing',  400.00, 1),
    (@PE033, 'Veteran software engineer and open-source contributor focused on developer tooling.',                    'Developer Tooling',           300.00, 1),
    (@PE034, 'UX researcher and designer bridging the gap between analytics and user experience.',                     'UX Research & Design',        275.00, 1),
    (@PE035, 'Full-stack developer with deep expertise in TypeScript and reactive frameworks.',                         'TypeScript & Frameworks',     325.00, 1),
    (@PE036, 'Database performance expert specializing in query optimization and indexing strategies.',                 'Database Performance',        450.00, 1),
    (@PE037, 'Cybersecurity consultant with specialization in zero-trust architecture.',                                'Cybersecurity',               500.00, 1),
    (@PE038, 'Community builder and developer advocate for metadata-driven platforms.',                                 'Developer Advocacy',          200.00, 1),
    (@PE039, 'Machine learning engineer focused on computer vision and edge computing.',                                'Machine Learning',            375.00, 1),
    (@PE040, 'Frontend specialist in accessibility and inclusive design patterns.',                                      'Accessibility & Inclusion',   250.00, 1),
    (@PE041, 'Distributed systems researcher with publications on consensus algorithms.',                               'Distributed Systems',         425.00, 0),  -- not available
    (@PE042, 'DevOps engineer and CI/CD pipeline architect for enterprise environments.',                               'DevOps & CI/CD',              300.00, 1),
    (@PE043, 'API design expert advocating for contract-first development approaches.',                                 'API Design',                  350.00, 1),
    (@PE044, 'Enterprise architect with 25 years of experience in financial services technology.',                      'Enterprise Architecture',     600.00, 1),
    (@PE045, 'Technical writer and documentation specialist for developer platforms.',                                  'Technical Writing',           175.00, 1),
    (@PE046, 'Data engineering lead specializing in real-time streaming architectures.',                                 'Data Engineering',            400.00, 1),
    (@PE047, 'Agile coach and transformation consultant for engineering organizations.',                                'Agile & Transformation',      350.00, 1),
    (@PE048, 'Mobile development expert spanning iOS, Android, and cross-platform frameworks.',                         'Mobile Development',          325.00, 1),
    (@PE049, 'GraphQL and API gateway specialist with deep knowledge of federation patterns.',                          'GraphQL & APIs',              375.00, 1),
    (@PE050, 'Legacy modernization expert helping organizations migrate from monoliths to microservices.',              'Legacy Modernization',        500.00, 0),  -- not available
    (@PE051, 'AI ethics researcher exploring responsible AI deployment in business contexts.',                           'AI Ethics',                   300.00, 1),
    (@PE052, 'Infrastructure-as-code evangelist and Terraform community contributor.',                                  'Infrastructure as Code',      275.00, 1),
    (@PE053, 'Product management leader with focus on data-driven decision making.',                                    'Product Management',          350.00, 1),
    (@PE054, 'Microservices architect with expertise in service mesh and observability.',                                'Microservices',               450.00, 1),
    (@PE055, 'Quantum computing researcher bridging theoretical physics and practical applications.',                   'Quantum Computing',           550.00, 1),
    (@PE056, 'Web performance specialist focused on Core Web Vitals and user experience metrics.',                      'Web Performance',             250.00, 1),
    (@PE057, 'Platform engineering pioneer building internal developer platforms for scale.',                            'Platform Engineering',        475.00, 1),
    (@PE058, 'Open-source sustainability advocate and maintainer of popular TypeScript libraries.',                      'Open Source',                 225.00, 1),
    (@PE059, 'Event-driven architecture expert specializing in CQRS and event sourcing patterns.',                      'Event-Driven Architecture',   400.00, 1),
    (@PE060, 'Testing and quality engineering leader championing shift-left testing strategies.',                        'Testing & QA',                275.00, 1),

    -- PE061-PE080: Speaker ONLY (not a Member)
    (@PE061, 'Blockchain developer and smart contract auditor for DeFi platforms.',                                     'Blockchain & Web3',           500.00, 1),
    (@PE062, 'Embedded systems engineer working on IoT and industrial automation.',                                     'Embedded Systems & IoT',      350.00, 1),
    (@PE063, 'Climate tech innovator applying machine learning to environmental monitoring.',                            'Climate Tech & ML',           325.00, 1),
    (@PE064, 'Compiler engineer and programming language designer with decades of experience.',                          'Compilers & Languages',       550.00, 1),
    (@PE065, 'Design systems architect creating scalable component libraries for enterprises.',                          'Design Systems',              300.00, 1),
    (@PE066, 'Site reliability engineer focused on chaos engineering and resilience testing.',                            'Site Reliability',            400.00, 1),
    (@PE067, 'Natural language generation researcher working on conversational AI systems.',                              'Conversational AI',           425.00, 1),
    (@PE068, 'Data privacy and compliance expert specializing in GDPR and global regulations.',                          'Data Privacy & Compliance',   475.00, 1),
    (@PE069, 'Game engine developer and real-time rendering specialist.',                                                 'Game Development',            300.00, 0),  -- not available
    (@PE070, 'Supply chain optimization expert using operations research and AI.',                                        'Supply Chain & OR',           450.00, 1),
    (@PE071, 'Low-code platform architect helping organizations democratize software development.',                      'Low-Code Platforms',          275.00, 1),
    (@PE072, 'Robotics engineer specializing in autonomous navigation and sensor fusion.',                                'Robotics & Autonomy',         500.00, 1),
    (@PE073, 'Digital transformation consultant bridging business strategy and technology execution.',                    'Digital Transformation',      350.00, 1),
    (@PE074, 'High-performance computing specialist optimizing workloads for GPU clusters.',                              'High-Performance Computing',  525.00, 1),
    (@PE075, 'Bioinformatics researcher applying data science to genomics and drug discovery.',                           'Bioinformatics',              400.00, 1),
    (@PE076, 'Networking and protocol design expert with contributions to IETF standards.',                               'Networking & Protocols',      450.00, 0),  -- not available
    (@PE077, 'AR/VR developer creating immersive experiences for education and training.',                                'AR/VR Development',           325.00, 1),
    (@PE078, 'Database internals expert and author of books on storage engine design.',                                   'Database Internals',          550.00, 1),
    (@PE079, 'Functional programming advocate with expertise in Haskell and category theory.',                            'Functional Programming',      375.00, 1),
    (@PE080, 'Edge computing architect designing systems for latency-sensitive applications.',                             'Edge Computing',              400.00, 1);

PRINT '  Inserted 50 Speaker records (shared PK with Person; PE031-PE060 overlap with Member)';
GO

-- =============================================================================================================
-- PHASE 5C: SAMPLE DATA - ORGANIZATIONS (50 records) AND VENDORS (30 records)
-- =============================================================================================================
PRINT '=== Phase 5C: Inserting Organization and Vendor data ===';

-- Organization UUIDs
DECLARE @OR001 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000001';
DECLARE @OR002 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000002';
DECLARE @OR003 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000003';
DECLARE @OR004 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000004';
DECLARE @OR005 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000005';
DECLARE @OR006 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000006';
DECLARE @OR007 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000007';
DECLARE @OR008 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000008';
DECLARE @OR009 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000009';
DECLARE @OR010 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000010';
DECLARE @OR011 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000011';
DECLARE @OR012 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000012';
DECLARE @OR013 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000013';
DECLARE @OR014 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000014';
DECLARE @OR015 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000015';
DECLARE @OR016 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000016';
DECLARE @OR017 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000017';
DECLARE @OR018 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000018';
DECLARE @OR019 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000019';
DECLARE @OR020 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000020';
DECLARE @OR021 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000021';
DECLARE @OR022 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000022';
DECLARE @OR023 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000023';
DECLARE @OR024 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000024';
DECLARE @OR025 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000025';
DECLARE @OR026 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000026';
DECLARE @OR027 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000027';
DECLARE @OR028 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000028';
DECLARE @OR029 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000029';
DECLARE @OR030 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000030';
DECLARE @OR031 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000031';
DECLARE @OR032 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000032';
DECLARE @OR033 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000033';
DECLARE @OR034 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000034';
DECLARE @OR035 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000035';
DECLARE @OR036 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000036';
DECLARE @OR037 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000037';
DECLARE @OR038 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000038';
DECLARE @OR039 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000039';
DECLARE @OR040 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000040';
DECLARE @OR041 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000041';
DECLARE @OR042 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000042';
DECLARE @OR043 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000043';
DECLARE @OR044 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000044';
DECLARE @OR045 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000045';
DECLARE @OR046 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000046';
DECLARE @OR047 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000047';
DECLARE @OR048 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000048';
DECLARE @OR049 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000049';
DECLARE @OR050 UNIQUEIDENTIFIER = 'D2000001-0001-4000-8000-000000000050';

-- ---------------------------------------------------------------------------
-- Insert Organizations: 50 records
-- OR001-OR030 will also be Vendors
-- OR031-OR050 are standalone organizations
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[Organization] ([ID], [Name], [Website], [Industry], [FoundedYear], [EmployeeCount])
VALUES
    -- OR001-OR010: Technology vendors
    (@OR001, 'Apex Cloud Solutions',       'https://apexcloud.io',          'Cloud Computing',        2015, 450),
    (@OR002, 'ByteForge Technologies',     'https://byteforge.dev',         'Software Development',   2012, 280),
    (@OR003, 'CipherGuard Security',       'https://cipherguard.com',       'Cybersecurity',          2018, 120),
    (@OR004, 'DataStream Analytics',       'https://datastream.ai',         'Data Analytics',         2016, 350),
    (@OR005, 'ElasticEdge Computing',      'https://elasticedge.io',        'Edge Computing',         2019, 85),
    (@OR006, 'FusionStack Labs',           'https://fusionstack.com',       'Developer Tools',        2014, 190),
    (@OR007, 'GridPoint Infrastructure',   'https://gridpoint.tech',        'Infrastructure',         2011, 520),
    (@OR008, 'HyperNova Systems',          'https://hypernova.systems',     'High-Performance Computing', 2017, 210),
    (@OR009, 'IonWave Networks',           'https://ionwave.net',           'Networking',             2013, 340),
    (@OR010, 'JetBridge Software',         'https://jetbridge.dev',         'Enterprise Software',    2010, 680),

    -- OR011-OR020: Professional services vendors
    (@OR011, 'Keystone Consulting Group',  'https://keystonecg.com',        'Management Consulting',  2008, 1200),
    (@OR012, 'Lighthouse Digital Agency',  'https://lighthousedigital.co',  'Digital Marketing',      2016, 95),
    (@OR013, 'Meridian Talent Solutions',  'https://meridiantalent.com',    'Staffing & Recruiting',  2013, 180),
    (@OR014, 'NorthStar Legal Partners',   'https://northstarlegal.com',    'Legal Services',         2005, 320),
    (@OR015, 'Oakbridge Financial',        'https://oakbridgefin.com',      'Financial Services',     2009, 550),
    (@OR016, 'PulsePoint Health',          'https://pulsepointhealth.org',  'Healthcare IT',          2017, 130),
    (@OR017, 'Quantum Leap Training',      'https://quantumleaptraining.com','Education & Training',  2014, 75),
    (@OR018, 'RedLine Logistics',          'https://redlinelogistics.com',  'Supply Chain & Logistics',2011, 890),
    (@OR019, 'SilverThread Design',        'https://silverthread.design',   'UX & Product Design',    2018, 60),
    (@OR020, 'TerraFirm Engineering',      'https://terrafirm.eng',         'Engineering Services',   2007, 420),

    -- OR021-OR030: Mixed industry vendors
    (@OR021, 'Vanguard Manufacturing',     'https://vanguardmfg.com',       'Manufacturing',          2003, 1500),
    (@OR022, 'Wavelength Communications',  'https://wavelengthcomm.io',     'Telecommunications',     2015, 275),
    (@OR023, 'Xenon Research Labs',        'https://xenonlabs.com',         'Research & Development', 2019, 45),
    (@OR024, 'Yellowstone Data Centers',   'https://yellowstonedc.com',     'Data Center Operations', 2012, 380),
    (@OR025, 'Zephyr Clean Energy',        'https://zephyrenergy.com',      'Renewable Energy',       2016, 210),
    (@OR026, 'Atlas Office Supplies',      'https://atlasoffice.com',       'Office Supplies',        2001, 650),
    (@OR027, 'Bolero Travel Services',     'https://bolerotravel.com',      'Travel & Hospitality',   2010, 190),
    (@OR028, 'Cortex AI Solutions',        'https://cortexai.io',           'Artificial Intelligence', 2020, 55),
    (@OR029, 'Dynamo Hardware',            'https://dynamohw.com',          'Hardware Manufacturing',  2008, 430),
    (@OR030, 'Evergreen Media Group',      'https://evergreenmedia.com',    'Media & Publishing',     2013, 160),

    -- OR031-OR050: Standalone organizations (not vendors)
    (@OR031, 'Alpine Community Foundation','https://alpinecf.org',          'Nonprofit',              1998, 35),
    (@OR032, 'Birchwood University',       'https://birchwood.edu',         'Higher Education',       1952, 4500),
    (@OR033, 'Cascade Health Systems',     'https://cascadehealth.org',     'Healthcare',             2006, 2200),
    (@OR034, 'Driftwood Arts Collective',  'https://driftwoodarts.org',     'Arts & Culture',         2015, 12),
    (@OR035, 'Emerald City Chamber',       'https://emeraldchamber.org',    'Business Association',   1975, 25),
    (@OR036, 'Foxglove Biotech',           'https://foxglovebio.com',       'Biotechnology',          2018, 95),
    (@OR037, 'Granite Peak Athletics',     'https://granitepeak.org',       'Sports & Recreation',    2010, 45),
    (@OR038, 'Harbor View Hospital',       'https://harborviewhosp.org',    'Healthcare',             1988, 3800),
    (@OR039, 'Ironwood Credit Union',      'https://ironwoodcu.org',        'Financial Services',     1965, 280),
    (@OR040, 'Juniper Research Institute', 'https://juniperresearch.org',   'Research',               2012, 150),
    (@OR041, 'Kestrel Aviation',           'https://kestrelaviation.com',   'Aviation',               2009, 520),
    (@OR042, 'Lakeshore Community College','https://lakeshore.edu',         'Education',              1968, 1200),
    (@OR043, 'Magnolia Publishing House',  'https://magnoliapub.com',       'Publishing',             2005, 80),
    (@OR044, 'Nighthawk Defense Systems',  'https://nighthawkdef.com',      'Defense & Aerospace',    2001, 950),
    (@OR045, 'Orchard Valley Farms',       'https://orchardvalley.com',     'Agriculture',            1990, 200),
    (@OR046, 'Pinnacle Sports Media',      'https://pinnaclesm.com',        'Sports Media',           2016, 110),
    (@OR047, 'Quartz Financial Advisors',  'https://quartzfa.com',          'Wealth Management',      2011, 65),
    (@OR048, 'Rosewood Hotels',            'https://rosewoodhotels.com',    'Hospitality',            1998, 1800),
    (@OR049, 'Sapphire Tech Academy',      'https://sapphiretech.edu',      'Education Technology',   2017, 40),
    (@OR050, 'Timberline Construction',    'https://timberlinecon.com',     'Construction',           2004, 730);

PRINT '  Inserted 50 Organization records';

-- ---------------------------------------------------------------------------
-- Insert Vendors: 30 records (OR001-OR030)
-- These share PKs with the Organization records above.
-- ---------------------------------------------------------------------------
INSERT INTO [AdvancedEntities].[Vendor] ([ID], [VendorCode], [PaymentTerms], [TaxID], [PreferredCurrency], [Rating])
VALUES
    (@OR001, 'VND-APEX-001',   'Net-30',  '12-3456781', 'USD', 4.5),
    (@OR002, 'VND-BYTE-002',   'Net-30',  '12-3456782', 'USD', 4.2),
    (@OR003, 'VND-CIPH-003',   'Net-15',  '12-3456783', 'USD', 4.8),
    (@OR004, 'VND-DATA-004',   'Net-45',  '12-3456784', 'USD', 4.0),
    (@OR005, 'VND-ELAS-005',   'Net-30',  '12-3456785', 'USD', 3.8),
    (@OR006, 'VND-FUSI-006',   'Net-30',  '12-3456786', 'USD', 4.3),
    (@OR007, 'VND-GRID-007',   'Net-60',  '12-3456787', 'USD', 4.7),
    (@OR008, 'VND-HYPE-008',   'Net-30',  '12-3456788', 'USD', 4.1),
    (@OR009, 'VND-IONW-009',   'Net-45',  '12-3456789', 'USD', 3.9),
    (@OR010, 'VND-JETB-010',   'Net-60',  '12-3456790', 'USD', 4.6),
    (@OR011, 'VND-KEYS-011',   'Net-30',  '12-3456791', 'USD', 4.4),
    (@OR012, 'VND-LIGH-012',   'Net-15',  '12-3456792', 'USD', 3.7),
    (@OR013, 'VND-MERI-013',   'Net-30',  '12-3456793', 'USD', 4.0),
    (@OR014, 'VND-NORT-014',   'Net-45',  '12-3456794', 'USD', 4.5),
    (@OR015, 'VND-OAKB-015',   'Net-60',  '12-3456795', 'USD', 4.8),
    (@OR016, 'VND-PULS-016',   'Net-30',  '12-3456796', 'USD', 4.2),
    (@OR017, 'VND-QUAN-017',   'Prepaid', '12-3456797', 'USD', 3.5),
    (@OR018, 'VND-REDL-018',   'Net-45',  '12-3456798', 'USD', 4.3),
    (@OR019, 'VND-SILV-019',   'Net-15',  '12-3456799', 'USD', 4.6),
    (@OR020, 'VND-TERR-020',   'Net-30',  '12-3456800', 'USD', 4.1),
    (@OR021, 'VND-VANG-021',   'Net-60',  '12-3456801', 'USD', 3.9),
    (@OR022, 'VND-WAVE-022',   'Net-30',  '12-3456802', 'USD', 4.0),
    (@OR023, 'VND-XENO-023',   'Prepaid', '12-3456803', 'EUR', 4.7),
    (@OR024, 'VND-YELL-024',   'Net-45',  '12-3456804', 'USD', 4.4),
    (@OR025, 'VND-ZEPH-025',   'Net-30',  '12-3456805', 'USD', 4.2),
    (@OR026, 'VND-ATLA-026',   'Net-15',  '12-3456806', 'USD', 3.6),
    (@OR027, 'VND-BOLE-027',   'Net-30',  '12-3456807', 'USD', 4.1),
    (@OR028, 'VND-CORT-028',   'Net-30',  '12-3456808', 'USD', 4.9),
    (@OR029, 'VND-DYNA-029',   'Net-45',  '12-3456809', 'USD', 4.0),
    (@OR030, 'VND-EVER-030',   'Net-30',  '12-3456810', 'USD', 3.8);

PRINT '  Inserted 30 Vendor records (shared PK with Organization)';
GO

-- =============================================================================================================
-- PHASE 6B: VERIFICATION QUERIES FOR OVERLAPPING SUBTYPES
-- =============================================================================================================
PRINT '=== Phase 6B: Running verification queries for overlapping subtypes ===';
PRINT '';

-- Verify row counts for all new tables
PRINT '--- Row Counts (New Tables) ---';
SELECT 'Person'       AS [Table], COUNT(*) AS [Rows] FROM [AdvancedEntities].[Person]
UNION ALL
SELECT 'Member',       COUNT(*) FROM [AdvancedEntities].[Member]
UNION ALL
SELECT 'GoldMember',   COUNT(*) FROM [AdvancedEntities].[GoldMember]
UNION ALL
SELECT 'Speaker',      COUNT(*) FROM [AdvancedEntities].[Speaker]
UNION ALL
SELECT 'Organization', COUNT(*) FROM [AdvancedEntities].[Organization]
UNION ALL
SELECT 'Vendor',       COUNT(*) FROM [AdvancedEntities].[Vendor]
ORDER BY [Table];
-- Expected: Person=100, Member=60, GoldMember=20, Speaker=50, Organization=50, Vendor=30

-- Verify IS-A shared PK: every Member ID exists in Person
PRINT '--- IS-A PK Verification: Members ---';
SELECT
    'PASS' AS [Status],
    COUNT(*) AS [MemberCount],
    'All Member IDs exist in Person' AS [Check]
FROM [AdvancedEntities].[Member] m
INNER JOIN [AdvancedEntities].[Person] p ON m.[ID] = p.[ID];
-- Expected: 60

-- Verify orphan check: no Member without a Person
SELECT
    'VIOLATION' AS [Status],
    m.[ID] AS [OrphanMemberID]
FROM [AdvancedEntities].[Member] m
LEFT JOIN [AdvancedEntities].[Person] p ON m.[ID] = p.[ID]
WHERE p.[ID] IS NULL;
-- Expected: 0 rows

-- Verify IS-A shared PK: every GoldMember ID exists in Member AND Person
PRINT '--- IS-A PK Verification: GoldMembers (3-level chain) ---';
SELECT
    gm.[ID],
    p.[FirstName] + ' ' + p.[LastName] AS [PersonName],
    m.[MembershipLevel],
    gm.[PersonalAdvisor],
    gm.[PointsBalance],
    'GoldMember IS-A Member IS-A Person' AS [Relationship]
FROM [AdvancedEntities].[GoldMember] gm
INNER JOIN [AdvancedEntities].[Member] m ON gm.[ID] = m.[ID]
INNER JOIN [AdvancedEntities].[Person] p ON m.[ID] = p.[ID];
-- Expected: 20 rows

-- Verify IS-A shared PK: every Speaker ID exists in Person
PRINT '--- IS-A PK Verification: Speakers ---';
SELECT
    'PASS' AS [Status],
    COUNT(*) AS [SpeakerCount],
    'All Speaker IDs exist in Person' AS [Check]
FROM [AdvancedEntities].[Speaker] s
INNER JOIN [AdvancedEntities].[Person] p ON s.[ID] = p.[ID];
-- Expected: 50

-- Verify IS-A shared PK: every Vendor ID exists in Organization
PRINT '--- IS-A PK Verification: Vendors ---';
SELECT
    'PASS' AS [Status],
    COUNT(*) AS [VendorCount],
    'All Vendor IDs exist in Organization' AS [Check]
FROM [AdvancedEntities].[Vendor] v
INNER JOIN [AdvancedEntities].[Organization] o ON v.[ID] = o.[ID];
-- Expected: 30

-- =============================================================================================================
-- KEY VERIFICATION: OVERLAPPING subtype check
-- This is the critical query demonstrating overlapping IS-A subtypes.
-- It finds persons who exist in BOTH the Member AND Speaker tables.
-- In a disjoint hierarchy (like Product -> Meeting/Publication), this would be 0 rows.
-- In our overlapping hierarchy, we expect EXACTLY 30 rows (PE031-PE060).
-- =============================================================================================================
PRINT '--- OVERLAPPING Subtype Verification: Persons who are BOTH Member AND Speaker ---';
SELECT
    p.[ID],
    p.[FirstName] + ' ' + p.[LastName] AS [PersonName],
    p.[Email],
    m.[MembershipLevel],
    m.[DuesAmount],
    s.[Expertise],
    s.[HourlyRate],
    'Person IS BOTH Member AND Speaker' AS [OverlapType]
FROM [AdvancedEntities].[Person] p
INNER JOIN [AdvancedEntities].[Member] m ON p.[ID] = m.[ID]
INNER JOIN [AdvancedEntities].[Speaker] s ON p.[ID] = s.[ID]
ORDER BY p.[LastName], p.[FirstName];
-- Expected: EXACTLY 30 rows (PE031-PE060)

-- Show the distribution breakdown
PRINT '--- Person Subtype Distribution ---';
SELECT
    CASE
        WHEN m.[ID] IS NOT NULL AND s.[ID] IS NOT NULL THEN 'Both Member AND Speaker'
        WHEN m.[ID] IS NOT NULL AND s.[ID] IS NULL     THEN 'Member ONLY'
        WHEN m.[ID] IS NULL     AND s.[ID] IS NOT NULL THEN 'Speaker ONLY'
        ELSE 'Neither (standalone Person)'
    END AS [SubtypeCategory],
    COUNT(*) AS [PersonCount]
FROM [AdvancedEntities].[Person] p
LEFT JOIN [AdvancedEntities].[Member] m ON p.[ID] = m.[ID]
LEFT JOIN [AdvancedEntities].[Speaker] s ON p.[ID] = s.[ID]
GROUP BY
    CASE
        WHEN m.[ID] IS NOT NULL AND s.[ID] IS NOT NULL THEN 'Both Member AND Speaker'
        WHEN m.[ID] IS NOT NULL AND s.[ID] IS NULL     THEN 'Member ONLY'
        WHEN m.[ID] IS NULL     AND s.[ID] IS NOT NULL THEN 'Speaker ONLY'
        ELSE 'Neither (standalone Person)'
    END
ORDER BY [SubtypeCategory];
-- Expected:
--   Both Member AND Speaker: 30
--   Member ONLY: 30
--   Neither (standalone Person): 20
--   Speaker ONLY: 20

-- =============================================================================================================
-- CONTRAST: Disjoint check still works for the existing Product hierarchy
-- Product -> Meeting and Product -> Publication remain DISJOINT
-- =============================================================================================================
PRINT '--- CONTRAST: Product hierarchy remains DISJOINT ---';
SELECT
    'Product DISJOINT check' AS [Test],
    COUNT(*) AS [ViolationCount],
    CASE
        WHEN COUNT(*) = 0 THEN 'PASS - No product is both Meeting and Publication'
        ELSE 'FAIL - Disjoint constraint violated!'
    END AS [Result]
FROM [AdvancedEntities].[Meeting] m
INNER JOIN [AdvancedEntities].[Publication] pub ON m.[ID] = pub.[ID];
-- Expected: ViolationCount=0, PASS

-- Organization subtype distribution
PRINT '--- Organization Subtype Distribution ---';
SELECT
    CASE
        WHEN v.[ID] IS NOT NULL THEN 'Vendor (IS-A Organization)'
        ELSE 'Standalone Organization'
    END AS [SubtypeCategory],
    COUNT(*) AS [OrgCount]
FROM [AdvancedEntities].[Organization] o
LEFT JOIN [AdvancedEntities].[Vendor] v ON o.[ID] = v.[ID]
GROUP BY
    CASE
        WHEN v.[ID] IS NOT NULL THEN 'Vendor (IS-A Organization)'
        ELSE 'Standalone Organization'
    END
ORDER BY [SubtypeCategory];
-- Expected:
--   Standalone Organization: 20
--   Vendor (IS-A Organization): 30

PRINT '';
PRINT '=== AdvancedEntities demo schema created successfully! ===';
PRINT '';
PRINT 'Disjoint IS-A:     Product (20) -> Meeting (7) -> Webinar (4), Publication (5)';
PRINT 'Overlapping IS-A:  Person (100) -> Member (60) -> GoldMember (20), Speaker (50)';
PRINT '                   Organization (50) -> Vendor (30)';
PRINT 'Virtual Entities:  Customer (25), Order (85) -> 4 aggregation views';
PRINT '';
PRINT 'Overlapping test:  30 persons are BOTH Member AND Speaker simultaneously';
PRINT 'Disjoint test:     0 products are both Meeting and Publication';
PRINT '';
PRINT 'See Demos/AdvancedEntities/README.md for CodeGen integration steps.';
GO
