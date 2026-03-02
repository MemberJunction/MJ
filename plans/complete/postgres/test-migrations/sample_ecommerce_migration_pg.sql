-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_ecommerce;
SET search_path TO sample_ecommerce, public;

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

-- Category table (self-referencing FK for hierarchy)
CREATE TABLE sample_ecom."Category" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(150) NOT NULL,
 "ParentCategoryID" UUID NULL,
 "DisplayOrder" INTEGER NOT NULL DEFAULT 0,
 "IsVisible" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "PK_Category" PRIMARY KEY ("ID")
);

-- Product table
CREATE TABLE sample_ecom."Product" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SKU" VARCHAR(50) NOT NULL,
 "Name" VARCHAR(300) NOT NULL,
 "Description" TEXT NULL,
 "Price" DECIMAL(10,2) NOT NULL,
 "DiscountPrice" DECIMAL(10,2) NULL,
 "StockQuantity" INTEGER NOT NULL DEFAULT 0,
 "Weight" DECIMAL(8,3) NULL,
 "CategoryID" UUID NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_Product" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Product_SKU" UNIQUE ("SKU")
);

-- Customer table
CREATE TABLE sample_ecom."Customer" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Email" VARCHAR(255) NOT NULL,
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Phone" VARCHAR(20) NULL,
 "IsVerified" BOOLEAN NOT NULL DEFAULT FALSE,
 "RegistrationDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "Notes" TEXT NULL,
 CONSTRAINT "PK_Customer" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Customer_Email" UNIQUE ("Email")
);

-- Address table
CREATE TABLE sample_ecom."Address" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "CustomerID" UUID NOT NULL,
 "AddressType" VARCHAR(20) NOT NULL DEFAULT 'Shipping',
 "Street1" VARCHAR(200) NOT NULL,
 "Street2" VARCHAR(200) NULL,
 "City" VARCHAR(100) NOT NULL,
 "State" VARCHAR(50) NOT NULL,
 "ZipCode" VARCHAR(20) NOT NULL,
 "Country" VARCHAR(3) NOT NULL DEFAULT 'USA',
 "IsDefault" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT "PK_Address" PRIMARY KEY ("ID")
);

-- OrderHeader table (multiple FKs to Address)
CREATE TABLE sample_ecom."OrderHeader" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "OrderNumber" VARCHAR(20) NOT NULL,
 "CustomerID" UUID NOT NULL,
 "ShippingAddressID" UUID NOT NULL,
 "BillingAddressID" UUID NOT NULL,
 "OrderDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
 "SubTotal" DECIMAL(12,2) NOT NULL,
 "TaxAmount" DECIMAL(12,2) NOT NULL,
 "ShippingAmount" DECIMAL(12,2) NOT NULL,
 "TotalAmount" DECIMAL(12,2) NOT NULL,
 "Notes" TEXT NULL,
 CONSTRAINT "PK_OrderHeader" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_OrderHeader_OrderNumber" UNIQUE ("OrderNumber")
);

-- OrderItem table
CREATE TABLE sample_ecom."OrderItem" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "OrderID" UUID NOT NULL,
 "ProductID" UUID NOT NULL,
 "Quantity" INTEGER NOT NULL,
 "UnitPrice" DECIMAL(10,2) NOT NULL,
 "LineTotal" DECIMAL(12,2) NOT NULL,
 "DiscountApplied" DECIMAL(10,2) NOT NULL DEFAULT 0,
 CONSTRAINT "PK_OrderItem" PRIMARY KEY ("ID")
);

-- ProductReview table (SMALLINT for Rating)
CREATE TABLE sample_ecom."ProductReview" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ProductID" UUID NOT NULL,
 "CustomerID" UUID NOT NULL,
 "Rating" SMALLINT NOT NULL,
 "Title" VARCHAR(200) NOT NULL,
 "Body" TEXT NULL,
 "IsApproved" BOOLEAN NOT NULL DEFAULT FALSE,
 "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_ProductReview" PRIMARY KEY ("ID")
);

-- Coupon table
CREATE TABLE sample_ecom."Coupon" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Code" VARCHAR(30) NOT NULL,
 "Description" VARCHAR(500) NULL,
 "DiscountType" VARCHAR(10) NOT NULL,
 "DiscountValue" DECIMAL(10,2) NOT NULL,
 "MinOrderAmount" DECIMAL(10,2) NULL,
 "MaxUses" INTEGER NULL,
 "CurrentUses" INTEGER NOT NULL DEFAULT 0,
 "StartDate" DATE NOT NULL,
 "EndDate" DATE NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT "PK_Coupon" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_Coupon_Code" UNIQUE ("Code")
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS "IX_Product_CategoryID"
    ON sample_ecom."Product" ("CategoryID");

