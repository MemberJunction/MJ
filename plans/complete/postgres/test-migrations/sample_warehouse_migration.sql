/* =============================================
   Sample Warehouse/Logistics System
   Schema: sample_warehouse
   Pass 15 - SQL Converter Validation
   ============================================= */

-- Create schema
CREATE SCHEMA sample_warehouse;
GO

USE SampleWarehouse;
GO

PRINT 'Creating Warehouse Management tables...';
GO

-- Table 1: Warehouse
CREATE TABLE sample_warehouse.Warehouse (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Code VARCHAR(10) NOT NULL,
    Address NVARCHAR(300) NOT NULL,
    City NVARCHAR(100) NOT NULL,
    CapacitySqFt INT NOT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    ManagerName NVARCHAR(100) NULL,
    Phone VARCHAR(20) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Warehouse PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT UQ_Warehouse_Code UNIQUE (Code),
    CONSTRAINT UQ_Warehouse_Name UNIQUE (Name),
    CONSTRAINT CK_Warehouse_Capacity CHECK (CapacitySqFt > 0)
);
GO

-- Table 2: ProductCategory
CREATE TABLE sample_warehouse.ProductCategory (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    ParentCategoryID UNIQUEIDENTIFIER NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_ProductCategory PRIMARY KEY (ID),
    CONSTRAINT FK_ProductCategory_Parent FOREIGN KEY (ParentCategoryID) REFERENCES sample_warehouse.ProductCategory(ID),
    CONSTRAINT UQ_ProductCategory_Name UNIQUE (Name)
);
GO

-- Table 3: Product
CREATE TABLE sample_warehouse.Product (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SKU VARCHAR(30) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    CategoryID UNIQUEIDENTIFIER NOT NULL,
    UnitPrice DECIMAL(10,2) NOT NULL,
    Weight DECIMAL(8,3) NULL,
    IsPerishable BIT NOT NULL DEFAULT 0,
    MinStockLevel INT NOT NULL DEFAULT 10,
    Description NVARCHAR(MAX) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Product PRIMARY KEY (ID),
    CONSTRAINT FK_Product_Category FOREIGN KEY (CategoryID) REFERENCES sample_warehouse.ProductCategory(ID),
    CONSTRAINT UQ_Product_SKU UNIQUE (SKU),
    CONSTRAINT CK_Product_Price CHECK (UnitPrice > 0),
    CONSTRAINT CK_Product_MinStock CHECK (MinStockLevel >= 0)
);
GO

-- Table 4: Supplier
CREATE TABLE sample_warehouse.Supplier (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(150) NOT NULL,
    ContactName NVARCHAR(100) NULL,
    Email NVARCHAR(200) NULL,
    Phone VARCHAR(20) NULL,
    Address NVARCHAR(300) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    Rating SMALLINT NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Supplier PRIMARY KEY (ID),
    CONSTRAINT UQ_Supplier_Name UNIQUE (Name),
    CONSTRAINT CK_Supplier_Rating CHECK (Rating BETWEEN 1 AND 5)
);
GO

-- Table 5: Inventory
CREATE TABLE sample_warehouse.Inventory (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProductID UNIQUEIDENTIFIER NOT NULL,
    WarehouseID UNIQUEIDENTIFIER NOT NULL,
    QuantityOnHand INT NOT NULL DEFAULT 0,
    QuantityReserved INT NOT NULL DEFAULT 0,
    ReorderPoint INT NOT NULL DEFAULT 5,
    LastCountDate DATE NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Inventory PRIMARY KEY (ID),
    CONSTRAINT FK_Inventory_Product FOREIGN KEY (ProductID) REFERENCES sample_warehouse.Product(ID),
    CONSTRAINT FK_Inventory_Warehouse FOREIGN KEY (WarehouseID) REFERENCES sample_warehouse.Warehouse(ID),
    CONSTRAINT UQ_Inventory_ProductWarehouse UNIQUE (ProductID, WarehouseID),
    CONSTRAINT CK_Inventory_Quantity CHECK (QuantityOnHand >= 0),
    CONSTRAINT CK_Inventory_Reserved CHECK (QuantityReserved >= 0)
);
GO

