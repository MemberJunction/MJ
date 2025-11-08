/*
 * LousyDB - Legacy Database Demo
 *
 * This script creates a realistic legacy database with:
 * - NO primary key constraints defined
 * - NO foreign key constraints defined
 * - Cryptic table and column names
 * - Single-character status codes
 * - Orphaned records and data quality issues
 *
 * Perfect for testing DBAutoDoc's Relationship Discovery Phase!
 *
 * PREREQUISITE: Create a database named 'LousyDB' and set it as current database
 * Example:
 *   CREATE DATABASE LousyDB;
 *   USE LousyDB;
 *   -- Then run this script
 */

-- Create schemas (drop first if they exist)
IF SCHEMA_ID('sales') IS NOT NULL
BEGIN
    -- Drop all tables in sales schema first
    DECLARE @sql NVARCHAR(MAX) = '';
    SELECT @sql += 'DROP TABLE sales.' + QUOTENAME(name) + ';'
    FROM sys.tables
    WHERE schema_id = SCHEMA_ID('sales');
    IF @sql != '' EXEC sp_executesql @sql;
    DROP SCHEMA sales;
END
GO

IF SCHEMA_ID('inv') IS NOT NULL
BEGIN
    -- Drop all tables in inv schema first
    DECLARE @sql NVARCHAR(MAX) = '';
    SELECT @sql += 'DROP TABLE inv.' + QUOTENAME(name) + ';'
    FROM sys.tables
    WHERE schema_id = SCHEMA_ID('inv');
    IF @sql != '' EXEC sp_executesql @sql;
    DROP SCHEMA inv;
END
GO

CREATE SCHEMA sales;
GO

CREATE SCHEMA inv;
GO

-- ============================================================================
-- SALES SCHEMA - Customer and Order Management
-- ============================================================================

-- Customers (NO PK/FK constraints!)
CREATE TABLE sales.cst (
    cst_id INT NOT NULL,           -- Would be PK but not defined
    nm NVARCHAR(100),              -- Name
    sts CHAR(1),                   -- Status: A=Active, I=Inactive, S=Suspended, T=Terminated
    dt DATE,                       -- Date created
    src CHAR(2),                   -- Source: WB=Website, PH=Phone, ST=Store, RF=Referral
    rep_id INT,                    -- Sales rep (orphaned FKs exist)
    seg CHAR(1),                   -- Segment: R=Retail, W=Wholesale, E=Enterprise
    rtg TINYINT,                   -- Rating 1-5
    bal DECIMAL(10,2),             -- Account balance
    cr_lmt DECIMAL(10,2),          -- Credit limit
    lst_ord DATE                   -- Last order date
);

-- Orders
CREATE TABLE sales.ord (
    ord_id INT NOT NULL,
    cst_id INT,                    -- FK to cst (some orphaned!)
    ord_dt DATE,
    ship_dt DATE,
    sts CHAR(1),                   -- P=Pending, C=Confirmed, S=Shipped, D=Delivered, X=Cancelled
    tot DECIMAL(10,2),
    tax DECIMAL(10,2),
    ship_amt DECIMAL(10,2),
    disc_pct DECIMAL(5,2),
    pmt_trm CHAR(3),               -- NET30, NET60, COD, etc.
    notes NVARCHAR(500)
);

-- Order Line Items
CREATE TABLE sales.oli (
    oli_id INT NOT NULL,
    ord_id INT,                    -- FK to ord
    prd_id INT,                    -- FK to inv.prd
    qty INT,
    prc DECIMAL(10,2),             -- Price
    disc DECIMAL(10,2),            -- Discount
    tax_amt DECIMAL(10,2),
    seq INT                        -- Line sequence
);

-- Payments
CREATE TABLE sales.pmt (
    pmt_id INT NOT NULL,
    ord_id INT,                    -- FK to ord (can be NULL for account credits!)
    cst_id INT,                    -- FK to cst
    pmt_dt DATE,
    amt DECIMAL(10,2),
    mthd CHAR(2),                  -- CC=Credit Card, CK=Check, WR=Wire, CA=Cash
    sts CHAR(1),                   -- P=Pending, A=Approved, R=Rejected, F=Failed
    ref NVARCHAR(50),              -- Reference number
    notes NVARCHAR(500)
);

