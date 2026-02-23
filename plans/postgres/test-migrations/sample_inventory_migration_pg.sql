-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_inventory;
SET search_path TO sample_inventory, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER → BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER→bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

-- ============================================================================
-- TABLES
-- ============================================================================

-- Warehouse table
CREATE TABLE sample_inv."Warehouse" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Code" VARCHAR(10) NOT NULL,
 "Address" VARCHAR(300) NOT NULL,
 "City" VARCHAR(100) NOT NULL,
 "State" VARCHAR(2) NOT NULL,
 "ZipCode" VARCHAR(10) NOT NULL,
 "ManagerName" VARCHAR(200) NOT NULL,
 "Phone" VARCHAR(20) NOT NULL,
 "SquareFootage" INTEGER NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "OpenedDate" DATE NOT NULL,
 CONSTRAINT "PK_Warehouse" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Warehouse_Code" UNIQUE ("Code")
);

-- Supplier table (inline CHECK on Rating)
CREATE TABLE sample_inv."Supplier" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "CompanyName" VARCHAR(250) NOT NULL,
 "ContactName" VARCHAR(200) NULL,
 "Email" VARCHAR(255) NOT NULL,
 "Phone" VARCHAR(20) NOT NULL,
 "Website" VARCHAR(300) NULL,
 "PaymentTermsDays" INTEGER NOT NULL DEFAULT 30,
 "Rating" SMALLINT NULL CHECK ("Rating" BETWEEN 1 AND 5),
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "Notes" TEXT NULL,
 CONSTRAINT "PK_Supplier" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Supplier_Email" UNIQUE ("Email")
);

-- ProductCategory table with self-referencing FK
CREATE TABLE sample_inv."ProductCategory" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(150) NOT NULL,
 "ParentCategoryID" UUID NULL,
 "Description" VARCHAR(500) NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "PK_ProductCategory" PRIMARY KEY ("ID")
);

-- Product table (inline CHECK on UnitPrice)
CREATE TABLE sample_inv."Product" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SKU" VARCHAR(30) NOT NULL,
 "Name" VARCHAR(300) NOT NULL,
 "Description" TEXT NULL,
 "CategoryID" UUID NOT NULL,
 "SupplierID" UUID NOT NULL,
 "UnitCost" DECIMAL(10,2) NOT NULL,
 "UnitPrice" DECIMAL(10,2) NOT NULL CHECK ("UnitPrice" >= 0),
 "ReorderLevel" INTEGER NOT NULL DEFAULT 10,
 "ReorderQuantity" INTEGER NOT NULL DEFAULT 50,
 "Weight" DECIMAL(8,3) NULL,
 "IsPerishable" BOOLEAN NOT NULL DEFAULT FALSE,
 "ShelfLifeDays" INTEGER NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_Product" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Product_SKU" UNIQUE ("SKU")
);

-- InventoryLevel table (inline CHECK on QuantityOnHand, composite UNIQUE)
CREATE TABLE sample_inv."InventoryLevel" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ProductID" UUID NOT NULL,
 "WarehouseID" UUID NOT NULL,
 "QuantityOnHand" INTEGER NOT NULL DEFAULT 0 CHECK ("QuantityOnHand" >= 0),
 "QuantityReserved" INTEGER NOT NULL DEFAULT 0,
 "QuantityOnOrder" INTEGER NOT NULL DEFAULT 0,
 "LastCountDate" TIMESTAMPTZ NULL,
 "BinLocation" VARCHAR(20) NULL,
 CONSTRAINT "PK_InventoryLevel" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_InvLevel" UNIQUE ("ProductID", "WarehouseID")
);

