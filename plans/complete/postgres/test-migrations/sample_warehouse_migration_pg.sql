-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_warehouse;
SET search_path TO sample_warehouse, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER → BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER→bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

-- Table 1: Warehouse
CREATE TABLE sample_warehouse."Warehouse" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "Code" VARCHAR(10) NOT NULL,
 "Address" VARCHAR(300) NOT NULL,
 "City" VARCHAR(100) NOT NULL,
 "CapacitySqFt" INTEGER NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "ManagerName" VARCHAR(100) NULL,
 "Phone" VARCHAR(20) NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Warehouse PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Warehouse_Code UNIQUE ("Code"),
 CONSTRAINT UQ_Warehouse_Name UNIQUE ("Name"),
 CONSTRAINT CK_Warehouse_Capacity CHECK ("CapacitySqFt" > 0)
);

-- Table 2: ProductCategory
CREATE TABLE sample_warehouse."ProductCategory" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "Description" TEXT NULL,
 "ParentCategoryID" UUID NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_ProductCategory PRIMARY KEY ("ID"),
 CONSTRAINT FK_ProductCategory_Parent FOREIGN KEY ("ParentCategoryID") REFERENCES sample_warehouse."ProductCategory"("ID"),
 CONSTRAINT UQ_ProductCategory_Name UNIQUE ("Name")
);

-- Table 3: Product
CREATE TABLE sample_warehouse."Product" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SKU" VARCHAR(30) NOT NULL,
 "Name" VARCHAR(200) NOT NULL,
 "CategoryID" UUID NOT NULL,
 "UnitPrice" DECIMAL(10,2) NOT NULL,
 "Weight" DECIMAL(8,3) NULL,
 "IsPerishable" BOOLEAN NOT NULL DEFAULT FALSE,
 "MinStockLevel" INTEGER NOT NULL DEFAULT 10,
 "Description" TEXT NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Product PRIMARY KEY ("ID"),
 CONSTRAINT FK_Product_Category FOREIGN KEY ("CategoryID") REFERENCES sample_warehouse."ProductCategory"("ID"),
 CONSTRAINT UQ_Product_SKU UNIQUE ("SKU"),
 CONSTRAINT CK_Product_Price CHECK ("UnitPrice" > 0),
 CONSTRAINT CK_Product_MinStock CHECK ("MinStockLevel" >= 0)
);

-- Table 4: Supplier
CREATE TABLE sample_warehouse."Supplier" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(150) NOT NULL,
 "ContactName" VARCHAR(100) NULL,
 "Email" VARCHAR(200) NULL,
 "Phone" VARCHAR(20) NULL,
 "Address" VARCHAR(300) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "Rating" SMALLINT NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Supplier PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Supplier_Name UNIQUE ("Name"),
 CONSTRAINT CK_Supplier_Rating CHECK ("Rating" BETWEEN 1 AND 5)
);

-- Table 5: Inventory
CREATE TABLE sample_warehouse."Inventory" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ProductID" UUID NOT NULL,
 "WarehouseID" UUID NOT NULL,
 "QuantityOnHand" INTEGER NOT NULL DEFAULT 0,
 "QuantityReserved" INTEGER NOT NULL DEFAULT 0,
 "ReorderPoint" INTEGER NOT NULL DEFAULT 5,
 "LastCountDate" DATE NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Inventory PRIMARY KEY ("ID"),
 CONSTRAINT FK_Inventory_Product FOREIGN KEY ("ProductID") REFERENCES sample_warehouse."Product"("ID"),
 CONSTRAINT FK_Inventory_Warehouse FOREIGN KEY ("WarehouseID") REFERENCES sample_warehouse."Warehouse"("ID"),
 CONSTRAINT UQ_Inventory_ProductWarehouse UNIQUE ("ProductID", "WarehouseID"),
 CONSTRAINT CK_Inventory_Quantity CHECK ("QuantityOnHand" >= 0),
 CONSTRAINT CK_Inventory_Reserved CHECK ("QuantityReserved" >= 0)
);

