-- ============================================================================
-- Sample Warehouse Inventory Migration - T-SQL
-- Pass 7 converter validation: new domain, new schema
-- Schema: sample_inv (Warehouse Inventory / Supply Chain)
-- 9 tables, 4 views, composite UNIQUE, multi-FK to same table,
-- DATEDIFF/ISNULL/IIF/YEAR/LEN in views, inline+ALTER CHECK constraints
-- ============================================================================

-- Create schema
CREATE SCHEMA sample_inv
GO

-- ============================================================================
-- TABLES
-- ============================================================================

-- Warehouse table
CREATE TABLE [sample_inv].[Warehouse] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(200) NOT NULL,
    [Code] VARCHAR(10) NOT NULL,
    [Address] NVARCHAR(300) NOT NULL,
    [City] NVARCHAR(100) NOT NULL,
    [State] VARCHAR(2) NOT NULL,
    [ZipCode] VARCHAR(10) NOT NULL,
    [ManagerName] NVARCHAR(200) NOT NULL,
    [Phone] VARCHAR(20) NOT NULL,
    [SquareFootage] INT NOT NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [OpenedDate] DATE NOT NULL,
    CONSTRAINT [PK_Warehouse] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Warehouse_Code] UNIQUE NONCLUSTERED ([Code])
)
GO

-- Supplier table (inline CHECK on Rating)
CREATE TABLE [sample_inv].[Supplier] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [CompanyName] NVARCHAR(250) NOT NULL,
    [ContactName] NVARCHAR(200) NULL,
    [Email] NVARCHAR(255) NOT NULL,
    [Phone] VARCHAR(20) NOT NULL,
    [Website] NVARCHAR(300) NULL,
    [PaymentTermsDays] INT NOT NULL DEFAULT 30,
    [Rating] SMALLINT NULL CHECK ([Rating] BETWEEN 1 AND 5),
    [IsActive] BIT NOT NULL DEFAULT 1,
    [Notes] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_Supplier] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Supplier_Email] UNIQUE NONCLUSTERED ([Email])
)
GO

-- ProductCategory table with self-referencing FK
CREATE TABLE [sample_inv].[ProductCategory] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(150) NOT NULL,
    [ParentCategoryID] UNIQUEIDENTIFIER NULL,
    [Description] NVARCHAR(500) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_ProductCategory] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- Product table (inline CHECK on UnitPrice)
CREATE TABLE [sample_inv].[Product] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SKU] VARCHAR(30) NOT NULL,
    [Name] NVARCHAR(300) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [CategoryID] UNIQUEIDENTIFIER NOT NULL,
    [SupplierID] UNIQUEIDENTIFIER NOT NULL,
    [UnitCost] DECIMAL(10,2) NOT NULL,
    [UnitPrice] DECIMAL(10,2) NOT NULL CHECK ([UnitPrice] >= 0),
    [ReorderLevel] INT NOT NULL DEFAULT 10,
    [ReorderQuantity] INT NOT NULL DEFAULT 50,
    [Weight] DECIMAL(8,3) NULL,
    [IsPerishable] BIT NOT NULL DEFAULT 0,
    [ShelfLifeDays] INT NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_Product] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Product_SKU] UNIQUE NONCLUSTERED ([SKU])
)
GO

-- InventoryLevel table (inline CHECK on QuantityOnHand, composite UNIQUE)
CREATE TABLE [sample_inv].[InventoryLevel] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ProductID] UNIQUEIDENTIFIER NOT NULL,
    [WarehouseID] UNIQUEIDENTIFIER NOT NULL,
    [QuantityOnHand] INT NOT NULL DEFAULT 0 CHECK ([QuantityOnHand] >= 0),
    [QuantityReserved] INT NOT NULL DEFAULT 0,
    [QuantityOnOrder] INT NOT NULL DEFAULT 0,
    [LastCountDate] DATETIME NULL,
    [BinLocation] VARCHAR(20) NULL,
    CONSTRAINT [PK_InventoryLevel] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_InvLevel] UNIQUE NONCLUSTERED ([ProductID], [WarehouseID])
)
GO