-- PurchaseOrder table (inline CHECK on Status)
CREATE TABLE sample_inv."PurchaseOrder" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PONumber" VARCHAR(20) NOT NULL,
 "SupplierID" UUID NOT NULL,
 "WarehouseID" UUID NOT NULL,
 "OrderDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "ExpectedDelivery" DATE NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK ("Status" IN ('Draft', 'Submitted', 'Approved', 'Received', 'Cancelled')),
 "TotalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
 "Notes" TEXT NULL,
 "ApprovedBy" VARCHAR(200) NULL,
 "ApprovedAt" TIMESTAMPTZ NULL,
 CONSTRAINT "PK_PurchaseOrder" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_PurchaseOrder_PONumber" UNIQUE ("PONumber")
);

-- PurchaseOrderLine table (inline CHECK on QuantityOrdered)
CREATE TABLE sample_inv."PurchaseOrderLine" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PurchaseOrderID" UUID NOT NULL,
 "ProductID" UUID NOT NULL,
 "QuantityOrdered" INTEGER NOT NULL CHECK ("QuantityOrdered" > 0),
 "UnitCost" DECIMAL(10,2) NOT NULL,
 "LineTotal" DECIMAL(12,2) NOT NULL,
 "QuantityReceived" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "PK_PurchaseOrderLine" PRIMARY KEY ("ID")
);

-- StockMovement table (inline CHECK on MovementType, multi-FK to Warehouse)
CREATE TABLE sample_inv."StockMovement" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ProductID" UUID NOT NULL,
 "FromWarehouseID" UUID NULL,
 "ToWarehouseID" UUID NULL,
 "Quantity" INTEGER NOT NULL,
 "MovementType" VARCHAR(20) NOT NULL CHECK ("MovementType" IN ('Inbound', 'Outbound', 'Transfer', 'Adjustment', 'Return')),
 "ReferenceNumber" VARCHAR(50) NULL,
 "MovedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "MovedBy" VARCHAR(200) NOT NULL,
 "Notes" TEXT NULL,
 CONSTRAINT "PK_StockMovement" PRIMARY KEY ("ID")
);

-- AuditLog table (inline CHECK on Action)
CREATE TABLE sample_inv."AuditLog" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "TableName" VARCHAR(100) NOT NULL,
 "RecordID" UUID NOT NULL,
 "Action" VARCHAR(10) NOT NULL CHECK ("Action" IN ('INSERT', 'UPDATE', 'DELETE')),
 "OldValue" TEXT NULL,
 "NewValue" TEXT NULL,
 "ChangedBy" VARCHAR(200) NOT NULL,
 "ChangedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_AuditLog" PRIMARY KEY ("ID")
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'InventoryReader') THEN
        CREATE ROLE "InventoryReader";
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_inv."vwInventorySummary"
AS SELECT
    p."ID" AS "ProductID",
    p."SKU",
    p."Name" AS "ProductName",
    pc."Name" AS "CategoryName",
    s."CompanyName" AS "SupplierName",
    p."UnitCost",
    p."UnitPrice",
    COALESCE(SUM(il."QuantityOnHand"), 0) AS "TotalOnHand",
    COALESCE(SUM(il."QuantityReserved"), 0) AS "TotalReserved",
    COALESCE(SUM(il."QuantityOnHand"), 0) - COALESCE(SUM(il."QuantityReserved"), 0) AS "AvailableStock",
    p."ReorderLevel",
    CASE
        WHEN COALESCE(SUM(il."QuantityOnHand"), 0) < p."ReorderLevel" THEN 1
        ELSE 0
    END AS "NeedsReorder",
    CASE WHEN p."IsPerishable" = 1 THEN COALESCE(p."ShelfLifeDays", 0) ELSE -1 END AS "EffectiveShelfLife",
    COUNT(DISTINCT il."WarehouseID") AS "WarehouseCount",
    LENGTH(p."SKU") AS "SKULength"
