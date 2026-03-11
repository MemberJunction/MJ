-- ============================================================================
-- Sample E-Commerce Migration - T-SQL
-- Stress-tests the unified sql-convert tool with different domain/constructs
-- Schema: sample_ecom
-- Constructs exercised: self-ref FK, multi-FK to same table, CHECK/UNIQUE,
--   SMALLINT, VARCHAR (non-NVARCHAR), N-string literals, computed view exprs,
--   hierarchical inserts, multiple sp_addextendedproperty calls
-- ============================================================================

-- Create schema
CREATE SCHEMA sample_ecom
GO

-- ============================================================================
-- TABLES
-- ============================================================================

-- Category table (self-referencing FK for hierarchy)
CREATE TABLE [sample_ecom].[Category] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(150) NOT NULL,
    [ParentCategoryID] UNIQUEIDENTIFIER NULL,
    [DisplayOrder] INT NOT NULL DEFAULT 0,
    [IsVisible] BIT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_Category] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- Product table
CREATE TABLE [sample_ecom].[Product] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SKU] VARCHAR(50) NOT NULL,
    [Name] NVARCHAR(300) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [Price] DECIMAL(10,2) NOT NULL,
    [DiscountPrice] DECIMAL(10,2) NULL,
    [StockQuantity] INT NOT NULL DEFAULT 0,
    [Weight] DECIMAL(8,3) NULL,
    [CategoryID] UNIQUEIDENTIFIER NOT NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_Product] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Product_SKU] UNIQUE NONCLUSTERED ([SKU])
)
GO

-- Customer table
CREATE TABLE [sample_ecom].[Customer] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Email] NVARCHAR(255) NOT NULL,
    [FirstName] NVARCHAR(100) NOT NULL,
    [LastName] NVARCHAR(100) NOT NULL,
    [Phone] VARCHAR(20) NULL,
    [IsVerified] BIT NOT NULL DEFAULT 0,
    [RegistrationDate] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [Notes] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_Customer] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Customer_Email] UNIQUE NONCLUSTERED ([Email])
)
GO

-- Address table
CREATE TABLE [sample_ecom].[Address] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [CustomerID] UNIQUEIDENTIFIER NOT NULL,
    [AddressType] VARCHAR(20) NOT NULL DEFAULT 'Shipping',
    [Street1] NVARCHAR(200) NOT NULL,
    [Street2] NVARCHAR(200) NULL,
    [City] NVARCHAR(100) NOT NULL,
    [State] NVARCHAR(50) NOT NULL,
    [ZipCode] VARCHAR(20) NOT NULL,
    [Country] VARCHAR(3) NOT NULL DEFAULT 'USA',
    [IsDefault] BIT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_Address] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- OrderHeader table (multiple FKs to Address)
CREATE TABLE [sample_ecom].[OrderHeader] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [OrderNumber] VARCHAR(20) NOT NULL,
    [CustomerID] UNIQUEIDENTIFIER NOT NULL,
    [ShippingAddressID] UNIQUEIDENTIFIER NOT NULL,
    [BillingAddressID] UNIQUEIDENTIFIER NOT NULL,
    [OrderDate] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [Status] VARCHAR(20) NOT NULL DEFAULT 'Pending',
    [SubTotal] DECIMAL(12,2) NOT NULL,
    [TaxAmount] DECIMAL(12,2) NOT NULL,
    [ShippingAmount] DECIMAL(12,2) NOT NULL,
    [TotalAmount] DECIMAL(12,2) NOT NULL,
    [Notes] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_OrderHeader] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_OrderHeader_OrderNumber] UNIQUE NONCLUSTERED ([OrderNumber])
)
GO

-- OrderItem table
CREATE TABLE [sample_ecom].[OrderItem] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [OrderID] UNIQUEIDENTIFIER NOT NULL,
    [ProductID] UNIQUEIDENTIFIER NOT NULL,
    [Quantity] INT NOT NULL,
    [UnitPrice] DECIMAL(10,2) NOT NULL,
    [LineTotal] DECIMAL(12,2) NOT NULL,
    [DiscountApplied] DECIMAL(10,2) NOT NULL DEFAULT 0,
    CONSTRAINT [PK_OrderItem] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- ProductReview table (SMALLINT for Rating)
CREATE TABLE [sample_ecom].[ProductReview] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ProductID] UNIQUEIDENTIFIER NOT NULL,
    [CustomerID] UNIQUEIDENTIFIER NOT NULL,
    [Rating] SMALLINT NOT NULL,
    [Title] NVARCHAR(200) NOT NULL,
    [Body] NVARCHAR(MAX) NULL,
    [IsApproved] BIT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_ProductReview] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- Coupon table