-- Table 6: PurchaseOrder
CREATE TABLE sample_warehouse."PurchaseOrder" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "OrderNumber" VARCHAR(20) NOT NULL,
 "SupplierID" UUID NOT NULL,
 "WarehouseID" UUID NOT NULL,
 "OrderDate" DATE NOT NULL,
 "ExpectedDeliveryDate" DATE NULL,
 "TotalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
 "Notes" TEXT NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_PurchaseOrder PRIMARY KEY ("ID"),
 CONSTRAINT FK_PurchaseOrder_Supplier FOREIGN KEY ("SupplierID") REFERENCES sample_warehouse."Supplier"("ID"),
 CONSTRAINT FK_PurchaseOrder_Warehouse FOREIGN KEY ("WarehouseID") REFERENCES sample_warehouse."Warehouse"("ID"),
 CONSTRAINT UQ_PurchaseOrder_Number UNIQUE ("OrderNumber"),
 CONSTRAINT CK_PurchaseOrder_Total CHECK ("TotalAmount" >= 0),
 CONSTRAINT CK_PurchaseOrder_Status CHECK ("Status" IN ('Pending', 'Approved', 'Shipped', 'Received', 'Cancelled'))
);

-- Table 7: PurchaseOrderItem
CREATE TABLE sample_warehouse."PurchaseOrderItem" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PurchaseOrderID" UUID NOT NULL,
 "ProductID" UUID NOT NULL,
 "QuantityOrdered" INTEGER NOT NULL,
 "UnitCost" DECIMAL(10,2) NOT NULL,
 "QuantityReceived" INTEGER NOT NULL DEFAULT 0,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_PurchaseOrderItem PRIMARY KEY ("ID"),
 CONSTRAINT FK_POItem_PurchaseOrder FOREIGN KEY ("PurchaseOrderID") REFERENCES sample_warehouse."PurchaseOrder"("ID"),
 CONSTRAINT FK_POItem_Product FOREIGN KEY ("ProductID") REFERENCES sample_warehouse."Product"("ID"),
 CONSTRAINT CK_POItem_Quantity CHECK ("QuantityOrdered" > 0),
 CONSTRAINT CK_POItem_Cost CHECK ("UnitCost" > 0),
 CONSTRAINT CK_POItem_Received CHECK ("QuantityReceived" >= 0)
);

-- Table 8: Shipment
CREATE TABLE sample_warehouse."Shipment" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ShipmentNumber" VARCHAR(20) NOT NULL,
 "WarehouseID" UUID NOT NULL,
 "ShipDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "DeliveryDate" TIMESTAMPTZ NULL,
 "Destination" VARCHAR(300) NOT NULL,
 "TotalWeight" DECIMAL(10,3) NULL,
 "ShippingCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Preparing',
 "IsExpedited" BOOLEAN NOT NULL DEFAULT FALSE,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Shipment PRIMARY KEY ("ID"),
 CONSTRAINT FK_Shipment_Warehouse FOREIGN KEY ("WarehouseID") REFERENCES sample_warehouse."Warehouse"("ID"),
 CONSTRAINT UQ_Shipment_Number UNIQUE ("ShipmentNumber"),
 CONSTRAINT CK_Shipment_Cost CHECK ("ShippingCost" >= 0),
 CONSTRAINT CK_Shipment_Status CHECK ("Status" IN ('Preparing', 'Shipped', 'InTransit', 'Delivered', 'Returned'))
);

-- Filtered indexes
CREATE INDEX IF NOT EXISTS IX_Product_Perishable ON sample_warehouse."Product"("CategoryID") WHERE "IsPerishable" = 1;

CREATE INDEX IF NOT EXISTS IX_Inventory_LowStock ON sample_warehouse."Inventory"("ProductID") WHERE "QuantityOnHand" <= 10;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'WarehouseReader') THEN
        CREATE ROLE "WarehouseReader";
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_warehouse."vwInventorySummary" AS SELECT
    p."ID" AS "ProductID",
    p."SKU",
    p."Name" AS "ProductName",
    pc."Name" AS "CategoryName",
    w."Name" AS "WarehouseName",
    i."QuantityOnHand",
    i."QuantityReserved",
    i."QuantityOnHand" - i."QuantityReserved" AS "AvailableQuantity",
    p."UnitPrice",
    ROUND(p."UnitPrice" * i."QuantityOnHand", 2) AS "InventoryValue",
    i."ReorderPoint",
    CASE WHEN i."QuantityOnHand" <= i."ReorderPoint" THEN 'Reorder' ELSE 'OK' END AS "StockStatus",
    COALESCE(i."LastCountDate", CAST('2000-01-01' AS DATE)) AS "LastCountDate"
FROM sample_warehouse."Inventory" i
LEFT JOIN sample_warehouse."Product" p ON i."ProductID" = p."ID"
LEFT JOIN sample_warehouse."ProductCategory" pc ON p."CategoryID" = pc."ID"
LEFT JOIN sample_warehouse."Warehouse" w ON i."WarehouseID" = w."ID";