FROM sample_inv."Product" p
LEFT JOIN sample_inv."ProductCategory" pc ON pc."ID" = p."CategoryID"
LEFT JOIN sample_inv."Supplier" s ON s."ID" = p."SupplierID"
LEFT JOIN sample_inv."InventoryLevel" il ON il."ProductID" = p."ID"
WHERE p."IsActive" = 1
GROUP BY
    p."ID", p."SKU", p."Name", pc."Name", s."CompanyName",
    p."UnitCost", p."UnitPrice", p."ReorderLevel",
    p."IsPerishable", p."ShelfLifeDays";

CREATE OR REPLACE VIEW sample_inv."vwPurchaseOrderStatus"
AS SELECT
    po."ID" AS "PurchaseOrderID",
    po."PONumber",
    s."CompanyName" AS "SupplierName",
    w."Name" AS "WarehouseName",
    w."City" AS "WarehouseCity",
    po."OrderDate",
    po."ExpectedDelivery",
    po."Status",
    po."TotalAmount",
    COUNT(pol."ID") AS "LineItemCount",
    COALESCE(SUM(pol."QuantityOrdered"), 0) AS "TotalUnitsOrdered",
    COALESCE(SUM(pol."QuantityReceived"), 0) AS "TotalUnitsReceived",
    CASE
        WHEN COALESCE(SUM(pol."QuantityOrdered"), 0) = 0 THEN 0.0
        ELSE CAST(SUM(pol."QuantityReceived") AS DECIMAL(10,2)) / CAST(SUM(pol."QuantityOrdered") AS DECIMAL(10,2)) * 100.0
    END AS "ReceivedPercentage",
    EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - po."OrderDate"::TIMESTAMPTZ)) AS "DaysSinceOrder",
    CASE WHEN po."ExpectedDelivery" IS NOT NULL AND po."ExpectedDelivery" < CAST(NOW() AS DATE) AND po."Status" NOT IN ('Received', 'Cancelled') THEN 1 ELSE 0 END AS "IsOverdue",
    po."ApprovedBy",
    po."ApprovedAt"
FROM sample_inv."PurchaseOrder" po
INNER JOIN sample_inv."Supplier" s ON s."ID" = po."SupplierID"
INNER JOIN sample_inv."Warehouse" w ON w."ID" = po."WarehouseID"
LEFT JOIN sample_inv."PurchaseOrderLine" pol ON pol."PurchaseOrderID" = po."ID"
GROUP BY
    po."ID", po."PONumber", s."CompanyName", w."Name", w."City",
    po."OrderDate", po."ExpectedDelivery", po."Status", po."TotalAmount",
    po."ApprovedBy", po."ApprovedAt";

CREATE OR REPLACE VIEW sample_inv."vwLowStockAlerts"
AS SELECT
    p."ID" AS "ProductID",
    p."SKU",
    p."Name" AS "ProductName",
    w."ID" AS "WarehouseID",
    w."Name" AS "WarehouseName",
    w."Code" AS "WarehouseCode",
    il."QuantityOnHand",
    il."QuantityReserved",
    COALESCE(il."QuantityOnHand", 0) - COALESCE(il."QuantityReserved", 0) AS "NetAvailable",
    p."ReorderLevel",
    p."ReorderQuantity",
    p."ReorderLevel" - COALESCE(il."QuantityOnHand", 0) AS "ShortfallQuantity",
    COALESCE(il."BinLocation", 'Unassigned') AS "BinLocation",
    EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - il."LastCountDate"::TIMESTAMPTZ)) AS "DaysSinceLastCount",
    CASE WHEN p."IsPerishable" = 1 AND p."ShelfLifeDays" IS NOT NULL THEN EXTRACT(DAY FROM ((p."CreatedAt" + p."ShelfLifeDays" * INTERVAL '1 day')::TIMESTAMPTZ - NOW()::TIMESTAMPTZ)) ELSE NULL END AS "EstimatedDaysToExpiry",
    s."CompanyName" AS "SupplierName",
    s."Phone" AS "SupplierPhone"