CREATE TABLE [sample_ecom].[Coupon] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Code] VARCHAR(30) NOT NULL,
    [Description] NVARCHAR(500) NULL,
    [DiscountType] VARCHAR(10) NOT NULL,
    [DiscountValue] DECIMAL(10,2) NOT NULL,
    [MinOrderAmount] DECIMAL(10,2) NULL,
    [MaxUses] INT NULL,
    [CurrentUses] INT NOT NULL DEFAULT 0,
    [StartDate] DATE NOT NULL,
    [EndDate] DATE NOT NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_Coupon] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Coupon_Code] UNIQUE NONCLUSTERED ([Code])
)
GO

-- ============================================================================
-- CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE [sample_ecom].[ProductReview]
    ADD CONSTRAINT [CK_ProductReview_Rating] CHECK ([Rating] BETWEEN 1 AND 5)
GO

ALTER TABLE [sample_ecom].[Coupon]
    ADD CONSTRAINT [CK_Coupon_DiscountType] CHECK ([DiscountType] IN ('Percent', 'Fixed'))
GO

ALTER TABLE [sample_ecom].[OrderItem]
    ADD CONSTRAINT [CK_OrderItem_Quantity] CHECK ([Quantity] > 0)
GO

ALTER TABLE [sample_ecom].[Product]
    ADD CONSTRAINT [CK_Product_Price] CHECK ([Price] >= 0)
GO

ALTER TABLE [sample_ecom].[Coupon]
    ADD CONSTRAINT [CK_Coupon_Dates] CHECK ([EndDate] >= [StartDate])
GO

ALTER TABLE [sample_ecom].[Product]
    ADD CONSTRAINT [CK_Product_StockQuantity] CHECK ([StockQuantity] >= 0)
GO

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Self-referencing FK on Category
ALTER TABLE [sample_ecom].[Category]
    ADD CONSTRAINT [FK_Category_ParentCategory] FOREIGN KEY ([ParentCategoryID])
    REFERENCES [sample_ecom].[Category] ([ID])
GO

ALTER TABLE [sample_ecom].[Product]
    ADD CONSTRAINT [FK_Product_Category] FOREIGN KEY ([CategoryID])
    REFERENCES [sample_ecom].[Category] ([ID])
GO

ALTER TABLE [sample_ecom].[Address]
    ADD CONSTRAINT [FK_Address_Customer] FOREIGN KEY ([CustomerID])
    REFERENCES [sample_ecom].[Customer] ([ID])
GO

ALTER TABLE [sample_ecom].[OrderHeader]
    ADD CONSTRAINT [FK_OrderHeader_Customer] FOREIGN KEY ([CustomerID])
    REFERENCES [sample_ecom].[Customer] ([ID])
GO

-- Multiple FKs from OrderHeader to Address
ALTER TABLE [sample_ecom].[OrderHeader]
    ADD CONSTRAINT [FK_OrderHeader_ShippingAddress] FOREIGN KEY ([ShippingAddressID])
    REFERENCES [sample_ecom].[Address] ([ID])
GO

ALTER TABLE [sample_ecom].[OrderHeader]
    ADD CONSTRAINT [FK_OrderHeader_BillingAddress] FOREIGN KEY ([BillingAddressID])
    REFERENCES [sample_ecom].[Address] ([ID])
GO

ALTER TABLE [sample_ecom].[OrderItem]
    ADD CONSTRAINT [FK_OrderItem_OrderHeader] FOREIGN KEY ([OrderID])
    REFERENCES [sample_ecom].[OrderHeader] ([ID])
GO

ALTER TABLE [sample_ecom].[OrderItem]
    ADD CONSTRAINT [FK_OrderItem_Product] FOREIGN KEY ([ProductID])
    REFERENCES [sample_ecom].[Product] ([ID])
GO

ALTER TABLE [sample_ecom].[ProductReview]
    ADD CONSTRAINT [FK_ProductReview_Product] FOREIGN KEY ([ProductID])
    REFERENCES [sample_ecom].[Product] ([ID])
GO

ALTER TABLE [sample_ecom].[ProductReview]
    ADD CONSTRAINT [FK_ProductReview_Customer] FOREIGN KEY ([CustomerID])
    REFERENCES [sample_ecom].[Customer] ([ID])
GO

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE NONCLUSTERED INDEX [IX_Product_CategoryID]
    ON [sample_ecom].[Product] ([CategoryID])
GO

CREATE NONCLUSTERED INDEX [IX_Address_CustomerID]
    ON [sample_ecom].[Address] ([CustomerID])
GO

CREATE NONCLUSTERED INDEX [IX_OrderHeader_CustomerID]
    ON [sample_ecom].[OrderHeader] ([CustomerID])
GO

CREATE NONCLUSTERED INDEX [IX_OrderHeader_ShippingAddressID]
    ON [sample_ecom].[OrderHeader] ([ShippingAddressID])
GO

CREATE NONCLUSTERED INDEX [IX_OrderHeader_BillingAddressID]
    ON [sample_ecom].[OrderHeader] ([BillingAddressID])
GO