-- PurchaseOrder table (inline CHECK on Status)
CREATE TABLE [sample_inv].[PurchaseOrder] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PONumber] VARCHAR(20) NOT NULL,
    [SupplierID] UNIQUEIDENTIFIER NOT NULL,
    [WarehouseID] UNIQUEIDENTIFIER NOT NULL,
    [OrderDate] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [ExpectedDelivery] DATE NULL,
    [Status] VARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK ([Status] IN ('Draft', 'Submitted', 'Approved', 'Received', 'Cancelled')),
    [TotalAmount] DECIMAL(12,2) NOT NULL DEFAULT 0,
    [Notes] NVARCHAR(MAX) NULL,
    [ApprovedBy] NVARCHAR(200) NULL,
    [ApprovedAt] DATETIME NULL,
    CONSTRAINT [PK_PurchaseOrder] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_PurchaseOrder_PONumber] UNIQUE NONCLUSTERED ([PONumber])
)
GO

-- PurchaseOrderLine table (inline CHECK on QuantityOrdered)
CREATE TABLE [sample_inv].[PurchaseOrderLine] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PurchaseOrderID] UNIQUEIDENTIFIER NOT NULL,
    [ProductID] UNIQUEIDENTIFIER NOT NULL,
    [QuantityOrdered] INT NOT NULL CHECK ([QuantityOrdered] > 0),
    [UnitCost] DECIMAL(10,2) NOT NULL,
    [LineTotal] DECIMAL(12,2) NOT NULL,
    [QuantityReceived] INT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_PurchaseOrderLine] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- StockMovement table (inline CHECK on MovementType, multi-FK to Warehouse)
CREATE TABLE [sample_inv].[StockMovement] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ProductID] UNIQUEIDENTIFIER NOT NULL,
    [FromWarehouseID] UNIQUEIDENTIFIER NULL,
    [ToWarehouseID] UNIQUEIDENTIFIER NULL,
    [Quantity] INT NOT NULL,
    [MovementType] VARCHAR(20) NOT NULL CHECK ([MovementType] IN ('Inbound', 'Outbound', 'Transfer', 'Adjustment', 'Return')),
    [ReferenceNumber] VARCHAR(50) NULL,
    [MovedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [MovedBy] NVARCHAR(200) NOT NULL,
    [Notes] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_StockMovement] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- AuditLog table (inline CHECK on Action)
CREATE TABLE [sample_inv].[AuditLog] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [TableName] NVARCHAR(100) NOT NULL,
    [RecordID] UNIQUEIDENTIFIER NOT NULL,
    [Action] VARCHAR(10) NOT NULL CHECK ([Action] IN ('INSERT', 'UPDATE', 'DELETE')),
    [OldValue] NVARCHAR(MAX) NULL,
    [NewValue] NVARCHAR(MAX) NULL,
    [ChangedBy] NVARCHAR(200) NOT NULL,
    [ChangedAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_AuditLog] PRIMARY KEY CLUSTERED ([ID])
)
GO

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

-- ProductCategory self-referencing FK
ALTER TABLE [sample_inv].[ProductCategory]
    ADD CONSTRAINT [FK_ProductCategory_Parent] FOREIGN KEY ([ParentCategoryID])
    REFERENCES [sample_inv].[ProductCategory] ([ID])
GO

-- Product FKs
ALTER TABLE [sample_inv].[Product]
    ADD CONSTRAINT [FK_Product_Category] FOREIGN KEY ([CategoryID])
    REFERENCES [sample_inv].[ProductCategory] ([ID])
GO

ALTER TABLE [sample_inv].[Product]
    ADD CONSTRAINT [FK_Product_Supplier] FOREIGN KEY ([SupplierID])
    REFERENCES [sample_inv].[Supplier] ([ID])
GO

-- InventoryLevel FKs
ALTER TABLE [sample_inv].[InventoryLevel]
    ADD CONSTRAINT [FK_InventoryLevel_Product] FOREIGN KEY ([ProductID])
    REFERENCES [sample_inv].[Product] ([ID])
GO

ALTER TABLE [sample_inv].[InventoryLevel]
    ADD CONSTRAINT [FK_InventoryLevel_Warehouse] FOREIGN KEY ([WarehouseID])
    REFERENCES [sample_inv].[Warehouse] ([ID])
GO

-- PurchaseOrder FKs
ALTER TABLE [sample_inv].[PurchaseOrder]
    ADD CONSTRAINT [FK_PurchaseOrder_Supplier] FOREIGN KEY ([SupplierID])
    REFERENCES [sample_inv].[Supplier] ([ID])
GO

ALTER TABLE [sample_inv].[PurchaseOrder]
    ADD CONSTRAINT [FK_PurchaseOrder_Warehouse] FOREIGN KEY ([WarehouseID])
    REFERENCES [sample_inv].[Warehouse] ([ID])
GO