-- Table 6: PurchaseOrder
CREATE TABLE sample_warehouse.PurchaseOrder (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderNumber VARCHAR(20) NOT NULL,
    SupplierID UNIQUEIDENTIFIER NOT NULL,
    WarehouseID UNIQUEIDENTIFIER NOT NULL,
    OrderDate DATE NOT NULL,
    ExpectedDeliveryDate DATE NULL,
    TotalAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
    Status NVARCHAR(20) NOT NULL DEFAULT N'Pending',
    Notes NVARCHAR(MAX) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_PurchaseOrder PRIMARY KEY (ID),
    CONSTRAINT FK_PurchaseOrder_Supplier FOREIGN KEY (SupplierID) REFERENCES sample_warehouse.Supplier(ID),
    CONSTRAINT FK_PurchaseOrder_Warehouse FOREIGN KEY (WarehouseID) REFERENCES sample_warehouse.Warehouse(ID),
    CONSTRAINT UQ_PurchaseOrder_Number UNIQUE (OrderNumber),
    CONSTRAINT CK_PurchaseOrder_Total CHECK (TotalAmount >= 0),
    CONSTRAINT CK_PurchaseOrder_Status CHECK (Status IN (N'Pending', N'Approved', N'Shipped', N'Received', N'Cancelled'))
);
GO

-- Table 7: PurchaseOrderItem
CREATE TABLE sample_warehouse.PurchaseOrderItem (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PurchaseOrderID UNIQUEIDENTIFIER NOT NULL,
    ProductID UNIQUEIDENTIFIER NOT NULL,
    QuantityOrdered INT NOT NULL,
    UnitCost DECIMAL(10,2) NOT NULL,
    QuantityReceived INT NOT NULL DEFAULT 0,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_PurchaseOrderItem PRIMARY KEY (ID),
    CONSTRAINT FK_POItem_PurchaseOrder FOREIGN KEY (PurchaseOrderID) REFERENCES sample_warehouse.PurchaseOrder(ID),
    CONSTRAINT FK_POItem_Product FOREIGN KEY (ProductID) REFERENCES sample_warehouse.Product(ID),
    CONSTRAINT CK_POItem_Quantity CHECK (QuantityOrdered > 0),
    CONSTRAINT CK_POItem_Cost CHECK (UnitCost > 0),
    CONSTRAINT CK_POItem_Received CHECK (QuantityReceived >= 0)
);
GO

-- Table 8: Shipment
CREATE TABLE sample_warehouse.Shipment (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ShipmentNumber VARCHAR(20) NOT NULL,
    WarehouseID UNIQUEIDENTIFIER NOT NULL,
    ShipDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    DeliveryDate DATETIME NULL,
    Destination NVARCHAR(300) NOT NULL,
    TotalWeight DECIMAL(10,3) NULL,
    ShippingCost DECIMAL(10,2) NOT NULL DEFAULT 0,
    Status NVARCHAR(20) NOT NULL DEFAULT N'Preparing',
    IsExpedited BIT NOT NULL DEFAULT 0,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Shipment PRIMARY KEY (ID),
    CONSTRAINT FK_Shipment_Warehouse FOREIGN KEY (WarehouseID) REFERENCES sample_warehouse.Warehouse(ID),
    CONSTRAINT UQ_Shipment_Number UNIQUE (ShipmentNumber),
    CONSTRAINT CK_Shipment_Cost CHECK (ShippingCost >= 0),
    CONSTRAINT CK_Shipment_Status CHECK (Status IN (N'Preparing', N'Shipped', N'InTransit', N'Delivered', N'Returned'))
);
GO

-- Filtered indexes
CREATE INDEX IX_Product_Perishable ON sample_warehouse.Product(CategoryID) WHERE IsPerishable = 1;
GO

CREATE INDEX IX_Inventory_LowStock ON sample_warehouse.Inventory(ProductID) WHERE QuantityOnHand <= 10;
GO

-- ALTER TABLE CHECK constraints
ALTER TABLE sample_warehouse.Warehouse ADD CONSTRAINT CK_Warehouse_Code_Length CHECK (LEN(Code) BETWEEN 2 AND 10);
GO

ALTER TABLE sample_warehouse.Product ADD CONSTRAINT CK_Product_SKU_Length CHECK (LEN(SKU) >= 3);
GO

ALTER TABLE sample_warehouse.PurchaseOrder ADD CONSTRAINT CK_PurchaseOrder_Dates CHECK (ExpectedDeliveryDate IS NULL OR ExpectedDeliveryDate >= OrderDate);
GO