CREATE OR REPLACE VIEW sample_warehouse."vwPurchaseOrderDashboard" AS SELECT
    po."ID" AS "OrderID",
    po."OrderNumber",
    s."Name" AS "SupplierName",
    w."Name" AS "WarehouseName",
    po."OrderDate",
    po."ExpectedDeliveryDate",
    EXTRACT(DAY FROM (COALESCE(po."ExpectedDeliveryDate", NOW())::TIMESTAMPTZ - po."OrderDate"::TIMESTAMPTZ)) AS "LeadTimeDays",
    COUNT(poi."ID") AS "ItemCount",
    SUM(poi."QuantityOrdered") AS "TotalItemsOrdered",
    SUM(poi."QuantityReceived") AS "TotalItemsReceived",
    po."TotalAmount",
    po."Status",
    CASE
        WHEN po."Status" = 'Received' THEN 'Complete'
        WHEN po."Status" = 'Cancelled' THEN 'Closed'
        WHEN EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - po."ExpectedDeliveryDate"::TIMESTAMPTZ)) > 0 THEN 'Overdue'
        ELSE 'On Track'
    END AS "TrackingStatus"
FROM sample_warehouse."PurchaseOrder" po
LEFT JOIN sample_warehouse."Supplier" s ON po."SupplierID" = s."ID"
LEFT JOIN sample_warehouse."Warehouse" w ON po."WarehouseID" = w."ID"
LEFT JOIN sample_warehouse."PurchaseOrderItem" poi ON po."ID" = poi."PurchaseOrderID"
GROUP BY po."ID", po."OrderNumber", s."Name", w."Name", po."OrderDate", po."ExpectedDeliveryDate", po."TotalAmount", po."Status";

CREATE OR REPLACE VIEW sample_warehouse."vwWarehouseUtilization" AS SELECT
    w."ID" AS "WarehouseID",
    w."Name" AS "WarehouseName",
    w."Code",
    w."CapacitySqFt",
    COUNT(DISTINCT i."ProductID") AS "UniqueProducts",
    COALESCE(SUM(i."QuantityOnHand"), 0) AS "TotalUnitsStored",
    ROUND(COALESCE(SUM(p."UnitPrice" * i."QuantityOnHand"), 0), 2) AS "TotalInventoryValue",
    COALESCE(SUM(CAST(CASE WHEN p."IsPerishable" = 1 THEN 1 ELSE 0 END AS INTEGER)), 0) AS "PerishableItemCount",
    EXTRACT(YEAR FROM NOW()) AS "ReportYear",
    EXTRACT(MONTH FROM NOW()) AS "ReportMonth"
FROM sample_warehouse."Warehouse" w
LEFT JOIN sample_warehouse."Inventory" i ON w."ID" = i."WarehouseID"
LEFT JOIN sample_warehouse."Product" p ON i."ProductID" = p."ID"
GROUP BY w."ID", w."Name", w."Code", w."CapacitySqFt";

CREATE OR REPLACE VIEW sample_warehouse."vwShipmentTracking" AS SELECT
    sh."ID" AS "ShipmentID",
    sh."ShipmentNumber",
    w."Name" AS "WarehouseName",
    sh."ShipDate",
    sh."DeliveryDate",
    CASE
        WHEN sh."DeliveryDate" IS NOT NULL THEN EXTRACT(DAY FROM (sh."DeliveryDate"::TIMESTAMPTZ - sh."ShipDate"::TIMESTAMPTZ))
        ELSE EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - sh."ShipDate"::TIMESTAMPTZ))
    END AS "TransitDays",
    sh."Destination",
    COALESCE(sh."TotalWeight", 0) AS "TotalWeight",
    sh."ShippingCost",
    sh."Status",
    CASE WHEN sh."IsExpedited" = 1 THEN 'Express' ELSE 'Standard' END AS "ShippingType",
    ROUND(sh."ShippingCost" + (sh."ShippingCost" * 0.1), 2) AS "CostWithSurcharge"