-- PurchaseOrderLine FKs
ALTER TABLE [sample_inv].[PurchaseOrderLine]
    ADD CONSTRAINT [FK_PurchaseOrderLine_PO] FOREIGN KEY ([PurchaseOrderID])
    REFERENCES [sample_inv].[PurchaseOrder] ([ID])
GO

ALTER TABLE [sample_inv].[PurchaseOrderLine]
    ADD CONSTRAINT [FK_PurchaseOrderLine_Product] FOREIGN KEY ([ProductID])
    REFERENCES [sample_inv].[Product] ([ID])
GO

-- StockMovement FKs (multi-FK to Warehouse)
ALTER TABLE [sample_inv].[StockMovement]
    ADD CONSTRAINT [FK_StockMovement_Product] FOREIGN KEY ([ProductID])
    REFERENCES [sample_inv].[Product] ([ID])
GO

ALTER TABLE [sample_inv].[StockMovement]
    ADD CONSTRAINT [FK_StockMovement_FromWarehouse] FOREIGN KEY ([FromWarehouseID])
    REFERENCES [sample_inv].[Warehouse] ([ID])
GO

ALTER TABLE [sample_inv].[StockMovement]
    ADD CONSTRAINT [FK_StockMovement_ToWarehouse] FOREIGN KEY ([ToWarehouseID])
    REFERENCES [sample_inv].[Warehouse] ([ID])
GO

-- ============================================================================
-- ALTER TABLE CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE [sample_inv].[Product]
    ADD CONSTRAINT [CK_Product_UnitCost] CHECK ([UnitCost] >= 0)
GO

ALTER TABLE [sample_inv].[Warehouse]
    ADD CONSTRAINT [CK_Warehouse_SquareFootage] CHECK ([SquareFootage] > 0)
GO

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Inventory summary - product with total on hand across warehouses
CREATE VIEW [sample_inv].[vwInventorySummary]
AS
SELECT
    p.[ID] AS ProductID,
    p.[SKU],
    p.[Name] AS ProductName,
    pc.[Name] AS CategoryName,
    s.[CompanyName] AS SupplierName,
    p.[UnitCost],
    p.[UnitPrice],
    ISNULL(SUM(il.[QuantityOnHand]), 0) AS TotalOnHand,
    ISNULL(SUM(il.[QuantityReserved]), 0) AS TotalReserved,
    ISNULL(SUM(il.[QuantityOnHand]), 0) - ISNULL(SUM(il.[QuantityReserved]), 0) AS AvailableStock,
    p.[ReorderLevel],
    CASE
        WHEN ISNULL(SUM(il.[QuantityOnHand]), 0) < p.[ReorderLevel] THEN 1
        ELSE 0
    END AS NeedsReorder,
    IIF(p.[IsPerishable] = 1, ISNULL(p.[ShelfLifeDays], 0), -1) AS EffectiveShelfLife,
    COUNT(DISTINCT il.[WarehouseID]) AS WarehouseCount,
    LEN(p.[SKU]) AS SKULength
FROM [sample_inv].[Product] p
LEFT JOIN [sample_inv].[ProductCategory] pc ON pc.[ID] = p.[CategoryID]
LEFT JOIN [sample_inv].[Supplier] s ON s.[ID] = p.[SupplierID]
LEFT JOIN [sample_inv].[InventoryLevel] il ON il.[ProductID] = p.[ID]
WHERE p.[IsActive] = 1
GROUP BY
    p.[ID], p.[SKU], p.[Name], pc.[Name], s.[CompanyName],
    p.[UnitCost], p.[UnitPrice], p.[ReorderLevel],
    p.[IsPerishable], p.[ShelfLifeDays]
GO

-- View: Purchase order status with supplier and warehouse details
CREATE VIEW [sample_inv].[vwPurchaseOrderStatus]
AS
SELECT
    po.[ID] AS PurchaseOrderID,
    po.[PONumber],
    s.[CompanyName] AS SupplierName,
    w.[Name] AS WarehouseName,
    w.[City] AS WarehouseCity,
    po.[OrderDate],
    po.[ExpectedDelivery],
    po.[Status],
    po.[TotalAmount],
    COUNT(pol.[ID]) AS LineItemCount,
    ISNULL(SUM(pol.[QuantityOrdered]), 0) AS TotalUnitsOrdered,
    ISNULL(SUM(pol.[QuantityReceived]), 0) AS TotalUnitsReceived,
    CASE
        WHEN ISNULL(SUM(pol.[QuantityOrdered]), 0) = 0 THEN 0.0
        ELSE CAST(SUM(pol.[QuantityReceived]) AS DECIMAL(10,2)) / CAST(SUM(pol.[QuantityOrdered]) AS DECIMAL(10,2)) * 100.0
    END AS ReceivedPercentage,
    DATEDIFF(DAY, po.[OrderDate], GETUTCDATE()) AS DaysSinceOrder,
    IIF(po.[ExpectedDelivery] IS NOT NULL AND po.[ExpectedDelivery] < CAST(GETUTCDATE() AS DATE) AND po.[Status] NOT IN ('Received', 'Cancelled'), 1, 0) AS IsOverdue,
    po.[ApprovedBy],
    po.[ApprovedAt]