-- View 1: Inventory Summary
CREATE VIEW sample_warehouse.vwInventorySummary AS
SELECT
    p.ID AS ProductID,
    p.SKU,
    p.Name AS ProductName,
    pc.Name AS CategoryName,
    w.Name AS WarehouseName,
    i.QuantityOnHand,
    i.QuantityReserved,
    i.QuantityOnHand - i.QuantityReserved AS AvailableQuantity,
    p.UnitPrice,
    ROUND(p.UnitPrice * i.QuantityOnHand, 2) AS InventoryValue,
    i.ReorderPoint,
    IIF(i.QuantityOnHand <= i.ReorderPoint, N'Reorder', N'OK') AS StockStatus,
    ISNULL(i.LastCountDate, CAST('2000-01-01' AS DATE)) AS LastCountDate
FROM sample_warehouse.Inventory i
LEFT JOIN sample_warehouse.Product p ON i.ProductID = p.ID
LEFT JOIN sample_warehouse.ProductCategory pc ON p.CategoryID = pc.ID
LEFT JOIN sample_warehouse.Warehouse w ON i.WarehouseID = w.ID;
GO

-- View 2: Purchase Order Dashboard
CREATE VIEW sample_warehouse.vwPurchaseOrderDashboard AS
SELECT
    po.ID AS OrderID,
    po.OrderNumber,
    s.Name AS SupplierName,
    w.Name AS WarehouseName,
    po.OrderDate,
    po.ExpectedDeliveryDate,
    DATEDIFF(DAY, po.OrderDate, ISNULL(po.ExpectedDeliveryDate, GETUTCDATE())) AS LeadTimeDays,
    COUNT(poi.ID) AS ItemCount,
    SUM(poi.QuantityOrdered) AS TotalItemsOrdered,
    SUM(poi.QuantityReceived) AS TotalItemsReceived,
    po.TotalAmount,
    po.Status,
    CASE
        WHEN po.Status = N'Received' THEN N'Complete'
        WHEN po.Status = N'Cancelled' THEN N'Closed'
        WHEN DATEDIFF(DAY, po.ExpectedDeliveryDate, GETUTCDATE()) > 0 THEN N'Overdue'
        ELSE N'On Track'
    END AS TrackingStatus
FROM sample_warehouse.PurchaseOrder po
LEFT JOIN sample_warehouse.Supplier s ON po.SupplierID = s.ID
LEFT JOIN sample_warehouse.Warehouse w ON po.WarehouseID = w.ID
LEFT JOIN sample_warehouse.PurchaseOrderItem poi ON po.ID = poi.PurchaseOrderID
GROUP BY po.ID, po.OrderNumber, s.Name, w.Name, po.OrderDate, po.ExpectedDeliveryDate, po.TotalAmount, po.Status;
GO

-- View 3: Warehouse Utilization
CREATE VIEW sample_warehouse.vwWarehouseUtilization AS
SELECT
    w.ID AS WarehouseID,
    w.Name AS WarehouseName,
    w.Code,
    w.CapacitySqFt,
    COUNT(DISTINCT i.ProductID) AS UniqueProducts,
    COALESCE(SUM(i.QuantityOnHand), 0) AS TotalUnitsStored,
    ROUND(COALESCE(SUM(p.UnitPrice * i.QuantityOnHand), 0), 2) AS TotalInventoryValue,
    COALESCE(SUM(CAST(IIF(p.IsPerishable = 1, 1, 0) AS INT)), 0) AS PerishableItemCount,
    YEAR(GETUTCDATE()) AS ReportYear,
    MONTH(GETUTCDATE()) AS ReportMonth
FROM sample_warehouse.Warehouse w
LEFT JOIN sample_warehouse.Inventory i ON w.ID = i.WarehouseID
LEFT JOIN sample_warehouse.Product p ON i.ProductID = p.ID
GROUP BY w.ID, w.Name, w.Code, w.CapacitySqFt;
GO

-- View 4: Shipment Tracking
CREATE VIEW sample_warehouse.vwShipmentTracking AS
SELECT
    sh.ID AS ShipmentID,
    sh.ShipmentNumber,
    w.Name AS WarehouseName,
    sh.ShipDate,
    sh.DeliveryDate,
    CASE
        WHEN sh.DeliveryDate IS NOT NULL THEN DATEDIFF(DAY, sh.ShipDate, sh.DeliveryDate)
        ELSE DATEDIFF(DAY, sh.ShipDate, GETUTCDATE())
    END AS TransitDays,
    sh.Destination,
    ISNULL(sh.TotalWeight, 0) AS TotalWeight,
    sh.ShippingCost,
    sh.Status,
    IIF(sh.IsExpedited = 1, N'Express', N'Standard') AS ShippingType,
    ROUND(sh.ShippingCost + (sh.ShippingCost * 0.1), 2) AS CostWithSurcharge