FROM sample_warehouse."Shipment" sh
LEFT JOIN sample_warehouse."Warehouse" w ON sh."WarehouseID" = w."ID";


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- INSERT seed data
-- Warehouses
INSERT INTO sample_warehouse."Warehouse" ("ID", "Name", "Code", "Address", "City", "CapacitySqFt", "IsActive", "ManagerName", "Phone") VALUES
(gen_random_uuid(), 'Central Distribution Hub', 'CDH', '100 Logistics Drive', 'Chicago', 50000, 1, 'John Maxwell', '555-2001'),
(gen_random_uuid(), 'East Coast Facility', 'ECF', '200 Harbor Road', 'Newark', 35000, 1, 'Sarah Palmer', '555-2002'),
(gen_random_uuid(), 'West Coast Center', 'WCC', '300 Pacific Blvd', 'Los Angeles', 45000, 1, 'Mike Chen', '555-2003'),
(gen_random_uuid(), 'South Regional Depot', 'SRD', '400 Commerce Way', 'Atlanta', 25000, 1, 'Lisa Rodriguez', '555-2004');

-- Product Categories
INSERT INTO sample_warehouse."ProductCategory" ("ID", "Name", "Description", "IsActive") VALUES
(gen_random_uuid(), 'Electronics', 'Electronic devices and components', 1),
(gen_random_uuid(), 'Food & Beverage', 'Perishable and non-perishable food items', 1),
(gen_random_uuid(), 'Clothing', 'Apparel and accessories', 1),
(gen_random_uuid(), 'Home & Garden', 'Household and garden products', 1),
(gen_random_uuid(), 'Office Supplies', 'Office and stationery products', 1);

-- Products
INSERT INTO sample_warehouse."Product" ("ID", "SKU", "Name", "CategoryID", "UnitPrice", "Weight", "IsPerishable", "MinStockLevel", "Description") VALUES
(gen_random_uuid(), 'ELEC-001', 'Wireless Mouse', (SELECT "ID" FROM sample_warehouse."ProductCategory" WHERE "Name" = 'Electronics'
LIMIT 1), 29.99, 0.150, 0, 50, 'Ergonomic wireless mouse'),
(gen_random_uuid(), 'ELEC-002', 'USB-C Hub', (SELECT "ID" FROM sample_warehouse."ProductCategory" WHERE "Name" = 'Electronics'
LIMIT 1), 49.99, 0.200, 0, 30, '7-port USB-C hub'),
(gen_random_uuid(), 'FOOD-001', 'Organic Coffee', (SELECT "ID" FROM sample_warehouse."ProductCategory" WHERE "Name" = 'Food & Beverage'
LIMIT 1), 14.99, 1.000, 1, 100, 'Fair trade organic coffee beans'),
(gen_random_uuid(), 'FOOD-002', 'Green Tea Pack', (SELECT "ID" FROM sample_warehouse."ProductCategory" WHERE "Name" = 'Food & Beverage'
LIMIT 1), 8.99, 0.500, 1, 75, 'Pack of 50 green tea bags'),
(gen_random_uuid(), 'CLTH-001', 'Cotton T-Shirt', (SELECT "ID" FROM sample_warehouse."ProductCategory" WHERE "Name" = 'Clothing'
LIMIT 1), 19.99, 0.250, 0, 200, 'Basic cotton crew neck'),
(gen_random_uuid(), 'CLTH-002', 'Denim Jacket', (SELECT "ID" FROM sample_warehouse."ProductCategory" WHERE "Name" = 'Clothing'
LIMIT 1), 79.99, 1.200, 0, 40, 'Classic denim jacket'),
(gen_random_uuid(), 'HOME-001', 'Table Lamp', (SELECT "ID" FROM sample_warehouse."ProductCategory" WHERE "Name" = 'Home & Garden'
LIMIT 1), 34.99, 2.500, 0, 25, 'Modern desk lamp'),
(gen_random_uuid(), 'HOME-002', 'Garden Tool Set', (SELECT "ID" FROM sample_warehouse."ProductCategory" WHERE "Name" = 'Home & Garden'
LIMIT 1), 45.99, 3.500, 0, 15, '5-piece garden tool kit'),
(gen_random_uuid(), 'OFFC-001', 'Printer Paper', (SELECT "ID" FROM sample_warehouse."ProductCategory" WHERE "Name" = 'Office Supplies'
LIMIT 1), 12.99, 5.000, 0, 500, '500-sheet letter paper'),
(gen_random_uuid(), 'OFFC-002', 'Ink Cartridge', (SELECT "ID" FROM sample_warehouse."ProductCategory" WHERE "Name" = 'Office Supplies'
LIMIT 1), 24.99, 0.300, 0, 60, 'Black ink cartridge');