CREATE NONCLUSTERED INDEX [IX_OrderItem_OrderID]
    ON [sample_ecom].[OrderItem] ([OrderID])
GO

CREATE NONCLUSTERED INDEX [IX_OrderItem_ProductID]
    ON [sample_ecom].[OrderItem] ([ProductID])
GO

CREATE NONCLUSTERED INDEX [IX_ProductReview_ProductID]
    ON [sample_ecom].[ProductReview] ([ProductID])
GO

CREATE NONCLUSTERED INDEX [IX_ProductReview_CustomerID]
    ON [sample_ecom].[ProductReview] ([CustomerID])
GO

CREATE NONCLUSTERED INDEX [IX_Category_ParentCategoryID]
    ON [sample_ecom].[Category] ([ParentCategoryID])
GO

-- ============================================================================
-- VIEWS
-- ============================================================================

-- vwProductCatalog: Active products with category name
CREATE VIEW [sample_ecom].[vwProductCatalog]
AS
SELECT
    p.[ID],
    p.[SKU],
    p.[Name] AS [ProductName],
    p.[Description],
    p.[Price],
    p.[DiscountPrice],
    COALESCE(p.[DiscountPrice], p.[Price]) AS [EffectivePrice],
    p.[StockQuantity],
    p.[Weight],
    c.[Name] AS [CategoryName],
    pc.[Name] AS [ParentCategoryName],
    p.[CreatedAt],
    p.[UpdatedAt]
FROM
    [sample_ecom].[Product] p
    INNER JOIN [sample_ecom].[Category] c ON p.[CategoryID] = c.[ID]
    LEFT JOIN [sample_ecom].[Category] pc ON c.[ParentCategoryID] = pc.[ID]
WHERE
    p.[IsActive] = 1
    AND c.[IsVisible] = 1
GO

-- vwCustomerOrders: Customer info joined with order totals
CREATE VIEW [sample_ecom].[vwCustomerOrders]
AS
SELECT
    cu.[ID] AS [CustomerID],
    cu.[FirstName] + N' ' + cu.[LastName] AS [CustomerName],
    cu.[Email],
    o.[ID] AS [OrderID],
    o.[OrderNumber],
    o.[OrderDate],
    o.[Status],
    o.[SubTotal],
    o.[TaxAmount],
    o.[ShippingAmount],
    o.[SubTotal] + o.[TaxAmount] + o.[ShippingAmount] AS [ComputedTotal],
    o.[TotalAmount]
FROM
    [sample_ecom].[Customer] cu
    INNER JOIN [sample_ecom].[OrderHeader] o ON cu.[ID] = o.[CustomerID]
GO

-- vwTopProducts: Products with avg rating and review count
CREATE VIEW [sample_ecom].[vwTopProducts]
AS
SELECT
    p.[ID],
    p.[SKU],
    p.[Name] AS [ProductName],
    p.[Price],
    c.[Name] AS [CategoryName],
    COUNT(r.[ID]) AS [ReviewCount],
    CAST(AVG(CAST(r.[Rating] AS DECIMAL(5,2))) AS DECIMAL(3,1)) AS [AvgRating]
FROM
    [sample_ecom].[Product] p
    INNER JOIN [sample_ecom].[Category] c ON p.[CategoryID] = c.[ID]
    LEFT JOIN [sample_ecom].[ProductReview] r ON p.[ID] = r.[ProductID] AND r.[IsApproved] = 1
WHERE
    p.[IsActive] = 1
GROUP BY
    p.[ID], p.[SKU], p.[Name], p.[Price], c.[Name]
GO

-- vwOrderSummary: Order details with customer name, item count, status
CREATE VIEW [sample_ecom].[vwOrderSummary]
AS
SELECT
    o.[ID] AS [OrderID],
    o.[OrderNumber],
    cu.[FirstName] + N' ' + cu.[LastName] AS [CustomerName],
    cu.[Email] AS [CustomerEmail],
    o.[OrderDate],
    o.[Status],
    COUNT(oi.[ID]) AS [ItemCount],
    SUM(oi.[Quantity]) AS [TotalUnits],
    o.[TotalAmount],
    o.[Notes]
FROM
    [sample_ecom].[OrderHeader] o
    INNER JOIN [sample_ecom].[Customer] cu ON o.[CustomerID] = cu.[ID]
    LEFT JOIN [sample_ecom].[OrderItem] oi ON o.[ID] = oi.[OrderID]
GROUP BY
    o.[ID], o.[OrderNumber], cu.[FirstName], cu.[LastName], cu.[Email],
    o.[OrderDate], o.[Status], o.[TotalAmount], o.[Notes]
GO

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Categories (hierarchy: root categories first, then children)
INSERT INTO [sample_ecom].[Category] ([ID], [Name], [ParentCategoryID], [DisplayOrder], [IsVisible])
VALUES ('10000001-0000-0000-0000-000000000001', N'Electronics', NULL, 1, 1)
GO