FROM sample_warehouse.Shipment sh
LEFT JOIN sample_warehouse.Warehouse w ON sh.WarehouseID = w.ID;
GO

-- Extended Properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Warehouse locations', @level0type=N'SCHEMA', @level0name=N'sample_warehouse', @level1type=N'TABLE', @level1name=N'Warehouse';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Product categories with hierarchy', @level0type=N'SCHEMA', @level0name=N'sample_warehouse', @level1type=N'TABLE', @level1name=N'ProductCategory';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Product catalog', @level0type=N'SCHEMA', @level0name=N'sample_warehouse', @level1type=N'TABLE', @level1name=N'Product';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Supplier information', @level0type=N'SCHEMA', @level0name=N'sample_warehouse', @level1type=N'TABLE', @level1name=N'Supplier';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current inventory levels', @level0type=N'SCHEMA', @level0name=N'sample_warehouse', @level1type=N'TABLE', @level1name=N'Inventory';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Purchase orders from suppliers', @level0type=N'SCHEMA', @level0name=N'sample_warehouse', @level1type=N'TABLE', @level1name=N'PurchaseOrder';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Line items for purchase orders', @level0type=N'SCHEMA', @level0name=N'sample_warehouse', @level1type=N'TABLE', @level1name=N'PurchaseOrderItem';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Outbound shipment tracking', @level0type=N'SCHEMA', @level0name=N'sample_warehouse', @level1type=N'TABLE', @level1name=N'Shipment';
GO

-- Column-level comments
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stock keeping unit identifier', @level0type=N'SCHEMA', @level0name=N'sample_warehouse', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'SKU';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Self-referencing hierarchy', @level0type=N'SCHEMA', @level0name=N'sample_warehouse', @level1type=N'TABLE', @level1name=N'ProductCategory', @level2type=N'COLUMN', @level2name=N'ParentCategoryID';
GO

-- Role and Grant
CREATE ROLE [WarehouseReader];
GO
GRANT SELECT ON SCHEMA::sample_warehouse TO [WarehouseReader];
GO

-- INSERT seed data
-- Warehouses
INSERT INTO sample_warehouse.Warehouse (ID, Name, Code, Address, City, CapacitySqFt, IsActive, ManagerName, Phone) VALUES
(NEWID(), N'Central Distribution Hub', N'CDH', N'100 Logistics Drive', N'Chicago', 50000, 1, N'John Maxwell', N'555-2001'),
(NEWID(), N'East Coast Facility', N'ECF', N'200 Harbor Road', N'Newark', 35000, 1, N'Sarah Palmer', N'555-2002'),
(NEWID(), N'West Coast Center', N'WCC', N'300 Pacific Blvd', N'Los Angeles', 45000, 1, N'Mike Chen', N'555-2003'),
(NEWID(), N'South Regional Depot', N'SRD', N'400 Commerce Way', N'Atlanta', 25000, 1, N'Lisa Rodriguez', N'555-2004');
GO

-- Product Categories
INSERT INTO sample_warehouse.ProductCategory (ID, Name, Description, IsActive) VALUES
(NEWID(), N'Electronics', N'Electronic devices and components', 1),
(NEWID(), N'Food & Beverage', N'Perishable and non-perishable food items', 1),
(NEWID(), N'Clothing', N'Apparel and accessories', 1),
(NEWID(), N'Home & Garden', N'Household and garden products', 1),
(NEWID(), N'Office Supplies', N'Office and stationery products', 1);
GO