-- Shipments
CREATE TABLE sales.shp (
    shp_id INT NOT NULL,
    ord_id INT,                    -- FK to ord
    whs_id INT,                    -- FK to inv.whs
    ship_dt DATE,
    dlv_dt DATE,
    carr NVARCHAR(50),             -- Carrier
    trk NVARCHAR(100),             -- Tracking number
    sts CHAR(1),                   -- N=New, P=Packed, S=Shipped, D=Delivered
    wgt DECIMAL(8,2),              -- Weight
    cost DECIMAL(10,2)
);

-- Returns
CREATE TABLE sales.rtn (
    rtn_id INT NOT NULL,
    ord_id INT,                    -- FK to ord
    oli_id INT,                    -- FK to oli
    rtn_dt DATE,
    rsn CHAR(3),                   -- DMG=Damaged, WRG=Wrong Item, DOA=Dead on Arrival, CHG=Changed Mind
    qty INT,
    amt DECIMAL(10,2),
    sts CHAR(1),                   -- P=Pending, A=Approved, R=Rejected, C=Completed
    notes NVARCHAR(500)
);

-- Customer Notes
CREATE TABLE sales.cst_note (
    note_id INT NOT NULL,
    cst_id INT,                    -- FK to cst
    dt DATE,
    usr NVARCHAR(50),              -- User who created note
    txt NVARCHAR(MAX),
    typ CHAR(1)                    -- C=Call, M=Meeting, E=Email, O=Other
);

-- Addresses (can be orphaned!)
CREATE TABLE sales.addr (
    addr_id INT NOT NULL,
    cst_id INT,                    -- FK to cst
    typ CHAR(1),                   -- B=Billing, S=Shipping, O=Other
    ln1 NVARCHAR(100),
    ln2 NVARCHAR(100),
    cty NVARCHAR(50),
    st CHAR(2),                    -- State
    zip NVARCHAR(10),
    ctry CHAR(2),                  -- Country code
    dflt BIT                       -- Is default
);

-- Phone Numbers
CREATE TABLE sales.phn (
    phn_id INT NOT NULL,
    cst_id INT,                    -- FK to cst
    typ CHAR(1),                   -- M=Mobile, H=Home, W=Work, F=Fax
    num NVARCHAR(20),              -- Inconsistent formatting!
    ext NVARCHAR(10),
    dflt BIT
);

-- Email Addresses
CREATE TABLE sales.eml (
    eml_id INT NOT NULL,
    cst_id INT,                    -- FK to cst
    typ CHAR(1),                   -- P=Primary, W=Work, O=Other
    adr NVARCHAR(100),
    vrf BIT,                       -- Verified
    dflt BIT
);

-- ============================================================================
-- INV SCHEMA - Inventory and Product Management
-- ============================================================================

-- Products
CREATE TABLE inv.prd (
    prd_id INT NOT NULL,
    cat_id INT,                    -- FK to cat
    sup_id INT,                    -- FK to sup
    sku NVARCHAR(50),              -- SKU
    nm NVARCHAR(100),
    dsc NVARCHAR(500),
    prc DECIMAL(10,2),
    cost DECIMAL(10,2),
    sts CHAR(1),                   -- A=Active, D=Discontinued, O=Out of Stock
    wgt DECIMAL(8,2),
    uom CHAR(2)                    -- EA=Each, BX=Box, CS=Case
);

-- Categories
CREATE TABLE inv.cat (
    cat_id INT NOT NULL,
    prnt_id INT,                   -- Parent category (self-referencing!)
    nm NVARCHAR(100),
    dsc NVARCHAR(500),
    lvl INT,                       -- Category level (1=top, 2=sub, etc.)
    seq INT                        -- Display sequence
);