INSERT INTO [sample_ecom].[Category] ([ID], [Name], [ParentCategoryID], [DisplayOrder], [IsVisible])
VALUES ('10000001-0000-0000-0000-000000000002', N'Clothing', NULL, 2, 1)
GO

INSERT INTO [sample_ecom].[Category] ([ID], [Name], [ParentCategoryID], [DisplayOrder], [IsVisible])
VALUES ('10000001-0000-0000-0000-000000000003', N'Home & Garden', NULL, 3, 1)
GO

INSERT INTO [sample_ecom].[Category] ([ID], [Name], [ParentCategoryID], [DisplayOrder], [IsVisible])
VALUES ('10000001-0000-0000-0000-000000000004', N'Laptops', '10000001-0000-0000-0000-000000000001', 1, 1)
GO

INSERT INTO [sample_ecom].[Category] ([ID], [Name], [ParentCategoryID], [DisplayOrder], [IsVisible])
VALUES ('10000001-0000-0000-0000-000000000005', N'Smartphones', '10000001-0000-0000-0000-000000000001', 2, 1)
GO

INSERT INTO [sample_ecom].[Category] ([ID], [Name], [ParentCategoryID], [DisplayOrder], [IsVisible])
VALUES ('10000001-0000-0000-0000-000000000006', N'Men''s Apparel', '10000001-0000-0000-0000-000000000002', 1, 1)
GO

INSERT INTO [sample_ecom].[Category] ([ID], [Name], [ParentCategoryID], [DisplayOrder], [IsVisible])
VALUES ('10000001-0000-0000-0000-000000000007', N'Women''s Apparel', '10000001-0000-0000-0000-000000000002', 2, 1)
GO

-- Products (10+ products across categories)
INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000001', 'LAP-PRO-001', N'ProBook Laptop 15"', N'High-performance laptop with 16GB RAM and 512GB SSD', 1299.99, 1199.99, 45, 2.100, '10000001-0000-0000-0000-000000000004', 1)
GO

INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000002', 'LAP-ECO-002', N'EcoBook Laptop 13"', N'Lightweight ultrabook for everyday computing', 799.99, NULL, 120, 1.350, '10000001-0000-0000-0000-000000000004', 1)
GO

INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000003', 'PHN-FLG-001', N'FlagPhone Ultra', N'Flagship smartphone with 6.7" OLED display', 999.99, 949.99, 200, 0.210, '10000001-0000-0000-0000-000000000005', 1)
GO

INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000004', 'PHN-BUD-002', N'BudgetPhone SE', N'Affordable smartphone with great camera', 349.99, NULL, 500, 0.185, '10000001-0000-0000-0000-000000000005', 1)
GO

INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000005', 'MEN-TSH-001', N'Classic Cotton T-Shirt', N'100% organic cotton crew neck t-shirt', 29.99, 24.99, 350, 0.200, '10000001-0000-0000-0000-000000000006', 1)
GO

INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000006', 'MEN-JKT-002', N'Tech Fleece Jacket', N'Warm and lightweight fleece jacket for all seasons', 89.99, NULL, 75, 0.450, '10000001-0000-0000-0000-000000000006', 1)
GO

INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000007', 'WMN-DRS-001', N'Silk Evening Dress', N'Elegant silk dress for special occasions', 249.99, 199.99, 30, 0.350, '10000001-0000-0000-0000-000000000007', 1)
GO

INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000008', 'WMN-SNK-002', N'Runner Pro Sneakers', N'Lightweight running sneakers with arch support', 119.99, NULL, 180, 0.600, '10000001-0000-0000-0000-000000000007', 1)
GO

INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000009', 'HOM-PLT-001', N'Indoor Herb Garden Kit', N'Complete kit for growing fresh herbs indoors', 59.99, 49.99, 90, 3.500, '10000001-0000-0000-0000-000000000003', 1)
GO

INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000010', 'HOM-LMP-002', N'Smart LED Desk Lamp', N'Adjustable LED desk lamp with wireless charging base', 79.99, NULL, 60, 1.800, '10000001-0000-0000-0000-000000000003', 1)
GO

INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000011', 'LAP-GAM-003', N'GameStation Laptop 17"', N'Gaming laptop with RTX 4070 and 32GB RAM', 2199.99, NULL, 15, 3.200, '10000001-0000-0000-0000-000000000004', 1)
GO

INSERT INTO [sample_ecom].[Product] ([ID], [SKU], [Name], [Description], [Price], [DiscountPrice], [StockQuantity], [Weight], [CategoryID], [IsActive])
VALUES ('20000001-0000-0000-0000-000000000012', 'PHN-OLD-003', N'ClassicPhone 3G', N'Basic phone - discontinued model', 99.99, NULL, 0, 0.150, '10000001-0000-0000-0000-000000000005', 0)
GO