FROM [sample_inv].[PurchaseOrder] po
INNER JOIN [sample_inv].[Supplier] s ON s.[ID] = po.[SupplierID]
INNER JOIN [sample_inv].[Warehouse] w ON w.[ID] = po.[WarehouseID]
LEFT JOIN [sample_inv].[PurchaseOrderLine] pol ON pol.[PurchaseOrderID] = po.[ID]
GROUP BY
    po.[ID], po.[PONumber], s.[CompanyName], w.[Name], w.[City],
    po.[OrderDate], po.[ExpectedDelivery], po.[Status], po.[TotalAmount],
    po.[ApprovedBy], po.[ApprovedAt]
GO

-- View: Low stock alerts - products where any warehouse quantity < reorder level
CREATE VIEW [sample_inv].[vwLowStockAlerts]
AS
SELECT
    p.[ID] AS ProductID,
    p.[SKU],
    p.[Name] AS ProductName,
    w.[ID] AS WarehouseID,
    w.[Name] AS WarehouseName,
    w.[Code] AS WarehouseCode,
    il.[QuantityOnHand],
    il.[QuantityReserved],
    ISNULL(il.[QuantityOnHand], 0) - ISNULL(il.[QuantityReserved], 0) AS NetAvailable,
    p.[ReorderLevel],
    p.[ReorderQuantity],
    p.[ReorderLevel] - ISNULL(il.[QuantityOnHand], 0) AS ShortfallQuantity,
    COALESCE(il.[BinLocation], N'Unassigned') AS BinLocation,
    DATEDIFF(DAY, il.[LastCountDate], GETUTCDATE()) AS DaysSinceLastCount,
    IIF(p.[IsPerishable] = 1 AND p.[ShelfLifeDays] IS NOT NULL,
        DATEDIFF(DAY, GETUTCDATE(), DATEADD(DAY, p.[ShelfLifeDays], p.[CreatedAt])),
        NULL) AS EstimatedDaysToExpiry,
    s.[CompanyName] AS SupplierName,
    s.[Phone] AS SupplierPhone
FROM [sample_inv].[InventoryLevel] il
INNER JOIN [sample_inv].[Product] p ON p.[ID] = il.[ProductID]
INNER JOIN [sample_inv].[Warehouse] w ON w.[ID] = il.[WarehouseID]
LEFT JOIN [sample_inv].[Supplier] s ON s.[ID] = p.[SupplierID]
WHERE il.[QuantityOnHand] < p.[ReorderLevel]
    AND p.[IsActive] = 1
    AND w.[IsActive] = 1
GO

-- View: Warehouse utilization - warehouse with product count, total units, total value
CREATE VIEW [sample_inv].[vwWarehouseUtilization]
AS
SELECT
    w.[ID] AS WarehouseID,
    w.[Name] AS WarehouseName,
    w.[Code] AS WarehouseCode,
    w.[City],
    w.[State],
    w.[SquareFootage],
    w.[ManagerName],
    COUNT(DISTINCT il.[ProductID]) AS UniqueProductCount,
    ISNULL(SUM(il.[QuantityOnHand]), 0) AS TotalUnitsStored,
    ISNULL(SUM(il.[QuantityOnHand] * p.[UnitCost]), 0) AS TotalInventoryValue,
    ISNULL(SUM(il.[QuantityOnHand] * p.[UnitPrice]), 0) AS TotalRetailValue,
    YEAR(w.[OpenedDate]) AS YearOpened,
    DATEDIFF(YEAR, w.[OpenedDate], GETUTCDATE()) AS YearsInOperation,
    COALESCE(
        (SELECT MAX(sm.[MovedAt]) FROM [sample_inv].[StockMovement] sm
         WHERE sm.[FromWarehouseID] = w.[ID] OR sm.[ToWarehouseID] = w.[ID]),
        w.[OpenedDate]
    ) AS LastMovementDate,
    DATEDIFF(DAY,
        COALESCE(
            (SELECT MAX(sm.[MovedAt]) FROM [sample_inv].[StockMovement] sm
             WHERE sm.[FromWarehouseID] = w.[ID] OR sm.[ToWarehouseID] = w.[ID]),
            w.[OpenedDate]
        ),
        GETUTCDATE()
    ) AS DaysSinceLastMovement,
    IIF(w.[IsActive] = 1, N'Active', N'Inactive') AS StatusLabel