-- Products
INSERT INTO sample_warehouse.Product (ID, SKU, Name, CategoryID, UnitPrice, Weight, IsPerishable, MinStockLevel, Description) VALUES
(NEWID(), N'ELEC-001', N'Wireless Mouse', (SELECT TOP 1 ID FROM sample_warehouse.ProductCategory WHERE Name = N'Electronics'), 29.99, 0.150, 0, 50, N'Ergonomic wireless mouse'),
(NEWID(), N'ELEC-002', N'USB-C Hub', (SELECT TOP 1 ID FROM sample_warehouse.ProductCategory WHERE Name = N'Electronics'), 49.99, 0.200, 0, 30, N'7-port USB-C hub'),
(NEWID(), N'FOOD-001', N'Organic Coffee', (SELECT TOP 1 ID FROM sample_warehouse.ProductCategory WHERE Name = N'Food & Beverage'), 14.99, 1.000, 1, 100, N'Fair trade organic coffee beans'),
(NEWID(), N'FOOD-002', N'Green Tea Pack', (SELECT TOP 1 ID FROM sample_warehouse.ProductCategory WHERE Name = N'Food & Beverage'), 8.99, 0.500, 1, 75, N'Pack of 50 green tea bags'),
(NEWID(), N'CLTH-001', N'Cotton T-Shirt', (SELECT TOP 1 ID FROM sample_warehouse.ProductCategory WHERE Name = N'Clothing'), 19.99, 0.250, 0, 200, N'Basic cotton crew neck'),
(NEWID(), N'CLTH-002', N'Denim Jacket', (SELECT TOP 1 ID FROM sample_warehouse.ProductCategory WHERE Name = N'Clothing'), 79.99, 1.200, 0, 40, N'Classic denim jacket'),
(NEWID(), N'HOME-001', N'Table Lamp', (SELECT TOP 1 ID FROM sample_warehouse.ProductCategory WHERE Name = N'Home & Garden'), 34.99, 2.500, 0, 25, N'Modern desk lamp'),
(NEWID(), N'HOME-002', N'Garden Tool Set', (SELECT TOP 1 ID FROM sample_warehouse.ProductCategory WHERE Name = N'Home & Garden'), 45.99, 3.500, 0, 15, N'5-piece garden tool kit'),
(NEWID(), N'OFFC-001', N'Printer Paper', (SELECT TOP 1 ID FROM sample_warehouse.ProductCategory WHERE Name = N'Office Supplies'), 12.99, 5.000, 0, 500, N'500-sheet letter paper'),
(NEWID(), N'OFFC-002', N'Ink Cartridge', (SELECT TOP 1 ID FROM sample_warehouse.ProductCategory WHERE Name = N'Office Supplies'), 24.99, 0.300, 0, 60, N'Black ink cartridge');
GO

-- Suppliers
INSERT INTO sample_warehouse.Supplier (ID, Name, ContactName, Email, Phone, Address, IsActive, Rating) VALUES
(NEWID(), N'TechParts Inc', N'Tom Baker', N'tom@techparts.com', N'555-3001', N'500 Tech Lane, San Jose', 1, 4),
(NEWID(), N'Global Foods Ltd', N'Anna Chen', N'anna@globalfoods.com', N'555-3002', N'600 Farm Road, Portland', 1, 5),
(NEWID(), N'Fashion Forward', N'David Lee', N'david@fashionfwd.com', N'555-3003', N'700 Style Ave, New York', 1, 3),
(NEWID(), N'Home Essentials Co', N'Maria Santos', N'maria@homeessentials.com', N'555-3004', N'800 Living Blvd, Dallas', 1, 4),
(NEWID(), N'Office Pro Supply', N'Chris Wilson', N'chris@officepro.com', N'555-3005', N'900 Business Park, Denver', 1, 4);
GO

-- Inventory
INSERT INTO sample_warehouse.Inventory (ID, ProductID, WarehouseID, QuantityOnHand, QuantityReserved, ReorderPoint, LastCountDate) VALUES
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'ELEC-001'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'CDH'), 120, 15, 50, '2024-10-01'),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'ELEC-002'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'CDH'), 80, 10, 30, '2024-10-01'),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'FOOD-001'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'ECF'), 200, 25, 100, '2024-09-28'),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'FOOD-002'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'ECF'), 150, 0, 75, '2024-09-28'),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'CLTH-001'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'WCC'), 500, 50, 200, '2024-10-05'),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'CLTH-002'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'WCC'), 35, 5, 40, '2024-10-05'),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'HOME-001'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'SRD'), 45, 3, 25, '2024-10-02'),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'HOME-002'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'SRD'), 20, 0, 15, '2024-10-02'),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'OFFC-001'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'CDH'), 800, 100, 500, '2024-10-01'),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'OFFC-002'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'CDH'), 55, 8, 60, '2024-10-01');
GO