-- Customers
INSERT INTO [sample_ecom].[Customer] ([ID], [Email], [FirstName], [LastName], [Phone], [IsVerified], [Notes])
VALUES ('30000001-0000-0000-0000-000000000001', N'john.doe@example.com', N'John', N'Doe', '555-1001', 1, N'VIP customer since 2020')
GO

INSERT INTO [sample_ecom].[Customer] ([ID], [Email], [FirstName], [LastName], [Phone], [IsVerified], [Notes])
VALUES ('30000001-0000-0000-0000-000000000002', N'jane.smith@example.com', N'Jane', N'Smith', '555-1002', 1, NULL)
GO

INSERT INTO [sample_ecom].[Customer] ([ID], [Email], [FirstName], [LastName], [Phone], [IsVerified])
VALUES ('30000001-0000-0000-0000-000000000003', N'robert.wilson@example.com', N'Robert', N'Wilson', '555-1003', 1)
GO

INSERT INTO [sample_ecom].[Customer] ([ID], [Email], [FirstName], [LastName], [Phone], [IsVerified])
VALUES ('30000001-0000-0000-0000-000000000004', N'maria.garcia@example.com', N'Maria', N'Garcia', NULL, 0)
GO

INSERT INTO [sample_ecom].[Customer] ([ID], [Email], [FirstName], [LastName], [Phone], [IsVerified])
VALUES ('30000001-0000-0000-0000-000000000005', N'li.chen@example.com', N'Li', N'Chen', '555-1005', 1)
GO

INSERT INTO [sample_ecom].[Customer] ([ID], [Email], [FirstName], [LastName], [Phone], [IsVerified])
VALUES ('30000001-0000-0000-0000-000000000006', N'emily.taylor@example.com', N'Emily', N'Taylor', '555-1006', 0)
GO

-- Addresses (multiple per customer, different types)
INSERT INTO [sample_ecom].[Address] ([ID], [CustomerID], [AddressType], [Street1], [Street2], [City], [State], [ZipCode], [Country], [IsDefault])
VALUES ('40000001-0000-0000-0000-000000000001', '30000001-0000-0000-0000-000000000001', 'Shipping', N'123 Main Street', N'Apt 4B', N'New York', N'NY', '10001', 'USA', 1)
GO

INSERT INTO [sample_ecom].[Address] ([ID], [CustomerID], [AddressType], [Street1], [City], [State], [ZipCode], [Country], [IsDefault])
VALUES ('40000001-0000-0000-0000-000000000002', '30000001-0000-0000-0000-000000000001', 'Billing', N'123 Main Street', N'New York', N'NY', '10001', 'USA', 0)
GO

INSERT INTO [sample_ecom].[Address] ([ID], [CustomerID], [AddressType], [Street1], [City], [State], [ZipCode], [Country], [IsDefault])
VALUES ('40000001-0000-0000-0000-000000000003', '30000001-0000-0000-0000-000000000002', 'Shipping', N'456 Oak Avenue', N'Los Angeles', N'CA', '90001', 'USA', 1)
GO

INSERT INTO [sample_ecom].[Address] ([ID], [CustomerID], [AddressType], [Street1], [City], [State], [ZipCode], [Country], [IsDefault])
VALUES ('40000001-0000-0000-0000-000000000004', '30000001-0000-0000-0000-000000000003', 'Shipping', N'789 Pine Road', N'Chicago', N'IL', '60601', 'USA', 1)
GO

INSERT INTO [sample_ecom].[Address] ([ID], [CustomerID], [AddressType], [Street1], [City], [State], [ZipCode], [Country], [IsDefault])
VALUES ('40000001-0000-0000-0000-000000000005', '30000001-0000-0000-0000-000000000004', 'Shipping', N'321 Elm Boulevard', N'Houston', N'TX', '77001', 'USA', 1)
GO

INSERT INTO [sample_ecom].[Address] ([ID], [CustomerID], [AddressType], [Street1], [City], [State], [ZipCode], [Country], [IsDefault])
VALUES ('40000001-0000-0000-0000-000000000006', '30000001-0000-0000-0000-000000000005', 'Shipping', N'555 Cedar Lane', N'San Francisco', N'CA', '94101', 'USA', 1)
GO

INSERT INTO [sample_ecom].[Address] ([ID], [CustomerID], [AddressType], [Street1], [City], [State], [ZipCode], [Country], [IsDefault])
VALUES ('40000001-0000-0000-0000-000000000007', '30000001-0000-0000-0000-000000000005', 'Billing', N'555 Cedar Lane', N'San Francisco', N'CA', '94101', 'USA', 0)
GO

-- Orders
INSERT INTO [sample_ecom].[OrderHeader] ([ID], [OrderNumber], [CustomerID], [ShippingAddressID], [BillingAddressID], [OrderDate], [Status], [SubTotal], [TaxAmount], [ShippingAmount], [TotalAmount], [Notes])
VALUES ('50000001-0000-0000-0000-000000000001', 'ORD-2024-00001', '30000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000002', '2024-06-15', 'Shipped', 1324.98, 115.94, 15.99, 1456.91, N'Express shipping requested')
GO