CREATE INDEX IF NOT EXISTS "IX_Address_CustomerID"
    ON sample_ecom."Address" ("CustomerID");

CREATE INDEX IF NOT EXISTS "IX_OrderHeader_CustomerID"
    ON sample_ecom."OrderHeader" ("CustomerID");

CREATE INDEX IF NOT EXISTS "IX_OrderHeader_ShippingAddressID"
    ON sample_ecom."OrderHeader" ("ShippingAddressID");

CREATE INDEX IF NOT EXISTS "IX_OrderHeader_BillingAddressID"
    ON sample_ecom."OrderHeader" ("BillingAddressID");

CREATE INDEX IF NOT EXISTS "IX_OrderItem_OrderID"
    ON sample_ecom."OrderItem" ("OrderID");

CREATE INDEX IF NOT EXISTS "IX_OrderItem_ProductID"
    ON sample_ecom."OrderItem" ("ProductID");

CREATE INDEX IF NOT EXISTS "IX_ProductReview_ProductID"
    ON sample_ecom."ProductReview" ("ProductID");

CREATE INDEX IF NOT EXISTS "IX_ProductReview_CustomerID"
    ON sample_ecom."ProductReview" ("CustomerID");

CREATE INDEX IF NOT EXISTS "IX_Category_ParentCategoryID"
    ON sample_ecom."Category" ("ParentCategoryID");


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_ecom."vwProductCatalog"
AS SELECT
    p."ID",
    p."SKU",
    p."Name" AS "ProductName",
    p."Description",
    p."Price",
    p."DiscountPrice",
    COALESCE(p."DiscountPrice", p."Price") AS "EffectivePrice",
    p."StockQuantity",
    p."Weight",
    c."Name" AS "CategoryName",
    pc."Name" AS "ParentCategoryName",
    p."CreatedAt",
    p."UpdatedAt"
FROM
    sample_ecom."Product" p
    INNER JOIN sample_ecom."Category" c ON p."CategoryID" = c."ID"
    LEFT JOIN sample_ecom."Category" pc ON c."ParentCategoryID" = pc."ID"
WHERE
    p."IsActive" = 1
    AND c."IsVisible" = 1;

CREATE OR REPLACE VIEW sample_ecom."vwCustomerOrders"
AS SELECT
    cu."ID" AS "CustomerID",
    cu."FirstName" || ' ' || cu."LastName" AS "CustomerName",
    cu."Email",
    o."ID" AS "OrderID",
    o."OrderNumber",
    o."OrderDate",
    o."Status",
    o."SubTotal",
    o."TaxAmount",
    o."ShippingAmount",
    o."SubTotal" + o."TaxAmount" + o."ShippingAmount" AS "ComputedTotal",
    o."TotalAmount"
FROM
    sample_ecom."Customer" cu
    INNER JOIN sample_ecom."OrderHeader" o ON cu."ID" = o."CustomerID";

CREATE OR REPLACE VIEW sample_ecom."vwTopProducts"
AS SELECT
    p."ID",
    p."SKU",
    p."Name" AS "ProductName",
    p."Price",
    c."Name" AS "CategoryName",
    COUNT(r."ID") AS "ReviewCount",
    CAST(AVG(CAST(r."Rating" AS DECIMAL(5,2))) AS DECIMAL(3,1)) AS "AvgRating"
FROM
    sample_ecom."Product" p
    INNER JOIN sample_ecom."Category" c ON p."CategoryID" = c."ID"
    LEFT JOIN sample_ecom."ProductReview" r ON p."ID" = r."ProductID" AND r."IsApproved" = 1
WHERE
    p."IsActive" = 1
GROUP BY
    p."ID", p."SKU", p."Name", p."Price", c."Name";

CREATE OR REPLACE VIEW sample_ecom."vwOrderSummary"
AS SELECT
    o."ID" AS "OrderID",
    o."OrderNumber",
    cu."FirstName" || ' ' || cu."LastName" AS "CustomerName",
    cu."Email" AS "CustomerEmail",
    o."OrderDate",
    o."Status",
    COUNT(oi."ID") AS "ItemCount",
    SUM(oi."Quantity") AS "TotalUnits",
    o."TotalAmount",
    o."Notes"
FROM
    sample_ecom."OrderHeader" o
    INNER JOIN sample_ecom."Customer" cu ON o."CustomerID" = cu."ID"
    LEFT JOIN sample_ecom."OrderItem" oi ON o."ID" = oi."OrderID"