-- Suppliers
INSERT INTO sample_warehouse."Supplier" ("ID", "Name", "ContactName", "Email", "Phone", "Address", "IsActive", "Rating") VALUES
(gen_random_uuid(), 'TechParts Inc', 'Tom Baker', 'tom@techparts.com', '555-3001', '500 Tech Lane, San Jose', 1, 4),
(gen_random_uuid(), 'Global Foods Ltd', 'Anna Chen', 'anna@globalfoods.com', '555-3002', '600 Farm Road, Portland', 1, 5),
(gen_random_uuid(), 'Fashion Forward', 'David Lee', 'david@fashionfwd.com', '555-3003', '700 Style Ave, New York', 1, 3),
(gen_random_uuid(), 'Home Essentials Co', 'Maria Santos', 'maria@homeessentials.com', '555-3004', '800 Living Blvd, Dallas', 1, 4),
(gen_random_uuid(), 'Office Pro Supply', 'Chris Wilson', 'chris@officepro.com', '555-3005', '900 Business Park, Denver', 1, 4);

-- Inventory
INSERT INTO sample_warehouse."Inventory" ("ID", "ProductID", "WarehouseID", "QuantityOnHand", "QuantityReserved", "ReorderPoint", "LastCountDate") VALUES
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'ELEC-001'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'CDH'
LIMIT 1), 120, 15, 50, '2024-10-01'),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'ELEC-002'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'CDH'
LIMIT 1), 80, 10, 30, '2024-10-01'),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'FOOD-001'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'ECF'
LIMIT 1), 200, 25, 100, '2024-09-28'),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'FOOD-002'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'ECF'
LIMIT 1), 150, 0, 75, '2024-09-28'),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'CLTH-001'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'WCC'
LIMIT 1), 500, 50, 200, '2024-10-05'),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'CLTH-002'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'WCC'
LIMIT 1), 35, 5, 40, '2024-10-05'),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'HOME-001'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'SRD'
LIMIT 1), 45, 3, 25, '2024-10-02'),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'HOME-002'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'SRD'
LIMIT 1), 20, 0, 15, '2024-10-02'),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'OFFC-001'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'CDH'
LIMIT 1), 800, 100, 500, '2024-10-01'),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'OFFC-002'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'CDH'
LIMIT 1), 55, 8, 60, '2024-10-01');

-- Purchase Orders
INSERT INTO sample_warehouse."PurchaseOrder" ("ID", "OrderNumber", "SupplierID", "WarehouseID", "OrderDate", "ExpectedDeliveryDate", "TotalAmount", "Status", "Notes") VALUES
(gen_random_uuid(), 'PO-2024-001', (SELECT "ID" FROM sample_warehouse."Supplier" WHERE "Name" = 'TechParts Inc'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'CDH'
LIMIT 1), '2024-09-15', '2024-09-25', 2499.50, 'Received', 'Regular restock order'),
(gen_random_uuid(), 'PO-2024-002', (SELECT "ID" FROM sample_warehouse."Supplier" WHERE "Name" = 'Global Foods Ltd'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'ECF'
LIMIT 1), '2024-09-20', '2024-09-28', 1750.00, 'Received', NULL),
(gen_random_uuid(), 'PO-2024-003', (SELECT "ID" FROM sample_warehouse."Supplier" WHERE "Name" = 'Fashion Forward'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'WCC'
LIMIT 1), '2024-10-01', '2024-10-12', 4200.00, 'Shipped', 'Fall collection order'),
(gen_random_uuid(), 'PO-2024-004', (SELECT "ID" FROM sample_warehouse."Supplier" WHERE "Name" = 'Office Pro Supply'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'CDH'
LIMIT 1), '2024-10-05', '2024-10-15', 1850.00, 'Pending', NULL),
(gen_random_uuid(), 'PO-2024-005', (SELECT "ID" FROM sample_warehouse."Supplier" WHERE "Name" = 'Home Essentials Co'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'SRD'
LIMIT 1), '2024-10-08', NULL, 3100.00, 'Approved', 'Bulk order for holiday season');