FROM sample_inv."InventoryLevel" il
INNER JOIN sample_inv."Product" p ON p."ID" = il."ProductID"
INNER JOIN sample_inv."Warehouse" w ON w."ID" = il."WarehouseID"
LEFT JOIN sample_inv."Supplier" s ON s."ID" = p."SupplierID"
WHERE il."QuantityOnHand" < p."ReorderLevel"
    AND p."IsActive" = 1
    AND w."IsActive" = 1;

CREATE OR REPLACE VIEW sample_inv."vwWarehouseUtilization"
AS SELECT
    w."ID" AS "WarehouseID",
    w."Name" AS "WarehouseName",
    w."Code" AS "WarehouseCode",
    w."City",
    w."State",
    w."SquareFootage",
    w."ManagerName",
    COUNT(DISTINCT il."ProductID") AS "UniqueProductCount",
    COALESCE(SUM(il."QuantityOnHand"), 0) AS "TotalUnitsStored",
    COALESCE(SUM(il."QuantityOnHand" * p."UnitCost"), 0) AS "TotalInventoryValue",
    COALESCE(SUM(il."QuantityOnHand" * p."UnitPrice"), 0) AS "TotalRetailValue",
    EXTRACT(YEAR FROM w."OpenedDate") AS "YearOpened",
    EXTRACT(YEAR FROM AGE(NOW()::TIMESTAMPTZ, w."OpenedDate"::TIMESTAMPTZ)) AS "YearsInOperation",
    COALESCE(
        (SELECT MAX(sm."MovedAt") FROM sample_inv."StockMovement" sm
         WHERE sm."FromWarehouseID" = w."ID" OR sm."ToWarehouseID" = w."ID"),
        w."OpenedDate"
    ) AS "LastMovementDate",
    EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - COALESCE(
            (SELECT MAX(sm."MovedAt") FROM sample_inv."StockMovement" sm
             WHERE sm."FromWarehouseID" = w."ID" OR sm."ToWarehouseID" = w."ID"),
            w."OpenedDate"
        )::TIMESTAMPTZ)) AS "DaysSinceLastMovement",
    CASE WHEN w."IsActive" = 1 THEN 'Active' ELSE 'Inactive' END AS "StatusLabel"
FROM sample_inv."Warehouse" w
LEFT JOIN sample_inv."InventoryLevel" il ON il."WarehouseID" = w."ID"
LEFT JOIN sample_inv."Product" p ON p."ID" = il."ProductID"
GROUP BY
    w."ID", w."Name", w."Code", w."City", w."State",
    w."SquareFootage", w."ManagerName", w."OpenedDate", w."IsActive";


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Warehouses (3)
INSERT INTO sample_inv."Warehouse" ("ID", "Name", "Code", "Address", "City", "State", "ZipCode", "ManagerName", "Phone", "SquareFootage", "IsActive", "OpenedDate")
VALUES
    ('A0000001-0001-0001-0001-000000000001', 'East Coast Distribution Center', 'ECDC', '100 Industrial Blvd', 'Newark', 'NJ', '07102', 'Sarah Mitchell', '(973) 555-0100', 85000, 1, '2018-03-15'),
    ('A0000001-0001-0001-0001-000000000002', 'Midwest Fulfillment Hub', 'MWFH', '500 Logistics Way', 'Columbus', 'OH', '43215', 'James Rodriguez', '(614) 555-0200', 62000, 1, '2020-07-01'),
    ('A0000001-0001-0001-0001-000000000003', 'West Coast Warehouse', 'WCW', '2200 Pacific Ave', 'Long Beach', 'CA', '90802', 'Emily Chen', '(562) 555-0300', 95000, 1, '2016-11-20');