GROUP BY
    o."ID", o."OrderNumber", cu."FirstName", cu."LastName", cu."Email",
    o."OrderDate", o."Status", o."TotalAmount", o."Notes";


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Categories (hierarchy: root categories first, then children)
INSERT INTO sample_ecom."Category" ("ID", "Name", "ParentCategoryID", "DisplayOrder", "IsVisible")
VALUES ('10000001-0000-0000-0000-000000000001', 'Electronics', NULL, 1, 1);

INSERT INTO sample_ecom."Category" ("ID", "Name", "ParentCategoryID", "DisplayOrder", "IsVisible")
VALUES ('10000001-0000-0000-0000-000000000002', 'Clothing', NULL, 2, 1);

INSERT INTO sample_ecom."Category" ("ID", "Name", "ParentCategoryID", "DisplayOrder", "IsVisible")
VALUES ('10000001-0000-0000-0000-000000000003', 'Home & Garden', NULL, 3, 1);

INSERT INTO sample_ecom."Category" ("ID", "Name", "ParentCategoryID", "DisplayOrder", "IsVisible")
VALUES ('10000001-0000-0000-0000-000000000004', 'Laptops', '10000001-0000-0000-0000-000000000001', 1, 1);

INSERT INTO sample_ecom."Category" ("ID", "Name", "ParentCategoryID", "DisplayOrder", "IsVisible")
VALUES ('10000001-0000-0000-0000-000000000005', 'Smartphones', '10000001-0000-0000-0000-000000000001', 2, 1);

INSERT INTO sample_ecom."Category" ("ID", "Name", "ParentCategoryID", "DisplayOrder", "IsVisible")
VALUES ('10000001-0000-0000-0000-000000000006', 'Men''s Apparel', '10000001-0000-0000-0000-000000000002', 1, 1);

INSERT INTO sample_ecom."Category" ("ID", "Name", "ParentCategoryID", "DisplayOrder", "IsVisible")
VALUES ('10000001-0000-0000-0000-000000000007', 'Women''s Apparel', '10000001-0000-0000-0000-000000000002', 2, 1);

-- Products (10+ products across categories)
INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000001', 'LAP-PRO-001', 'ProBook Laptop 15"', 'High-performance laptop with 16GB RAM and 512GB SSD', 1299.99, 1199.99, 45, 2.100, '10000001-0000-0000-0000-000000000004', 1);

INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000002', 'LAP-ECO-002', 'EcoBook Laptop 13"', 'Lightweight ultrabook for everyday computing', 799.99, NULL, 120, 1.350, '10000001-0000-0000-0000-000000000004', 1);

INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000003', 'PHN-FLG-001', 'FlagPhone Ultra', 'Flagship smartphone with 6.7" OLED display', 999.99, 949.99, 200, 0.210, '10000001-0000-0000-0000-000000000005', 1);

INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000004', 'PHN-BUD-002', 'BudgetPhone SE', 'Affordable smartphone with great camera', 349.99, NULL, 500, 0.185, '10000001-0000-0000-0000-000000000005', 1);

INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000005', 'MEN-TSH-001', 'Classic Cotton T-Shirt', '100% organic cotton crew neck t-shirt', 29.99, 24.99, 350, 0.200, '10000001-0000-0000-0000-000000000006', 1);

INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000006', 'MEN-JKT-002', 'Tech Fleece Jacket', 'Warm and lightweight fleece jacket for all seasons', 89.99, NULL, 75, 0.450, '10000001-0000-0000-0000-000000000006', 1);

INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000007', 'WMN-DRS-001', 'Silk Evening Dress', 'Elegant silk dress for special occasions', 249.99, 199.99, 30, 0.350, '10000001-0000-0000-0000-000000000007', 1);

INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000008', 'WMN-SNK-002', 'Runner Pro Sneakers', 'Lightweight running sneakers with arch support', 119.99, NULL, 180, 0.600, '10000001-0000-0000-0000-000000000007', 1);

INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000009', 'HOM-PLT-001', 'Indoor Herb Garden Kit', 'Complete kit for growing fresh herbs indoors', 59.99, 49.99, 90, 3.500, '10000001-0000-0000-0000-000000000003', 1);

INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000010', 'HOM-LMP-002', 'Smart LED Desk Lamp', 'Adjustable LED desk lamp with wireless charging base', 79.99, NULL, 60, 1.800, '10000001-0000-0000-0000-000000000003', 1);

INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000011', 'LAP-GAM-003', 'GameStation Laptop 17"', 'Gaming laptop with RTX 4070 and 32GB RAM', 2199.99, NULL, 15, 3.200, '10000001-0000-0000-0000-000000000004', 1);