-- Purchase Order Items
INSERT INTO sample_warehouse."PurchaseOrderItem" ("ID", "PurchaseOrderID", "ProductID", "QuantityOrdered", "UnitCost", "QuantityReceived") VALUES
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."PurchaseOrder" WHERE "OrderNumber" = 'PO-2024-001'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'ELEC-001'
LIMIT 1), 50, 18.99, 50),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."PurchaseOrder" WHERE "OrderNumber" = 'PO-2024-001'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'ELEC-002'
LIMIT 1), 30, 32.50, 30),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."PurchaseOrder" WHERE "OrderNumber" = 'PO-2024-002'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'FOOD-001'
LIMIT 1), 100, 9.50, 100),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."PurchaseOrder" WHERE "OrderNumber" = 'PO-2024-002'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'FOOD-002'
LIMIT 1), 75, 5.00, 75),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."PurchaseOrder" WHERE "OrderNumber" = 'PO-2024-003'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'CLTH-001'
LIMIT 1), 200, 12.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."PurchaseOrder" WHERE "OrderNumber" = 'PO-2024-003'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'CLTH-002'
LIMIT 1), 50, 48.00, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."PurchaseOrder" WHERE "OrderNumber" = 'PO-2024-004'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'OFFC-001'
LIMIT 1), 100, 8.50, 0),
(gen_random_uuid(), (SELECT "ID" FROM sample_warehouse."PurchaseOrder" WHERE "OrderNumber" = 'PO-2024-004'
LIMIT 1), (SELECT "ID" FROM sample_warehouse."Product" WHERE "SKU" = 'OFFC-002'
LIMIT 1), 50, 16.00, 0);

-- Shipments
INSERT INTO sample_warehouse."Shipment" ("ID", "ShipmentNumber", "WarehouseID", "ShipDate", "DeliveryDate", "Destination", "TotalWeight", "ShippingCost", "Status", "IsExpedited") VALUES
(gen_random_uuid(), 'SH-2024-001', (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'CDH'
LIMIT 1), '2024-09-28', '2024-10-02', 'Customer A - 123 Main St, Boston', 15.500, 45.00, 'Delivered', 0),
(gen_random_uuid(), 'SH-2024-002', (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'ECF'
LIMIT 1), '2024-10-01', '2024-10-03', 'Customer B - 456 Oak Ave, Philadelphia', 8.200, 32.00, 'Delivered', 1),
(gen_random_uuid(), 'SH-2024-003', (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'WCC'
LIMIT 1), '2024-10-05', NULL, 'Customer C - 789 Pine St, San Francisco', 22.100, 55.00, 'InTransit', 0),
(gen_random_uuid(), 'SH-2024-004', (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'SRD'
LIMIT 1), '2024-10-08', NULL, 'Customer D - 321 Elm Rd, Miami', 5.750, 28.00, 'Shipped', 1),
(gen_random_uuid(), 'SH-2024-005', (SELECT "ID" FROM sample_warehouse."Warehouse" WHERE "Code" = 'CDH'
LIMIT 1), '2024-10-10', NULL, 'Customer E - 654 Maple Dr, Minneapolis', 35.000, 72.00, 'Preparing', 0);


-- ===================== FK & CHECK Constraints =====================

-- ALTER TABLE CHECK constraints
ALTER TABLE sample_warehouse."Warehouse" ADD CONSTRAINT CK_Warehouse_Code_Length CHECK (LENGTH("Code") BETWEEN 2 AND 10) NOT VALID;

ALTER TABLE sample_warehouse."Product" ADD CONSTRAINT CK_Product_SKU_Length CHECK (LENGTH("SKU") >= 3) NOT VALID;

ALTER TABLE sample_warehouse."PurchaseOrder" ADD CONSTRAINT CK_PurchaseOrder_Dates CHECK ("ExpectedDeliveryDate" IS NULL OR "ExpectedDeliveryDate" >= "OrderDate") NOT VALID;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA sample_warehouse TO "WarehouseReader";


-- ===================== Comments =====================

COMMENT ON TABLE sample_warehouse."Warehouse" IS 'Warehouse locations';

COMMENT ON TABLE sample_warehouse."ProductCategory" IS 'Product categories with hierarchy';

COMMENT ON TABLE sample_warehouse."Product" IS 'Product catalog';

COMMENT ON TABLE sample_warehouse."Supplier" IS 'Supplier information';

COMMENT ON TABLE sample_warehouse."Inventory" IS 'Current inventory levels';

COMMENT ON TABLE sample_warehouse."PurchaseOrder" IS 'Purchase orders from suppliers';

COMMENT ON TABLE sample_warehouse."PurchaseOrderItem" IS 'Line items for purchase orders';

COMMENT ON TABLE sample_warehouse."Shipment" IS 'Outbound shipment tracking';

COMMENT ON COLUMN sample_warehouse."Product"."SKU" IS 'Stock keeping unit identifier';

COMMENT ON COLUMN sample_warehouse."ProductCategory"."ParentCategoryID" IS 'Self-referencing hierarchy';