FROM [sample_inv].[Warehouse] w
LEFT JOIN [sample_inv].[InventoryLevel] il ON il.[WarehouseID] = w.[ID]
LEFT JOIN [sample_inv].[Product] p ON p.[ID] = il.[ProductID]
GROUP BY
    w.[ID], w.[Name], w.[Code], w.[City], w.[State],
    w.[SquareFootage], w.[ManagerName], w.[OpenedDate], w.[IsActive]
GO

-- ============================================================================
-- EXTENDED PROPERTIES
-- ============================================================================

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Warehouse locations for inventory storage',
    @level0type = N'SCHEMA', @level0name = N'sample_inv',
    @level1type = N'TABLE',  @level1name = N'Warehouse'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Material and product suppliers',
    @level0type = N'SCHEMA', @level0name = N'sample_inv',
    @level1type = N'TABLE',  @level1name = N'Supplier'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Hierarchical product categorization',
    @level0type = N'SCHEMA', @level0name = N'sample_inv',
    @level1type = N'TABLE',  @level1name = N'ProductCategory'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Products tracked in warehouse inventory',
    @level0type = N'SCHEMA', @level0name = N'sample_inv',
    @level1type = N'TABLE',  @level1name = N'Product'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current inventory quantities per product per warehouse',
    @level0type = N'SCHEMA', @level0name = N'sample_inv',
    @level1type = N'TABLE',  @level1name = N'InventoryLevel'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Purchase orders placed with suppliers',
    @level0type = N'SCHEMA', @level0name = N'sample_inv',
    @level1type = N'TABLE',  @level1name = N'PurchaseOrder'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Line items within purchase orders',
    @level0type = N'SCHEMA', @level0name = N'sample_inv',
    @level1type = N'TABLE',  @level1name = N'PurchaseOrderLine'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Tracks movement of stock between warehouses',
    @level0type = N'SCHEMA', @level0name = N'sample_inv',
    @level1type = N'TABLE',  @level1name = N'StockMovement'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Audit trail for data changes',
    @level0type = N'SCHEMA', @level0name = N'sample_inv',
    @level1type = N'TABLE',  @level1name = N'AuditLog'
GO

-- ============================================================================
-- SECURITY
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'InventoryReader')
    CREATE ROLE [InventoryReader]
GO

GRANT SELECT ON SCHEMA::[sample_inv] TO [InventoryReader]
GO

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Warehouses (3)
INSERT INTO [sample_inv].[Warehouse] ([ID], [Name], [Code], [Address], [City], [State], [ZipCode], [ManagerName], [Phone], [SquareFootage], [IsActive], [OpenedDate])
VALUES
    ('A0000001-0001-0001-0001-000000000001', N'East Coast Distribution Center', 'ECDC', N'100 Industrial Blvd', N'Newark', 'NJ', '07102', N'Sarah Mitchell', '(973) 555-0100', 85000, 1, '2018-03-15'),
    ('A0000001-0001-0001-0001-000000000002', N'Midwest Fulfillment Hub', 'MWFH', N'500 Logistics Way', N'Columbus', 'OH', '43215', N'James Rodriguez', '(614) 555-0200', 62000, 1, '2020-07-01'),
    ('A0000001-0001-0001-0001-000000000003', N'West Coast Warehouse', 'WCW', N'2200 Pacific Ave', N'Long Beach', 'CA', '90802', N'Emily Chen', '(562) 555-0300', 95000, 1, '2016-11-20')
GO