INSERT INTO sample_ecom."Product" ("ID", "SKU", "Name", "Description", "Price", "DiscountPrice", "StockQuantity", "Weight", "CategoryID", "IsActive")
VALUES ('20000001-0000-0000-0000-000000000012', 'PHN-OLD-003', 'ClassicPhone 3G', 'Basic phone - discontinued model', 99.99, NULL, 0, 0.150, '10000001-0000-0000-0000-000000000005', 0);

-- Customers
INSERT INTO sample_ecom."Customer" ("ID", "Email", "FirstName", "LastName", "Phone", "IsVerified", "Notes")
VALUES ('30000001-0000-0000-0000-000000000001', 'john.doe@example.com', 'John', 'Doe', '555-1001', 1, 'VIP customer since 2020');

INSERT INTO sample_ecom."Customer" ("ID", "Email", "FirstName", "LastName", "Phone", "IsVerified", "Notes")
VALUES ('30000001-0000-0000-0000-000000000002', 'jane.smith@example.com', 'Jane', 'Smith', '555-1002', 1, NULL);

INSERT INTO sample_ecom."Customer" ("ID", "Email", "FirstName", "LastName", "Phone", "IsVerified")
VALUES ('30000001-0000-0000-0000-000000000003', 'robert.wilson@example.com', 'Robert', 'Wilson', '555-1003', 1);

INSERT INTO sample_ecom."Customer" ("ID", "Email", "FirstName", "LastName", "Phone", "IsVerified")
VALUES ('30000001-0000-0000-0000-000000000004', 'maria.garcia@example.com', 'Maria', 'Garcia', NULL, 0);

INSERT INTO sample_ecom."Customer" ("ID", "Email", "FirstName", "LastName", "Phone", "IsVerified")
VALUES ('30000001-0000-0000-0000-000000000005', 'li.chen@example.com', 'Li', 'Chen', '555-1005', 1);

INSERT INTO sample_ecom."Customer" ("ID", "Email", "FirstName", "LastName", "Phone", "IsVerified")
VALUES ('30000001-0000-0000-0000-000000000006', 'emily.taylor@example.com', 'Emily', 'Taylor', '555-1006', 0);

-- Addresses (multiple per customer, different types)
INSERT INTO sample_ecom."Address" ("ID", "CustomerID", "AddressType", "Street1", "Street2", "City", "State", "ZipCode", "Country", "IsDefault")
VALUES ('40000001-0000-0000-0000-000000000001', '30000001-0000-0000-0000-000000000001', 'Shipping', '123 Main Street', 'Apt 4B', 'New York', 'NY', '10001', 'USA', 1);

INSERT INTO sample_ecom."Address" ("ID", "CustomerID", "AddressType", "Street1", "City", "State", "ZipCode", "Country", "IsDefault")
VALUES ('40000001-0000-0000-0000-000000000002', '30000001-0000-0000-0000-000000000001', 'Billing', '123 Main Street', 'New York', 'NY', '10001', 'USA', 0);

INSERT INTO sample_ecom."Address" ("ID", "CustomerID", "AddressType", "Street1", "City", "State", "ZipCode", "Country", "IsDefault")
VALUES ('40000001-0000-0000-0000-000000000003', '30000001-0000-0000-0000-000000000002', 'Shipping', '456 Oak Avenue', 'Los Angeles', 'CA', '90001', 'USA', 1);

INSERT INTO sample_ecom."Address" ("ID", "CustomerID", "AddressType", "Street1", "City", "State", "ZipCode", "Country", "IsDefault")
VALUES ('40000001-0000-0000-0000-000000000004', '30000001-0000-0000-0000-000000000003', 'Shipping', '789 Pine Road', 'Chicago', 'IL', '60601', 'USA', 1);

INSERT INTO sample_ecom."Address" ("ID", "CustomerID", "AddressType", "Street1", "City", "State", "ZipCode", "Country", "IsDefault")
VALUES ('40000001-0000-0000-0000-000000000005', '30000001-0000-0000-0000-000000000004', 'Shipping', '321 Elm Boulevard', 'Houston', 'TX', '77001', 'USA', 1);

INSERT INTO sample_ecom."Address" ("ID", "CustomerID", "AddressType", "Street1", "City", "State", "ZipCode", "Country", "IsDefault")
VALUES ('40000001-0000-0000-0000-000000000006', '30000001-0000-0000-0000-000000000005', 'Shipping', '555 Cedar Lane', 'San Francisco', 'CA', '94101', 'USA', 1);