-- Suppliers (5)
INSERT INTO sample_inv."Supplier" ("ID", "CompanyName", "ContactName", "Email", "Phone", "Website", "PaymentTermsDays", "Rating", "IsActive", "Notes")
VALUES
    ('B0000001-0001-0001-0001-000000000001', 'TechParts Global', 'Michael Brown', 'orders@techpartsglobal.com', '(800) 555-1001', 'https://techpartsglobal.com', 30, 5, 1, 'Primary electronics supplier'),
    ('B0000001-0001-0001-0001-000000000002', 'PackRight Industries', 'Lisa Wong', 'sales@packright.com', '(800) 555-1002', 'https://packright.com', 45, 4, 1, NULL),
    ('B0000001-0001-0001-0001-000000000003', 'GreenSource Materials', NULL, 'contact@greensource.com', '(800) 555-1003', NULL, 30, 3, 1, 'Eco-friendly packaging supplier'),
    ('B0000001-0001-0001-0001-000000000004', 'FastShip Components', 'David Park', 'orders@fastshipcomp.com', '(800) 555-1004', 'https://fastshipcomp.com', 15, 4, 1, NULL),
    ('B0000001-0001-0001-0001-000000000005', 'National Hardware Supply', 'Karen Adams', 'wholesale@nhs.com', '(800) 555-1005', 'https://nhs.com', 60, 2, 1, 'Bulk hardware and fasteners');

-- Product Categories (5)
INSERT INTO sample_inv."ProductCategory" ("ID", "Name", "ParentCategoryID", "Description", "IsActive")
VALUES
    ('C0000001-0001-0001-0001-000000000001', 'Electronics', NULL, 'Electronic components and devices', 1),
    ('C0000001-0001-0001-0001-000000000002', 'Packaging', NULL, 'Packaging materials and supplies', 1),
    ('C0000001-0001-0001-0001-000000000003', 'Hardware', NULL, 'Hardware and fasteners', 1),
    ('C0000001-0001-0001-0001-000000000004', 'Cables & Adapters', 'C0000001-0001-0001-0001-000000000001', 'Cables, connectors, and adapters', 1),
    ('C0000001-0001-0001-0001-000000000005', 'Boxes & Containers', 'C0000001-0001-0001-0001-000000000002', 'Shipping boxes and storage containers', 1);