INSERT INTO [sample_ecom].[OrderHeader] ([ID], [OrderNumber], [CustomerID], [ShippingAddressID], [BillingAddressID], [OrderDate], [Status], [SubTotal], [TaxAmount], [ShippingAmount], [TotalAmount])
VALUES ('50000001-0000-0000-0000-000000000002', 'ORD-2024-00002', '30000001-0000-0000-0000-000000000002', '40000001-0000-0000-0000-000000000003', '40000001-0000-0000-0000-000000000003', '2024-07-01', 'Delivered', 349.99, 28.88, 0.00, 378.87)
GO

INSERT INTO [sample_ecom].[OrderHeader] ([ID], [OrderNumber], [CustomerID], [ShippingAddressID], [BillingAddressID], [OrderDate], [Status], [SubTotal], [TaxAmount], [ShippingAmount], [TotalAmount])
VALUES ('50000001-0000-0000-0000-000000000003', 'ORD-2024-00003', '30000001-0000-0000-0000-000000000003', '40000001-0000-0000-0000-000000000004', '40000001-0000-0000-0000-000000000004', '2024-07-20', 'Pending', 2249.98, 191.25, 25.00, 2466.23)
GO

INSERT INTO [sample_ecom].[OrderHeader] ([ID], [OrderNumber], [CustomerID], [ShippingAddressID], [BillingAddressID], [OrderDate], [Status], [SubTotal], [TaxAmount], [ShippingAmount], [TotalAmount])
VALUES ('50000001-0000-0000-0000-000000000004', 'ORD-2024-00004', '30000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000002', '2024-08-05', 'Processing', 89.99, 7.87, 5.99, 103.85)
GO

INSERT INTO [sample_ecom].[OrderHeader] ([ID], [OrderNumber], [CustomerID], [ShippingAddressID], [BillingAddressID], [OrderDate], [Status], [SubTotal], [TaxAmount], [ShippingAmount], [TotalAmount])
VALUES ('50000001-0000-0000-0000-000000000005', 'ORD-2024-00005', '30000001-0000-0000-0000-000000000005', '40000001-0000-0000-0000-000000000006', '40000001-0000-0000-0000-000000000007', '2024-08-15', 'Delivered', 1419.97, 127.80, 0.00, 1547.77)
GO

INSERT INTO [sample_ecom].[OrderHeader] ([ID], [OrderNumber], [CustomerID], [ShippingAddressID], [BillingAddressID], [OrderDate], [Status], [SubTotal], [TaxAmount], [ShippingAmount], [TotalAmount], [Notes])
VALUES ('50000001-0000-0000-0000-000000000006', 'ORD-2024-00006', '30000001-0000-0000-0000-000000000004', '40000001-0000-0000-0000-000000000005', '40000001-0000-0000-0000-000000000005', '2024-09-01', 'Cancelled', 59.99, 4.95, 5.99, 70.93, N'Customer changed mind')
GO

-- Order Items
INSERT INTO [sample_ecom].[OrderItem] ([ID], [OrderID], [ProductID], [Quantity], [UnitPrice], [LineTotal], [DiscountApplied])
VALUES ('60000001-0000-0000-0000-000000000001', '50000001-0000-0000-0000-000000000001', '20000001-0000-0000-0000-000000000001', 1, 1199.99, 1199.99, 100.00)
GO

INSERT INTO [sample_ecom].[OrderItem] ([ID], [OrderID], [ProductID], [Quantity], [UnitPrice], [LineTotal])
VALUES ('60000001-0000-0000-0000-000000000002', '50000001-0000-0000-0000-000000000001', '20000001-0000-0000-0000-000000000005', 5, 24.99, 124.99)
GO

INSERT INTO [sample_ecom].[OrderItem] ([ID], [OrderID], [ProductID], [Quantity], [UnitPrice], [LineTotal])
VALUES ('60000001-0000-0000-0000-000000000003', '50000001-0000-0000-0000-000000000002', '20000001-0000-0000-0000-000000000004', 1, 349.99, 349.99)
GO

INSERT INTO [sample_ecom].[OrderItem] ([ID], [OrderID], [ProductID], [Quantity], [UnitPrice], [LineTotal])
VALUES ('60000001-0000-0000-0000-000000000004', '50000001-0000-0000-0000-000000000003', '20000001-0000-0000-0000-000000000011', 1, 2199.99, 2199.99)
GO

INSERT INTO [sample_ecom].[OrderItem] ([ID], [OrderID], [ProductID], [Quantity], [UnitPrice], [LineTotal])
VALUES ('60000001-0000-0000-0000-000000000005', '50000001-0000-0000-0000-000000000003', '20000001-0000-0000-0000-000000000010', 1, 49.99, 49.99)
GO