INSERT INTO sample_ecom."Address" ("ID", "CustomerID", "AddressType", "Street1", "City", "State", "ZipCode", "Country", "IsDefault")
VALUES ('40000001-0000-0000-0000-000000000007', '30000001-0000-0000-0000-000000000005', 'Billing', '555 Cedar Lane', 'San Francisco', 'CA', '94101', 'USA', 0);

-- Orders
INSERT INTO sample_ecom."OrderHeader" ("ID", "OrderNumber", "CustomerID", "ShippingAddressID", "BillingAddressID", "OrderDate", "Status", "SubTotal", "TaxAmount", "ShippingAmount", "TotalAmount", "Notes")
VALUES ('50000001-0000-0000-0000-000000000001', 'ORD-2024-00001', '30000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000002', '2024-06-15', 'Shipped', 1324.98, 115.94, 15.99, 1456.91, 'Express shipping requested');

INSERT INTO sample_ecom."OrderHeader" ("ID", "OrderNumber", "CustomerID", "ShippingAddressID", "BillingAddressID", "OrderDate", "Status", "SubTotal", "TaxAmount", "ShippingAmount", "TotalAmount")
VALUES ('50000001-0000-0000-0000-000000000002', 'ORD-2024-00002', '30000001-0000-0000-0000-000000000002', '40000001-0000-0000-0000-000000000003', '40000001-0000-0000-0000-000000000003', '2024-07-01', 'Delivered', 349.99, 28.88, 0.00, 378.87);

INSERT INTO sample_ecom."OrderHeader" ("ID", "OrderNumber", "CustomerID", "ShippingAddressID", "BillingAddressID", "OrderDate", "Status", "SubTotal", "TaxAmount", "ShippingAmount", "TotalAmount")
VALUES ('50000001-0000-0000-0000-000000000003', 'ORD-2024-00003', '30000001-0000-0000-0000-000000000003', '40000001-0000-0000-0000-000000000004', '40000001-0000-0000-0000-000000000004', '2024-07-20', 'Pending', 2249.98, 191.25, 25.00, 2466.23);

INSERT INTO sample_ecom."OrderHeader" ("ID", "OrderNumber", "CustomerID", "ShippingAddressID", "BillingAddressID", "OrderDate", "Status", "SubTotal", "TaxAmount", "ShippingAmount", "TotalAmount")
VALUES ('50000001-0000-0000-0000-000000000004', 'ORD-2024-00004', '30000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000002', '2024-08-05', 'Processing', 89.99, 7.87, 5.99, 103.85);

INSERT INTO sample_ecom."OrderHeader" ("ID", "OrderNumber", "CustomerID", "ShippingAddressID", "BillingAddressID", "OrderDate", "Status", "SubTotal", "TaxAmount", "ShippingAmount", "TotalAmount")
VALUES ('50000001-0000-0000-0000-000000000005', 'ORD-2024-00005', '30000001-0000-0000-0000-000000000005', '40000001-0000-0000-0000-000000000006', '40000001-0000-0000-0000-000000000007', '2024-08-15', 'Delivered', 1419.97, 127.80, 0.00, 1547.77);

INSERT INTO sample_ecom."OrderHeader" ("ID", "OrderNumber", "CustomerID", "ShippingAddressID", "BillingAddressID", "OrderDate", "Status", "SubTotal", "TaxAmount", "ShippingAmount", "TotalAmount", "Notes")
VALUES ('50000001-0000-0000-0000-000000000006', 'ORD-2024-00006', '30000001-0000-0000-0000-000000000004', '40000001-0000-0000-0000-000000000005', '40000001-0000-0000-0000-000000000005', '2024-09-01', 'Cancelled', 59.99, 4.95, 5.99, 70.93, 'Customer changed mind');

-- Order Items
INSERT INTO sample_ecom."OrderItem" ("ID", "OrderID", "ProductID", "Quantity", "UnitPrice", "LineTotal", "DiscountApplied")
VALUES ('60000001-0000-0000-0000-000000000001', '50000001-0000-0000-0000-000000000001', '20000001-0000-0000-0000-000000000001', 1, 1199.99, 1199.99, 100.00);

INSERT INTO sample_ecom."OrderItem" ("ID", "OrderID", "ProductID", "Quantity", "UnitPrice", "LineTotal")
VALUES ('60000001-0000-0000-0000-000000000002', '50000001-0000-0000-0000-000000000001', '20000001-0000-0000-0000-000000000005', 5, 24.99, 124.99);

INSERT INTO sample_ecom."OrderItem" ("ID", "OrderID", "ProductID", "Quantity", "UnitPrice", "LineTotal")
VALUES ('60000001-0000-0000-0000-000000000003', '50000001-0000-0000-0000-000000000002', '20000001-0000-0000-0000-000000000004', 1, 349.99, 349.99);