-- Suppliers (5)
INSERT INTO [sample_inv].[Supplier] ([ID], [CompanyName], [ContactName], [Email], [Phone], [Website], [PaymentTermsDays], [Rating], [IsActive], [Notes])
VALUES
    ('B0000001-0001-0001-0001-000000000001', N'TechParts Global', N'Michael Brown', N'orders@techpartsglobal.com', '(800) 555-1001', N'https://techpartsglobal.com', 30, 5, 1, N'Primary electronics supplier'),
    ('B0000001-0001-0001-0001-000000000002', N'PackRight Industries', N'Lisa Wong', N'sales@packright.com', '(800) 555-1002', N'https://packright.com', 45, 4, 1, NULL),
    ('B0000001-0001-0001-0001-000000000003', N'GreenSource Materials', NULL, N'contact@greensource.com', '(800) 555-1003', NULL, 30, 3, 1, N'Eco-friendly packaging supplier'),
    ('B0000001-0001-0001-0001-000000000004', N'FastShip Components', N'David Park', N'orders@fastshipcomp.com', '(800) 555-1004', N'https://fastshipcomp.com', 15, 4, 1, NULL),
    ('B0000001-0001-0001-0001-000000000005', N'National Hardware Supply', N'Karen Adams', N'wholesale@nhs.com', '(800) 555-1005', N'https://nhs.com', 60, 2, 1, N'Bulk hardware and fasteners')
GO

-- Product Categories (5)
INSERT INTO [sample_inv].[ProductCategory] ([ID], [Name], [ParentCategoryID], [Description], [IsActive])
VALUES
    ('C0000001-0001-0001-0001-000000000001', N'Electronics', NULL, N'Electronic components and devices', 1),
    ('C0000001-0001-0001-0001-000000000002', N'Packaging', NULL, N'Packaging materials and supplies', 1),
    ('C0000001-0001-0001-0001-000000000003', N'Hardware', NULL, N'Hardware and fasteners', 1),
    ('C0000001-0001-0001-0001-000000000004', N'Cables & Adapters', 'C0000001-0001-0001-0001-000000000001', N'Cables, connectors, and adapters', 1),
    ('C0000001-0001-0001-0001-000000000005', N'Boxes & Containers', 'C0000001-0001-0001-0001-000000000002', N'Shipping boxes and storage containers', 1)
GO