-- Products (15)
INSERT INTO sample_inv."Product" ("ID", "SKU", "Name", "Description", "CategoryID", "SupplierID", "UnitCost", "UnitPrice", "ReorderLevel", "ReorderQuantity", "Weight", "IsPerishable", "ShelfLifeDays", "IsActive")
VALUES
    ('D0000001-0001-0001-0001-000000000001', 'ELEC-USB-C-001', 'USB-C Charging Cable 6ft', 'Premium braided USB-C cable', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000001', 3.50, 12.99, 100, 500, 0.150, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000002', 'ELEC-HDMI-001', 'HDMI 2.1 Cable 3ft', 'High speed HDMI cable', 'C0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000001', 5.25, 19.99, 75, 300, 0.200, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000003', 'ELEC-PWR-001', '12V Power Adapter', 'Universal 12V 2A adapter', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', 8.00, 24.99, 50, 200, 0.350, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000004', 'PACK-BOX-SM', 'Small Shipping Box', '12x10x4 corrugated box', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000002', 0.45, 1.29, 500, 2000, 0.300, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000005', 'PACK-BOX-MD', 'Medium Shipping Box', '16x12x6 corrugated box', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000002', 0.75, 2.49, 400, 1500, 0.500, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000006', 'PACK-BOX-LG', 'Large Shipping Box', '24x18x12 corrugated box', 'C0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000002', 1.25, 3.99, 300, 1000, 0.800, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000007', 'PACK-WRAP-001', 'Bubble Wrap Roll 12in', 'Perforated bubble wrap roll', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000002', 6.50, 14.99, 50, 100, 2.500, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000008', 'PACK-TAPE-001', 'Packing Tape 2in', 'Clear packing tape roll', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', 1.10, 3.49, 200, 500, 0.400, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000009', 'HW-BOLT-M8', 'M8 Hex Bolt Pack (50ct)', 'Stainless steel M8x30mm', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000005', 4.20, 9.99, 80, 200, 1.200, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000010', 'HW-NUT-M8', 'M8 Hex Nut Pack (50ct)', 'Stainless steel M8 nuts', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000005', 2.80, 6.99, 80, 200, 0.800, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000011', 'HW-SCREW-001', 'Wood Screw Assortment', 'Mixed wood screw box 200ct', 'C0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000005', 5.50, 12.99, 60, 150, 1.500, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000012', 'ELEC-BAT-AA', 'AA Batteries 24-Pack', 'Alkaline AA batteries', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000004', 4.00, 11.99, 150, 600, 0.650, 1, 1095, 1),
    ('D0000001-0001-0001-0001-000000000013', 'ELEC-BAT-9V', '9V Battery 4-Pack', 'Alkaline 9V batteries', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000004', 3.25, 9.99, 100, 400, 0.400, 1, 1095, 1),
    ('D0000001-0001-0001-0001-000000000014', 'PACK-LABEL-001', 'Shipping Labels 500ct', '4x6 thermal shipping labels', 'C0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000003', 8.50, 19.99, 30, 100, 2.000, 0, NULL, 1),
    ('D0000001-0001-0001-0001-000000000015', 'ELEC-ADAPT-001', 'Universal Travel Adapter', 'Multi-region power adapter', 'C0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', 6.75, 22.99, 40, 150, 0.250, 0, NULL, 1);

-- Inventory Levels (spread across warehouses)
INSERT INTO sample_inv."InventoryLevel" ("ID", "ProductID", "WarehouseID", "QuantityOnHand", "QuantityReserved", "QuantityOnOrder", "LastCountDate", "BinLocation")
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
    ('E0000001-0001-0001-0001-000000000015', 'D0000001-0001-0001-0001-000000000008', 'A0000001-0001-0001-0001-000000000002', 180, 0, 0, '2025-12-01', 'E2-04');

-- Purchase Orders (4)
INSERT INTO sample_inv."PurchaseOrder" ("ID", "PONumber", "SupplierID", "WarehouseID", "OrderDate", "ExpectedDelivery", "Status", "TotalAmount", "Notes", "ApprovedBy", "ApprovedAt")
VALUES
    ('F0000001-0001-0001-0001-000000000001', 'PO-2025-0001', 'B0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000001', '2025-11-15', '2025-12-01', 'Received', 4575.00, 'Q4 cable restock', 'Sarah Mitchell', '2025-11-16'),
    ('F0000001-0001-0001-0001-000000000002', 'PO-2025-0002', 'B0000001-0001-0001-0001-000000000002', 'A0000001-0001-0001-0001-000000000002', '2025-12-01', '2025-12-15', 'Approved', 2250.00, NULL, 'James Rodriguez', '2025-12-02'),
    ('F0000001-0001-0001-0001-000000000003', 'PO-2025-0003', 'B0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000002', '2025-12-10', '2026-01-05', 'Submitted', 1680.00, 'Hardware restocking', NULL, NULL),
    ('F0000001-0001-0001-0001-000000000004', 'PO-2025-0004', 'B0000001-0001-0001-0001-000000000004', 'A0000001-0001-0001-0001-000000000001', '2025-12-18', NULL, 'Draft', 0, NULL, NULL, NULL);

-- Purchase Order Lines (8)
INSERT INTO sample_inv."PurchaseOrderLine" ("ID", "PurchaseOrderID", "ProductID", "QuantityOrdered", "UnitCost", "LineTotal", "QuantityReceived")
VALUES
    ('A1000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', 500, 3.50, 1750.00, 500),
    ('A1000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000002', 300, 5.25, 1575.00, 300),
    ('A1000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000015', 50, 25.00, 1250.00, 50),
    ('A1000001-0001-0001-0001-000000000004', 'F0000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000004', 2000, 0.45, 900.00, 0),
    ('A1000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000005', 1500, 0.75, 1125.00, 0),
    ('A1000001-0001-0001-0001-000000000006', 'F0000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000007', 30, 7.50, 225.00, 0),
    ('A1000001-0001-0001-0001-000000000007', 'F0000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000009', 200, 4.20, 840.00, 0),
    ('A1000001-0001-0001-0001-000000000008', 'F0000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000010', 200, 4.20, 840.00, 0);

-- Stock Movements (6)
INSERT INTO sample_inv."StockMovement" ("ID", "ProductID", "FromWarehouseID", "ToWarehouseID", "Quantity", "MovementType", "ReferenceNumber", "MovedBy", "Notes")
VALUES
    ('A2000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', NULL, 'A0000001-0001-0001-0001-000000000001', 500, 'Inbound', 'PO-2025-0001', 'Dock Worker A', 'PO receipt from TechParts Global'),
    ('A2000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000003', 200, 'Transfer', 'TF-2025-001', 'Logistics Team', 'Transfer to West Coast'),
    ('A2000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000004', NULL, 'A0000001-0001-0001-0001-000000000001', 2000, 'Inbound', 'PO-2025-PREV', 'Dock Worker B', NULL),
    ('A2000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000009', 'A0000001-0001-0001-0001-000000000002', NULL, 25, 'Outbound', 'SO-2025-0445', 'Shipping Clerk', 'Customer order fulfillment'),
    ('A2000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000012', NULL, 'A0000001-0001-0001-0001-000000000001', 100, 'Return', 'RMA-2025-012', 'Returns Dept', 'Customer return - unopened'),
    ('A2000001-0001-0001-0001-000000000006', 'D0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000001', NULL, 50, 'Adjustment', NULL, 'Inventory Manager', 'Damaged stock write-off');

-- Audit Log entries (5)
INSERT INTO sample_inv."AuditLog" ("ID", "TableName", "RecordID", "Action", "OldValue", "NewValue", "ChangedBy")
VALUES
    ('A3000001-0001-0001-0001-000000000001', 'PurchaseOrder', 'F0000001-0001-0001-0001-000000000001', 'UPDATE', '{"Status":"Approved"}', '{"Status":"Received"}', 'Sarah Mitchell'),
    ('A3000001-0001-0001-0001-000000000002', 'InventoryLevel', 'E0000001-0001-0001-0001-000000000001', 'UPDATE', '{"QuantityOnHand":200}', '{"QuantityOnHand":250}', 'System'),
    ('A3000001-0001-0001-0001-000000000003', 'Product', 'D0000001-0001-0001-0001-000000000003', 'UPDATE', '{"UnitPrice":22.99}', '{"UnitPrice":24.99}', 'Admin'),
    ('A3000001-0001-0001-0001-000000000004', 'Supplier', 'B0000001-0001-0001-0001-000000000003', 'UPDATE', '{"Rating":4}', '{"Rating":3}', 'Procurement Lead'),
    ('A3000001-0001-0001-0001-000000000005', 'StockMovement', 'A2000001-0001-0001-0001-000000000006', 'INSERT', NULL, '{"MovementType":"Adjustment","Quantity":50}', 'Inventory Manager');


-- ===================== FK & CHECK Constraints =====================

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

-- ProductCategory self-referencing FK
ALTER TABLE sample_inv."ProductCategory"
    ADD CONSTRAINT "FK_ProductCategory_Parent" FOREIGN KEY ("ParentCategoryID")
    REFERENCES sample_inv."ProductCategory" ("ID") DEFERRABLE INITIALLY DEFERRED;

-- Product FKs
ALTER TABLE sample_inv."Product"
    ADD CONSTRAINT "FK_Product_Category" FOREIGN KEY ("CategoryID")
    REFERENCES sample_inv."ProductCategory" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_inv."Product"
    ADD CONSTRAINT "FK_Product_Supplier" FOREIGN KEY ("SupplierID")
    REFERENCES sample_inv."Supplier" ("ID") DEFERRABLE INITIALLY DEFERRED;

-- InventoryLevel FKs
ALTER TABLE sample_inv."InventoryLevel"
    ADD CONSTRAINT "FK_InventoryLevel_Product" FOREIGN KEY ("ProductID")
    REFERENCES sample_inv."Product" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_inv."InventoryLevel"
    ADD CONSTRAINT "FK_InventoryLevel_Warehouse" FOREIGN KEY ("WarehouseID")
    REFERENCES sample_inv."Warehouse" ("ID") DEFERRABLE INITIALLY DEFERRED;

-- PurchaseOrder FKs
ALTER TABLE sample_inv."PurchaseOrder"
    ADD CONSTRAINT "FK_PurchaseOrder_Supplier" FOREIGN KEY ("SupplierID")
    REFERENCES sample_inv."Supplier" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_inv."PurchaseOrder"
    ADD CONSTRAINT "FK_PurchaseOrder_Warehouse" FOREIGN KEY ("WarehouseID")
    REFERENCES sample_inv."Warehouse" ("ID") DEFERRABLE INITIALLY DEFERRED;

-- PurchaseOrderLine FKs
ALTER TABLE sample_inv."PurchaseOrderLine"
    ADD CONSTRAINT "FK_PurchaseOrderLine_PO" FOREIGN KEY ("PurchaseOrderID")
    REFERENCES sample_inv."PurchaseOrder" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_inv."PurchaseOrderLine"
    ADD CONSTRAINT "FK_PurchaseOrderLine_Product" FOREIGN KEY ("ProductID")
    REFERENCES sample_inv."Product" ("ID") DEFERRABLE INITIALLY DEFERRED;

-- StockMovement FKs (multi-FK to Warehouse)
ALTER TABLE sample_inv."StockMovement"
    ADD CONSTRAINT "FK_StockMovement_Product" FOREIGN KEY ("ProductID")
    REFERENCES sample_inv."Product" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_inv."StockMovement"
    ADD CONSTRAINT "FK_StockMovement_FromWarehouse" FOREIGN KEY ("FromWarehouseID")
    REFERENCES sample_inv."Warehouse" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_inv."StockMovement"
    ADD CONSTRAINT "FK_StockMovement_ToWarehouse" FOREIGN KEY ("ToWarehouseID")
    REFERENCES sample_inv."Warehouse" ("ID") DEFERRABLE INITIALLY DEFERRED;

-- ============================================================================
-- ALTER TABLE CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE sample_inv."Product"
    ADD CONSTRAINT "CK_Product_UnitCost" CHECK ("UnitCost" >= 0) NOT VALID;

ALTER TABLE sample_inv."Warehouse"
    ADD CONSTRAINT "CK_Warehouse_SquareFootage" CHECK ("SquareFootage" > 0) NOT VALID;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA "sample_inv" TO "InventoryReader";


-- ===================== Comments =====================

COMMENT ON TABLE sample_inv."Warehouse" IS 'Warehouse locations for inventory storage';

COMMENT ON TABLE sample_inv."Supplier" IS 'Material and product suppliers';

COMMENT ON TABLE sample_inv."ProductCategory" IS 'Hierarchical product categorization';

COMMENT ON TABLE sample_inv."Product" IS 'Products tracked in warehouse inventory';

COMMENT ON TABLE sample_inv."InventoryLevel" IS 'Current inventory quantities per product per warehouse';

COMMENT ON TABLE sample_inv."PurchaseOrder" IS 'Purchase orders placed with suppliers';

COMMENT ON TABLE sample_inv."PurchaseOrderLine" IS 'Line items within purchase orders';

COMMENT ON TABLE sample_inv."StockMovement" IS 'Tracks movement of stock between warehouses';

COMMENT ON TABLE sample_inv."AuditLog" IS 'Audit trail for data changes';


-- ===================== Other =====================

-- ============================================================================
-- SECURITY
-- ============================================================================