-- Suppliers
CREATE TABLE inv.sup (
    sup_id INT NOT NULL,
    nm NVARCHAR(100),
    sts CHAR(1),                   -- A=Active, I=Inactive
    pmt_trm CHAR(3),
    rtg TINYINT,                   -- Rating 1-5
    cnt_nm NVARCHAR(100),          -- Contact name
    cnt_phn NVARCHAR(20),
    cnt_eml NVARCHAR(100)
);

-- Warehouses
CREATE TABLE inv.whs (
    whs_id INT NOT NULL,
    cd CHAR(3),                    -- Code: CHI, NYC, LAX, etc.
    nm NVARCHAR(100),
    cty NVARCHAR(50),
    st CHAR(2),
    typ CHAR(1),                   -- M=Main, R=Regional, D=Distribution
    cap INT,                       -- Capacity
    sts CHAR(1)                    -- A=Active, C=Closed, M=Maintenance
);

-- Stock Levels (Composite PK: prd_id + whs_id)
CREATE TABLE inv.stk (
    prd_id INT NOT NULL,           -- Part of composite key
    whs_id INT NOT NULL,           -- Part of composite key
    qty INT,
    rsv INT,                       -- Reserved quantity
    min_qty INT,
    max_qty INT,
    lst_cnt DATE,                  -- Last count date
    lst_rcv DATE                   -- Last received date
);

-- Purchase Orders
CREATE TABLE inv.po (
    po_id INT NOT NULL,
    sup_id INT,                    -- FK to sup
    po_dt DATE,
    exp_dt DATE,                   -- Expected delivery
    sts CHAR(1),                   -- P=Pending, A=Approved, S=Sent, R=Received, X=Cancelled
    tot DECIMAL(10,2),
    ship_amt DECIMAL(10,2),
    notes NVARCHAR(500)
);

-- PO Details (Composite PK: po_id + seq)
CREATE TABLE inv.po_dtl (
    po_id INT NOT NULL,
    seq INT NOT NULL,              -- Line sequence
    prd_id INT,                    -- FK to prd
    qty INT,
    prc DECIMAL(10,2),
    rcv_qty INT                    -- Received quantity (may differ from ordered!)
);

-- Receiving Records
CREATE TABLE inv.rcv (
    rcv_id INT NOT NULL,
    po_id INT,                     -- FK to po
    rcv_dt DATE,
    whs_id INT,                    -- FK to whs
    notes NVARCHAR(500)
);

-- Inventory Adjustments
CREATE TABLE inv.adj (
    adj_id INT NOT NULL,
    prd_id INT,                    -- FK to prd
    whs_id INT,                    -- FK to whs
    adj_dt DATE,
    qty INT,                       -- Can be negative!
    rsn CHAR(3),                   -- DAM=Damaged, STL=Stolen, EXP=Expired, COR=Correction
    usr NVARCHAR(50),
    notes NVARCHAR(500)
);

-- Cycle Counts
CREATE TABLE inv.cnt (
    cnt_id INT NOT NULL,
    whs_id INT,                    -- FK to whs
    cnt_dt DATE,
    prd_id INT,                    -- FK to prd
    exp_qty INT,                   -- Expected quantity
    act_qty INT,                   -- Actual counted
    var INT,                       -- Variance
    usr NVARCHAR(50)
);

GO

-- ============================================================================
-- INSERT SAMPLE DATA
-- Realistic data with intentional quality issues!
-- ============================================================================