INSERT INTO [sample_ecom].[OrderItem] ([ID], [OrderID], [ProductID], [Quantity], [UnitPrice], [LineTotal])
VALUES ('60000001-0000-0000-0000-000000000006', '50000001-0000-0000-0000-000000000004', '20000001-0000-0000-0000-000000000006', 1, 89.99, 89.99)
GO

INSERT INTO [sample_ecom].[OrderItem] ([ID], [OrderID], [ProductID], [Quantity], [UnitPrice], [LineTotal], [DiscountApplied])
VALUES ('60000001-0000-0000-0000-000000000007', '50000001-0000-0000-0000-000000000005', '20000001-0000-0000-0000-000000000003', 1, 949.99, 949.99, 50.00)
GO

INSERT INTO [sample_ecom].[OrderItem] ([ID], [OrderID], [ProductID], [Quantity], [UnitPrice], [LineTotal])
VALUES ('60000001-0000-0000-0000-000000000008', '50000001-0000-0000-0000-000000000005', '20000001-0000-0000-0000-000000000007', 1, 199.99, 199.99)
GO

INSERT INTO [sample_ecom].[OrderItem] ([ID], [OrderID], [ProductID], [Quantity], [UnitPrice], [LineTotal])
VALUES ('60000001-0000-0000-0000-000000000009', '50000001-0000-0000-0000-000000000005', '20000001-0000-0000-0000-000000000009', 3, 49.99, 149.97)
GO

INSERT INTO [sample_ecom].[OrderItem] ([ID], [OrderID], [ProductID], [Quantity], [UnitPrice], [LineTotal])
VALUES ('60000001-0000-0000-0000-000000000010', '50000001-0000-0000-0000-000000000005', '20000001-0000-0000-0000-000000000008', 1, 119.99, 119.99)
GO

INSERT INTO [sample_ecom].[OrderItem] ([ID], [OrderID], [ProductID], [Quantity], [UnitPrice], [LineTotal])
VALUES ('60000001-0000-0000-0000-000000000011', '50000001-0000-0000-0000-000000000006', '20000001-0000-0000-0000-000000000009', 1, 59.99, 59.99)
GO

-- Product Reviews
INSERT INTO [sample_ecom].[ProductReview] ([ID], [ProductID], [CustomerID], [Rating], [Title], [Body], [IsApproved])
VALUES ('70000001-0000-0000-0000-000000000001', '20000001-0000-0000-0000-000000000001', '30000001-0000-0000-0000-000000000001', 5, N'Excellent laptop!', N'Blazing fast performance, great build quality. Worth every penny.', 1)
GO

INSERT INTO [sample_ecom].[ProductReview] ([ID], [ProductID], [CustomerID], [Rating], [Title], [Body], [IsApproved])
VALUES ('70000001-0000-0000-0000-000000000002', '20000001-0000-0000-0000-000000000001', '30000001-0000-0000-0000-000000000003', 4, N'Great but heavy', N'Performance is top-notch but it''s a bit heavy for daily carry.', 1)
GO

INSERT INTO [sample_ecom].[ProductReview] ([ID], [ProductID], [CustomerID], [Rating], [Title], [Body], [IsApproved])
VALUES ('70000001-0000-0000-0000-000000000003', '20000001-0000-0000-0000-000000000003', '30000001-0000-0000-0000-000000000002', 5, N'Best phone ever', N'The camera and display are absolutely stunning.', 1)
GO

INSERT INTO [sample_ecom].[ProductReview] ([ID], [ProductID], [CustomerID], [Rating], [Title], [Body], [IsApproved])
VALUES ('70000001-0000-0000-0000-000000000004', '20000001-0000-0000-0000-000000000005', '30000001-0000-0000-0000-000000000005', 3, N'Decent quality', N'Good for the price but fabric could be softer.', 1)
GO

INSERT INTO [sample_ecom].[ProductReview] ([ID], [ProductID], [CustomerID], [Rating], [Title], [Body], [IsApproved])
VALUES ('70000001-0000-0000-0000-000000000005', '20000001-0000-0000-0000-000000000004', '30000001-0000-0000-0000-000000000004', 4, N'Great budget option', N'Does everything I need without breaking the bank.', 1)
GO

INSERT INTO [sample_ecom].[ProductReview] ([ID], [ProductID], [CustomerID], [Rating], [Title], [Body], [IsApproved])
VALUES ('70000001-0000-0000-0000-000000000006', '20000001-0000-0000-0000-000000000009', '30000001-0000-0000-0000-000000000005', 2, N'Kit was incomplete', N'Missing some seeds from the package. Contacted support.', 0)
GO

INSERT INTO [sample_ecom].[ProductReview] ([ID], [ProductID], [CustomerID], [Rating], [Title], [Body], [IsApproved])
VALUES ('70000001-0000-0000-0000-000000000007', '20000001-0000-0000-0000-000000000007', '30000001-0000-0000-0000-000000000002', 5, N'Stunning dress', N'Perfect fit and beautiful silk. Got compliments all evening!', 1)
GO