-- Purchase Orders
INSERT INTO sample_warehouse.PurchaseOrder (ID, OrderNumber, SupplierID, WarehouseID, OrderDate, ExpectedDeliveryDate, TotalAmount, Status, Notes) VALUES
(NEWID(), N'PO-2024-001', (SELECT TOP 1 ID FROM sample_warehouse.Supplier WHERE Name = N'TechParts Inc'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'CDH'), '2024-09-15', '2024-09-25', 2499.50, N'Received', N'Regular restock order'),
(NEWID(), N'PO-2024-002', (SELECT TOP 1 ID FROM sample_warehouse.Supplier WHERE Name = N'Global Foods Ltd'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'ECF'), '2024-09-20', '2024-09-28', 1750.00, N'Received', NULL),
(NEWID(), N'PO-2024-003', (SELECT TOP 1 ID FROM sample_warehouse.Supplier WHERE Name = N'Fashion Forward'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'WCC'), '2024-10-01', '2024-10-12', 4200.00, N'Shipped', N'Fall collection order'),
(NEWID(), N'PO-2024-004', (SELECT TOP 1 ID FROM sample_warehouse.Supplier WHERE Name = N'Office Pro Supply'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'CDH'), '2024-10-05', '2024-10-15', 1850.00, N'Pending', NULL),
(NEWID(), N'PO-2024-005', (SELECT TOP 1 ID FROM sample_warehouse.Supplier WHERE Name = N'Home Essentials Co'), (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'SRD'), '2024-10-08', NULL, 3100.00, N'Approved', N'Bulk order for holiday season');
GO

-- Purchase Order Items
INSERT INTO sample_warehouse.PurchaseOrderItem (ID, PurchaseOrderID, ProductID, QuantityOrdered, UnitCost, QuantityReceived) VALUES
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.PurchaseOrder WHERE OrderNumber = N'PO-2024-001'), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'ELEC-001'), 50, 18.99, 50),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.PurchaseOrder WHERE OrderNumber = N'PO-2024-001'), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'ELEC-002'), 30, 32.50, 30),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.PurchaseOrder WHERE OrderNumber = N'PO-2024-002'), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'FOOD-001'), 100, 9.50, 100),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.PurchaseOrder WHERE OrderNumber = N'PO-2024-002'), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'FOOD-002'), 75, 5.00, 75),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.PurchaseOrder WHERE OrderNumber = N'PO-2024-003'), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'CLTH-001'), 200, 12.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.PurchaseOrder WHERE OrderNumber = N'PO-2024-003'), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'CLTH-002'), 50, 48.00, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.PurchaseOrder WHERE OrderNumber = N'PO-2024-004'), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'OFFC-001'), 100, 8.50, 0),
(NEWID(), (SELECT TOP 1 ID FROM sample_warehouse.PurchaseOrder WHERE OrderNumber = N'PO-2024-004'), (SELECT TOP 1 ID FROM sample_warehouse.Product WHERE SKU = N'OFFC-002'), 50, 16.00, 0);
GO

-- Shipments
INSERT INTO sample_warehouse.Shipment (ID, ShipmentNumber, WarehouseID, ShipDate, DeliveryDate, Destination, TotalWeight, ShippingCost, Status, IsExpedited) VALUES
(NEWID(), N'SH-2024-001', (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'CDH'), '2024-09-28', '2024-10-02', N'Customer A - 123 Main St, Boston', 15.500, 45.00, N'Delivered', 0),
(NEWID(), N'SH-2024-002', (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'ECF'), '2024-10-01', '2024-10-03', N'Customer B - 456 Oak Ave, Philadelphia', 8.200, 32.00, N'Delivered', 1),
(NEWID(), N'SH-2024-003', (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'WCC'), '2024-10-05', NULL, N'Customer C - 789 Pine St, San Francisco', 22.100, 55.00, N'InTransit', 0),
(NEWID(), N'SH-2024-004', (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'SRD'), '2024-10-08', NULL, N'Customer D - 321 Elm Rd, Miami', 5.750, 28.00, N'Shipped', 1),
(NEWID(), N'SH-2024-005', (SELECT TOP 1 ID FROM sample_warehouse.Warehouse WHERE Code = N'CDH'), '2024-10-10', NULL, N'Customer E - 654 Maple Dr, Minneapolis', 35.000, 72.00, N'Preparing', 0);
GO