INSERT INTO sample_ecom."OrderItem" ("ID", "OrderID", "ProductID", "Quantity", "UnitPrice", "LineTotal")
VALUES ('60000001-0000-0000-0000-000000000004', '50000001-0000-0000-0000-000000000003', '20000001-0000-0000-0000-000000000011', 1, 2199.99, 2199.99);

INSERT INTO sample_ecom."OrderItem" ("ID", "OrderID", "ProductID", "Quantity", "UnitPrice", "LineTotal")
VALUES ('60000001-0000-0000-0000-000000000005', '50000001-0000-0000-0000-000000000003', '20000001-0000-0000-0000-000000000010', 1, 49.99, 49.99);

INSERT INTO sample_ecom."OrderItem" ("ID", "OrderID", "ProductID", "Quantity", "UnitPrice", "LineTotal")
VALUES ('60000001-0000-0000-0000-000000000006', '50000001-0000-0000-0000-000000000004', '20000001-0000-0000-0000-000000000006', 1, 89.99, 89.99);

INSERT INTO sample_ecom."OrderItem" ("ID", "OrderID", "ProductID", "Quantity", "UnitPrice", "LineTotal", "DiscountApplied")
VALUES ('60000001-0000-0000-0000-000000000007', '50000001-0000-0000-0000-000000000005', '20000001-0000-0000-0000-000000000003', 1, 949.99, 949.99, 50.00);

INSERT INTO sample_ecom."OrderItem" ("ID", "OrderID", "ProductID", "Quantity", "UnitPrice", "LineTotal")
VALUES ('60000001-0000-0000-0000-000000000008', '50000001-0000-0000-0000-000000000005', '20000001-0000-0000-0000-000000000007', 1, 199.99, 199.99);

INSERT INTO sample_ecom."OrderItem" ("ID", "OrderID", "ProductID", "Quantity", "UnitPrice", "LineTotal")
VALUES ('60000001-0000-0000-0000-000000000009', '50000001-0000-0000-0000-000000000005', '20000001-0000-0000-0000-000000000009', 3, 49.99, 149.97);

INSERT INTO sample_ecom."OrderItem" ("ID", "OrderID", "ProductID", "Quantity", "UnitPrice", "LineTotal")
VALUES ('60000001-0000-0000-0000-000000000010', '50000001-0000-0000-0000-000000000005', '20000001-0000-0000-0000-000000000008', 1, 119.99, 119.99);

INSERT INTO sample_ecom."OrderItem" ("ID", "OrderID", "ProductID", "Quantity", "UnitPrice", "LineTotal")
VALUES ('60000001-0000-0000-0000-000000000011', '50000001-0000-0000-0000-000000000006', '20000001-0000-0000-0000-000000000009', 1, 59.99, 59.99);

-- Product Reviews
INSERT INTO sample_ecom."ProductReview" ("ID", "ProductID", "CustomerID", "Rating", "Title", "Body", "IsApproved")
VALUES ('70000001-0000-0000-0000-000000000001', '20000001-0000-0000-0000-000000000001', '30000001-0000-0000-0000-000000000001', 5, 'Excellent laptop!', 'Blazing fast performance, great build quality. Worth every penny.', 1);

INSERT INTO sample_ecom."ProductReview" ("ID", "ProductID", "CustomerID", "Rating", "Title", "Body", "IsApproved")
VALUES ('70000001-0000-0000-0000-000000000002', '20000001-0000-0000-0000-000000000001', '30000001-0000-0000-0000-000000000003', 4, 'Great but heavy', 'Performance is top-notch but it''s a bit heavy for daily carry.', 1);

INSERT INTO sample_ecom."ProductReview" ("ID", "ProductID", "CustomerID", "Rating", "Title", "Body", "IsApproved")
VALUES ('70000001-0000-0000-0000-000000000003', '20000001-0000-0000-0000-000000000003', '30000001-0000-0000-0000-000000000002', 5, 'Best phone ever', 'The camera and display are absolutely stunning.', 1);

INSERT INTO sample_ecom."ProductReview" ("ID", "ProductID", "CustomerID", "Rating", "Title", "Body", "IsApproved")
VALUES ('70000001-0000-0000-0000-000000000004', '20000001-0000-0000-0000-000000000005', '30000001-0000-0000-0000-000000000005', 3, 'Decent quality', 'Good for the price but fabric could be softer.', 1);