-- Customers (100 customers, some will be orphaned later)
INSERT INTO sales.cst (cst_id, nm, sts, dt, src, rep_id, seg, rtg, bal, cr_lmt, lst_ord)
VALUES
    (1, 'Acme Corporation', 'A', '2020-01-15', 'WB', 1, 'E', 5, 0.00, 50000.00, '2024-10-15'),
    (2, 'Smith & Sons', 'A', '2020-02-20', 'PH', 2, 'W', 4, 1250.00, 25000.00, '2024-09-20'),
    (3, 'Johnson Retail', 'A', '2020-03-10', 'ST', 1, 'R', 3, 0.00, 5000.00, '2024-10-01'),
    (4, 'Williams Inc', 'S', '2021-05-15', 'RF', 3, 'W', 2, 5600.00, 10000.00, '2024-06-15'),
    (5, 'Brown Enterprises', 'I', '2019-12-01', 'WB', 2, 'E', 5, 0.00, 100000.00, '2024-08-20'),
    (6, 'Davis Wholesale', 'A', '2022-01-10', 'PH', 1, 'W', 4, 2300.00, 15000.00, '2024-10-10'),
    (7, 'Miller Supply', 'T', '2018-06-20', 'ST', 99, 'R', 1, 12000.00, 5000.00, '2022-12-31'),
    (8, 'Wilson Trading', 'A', '2021-08-15', 'WB', 2, 'W', 5, 0.00, 30000.00, '2024-10-18'),
    (9, 'Moore Partners', 'A', '2023-02-28', 'RF', 1, 'E', 4, 450.00, 75000.00, '2024-10-12'),
    (10, 'Taylor Goods', 'A', '2020-07-14', 'WB', 3, 'R', 3, 0.00, 8000.00, '2024-09-28');

-- Insert 90 more customers with variations
DECLARE @i INT = 11;
WHILE @i <= 100
BEGIN
    INSERT INTO sales.cst (cst_id, nm, sts, dt, src, rep_id, seg, rtg, bal, cr_lmt, lst_ord)
    VALUES (
        @i,
        'Customer ' + CAST(@i AS NVARCHAR),
        CASE (@i % 10) WHEN 0 THEN 'T' WHEN 9 THEN 'I' WHEN 8 THEN 'S' ELSE 'A' END,
        DATEADD(DAY, -(@i * 5), GETDATE()),
        CASE (@i % 4) WHEN 0 THEN 'WB' WHEN 1 THEN 'PH' WHEN 2 THEN 'ST' ELSE 'RF' END,
        (@i % 3) + 1,
        CASE (@i % 3) WHEN 0 THEN 'R' WHEN 1 THEN 'W' ELSE 'E' END,
        (@i % 5) + 1,
        CASE WHEN @i % 7 = 0 THEN (@i * 100.50) ELSE 0.00 END,
        (@i * 500.00),
        CASE WHEN @i % 5 = 0 THEN NULL ELSE DATEADD(DAY, -(@i % 30), GETDATE()) END
    );
    SET @i = @i + 1;
END