-- Products (15)
INSERT INTO [sample_inv].[Product] ([ID], [SKU], [Name], [Description], [CategoryID], [SupplierID], [UnitCost], [UnitPrice], [ReorderLevel], [ReorderQuantity], [Weight], [IsPerishable], [ShelfLifeDays], [IsActive])
VALUES
    ('D0000001-0001-0001-0001-000000000001', 'ELEC-USB-C-001', N'USB-C Charging Cable 6ft', N'Premium braided USB-C cable', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000001', 3.50, 12.99, 100, 500, 0.150, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000002', 'ELEC-HDMI-001', N'HDMI 2.1 Cable 3ft', N'High speed HDMI cable', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000001', 5.25, 19.99, 75, 300, 0.200, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000003', 'ELEC-PWR-001', N'12V Power Adapter', N'Universal 12V 2A adapter', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', 8.00, 24.99, 50, 200, 0.350, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000004', 'PACK-BOX-SM', N'Small Shipping Box', N'12x10x4 corrugated box', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000002', 0.45, 1.29, 500, 2000, 0.300, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000005', 'PACK-BOX-MD', N'Medium Shipping Box', N'16x12x6 corrugated box', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000002', 0.75, 2.49, 400, 1500, 0.500, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000006', 'PACK-BOX-LG', N'Large Shipping Box', N'24x18x12 corrugated box', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000002', 1.25, 3.99, 300, 1000, 0.800, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000007', 'PACK-WRAP-001', N'Bubble Wrap Roll 12in', N'Perforated bubble wrap roll', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000002', 6.50, 14.99, 50, 100, 2.500, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000008', 'PACK-TAPE-001', N'Packing Tape 2in', N'Clear packing tape roll', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', 1.10, 3.49, 200, 500, 0.400, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000009', 'HW-BOLT-M8', N'M8 Hex Bolt Pack (50ct)', N'Stainless steel M8x30mm', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000005', 4.20, 9.99, 80, 200, 1.200, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000010', 'HW-NUT-M8', N'M8 Hex Nut Pack (50ct)', N'Stainless steel M8 nuts', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000005', 2.80, 6.99, 80, 200, 0.800, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000011', 'HW-SCREW-001', N'Wood Screw Assortment', N'Mixed wood screw box 200ct', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000005', 5.50, 12.99, 60, 150, 1.500, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000012', 'ELEC-BAT-AA', N'AA Batteries 24-Pack', N'Alkaline AA batteries', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000004', 4.00, 11.99, 150, 600, 0.650, 1, 1095, 1),
    ('D0000001-0001-0001-0001-000000000013', 'ELEC-BAT-9V', N'9V Battery 4-Pack', N'Alkaline 9V batteries', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000004', 3.25, 9.99, 100, 400, 0.400, 1, 1095, 1),
    ('D0000001-0001-0001-0001-000000000014', 'PACK-LABEL-001', N'Shipping Labels 500ct', N'4x6 thermal shipping labels', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', 8.50, 19.99, 30, 100, 2.000, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000015', 'ELEC-ADAPT-001', N'Universal Travel Adapter', N'Multi-region power adapter', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', 6.75, 22.99, 40, 150, 0.250, 0, NULL, 1)
GO

-- Inventory Levels (spread across warehouses)
INSERT INTO [sample_inv].[InventoryLevel] ([ID], [ProductID], [WarehouseID], [QuantityOnHand], [QuantityReserved], [QuantityOnOrder], [LastCountDate], [BinLocation])
VALUES
    ('E0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000001', 250, 30, 0, '2025-12-01', 'A1-01'),
    ('E0000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000003', 180, 15, 500, '2025-11-20', 'B2-05'),
    ('E0000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000002', 'A0000001-0001-0001-0001-000000000001', 45, 10, 300, '2025-12-01', 'A1-02'),
    ('E0000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000003', 'A0000001-0001-0001-0001-000000000002', 120, 5, 0, '2025-11-15', 'C3-01'),
    ('E0000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000004', 'A0000001-0001-0001-0001-000000000001', 1500, 200, 0, '2025-12-05', 'D1-01'),
    ('E0000001-0001-0001-0001-000000000006', 'D0000001-0001-0001-0001-000000000004', 'A0000001-0001-0001-0001-000000000002', 800, 50, 2000, '2025-11-28', 'D1-02'),
    ('E0000001-0001-0001-0001-000000000007', 'D0000001-0001-0001-0001-000000000004', 'A0000001-0001-0001-0001-000000000003', 2100, 100, 0, '2025-12-01', 'D1-03'),
    ('E0000001-0001-0001-0001-000000000008', 'D0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000001', 350, 25, 0, '2025-12-02', 'D2-01'),
    ('E0000001-0001-0001-0001-000000000009', 'D0000001-0001-0001-0001-000000000007', 'A0000001-0001-0001-0001-000000000001', 30, 2, 100, '2025-11-10', 'E1-01'),
    ('E0000001-0001-0001-0001-000000000010', 'D0000001-0001-0001-0001-000000000009', 'A0000001-0001-0001-0001-000000000002', 55, 0, 200, '2025-11-25', 'F2-01'),
    ('E0000001-0001-0001-0001-000000000011', 'D0000001-0001-0001-0001-000000000012', 'A0000001-0001-0001-0001-000000000001', 90, 10, 600, '2025-12-01', 'G1-01'),
    ('E0000001-0001-0001-0001-000000000012', 'D0000001-0001-0001-0001-000000000012', 'A0000001-0001-0001-0001-000000000003', 200, 20, 0, '2025-11-30', 'G1-02'),
    ('E0000001-0001-0001-0001-000000000013', 'D0000001-0001-0001-0001-000000000014', 'A0000001-0001-0001-0001-000000000001', 15, 0, 100, '2025-12-03', 'H1-01'),
    ('E0000001-0001-0001-0001-000000000014', 'D0000001-0001-0001-0001-000000000015', 'A0000001-0001-0001-0001-000000000003', 25, 5, 150, '2025-11-18', 'A3-01'),
    ('E0000001-0001-0001-0001-000000000015', 'D0000001-0001-0001-0001-000000000008', 'A0000001-0001-0001-0001-000000000002', 180, 0, 0, '2025-12-01', 'E2-04')
GO

-- Purchase Orders (4)
INSERT INTO [sample_inv].[PurchaseOrder] ([ID], [PONumber], [SupplierID], [WarehouseID], [OrderDate], [ExpectedDelivery], [Status], [TotalAmount], [Notes], [ApprovedBy], [ApprovedAt])
VALUES
    ('F0000001-0001-0001-0001-000000000001', 'PO-2025-0001', 'B0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000001', '2025-11-15', '2025-12-01', 'Received', 4575.00, N'Q4 cable restock', N'Sarah Mitchell', '2025-11-16'),
    ('F0000001-0001-0001-0001-000000000002', 'PO-2025-0002', 'B0000001-0001-0001-0001-000000000002', 'A0000001-0001-0001-0001-000000000002', '2025-12-01', '2025-12-15', 'Approved', 2250.00, NULL, N'James Rodriguez', '2025-12-02'),
    ('F0000001-0001-0001-0001-000000000003', 'PO-2025-0003', 'B0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000002', '2025-12-10', '2026-01-05', 'Submitted', 1680.00, N'Hardware restocking', NULL, NULL),
    ('F0000001-0001-0001-0001-000000000004', 'PO-2025-0004', 'B0000001-0001-0001-0001-000000000004', 'A0000001-0001-0001-0001-000000000001', '2025-12-18', NULL, 'Draft', 0, NULL, NULL, NULL)
GO

-- Purchase Order Lines (8)
INSERT INTO [sample_inv].[PurchaseOrderLine] ([ID], [PurchaseOrderID], [ProductID], [QuantityOrdered], [UnitCost], [LineTotal], [QuantityReceived])
VALUES
    ('A1000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', 500, 3.50, 1750.00, 500),
    ('A1000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000002', 300, 5.25, 1575.00, 300),
    ('A1000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000015', 50, 25.00, 1250.00, 50),
    ('A1000001-0001-0001-0001-000000000004', 'F0000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000004', 2000, 0.45, 900.00, 0),
    ('A1000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000005', 1500, 0.75, 1125.00, 0),
    ('A1000001-0001-0001-0001-000000000006', 'F0000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000007', 30, 7.50, 225.00, 0),
    ('A1000001-0001-0001-0001-000000000007', 'F0000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000009', 200, 4.20, 840.00, 0),
    ('A1000001-0001-0001-0001-000000000008', 'F0000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000010', 200, 4.20, 840.00, 0)
GO

-- Stock Movements (6)
INSERT INTO [sample_inv].[StockMovement] ([ID], [ProductID], [FromWarehouseID], [ToWarehouseID], [Quantity], [MovementType], [ReferenceNumber], [MovedBy], [Notes])
VALUES
    ('A2000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', NULL, 'A0000001-0001-0001-0001-000000000001', 500, 'Inbound', 'PO-2025-0001', N'Dock Worker A', N'PO receipt from TechParts Global'),
    ('A2000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000003', 200, 'Transfer', 'TF-2025-001', N'Logistics Team', N'Transfer to West Coast'),
    ('A2000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000004', NULL, 'A0000001-0001-0001-0001-000000000001', 2000, 'Inbound', 'PO-2025-PREV', N'Dock Worker B', NULL),
    ('A2000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000009', 'A0000001-0001-0001-0001-000000000002', NULL, 25, 'Outbound', 'SO-2025-0445', N'Shipping Clerk', N'Customer order fulfillment'),
    ('A2000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000012', NULL, 'A0000001-0001-0001-0001-000000000001', 100, 'Return', 'RMA-2025-012', N'Returns Dept', N'Customer return - unopened'),
    ('A2000001-0001-0001-0001-000000000006', 'D0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000001', NULL, 50, 'Adjustment', NULL, N'Inventory Manager', N'Damaged stock write-off')
GO

-- Audit Log entries (5)
INSERT INTO [sample_inv].[AuditLog] ([ID], [TableName], [RecordID], [Action], [OldValue], [NewValue], [ChangedBy])
VALUES
    ('A3000001-0001-0001-0001-000000000001', N'PurchaseOrder', 'F0000001-0001-0001-0001-000000000001', 'UPDATE', N'{"Status":"Approved"}', N'{"Status":"Received"}', N'Sarah Mitchell'),
    ('A3000001-0001-0001-0001-000000000002', N'InventoryLevel', 'E0000001-0001-0001-0001-000000000001', 'UPDATE', N'{"QuantityOnHand":200}', N'{"QuantityOnHand":250}', N'System'),
    ('A3000001-0001-0001-0001-000000000003', N'Product', 'D0000001-0001-0001-0001-000000000003', 'UPDATE', N'{"UnitPrice":22.99}', N'{"UnitPrice":24.99}', N'Admin'),
    ('A3000001-0001-0001-0001-000000000004', N'Supplier', 'B0000001-0001-0001-0001-000000000003', 'UPDATE', N'{"Rating":4}', N'{"Rating":3}', N'Procurement Lead'),
    ('A3000001-0001-0001-0001-000000000005', N'StockMovement', 'A2000001-0001-0001-0001-000000000006', 'INSERT', NULL, N'{"MovementType":"Adjustment","Quantity":50}', N'Inventory Manager')
GO