-- Coupons
INSERT INTO [sample_ecom].[Coupon] ([ID], [Code], [Description], [DiscountType], [DiscountValue], [MinOrderAmount], [MaxUses], [CurrentUses], [StartDate], [EndDate], [IsActive])
VALUES ('80000001-0000-0000-0000-000000000001', 'SAVE10', N'10% off any order', 'Percent', 10.00, 50.00, 1000, 247, '2024-01-01', '2024-12-31', 1)
GO

INSERT INTO [sample_ecom].[Coupon] ([ID], [Code], [Description], [DiscountType], [DiscountValue], [MinOrderAmount], [MaxUses], [CurrentUses], [StartDate], [EndDate], [IsActive])
VALUES ('80000001-0000-0000-0000-000000000002', 'FLAT25', N'$25 off orders over $100', 'Fixed', 25.00, 100.00, 500, 112, '2024-03-01', '2024-09-30', 1)
GO

INSERT INTO [sample_ecom].[Coupon] ([ID], [Code], [Description], [DiscountType], [DiscountValue], [MinOrderAmount], [MaxUses], [CurrentUses], [StartDate], [EndDate], [IsActive])
VALUES ('80000001-0000-0000-0000-000000000003', 'WELCOME15', N'15% off first purchase', 'Percent', 15.00, NULL, NULL, 891, '2024-01-01', '2025-12-31', 1)
GO

INSERT INTO [sample_ecom].[Coupon] ([ID], [Code], [Description], [DiscountType], [DiscountValue], [MinOrderAmount], [MaxUses], [CurrentUses], [StartDate], [EndDate], [IsActive])
VALUES ('80000001-0000-0000-0000-000000000004', 'HOLIDAY50', N'$50 off holiday special', 'Fixed', 50.00, 200.00, 100, 100, '2024-12-01', '2024-12-31', 0)
GO

-- ============================================================================
-- EXTENDED PROPERTIES (table and column descriptions)
-- ============================================================================

-- Category table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Product categories with hierarchical support via self-referencing parent',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'Category'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'References parent category for hierarchy; NULL for root categories',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'Category',
    @level2type = N'COLUMN', @level2name = N'ParentCategoryID'
GO

-- Product table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Product catalog with pricing, inventory, and category assignment',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'Product'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stock Keeping Unit - unique product identifier for inventory tracking',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'SKU'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sale price; NULL when product is not discounted',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'DiscountPrice'
GO

-- Customer table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Registered customers with contact and verification info',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'Customer'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the customer email has been verified',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'Customer',
    @level2type = N'COLUMN', @level2name = N'IsVerified'
GO

-- Address table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Customer shipping and billing addresses',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'Address'
GO

-- OrderHeader table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Order header with customer, addresses, totals, and status tracking',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'OrderHeader'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique human-readable order identifier',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'OrderNumber'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'FK to Address table for delivery destination',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'ShippingAddressID'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'FK to Address table for billing destination',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'BillingAddressID'
GO

-- OrderItem table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Individual line items within an order',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'OrderItem'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of units ordered; must be greater than zero',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'OrderItem',
    @level2type = N'COLUMN', @level2name = N'Quantity'
GO

-- ProductReview table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Customer product reviews with moderation workflow',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'ProductReview'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Star rating from 1 (worst) to 5 (best)',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'ProductReview',
    @level2type = N'COLUMN', @level2name = N'Rating'
GO

-- Coupon table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Discount coupons with usage tracking and validity dates',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'Coupon'
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Either Percent or Fixed discount type',
    @level0type = N'SCHEMA', @level0name = N'sample_ecom',
    @level1type = N'TABLE', @level1name = N'Coupon',
    @level2type = N'COLUMN', @level2name = N'DiscountType'
GO

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON [sample_ecom].[vwProductCatalog] TO [cdp_UI]
GO

GRANT SELECT ON [sample_ecom].[vwCustomerOrders] TO [cdp_UI]
GO

GRANT SELECT ON [sample_ecom].[vwTopProducts] TO [cdp_UI]
GO

GRANT SELECT ON [sample_ecom].[vwOrderSummary] TO [cdp_UI]
GO

GRANT SELECT, INSERT, UPDATE ON [sample_ecom].[Product] TO [cdp_Developer]
GO

GRANT SELECT, INSERT, UPDATE ON [sample_ecom].[Customer] TO [cdp_Developer]
GO

GRANT SELECT, INSERT, UPDATE ON [sample_ecom].[OrderHeader] TO [cdp_Developer]
GO

GRANT SELECT, INSERT, UPDATE ON [sample_ecom].[OrderItem] TO [cdp_Developer]
GO

GRANT SELECT ON [sample_ecom].[Coupon] TO [cdp_UI]
GO