INSERT INTO sample_ecom."ProductReview" ("ID", "ProductID", "CustomerID", "Rating", "Title", "Body", "IsApproved")
VALUES ('70000001-0000-0000-0000-000000000005', '20000001-0000-0000-0000-000000000004', '30000001-0000-0000-0000-000000000004', 4, 'Great budget option', 'Does everything I need without breaking the bank.', 1);

INSERT INTO sample_ecom."ProductReview" ("ID", "ProductID", "CustomerID", "Rating", "Title", "Body", "IsApproved")
VALUES ('70000001-0000-0000-0000-000000000006', '20000001-0000-0000-0000-000000000009', '30000001-0000-0000-0000-000000000005', 2, 'Kit was incomplete', 'Missing some seeds from the package. Contacted support.', 0);

INSERT INTO sample_ecom."ProductReview" ("ID", "ProductID", "CustomerID", "Rating", "Title", "Body", "IsApproved")
VALUES ('70000001-0000-0000-0000-000000000007', '20000001-0000-0000-0000-000000000007', '30000001-0000-0000-0000-000000000002', 5, 'Stunning dress', 'Perfect fit and beautiful silk. Got compliments all evening!', 1);

-- Coupons
INSERT INTO sample_ecom."Coupon" ("ID", "Code", "Description", "DiscountType", "DiscountValue", "MinOrderAmount", "MaxUses", "CurrentUses", "StartDate", "EndDate", "IsActive")
VALUES ('80000001-0000-0000-0000-000000000001', 'SAVE10', '10% off any order', 'Percent', 10.00, 50.00, 1000, 247, '2024-01-01', '2024-12-31', 1);

INSERT INTO sample_ecom."Coupon" ("ID", "Code", "Description", "DiscountType", "DiscountValue", "MinOrderAmount", "MaxUses", "CurrentUses", "StartDate", "EndDate", "IsActive")
VALUES ('80000001-0000-0000-0000-000000000002', 'FLAT25', '$25 off orders over $100', 'Fixed', 25.00, 100.00, 500, 112, '2024-03-01', '2024-09-30', 1);

INSERT INTO sample_ecom."Coupon" ("ID", "Code", "Description", "DiscountType", "DiscountValue", "MinOrderAmount", "MaxUses", "CurrentUses", "StartDate", "EndDate", "IsActive")
VALUES ('80000001-0000-0000-0000-000000000003', 'WELCOME15', '15% off first purchase', 'Percent', 15.00, NULL, NULL, 891, '2024-01-01', '2025-12-31', 1);

INSERT INTO sample_ecom."Coupon" ("ID", "Code", "Description", "DiscountType", "DiscountValue", "MinOrderAmount", "MaxUses", "CurrentUses", "StartDate", "EndDate", "IsActive")
VALUES ('80000001-0000-0000-0000-000000000004', 'HOLIDAY50', '$50 off holiday special', 'Fixed', 50.00, 200.00, 100, 100, '2024-12-01', '2024-12-31', 0);


-- ===================== FK & CHECK Constraints =====================

-- ============================================================================
-- CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE sample_ecom."ProductReview"
    ADD CONSTRAINT "CK_ProductReview_Rating" CHECK ("Rating" BETWEEN 1 AND 5) NOT VALID;

ALTER TABLE sample_ecom."Coupon"
    ADD CONSTRAINT "CK_Coupon_DiscountType" CHECK ("DiscountType" IN ('Percent', 'Fixed')) NOT VALID;

ALTER TABLE sample_ecom."OrderItem"
    ADD CONSTRAINT "CK_OrderItem_Quantity" CHECK ("Quantity" > 0) NOT VALID;

ALTER TABLE sample_ecom."Product"
    ADD CONSTRAINT "CK_Product_Price" CHECK ("Price" >= 0) NOT VALID;

ALTER TABLE sample_ecom."Coupon"
    ADD CONSTRAINT "CK_Coupon_Dates" CHECK ("EndDate" >= "StartDate") NOT VALID;

ALTER TABLE sample_ecom."Product"
    ADD CONSTRAINT "CK_Product_StockQuantity" CHECK ("StockQuantity" >= 0) NOT VALID;

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Self-referencing FK on Category
ALTER TABLE sample_ecom."Category"
    ADD CONSTRAINT "FK_Category_ParentCategory" FOREIGN KEY ("ParentCategoryID")
    REFERENCES sample_ecom."Category" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_ecom."Product"
    ADD CONSTRAINT "FK_Product_Category" FOREIGN KEY ("CategoryID")
    REFERENCES sample_ecom."Category" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_ecom."Address"
    ADD CONSTRAINT "FK_Address_Customer" FOREIGN KEY ("CustomerID")
    REFERENCES sample_ecom."Customer" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_ecom."OrderHeader"
    ADD CONSTRAINT "FK_OrderHeader_Customer" FOREIGN KEY ("CustomerID")
    REFERENCES sample_ecom."Customer" ("ID") DEFERRABLE INITIALLY DEFERRED;