-- Orders (200 orders, ~5% orphaned customer references)
SET @i = 1;
WHILE @i <= 200
BEGIN
    INSERT INTO sales.ord (ord_id, cst_id, ord_dt, ship_dt, sts, tot, tax, ship_amt, disc_pct, pmt_trm, notes)
    VALUES (
        @i,
        CASE WHEN @i % 20 = 0 THEN 999 ELSE (@i % 100) + 1 END,  -- 5% orphaned (customer 999 doesn't exist)
        DATEADD(DAY, -(@i * 2), GETDATE()),
        CASE WHEN @i % 5 = 0 THEN NULL ELSE DATEADD(DAY, -(@i * 2) + 3, GETDATE()) END,
        CASE (@i % 5) WHEN 0 THEN 'P' WHEN 1 THEN 'C' WHEN 2 THEN 'S' WHEN 3 THEN 'D' ELSE 'X' END,
        (@i * 125.75),
        (@i * 10.50),
        CASE WHEN @i > 150 THEN 0.00 ELSE 15.00 END,
        CASE WHEN @i % 10 = 0 THEN 10.00 ELSE 0.00 END,
        CASE WHEN @i % 3 = 0 THEN 'N30' WHEN @i % 3 = 1 THEN 'N60' ELSE 'COD' END,
        CASE WHEN @i % 7 = 0 THEN 'Rush order' ELSE NULL END
    );
    SET @i = @i + 1;
END

-- Order Line Items (500+ line items)
SET @i = 1;
DECLARE @ord_id INT, @line INT;
WHILE @i <= 200
BEGIN
    SET @line = 1;
    WHILE @line <= ((@i % 5) + 1)  -- 1-5 lines per order
    BEGIN
        INSERT INTO sales.oli (oli_id, ord_id, prd_id, qty, prc, disc, tax_amt, seq)
        VALUES (
            (@i * 10) + @line,
            @i,
            ((@i + @line) % 50) + 1,  -- Reference products 1-50
            (@line * 2),
            ((@i + @line) * 12.99),
            CASE WHEN @i % 10 = 0 THEN ((@i + @line) * 1.50) ELSE 0.00 END,
            ((@i + @line) * 1.25),
            @line
        );
        SET @line = @line + 1;
    END
    SET @i = @i + 1;
END

-- Payments (220 payments - 10% with NULL ord_id for account credits)
SET @i = 1;
WHILE @i <= 220
BEGIN
    INSERT INTO sales.pmt (pmt_id, ord_id, cst_id, pmt_dt, amt, mthd, sts, ref, notes)
    VALUES (
        @i,
        CASE WHEN @i % 10 = 0 THEN NULL ELSE (@i % 200) + 1 END,  -- 10% NULL for account credits
        (@i % 100) + 1,
        DATEADD(DAY, -(@i * 2) + 1, GETDATE()),
        (@i * 100.00),
        CASE (@i % 4) WHEN 0 THEN 'CC' WHEN 1 THEN 'CK' WHEN 2 THEN 'WR' ELSE 'CA' END,
        CASE (@i % 4) WHEN 0 THEN 'P' WHEN 1 THEN 'A' WHEN 2 THEN 'R' ELSE 'F' END,
        'REF-' + RIGHT('00000' + CAST(@i AS NVARCHAR), 5),
        CASE WHEN @i % 10 = 0 THEN 'Account credit' ELSE NULL END
    );
    SET @i = @i + 1;
END

-- Categories (15 categories with hierarchy)
INSERT INTO inv.cat (cat_id, prnt_id, nm, dsc, lvl, seq)
VALUES
    (1, NULL, 'Electronics', 'Electronic devices and accessories', 1, 1),
    (2, 1, 'Computers', 'Desktop and laptop computers', 2, 1),
    (3, 1, 'Peripherals', 'Computer peripherals', 2, 2),
    (4, NULL, 'Furniture', 'Office and home furniture', 1, 2),
    (5, 4, 'Desks', 'Office desks', 2, 1),
    (6, 4, 'Chairs', 'Office chairs', 2, 2),
    (7, NULL, 'Supplies', 'Office supplies', 1, 3),
    (8, 7, 'Paper', 'Paper products', 2, 1),
    (9, 7, 'Writing', 'Pens and pencils', 2, 2),
    (10, NULL, 'Equipment', 'Office equipment', 1, 4),
    (11, 10, 'Printers', 'Printers and copiers', 2, 1),
    (12, 10, 'Scanners', 'Document scanners', 2, 2),
    (13, 1, 'Accessories', 'Electronic accessories', 2, 3),
    (14, 7, 'Folders', 'File folders and binders', 2, 3),
    (15, 4, 'Storage', 'Storage furniture', 2, 3);

-- Suppliers (10 suppliers)
INSERT INTO inv.sup (sup_id, nm, sts, pmt_trm, rtg, cnt_nm, cnt_phn, cnt_eml)
VALUES
    (1, 'Tech Distributors Inc', 'A', 'N30', 5, 'John Smith', '555-1234', 'john@techdist.com'),
    (2, 'Office Plus Supply', 'A', 'N60', 4, 'Jane Doe', '555-5678', 'jane@officeplus.com'),
    (3, 'Furniture Wholesale', 'A', 'N30', 4, 'Bob Johnson', '555-9012', 'bob@furnwholesale.com'),
    (4, 'Global Electronics', 'I', 'N45', 2, 'Mary Wilson', '555-3456', 'mary@globalelec.com'),
    (5, 'Quick Ship Supplies', 'A', 'COD', 5, 'Tom Brown', '555-7890', 'tom@quickship.com'),
    (6, 'Premium Paper Co', 'A', 'N60', 3, 'Lisa Davis', '555-2345', 'lisa@premiumpaper.com'),
    (7, 'Reliable Equipment', 'A', 'N30', 5, 'Mike Miller', '555-6789', 'mike@reliable.com'),
    (8, 'Budget Furniture', 'A', 'N15', 3, 'Sarah Garcia', '555-0123', 'sarah@budgetfurn.com'),
    (9, 'Elite Electronics', 'A', 'N30', 4, 'David Martinez', '555-4567', 'david@eliteelec.com'),
    (10, 'Express Supplies', 'S', 'COD', 1, 'Emily Rodriguez', '555-8901', 'emily@express.com');

-- Products (50 products)
SET @i = 1;
WHILE @i <= 50
BEGIN
    INSERT INTO inv.prd (prd_id, cat_id, sup_id, sku, nm, dsc, prc, cost, sts, wgt, uom)
    VALUES (
        @i,
        (@i % 15) + 1,
        (@i % 10) + 1,
        'SKU-' + RIGHT('0000' + CAST(@i AS NVARCHAR), 4),
        'Product ' + CAST(@i AS NVARCHAR),
        'Description for product ' + CAST(@i AS NVARCHAR),
        (@i * 25.99),
        (@i * 15.00),
        CASE WHEN @i % 15 = 0 THEN 'D' WHEN @i % 12 = 0 THEN 'O' ELSE 'A' END,
        (@i * 0.5),
        CASE (@i % 3) WHEN 0 THEN 'EA' WHEN 1 THEN 'BX' ELSE 'CS' END
    );
    SET @i = @i + 1;
END

-- Warehouses (5 warehouses)
INSERT INTO inv.whs (whs_id, cd, nm, cty, st, typ, cap, sts)
VALUES
    (1, 'CHI', 'Chicago Distribution', 'Chicago', 'IL', 'M', 100000, 'A'),
    (2, 'NYC', 'New York Regional', 'New York', 'NY', 'R', 50000, 'A'),
    (3, 'LAX', 'Los Angeles Distribution', 'Los Angeles', 'CA', 'D', 75000, 'A'),
    (4, 'DAL', 'Dallas Regional', 'Dallas', 'TX', 'R', 60000, 'A'),
    (5, 'MIA', 'Miami Distribution', 'Miami', 'FL', 'M', 40000, 'M');

-- Stock Levels (product x warehouse combinations)
DECLARE @prd_id INT, @whs_id INT;
SET @prd_id = 1;
WHILE @prd_id <= 50
BEGIN
    SET @whs_id = 1;
    WHILE @whs_id <= 5
    BEGIN
        IF (@prd_id + @whs_id) % 3 != 0  -- Not every product in every warehouse
        BEGIN
            INSERT INTO inv.stk (prd_id, whs_id, qty, rsv, min_qty, max_qty, lst_cnt, lst_rcv)
            VALUES (
                @prd_id,
                @whs_id,
                (@prd_id * @whs_id * 10),
                (@prd_id * @whs_id * 2),
                (@prd_id * 5),
                (@prd_id * 100),
                DATEADD(DAY, -((@prd_id + @whs_id) % 30), GETDATE()),
                DATEADD(DAY, -((@prd_id + @whs_id) % 15), GETDATE())
            );
        END
        SET @whs_id = @whs_id + 1;
    END
    SET @prd_id = @prd_id + 1;
END

-- Purchase Orders (30 POs)
SET @i = 1;
WHILE @i <= 30
BEGIN
    INSERT INTO inv.po (po_id, sup_id, po_dt, exp_dt, sts, tot, ship_amt, notes)
    VALUES (
        @i,
        (@i % 10) + 1,
        DATEADD(DAY, -(@i * 10), GETDATE()),
        DATEADD(DAY, -(@i * 10) + 14, GETDATE()),
        CASE (@i % 5) WHEN 0 THEN 'P' WHEN 1 THEN 'A' WHEN 2 THEN 'S' WHEN 3 THEN 'R' ELSE 'X' END,
        (@i * 5000.00),
        (@i * 100.00),
        CASE WHEN @i % 8 = 0 THEN 'Expedited shipping' ELSE NULL END
    );
    SET @i = @i + 1;
END

-- PO Details (multiple lines per PO)
SET @i = 1;
WHILE @i <= 30
BEGIN
    SET @line = 1;
    WHILE @line <= ((@i % 4) + 2)  -- 2-5 lines per PO
    BEGIN
        INSERT INTO inv.po_dtl (po_id, seq, prd_id, qty, prc, rcv_qty)
        VALUES (
            @i,
            @line,
            ((@i + @line) % 50) + 1,
            (@line * 50),
            ((@i + @line) * 18.99),
            CASE WHEN @i % 5 = 3 THEN (@line * 50) - 5 ELSE (@line * 50) END  -- Some received qty differs!
        );
        SET @line = @line + 1;
    END
    SET @i = @i + 1;
END

-- Additional tables with smaller datasets
-- Shipments, Returns, Notes, Addresses, Phones, Emails, Receiving, Adjustments, Counts
-- (Abbreviated for brevity - would add similar patterns)

-- Shipments (150 shipments)
SET @i = 1;
WHILE @i <= 150
BEGIN
    INSERT INTO sales.shp (shp_id, ord_id, whs_id, ship_dt, dlv_dt, carr, trk, sts, wgt, cost)
    VALUES (
        @i,
        (@i % 200) + 1,
        (@i % 5) + 1,
        DATEADD(DAY, -(@i * 2) + 4, GETDATE()),
        CASE WHEN @i % 4 = 0 THEN NULL ELSE DATEADD(DAY, -(@i * 2) + 7, GETDATE()) END,
        CASE (@i % 3) WHEN 0 THEN 'FedEx' WHEN 1 THEN 'UPS' ELSE 'USPS' END,
        'TRK' + CAST(@i * 123456 AS NVARCHAR),
        CASE (@i % 4) WHEN 0 THEN 'N' WHEN 1 THEN 'P' WHEN 2 THEN 'S' ELSE 'D' END,
        (@i * 2.5),
        (@i * 1.25)
    );
    SET @i = @i + 1;
END

-- Customer Notes (80 notes)
SET @i = 1;
WHILE @i <= 80
BEGIN
    INSERT INTO sales.cst_note (note_id, cst_id, dt, usr, txt, typ)
    VALUES (
        @i,
        (@i % 100) + 1,
        DATEADD(DAY, -(@i * 3), GETDATE()),
        'User' + CAST((@i % 5) + 1 AS NVARCHAR),
        'Note text for customer interaction #' + CAST(@i AS NVARCHAR),
        CASE (@i % 4) WHEN 0 THEN 'C' WHEN 1 THEN 'M' WHEN 2 THEN 'E' ELSE 'O' END
    );
    SET @i = @i + 1;
END

-- Addresses (120 addresses, some orphaned)
SET @i = 1;
WHILE @i <= 120
BEGIN
    INSERT INTO sales.addr (addr_id, cst_id, typ, ln1, ln2, cty, st, zip, ctry, dflt)
    VALUES (
        @i,
        CASE WHEN @i % 25 = 0 THEN 999 ELSE (@i % 100) + 1 END,  -- 4% orphaned
        CASE (@i % 2) WHEN 0 THEN 'B' ELSE 'S' END,
        CAST(@i * 123 AS NVARCHAR) + ' Main St',
        CASE WHEN @i % 5 = 0 THEN 'Suite ' + CAST(@i AS NVARCHAR) ELSE NULL END,
        'City' + CAST((@i % 20) + 1 AS NVARCHAR),
        CASE (@i % 10) WHEN 0 THEN 'CA' WHEN 1 THEN 'NY' WHEN 2 THEN 'TX' WHEN 3 THEN 'FL' WHEN 4 THEN 'IL' ELSE 'WA' END,
        RIGHT('00000' + CAST(@i * 111 AS NVARCHAR), 5),
        'US',
        CASE WHEN @i % 3 = 0 THEN 1 ELSE 0 END
    );
    SET @i = @i + 1;
END

PRINT 'LousyDB created successfully!';
PRINT 'Schemas: sales, inv';
PRINT 'Tables: 20';
PRINT 'Sample data: ~1000+ rows across all tables';
PRINT 'Data quality: Intentionally includes orphaned records, NULLs, and inconsistencies';
PRINT 'Metadata: NO PRIMARY KEYS or FOREIGN KEYS defined!';
GO