-- Multiple FKs from OrderHeader to Address
ALTER TABLE sample_ecom."OrderHeader"
    ADD CONSTRAINT "FK_OrderHeader_ShippingAddress" FOREIGN KEY ("ShippingAddressID")
    REFERENCES sample_ecom."Address" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_ecom."OrderHeader"
    ADD CONSTRAINT "FK_OrderHeader_BillingAddress" FOREIGN KEY ("BillingAddressID")
    REFERENCES sample_ecom."Address" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_ecom."OrderItem"
    ADD CONSTRAINT "FK_OrderItem_OrderHeader" FOREIGN KEY ("OrderID")
    REFERENCES sample_ecom."OrderHeader" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_ecom."OrderItem"
    ADD CONSTRAINT "FK_OrderItem_Product" FOREIGN KEY ("ProductID")
    REFERENCES sample_ecom."Product" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_ecom."ProductReview"
    ADD CONSTRAINT "FK_ProductReview_Product" FOREIGN KEY ("ProductID")
    REFERENCES sample_ecom."Product" ("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sample_ecom."ProductReview"
    ADD CONSTRAINT "FK_ProductReview_Customer" FOREIGN KEY ("CustomerID")
    REFERENCES sample_ecom."Customer" ("ID") DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON sample_ecom."vwProductCatalog" TO "cdp_UI";

GRANT SELECT ON sample_ecom."vwCustomerOrders" TO "cdp_UI";

GRANT SELECT ON sample_ecom."vwTopProducts" TO "cdp_UI";

GRANT SELECT ON sample_ecom."vwOrderSummary" TO "cdp_UI";

GRANT SELECT, INSERT, UPDATE ON sample_ecom."Product" TO "cdp_Developer";

GRANT SELECT, INSERT, UPDATE ON sample_ecom."Customer" TO "cdp_Developer";

GRANT SELECT, INSERT, UPDATE ON sample_ecom."OrderHeader" TO "cdp_Developer";

GRANT SELECT, INSERT, UPDATE ON sample_ecom."OrderItem" TO "cdp_Developer";

GRANT SELECT ON sample_ecom."Coupon" TO "cdp_UI";


-- ===================== Comments =====================

COMMENT ON TABLE sample_ecom."Category" IS 'Product categories with hierarchical support via self-referencing parent';

COMMENT ON COLUMN sample_ecom."Category"."ParentCategoryID" IS 'References parent category for hierarchy; NULL for root categories';

COMMENT ON TABLE sample_ecom."Product" IS 'Product catalog with pricing, inventory, and category assignment';

COMMENT ON COLUMN sample_ecom."Product"."SKU" IS 'Stock Keeping Unit - unique product identifier for inventory tracking';

COMMENT ON COLUMN sample_ecom."Product"."DiscountPrice" IS 'Sale price; NULL when product is not discounted';

COMMENT ON TABLE sample_ecom."Customer" IS 'Registered customers with contact and verification info';

COMMENT ON COLUMN sample_ecom."Customer"."IsVerified" IS 'Whether the customer email has been verified';

COMMENT ON TABLE sample_ecom."Address" IS 'Customer shipping and billing addresses';

COMMENT ON TABLE sample_ecom."OrderHeader" IS 'Order header with customer, addresses, totals, and status tracking';

COMMENT ON COLUMN sample_ecom."OrderHeader"."OrderNumber" IS 'Unique human-readable order identifier';

COMMENT ON COLUMN sample_ecom."OrderHeader"."ShippingAddressID" IS 'FK to Address table for delivery destination';

COMMENT ON COLUMN sample_ecom."OrderHeader"."BillingAddressID" IS 'FK to Address table for billing destination';

COMMENT ON TABLE sample_ecom."OrderItem" IS 'Individual line items within an order';

COMMENT ON COLUMN sample_ecom."OrderItem"."Quantity" IS 'Number of units ordered; must be greater than zero';

COMMENT ON TABLE sample_ecom."ProductReview" IS 'Customer product reviews with moderation workflow';

COMMENT ON COLUMN sample_ecom."ProductReview"."Rating" IS 'Star rating from 1 (worst) to 5 (best)';

COMMENT ON TABLE sample_ecom."Coupon" IS 'Discount coupons with usage tracking and validity dates';

COMMENT ON COLUMN sample_ecom."Coupon"."DiscountType" IS 'Either Percent or Fixed discount type';
