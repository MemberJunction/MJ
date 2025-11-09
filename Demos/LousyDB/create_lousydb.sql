/*
 * LousyDB - Legacy Database Demo
 *
 * This script creates a realistic legacy database with:
 * - NO primary key constraints defined
 * - NO foreign key constraints defined
 * - Cryptic table and column names
 * - Single-character status codes
 * - Orphaned records and data quality issues
 * - REALISTIC, VOLUMINOUS DATA (hundreds to thousands of rows)
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
-- INSERT REALISTIC, VOLUMINOUS DATA
-- ============================================================================

-- Real customer first/last names for generating realistic data
DECLARE @FirstNames TABLE (name NVARCHAR(50));
INSERT INTO @FirstNames VALUES
('James'),('Mary'),('John'),('Patricia'),('Robert'),('Jennifer'),('Michael'),('Linda'),('William'),('Elizabeth'),
('David'),('Barbara'),('Richard'),('Susan'),('Joseph'),('Jessica'),('Thomas'),('Sarah'),('Christopher'),('Karen'),
('Charles'),('Nancy'),('Daniel'),('Lisa'),('Matthew'),('Betty'),('Anthony'),('Margaret'),('Mark'),('Sandra'),
('Donald'),('Ashley'),('Steven'),('Kimberly'),('Paul'),('Emily'),('Andrew'),('Donna'),('Joshua'),('Michelle'),
('Kenneth'),('Carol'),('Kevin'),('Amanda'),('Brian'),('Dorothy'),('George'),('Melissa'),('Timothy'),('Deborah'),
('Ronald'),('Stephanie'),('Edward'),('Rebecca'),('Jason'),('Sharon'),('Jeffrey'),('Laura'),('Ryan'),('Cynthia'),
('Jacob'),('Kathleen'),('Gary'),('Amy'),('Nicholas'),('Angela'),('Eric'),('Shirley'),('Jonathan'),('Anna'),
('Stephen'),('Brenda'),('Larry'),('Pamela'),('Justin'),('Emma'),('Scott'),('Nicole'),('Brandon'),('Helen'),
('Benjamin'),('Samantha'),('Samuel'),('Katherine'),('Raymond'),('Christine'),('Gregory'),('Debra'),('Frank'),('Rachel'),
('Alexander'),('Carolyn'),('Patrick'),('Janet'),('Jack'),('Catherine'),('Dennis'),('Maria'),('Jerry'),('Heather');

DECLARE @LastNames TABLE (name NVARCHAR(50));
INSERT INTO @LastNames VALUES
('Smith'),('Johnson'),('Williams'),('Brown'),('Jones'),('Garcia'),('Miller'),('Davis'),('Rodriguez'),('Martinez'),
('Hernandez'),('Lopez'),('Gonzalez'),('Wilson'),('Anderson'),('Thomas'),('Taylor'),('Moore'),('Jackson'),('Martin'),
('Lee'),('Perez'),('Thompson'),('White'),('Harris'),('Sanchez'),('Clark'),('Ramirez'),('Lewis'),('Robinson'),
('Walker'),('Young'),('Allen'),('King'),('Wright'),('Scott'),('Torres'),('Nguyen'),('Hill'),('Flores'),
('Green'),('Adams'),('Nelson'),('Baker'),('Hall'),('Rivera'),('Campbell'),('Mitchell'),('Carter'),('Roberts'),
('Gomez'),('Phillips'),('Evans'),('Turner'),('Diaz'),('Parker'),('Cruz'),('Edwards'),('Collins'),('Reyes'),
('Stewart'),('Morris'),('Morales'),('Murphy'),('Cook'),('Rogers'),('Gutierrez'),('Ortiz'),('Morgan'),('Cooper'),
('Peterson'),('Bailey'),('Reed'),('Kelly'),('Howard'),('Ramos'),('Kim'),('Cox'),('Ward'),('Richardson'),
('Watson'),('Brooks'),('Chavez'),('Wood'),('James'),('Bennett'),('Gray'),('Mendoza'),('Ruiz'),('Hughes'),
('Price'),('Alvarez'),('Castillo'),('Sanders'),('Patel'),('Myers'),('Long'),('Ross'),('Foster'),('Jimenez');

DECLARE @CompanyTypes TABLE (suffix NVARCHAR(20));
INSERT INTO @CompanyTypes VALUES
('Inc'),('LLC'),('Corp'),('Co'),('Ltd'),('Group'),('Industries'),('Enterprises'),('Solutions'),('Partners'),
('Associates'),('Ventures'),('Holdings'),('Systems'),('Technologies'),('Services'),('Company'),('International'),
('Global'),('Worldwide'),('Distributors'),('Supply'),('Wholesale'),('Retail'),('Trading');

DECLARE @Products TABLE (cat_id INT, name NVARCHAR(100), desc_template NVARCHAR(200), base_price DECIMAL(10,2));
INSERT INTO @Products (cat_id, name, desc_template, base_price) VALUES
-- Electronics/Computers (cat 2)
(2, 'Dell OptiPlex 7090 Desktop', 'High-performance desktop computer with Intel Core i7 processor', 1299.99),
(2, 'HP EliteBook 840 Laptop', 'Business laptop with 14" display and SSD storage', 1499.99),
(2, 'Lenovo ThinkPad X1 Carbon', 'Ultralight laptop for professionals', 1899.99),
(2, 'Apple MacBook Air M2', 'Latest generation MacBook with Apple Silicon', 1199.99),
(2, 'ASUS ROG Gaming Desktop', 'High-end gaming PC with RTX graphics', 2499.99),
-- Peripherals (cat 3)
(3, 'Logitech MX Master 3 Mouse', 'Advanced wireless mouse with precision scrolling', 99.99),
(3, 'Microsoft Ergonomic Keyboard', 'Split keyboard design for comfortable typing', 69.99),
(3, 'Dell UltraSharp 27" Monitor', '4K monitor with USB-C connectivity', 549.99),
(3, 'HP DeskJet Color Printer', 'All-in-one inkjet printer for home office', 129.99),
(3, 'Logitech C920 Webcam', 'HD webcam for video conferencing', 79.99),
(3, 'Blue Yeti Microphone', 'Professional USB microphone for recording', 129.99),
(3, 'SanDisk 1TB External SSD', 'Portable solid state drive for backup', 149.99),
(3, 'WD 4TB External Hard Drive', 'High-capacity storage for archives', 99.99),
-- Accessories (cat 13)
(13, 'Anker USB-C Hub', '7-in-1 USB-C adapter with HDMI and card reader', 49.99),
(13, 'Belkin Surge Protector', '12-outlet surge protector with USB ports', 39.99),
(13, 'Cable Matters USB-C Cable 6ft', 'Premium braided USB-C charging cable', 14.99),
(13, 'Kensington Laptop Lock', 'Security cable lock for laptops', 29.99),
(13, 'Laptop Stand Aluminum', 'Ergonomic laptop riser for better posture', 44.99),
-- Desks (cat 5)
(5, 'HON Preside Conference Table', 'Large conference table for meetings', 899.99),
(5, 'Steelcase Series 2 Desk', 'Height-adjustable standing desk', 1299.99),
(5, 'IKEA BEKANT Desk 63"', 'Modern office desk with cable management', 329.99),
(5, 'Bush Furniture L-Shaped Desk', 'Corner desk with hutch storage', 499.99),
(5, 'FlexiSpot Electric Desk', 'Motorized sit-stand desk frame', 399.99),
-- Chairs (cat 6)
(6, 'Herman Miller Aeron Chair', 'Premium ergonomic office chair', 1495.00),
(6, 'Steelcase Leap V2', 'Highly adjustable ergonomic chair', 979.00),
(6, 'HON Ignition 2.0 Chair', 'Mid-range ergonomic task chair', 349.99),
(6, 'Autonomous ErgoChair Pro', 'Adjustable mesh office chair', 449.00),
(6, 'AmazonBasics Office Chair', 'Budget-friendly desk chair', 89.99),
(6, 'Herman Miller Sayl Chair', 'Stylish ergonomic seating', 695.00),
-- Paper (cat 8)
(8, 'HP Printer Paper 500 Sheets', 'Multipurpose copy paper letter size', 8.99),
(8, 'Hammermill Premium Paper', 'Bright white paper for presentations', 12.99),
(8, 'Georgia-Pacific Copy Paper', 'Economical multipurpose paper 5 reams', 39.99),
(8, 'Southworth Resume Paper', 'Premium cotton fiber paper', 19.99),
(8, 'Astrobrights Color Paper', 'Assorted bright colored paper', 24.99),
-- Writing (cat 9)
(9, 'Pilot G2 Pens 12-Pack', 'Smooth gel ink retractable pens', 12.99),
(9, 'Sharpie Permanent Markers', 'Fine point markers assorted colors', 9.99),
(9, 'BIC Cristal Ball Pens', 'Classic ballpoint pens 60-count', 14.99),
(9, 'Paper Mate Mechanical Pencils', '0.7mm mechanical pencils 12-pack', 8.99),
(9, 'Pentel EnerGel Pens', 'Quick-drying ink pens variety pack', 15.99),
(9, 'Highlighter Set 6 Colors', 'Chisel tip highlighters assorted', 7.99),
-- Printers (cat 11)
(11, 'HP LaserJet Pro M404n', 'Monochrome laser printer for office', 279.99),
(11, 'Brother MFC-L3770CDW', 'Color laser all-in-one printer', 399.99),
(11, 'Canon imageCLASS MF445dw', 'Multifunction laser printer with duplex', 379.99),
(11, 'Epson EcoTank ET-4760', 'Cartridge-free supertank printer', 549.99),
(11, 'HP OfficeJet Pro 9015e', 'All-in-one color inkjet printer', 229.99),
-- Scanners (cat 12)
(12, 'Fujitsu ScanSnap iX1600', 'High-speed document scanner', 495.00),
(12, 'Epson WorkForce ES-500W', 'Wireless duplex document scanner', 399.99),
(12, 'Brother ADS-2700W', 'Network document scanner 35ppm', 449.99),
(12, 'Canon CanoScan LiDE 400', 'Flatbed scanner for photos', 89.99),
-- Folders (cat 14)
(14, 'Pendaflex File Folders Letter', '100-pack manila file folders', 24.99),
(14, 'Smead Hanging File Folders', 'Letter size hanging folders 25-count', 18.99),
(14, 'AmazonBasics Manila Folders', 'Standard file folders 100-pack', 12.99),
(14, '3-Ring Binder 2" White', 'Heavy-duty view binder', 9.99),
(14, 'Avery Tab Dividers 8-Tab', 'Insertable dividers for binders', 6.99),
-- Storage (cat 15)
(15, 'HON 4-Drawer File Cabinet', 'Vertical file cabinet letter size', 299.99),
(15, 'Lorell 5-Shelf Bookcase', 'Wood veneer bookshelf 72" high', 189.99),
(15, 'IKEA KALLAX 4x4 Shelf Unit', 'Cube storage organizer', 129.99),
(15, 'Safco Mobile File Cart', 'Rolling file cabinet with drawers', 149.99),
(15, 'Sterilite Storage Drawers', 'Plastic 3-drawer organizer', 34.99);

-- ============================================================================
-- CATEGORIES (20 categories with realistic hierarchy)
-- ============================================================================
INSERT INTO inv.cat (cat_id, prnt_id, nm, dsc, lvl, seq) VALUES
(1, NULL, 'Electronics', 'Electronic devices and accessories', 1, 1),
(2, 1, 'Computers', 'Desktop and laptop computers', 2, 1),
(3, 1, 'Peripherals', 'Computer peripherals and accessories', 2, 2),
(13, 1, 'Accessories', 'Electronic accessories and cables', 2, 3),
(4, NULL, 'Furniture', 'Office and home furniture', 1, 2),
(5, 4, 'Desks', 'Office desks and workstations', 2, 1),
(6, 4, 'Chairs', 'Office chairs and seating', 2, 2),
(15, 4, 'Storage', 'Storage furniture and cabinets', 2, 3),
(7, NULL, 'Supplies', 'Office supplies and materials', 1, 3),
(8, 7, 'Paper', 'Paper products and stationery', 2, 1),
(9, 7, 'Writing', 'Pens, pencils, and markers', 2, 2),
(14, 7, 'Folders', 'File folders and binders', 2, 3),
(10, NULL, 'Equipment', 'Office equipment and machines', 1, 4),
(11, 10, 'Printers', 'Printers and copiers', 2, 1),
(12, 10, 'Scanners', 'Document scanners', 2, 2),
(16, NULL, 'Breakroom', 'Breakroom supplies', 1, 5),
(17, 16, 'Kitchen', 'Kitchen appliances and supplies', 2, 1),
(18, 16, 'Cleaning', 'Cleaning supplies', 2, 2),
(19, NULL, 'Safety', 'Safety equipment', 1, 6),
(20, 19, 'PPE', 'Personal protective equipment', 2, 1);

-- ============================================================================
-- SUPPLIERS (25 realistic suppliers)
-- ============================================================================
INSERT INTO inv.sup (sup_id, nm, sts, pmt_trm, rtg, cnt_nm, cnt_phn, cnt_eml) VALUES
(1, 'Tech Solutions Distributors', 'A', 'N30', 5, 'Michael Chen', '555-0101', 'mchen@techsolutions.com'),
(2, 'Office Plus Supply Co', 'A', 'N60', 4, 'Sarah Johnson', '555-0102', 'sjohnson@officeplus.com'),
(3, 'Premium Furniture Wholesale', 'A', 'N30', 5, 'Robert Williams', '555-0103', 'rwilliams@premiumfurn.com'),
(4, 'Global Electronics Inc', 'A', 'N45', 4, 'Jennifer Martinez', '555-0104', 'jmartinez@globalelec.com'),
(5, 'QuickShip Business Supplies', 'A', 'N15', 5, 'David Anderson', '555-0105', 'danderson@quickship.com'),
(6, 'Premium Paper Products', 'A', 'N60', 4, 'Lisa Thompson', '555-0106', 'lthompson@premiumpaper.com'),
(7, 'Reliable Office Equipment', 'A', 'N30', 5, 'James Garcia', '555-0107', 'jgarcia@reliable.com'),
(8, 'Budget Office Furniture', 'A', 'N30', 3, 'Mary Rodriguez', '555-0108', 'mrodriguez@budgetfurn.com'),
(9, 'Elite Tech Distributors', 'A', 'N30', 5, 'John Wilson', '555-0109', 'jwilson@elitetech.com'),
(10, 'Express Business Supply', 'I', 'COD', 2, 'Patricia Moore', '555-0110', 'pmoore@express.com'),
(11, 'Corporate Furniture Group', 'A', 'N45', 4, 'Christopher Taylor', '555-0111', 'ctaylor@corpfurn.com'),
(12, 'Wholesale Office Solutions', 'A', 'N30', 5, 'Linda Anderson', '555-0112', 'landerson@wholesale.com'),
(13, 'National Supply Partners', 'A', 'N60', 4, 'Michael Thomas', '555-0113', 'mthomas@natsupply.com'),
(14, 'Metro Electronics Ltd', 'A', 'N30', 4, 'Barbara Jackson', '555-0114', 'bjackson@metroelec.com'),
(15, 'Quality Paper & Supplies', 'A', 'N45', 3, 'Richard White', '555-0115', 'rwhite@qualitypaper.com'),
(16, 'ProOffice Distributors', 'A', 'N30', 5, 'Susan Harris', '555-0116', 'sharris@prooffice.com'),
(17, 'Furniture Warehouse Direct', 'A', 'N60', 4, 'Joseph Martin', '555-0117', 'jmartin@furnwarehouse.com'),
(18, 'TechPro Supply Chain', 'A', 'N30', 5, 'Jessica Thompson', '555-0118', 'jthompson@techpro.com'),
(19, 'Office Essentials Plus', 'A', 'N30', 4, 'Charles Garcia', '555-0119', 'cgarcia@officeess.com'),
(20, 'Budget Electronics Outlet', 'S', 'COD', 2, 'Karen Martinez', '555-0120', 'kmartinez@budgetelec.com'),
(21, 'Premier Business Supplies', 'A', 'N45', 5, 'Daniel Robinson', '555-0121', 'drobinson@premier.com'),
(22, 'Nationwide Furniture Co', 'A', 'N30', 4, 'Nancy Clark', '555-0122', 'nclark@nationwide.com'),
(23, 'TechWorld Distributors', 'A', 'N30', 5, 'Matthew Rodriguez', '555-0123', 'mrodriguez@techworld.com'),
(24, 'Continental Office Supply', 'A', 'N60', 4, 'Betty Lewis', '555-0124', 'blewis@continental.com'),
(25, 'Discount Supply Warehouse', 'T', 'N15', 1, 'Anthony Lee', '555-0125', 'alee@discountsupply.com');

-- ============================================================================
-- WAREHOUSES (8 major warehouses)
-- ============================================================================
INSERT INTO inv.whs (whs_id, cd, nm, cty, st, typ, cap, sts) VALUES
(1, 'CHI', 'Chicago Distribution Center', 'Chicago', 'IL', 'M', 250000, 'A'),
(2, 'NYC', 'New York Regional Hub', 'New York', 'NY', 'R', 150000, 'A'),
(3, 'LAX', 'Los Angeles Distribution', 'Los Angeles', 'CA', 'D', 200000, 'A'),
(4, 'DAL', 'Dallas Regional Center', 'Dallas', 'TX', 'R', 180000, 'A'),
(5, 'ATL', 'Atlanta Distribution Hub', 'Atlanta', 'GA', 'M', 220000, 'A'),
(6, 'SEA', 'Seattle Regional Warehouse', 'Seattle', 'WA', 'R', 120000, 'A'),
(7, 'MIA', 'Miami Distribution Center', 'Miami', 'FL', 'D', 140000, 'A'),
(8, 'DEN', 'Denver Regional Hub', 'Denver', 'CO', 'R', 100000, 'M');

-- ============================================================================
-- PRODUCTS (200 realistic products)
-- ============================================================================
DECLARE @prd_counter INT = 1;
DECLARE @cat_id INT, @sup_id INT, @name NVARCHAR(100), @desc NVARCHAR(200), @price DECIMAL(10,2);
DECLARE @cost DECIMAL(10,2), @sku NVARCHAR(50), @prd_weight DECIMAL(8,2), @prd_status CHAR(1), @uom CHAR(2);

DECLARE product_cursor CURSOR FOR SELECT cat_id, name, desc_template, base_price FROM @Products;
OPEN product_cursor;

FETCH NEXT FROM product_cursor INTO @cat_id, @name, @desc, @price;
WHILE @@FETCH_STATUS = 0
BEGIN
    -- Generate 2-3 variants per product template
    DECLARE @variant INT = 1;
    WHILE @variant <= (CASE WHEN @prd_counter % 3 = 0 THEN 3 ELSE 2 END)
    BEGIN
        SET @sup_id = ((@prd_counter % 25) + 1);
        SET @sku = 'SKU-' + RIGHT('0000' + CAST(@prd_counter AS NVARCHAR), 4);
        SET @cost = @price * 0.60; -- 40% markup
        SET @prd_weight = CASE
            WHEN @cat_id IN (2,5,6,11) THEN (@prd_counter % 50) + 10.0  -- Heavy items
            WHEN @cat_id IN (9,14) THEN (@prd_counter % 5) * 0.1 + 0.1  -- Light items
            ELSE (@prd_counter % 10) + 1.0
        END;
        SET @prd_status = CASE
            WHEN @prd_counter % 25 = 0 THEN 'D'  -- 4% discontinued
            WHEN @prd_counter % 20 = 0 THEN 'O'  -- 5% out of stock
            ELSE 'A'
        END;
        SET @uom = CASE @cat_id
            WHEN 8 THEN 'CS'  -- Paper by case
            WHEN 9 THEN 'BX'  -- Writing by box
            ELSE 'EA'
        END;

        INSERT INTO inv.prd (prd_id, cat_id, sup_id, sku, nm, dsc, prc, cost, sts, wgt, uom)
        VALUES (
            @prd_counter,
            @cat_id,
            @sup_id,
            @sku,
            @name + CASE WHEN @variant > 1 THEN ' - Variant ' + CAST(@variant AS NVARCHAR) ELSE '' END,
            @desc,
            @price * (1 + (@variant - 1) * 0.15),  -- Variants are 15% more expensive
            @cost * (1 + (@variant - 1) * 0.15),
            @prd_status,
            @prd_weight,
            @uom
        );

        SET @prd_counter = @prd_counter + 1;
        SET @variant = @variant + 1;

        IF @prd_counter > 200 BREAK;
    END

    IF @prd_counter > 200 BREAK;
    FETCH NEXT FROM product_cursor INTO @cat_id, @name, @desc, @price;
END

CLOSE product_cursor;
DEALLOCATE product_cursor;

-- ============================================================================
-- CUSTOMERS (500 realistic customers)
-- ============================================================================
DECLARE @cst_counter INT = 1;
DECLARE @first NVARCHAR(50), @last NVARCHAR(50), @company_type NVARCHAR(20);
DECLARE @customer_name NVARCHAR(100), @cst_status CHAR(1), @cst_source CHAR(2), @cst_segment CHAR(1);
DECLARE @cst_rating TINYINT, @cst_balance DECIMAL(10,2), @cst_credit_limit DECIMAL(10,2);
DECLARE @cst_create_date DATE, @cst_last_order_date DATE;

WHILE @cst_counter <= 500
BEGIN
    -- Pick random first and last name
    SELECT TOP 1 @first = name FROM @FirstNames ORDER BY NEWID();
    SELECT TOP 1 @last = name FROM @LastNames ORDER BY NEWID();

    -- 40% business customers, 60% individual
    IF @cst_counter % 10 < 4
    BEGIN
        SELECT TOP 1 @company_type = suffix FROM @CompanyTypes ORDER BY NEWID();
        SET @customer_name = @last + ' ' + @company_type;
    END
    ELSE
    BEGIN
        SET @customer_name = @first + ' ' + @last;
    END

    -- Realistic status distribution
    SET @cst_status = CASE
        WHEN @cst_counter % 50 = 0 THEN 'T'  -- 2% terminated
        WHEN @cst_counter % 30 = 0 THEN 'I'  -- 3% inactive
        WHEN @cst_counter % 20 = 0 THEN 'S'  -- 5% suspended
        ELSE 'A'  -- 90% active
    END;

    SET @cst_source = CASE (@cst_counter % 4)
        WHEN 0 THEN 'WB'
        WHEN 1 THEN 'PH'
        WHEN 2 THEN 'ST'
        ELSE 'RF'
    END;

    SET @cst_segment = CASE
        WHEN @cst_counter % 10 < 2 THEN 'E'  -- 20% Enterprise
        WHEN @cst_counter % 10 < 6 THEN 'W'  -- 40% Wholesale
        ELSE 'R'  -- 40% Retail
    END;

    SET @cst_rating = ((@cst_counter % 5) + 1);  -- Ratings 1-5

    -- Balance: 30% have outstanding balance
    SET @cst_balance = CASE
        WHEN @cst_counter % 10 < 3 THEN (@cst_counter % 100) * 50.0 + (RAND() * 1000)
        ELSE 0.00
    END;

    -- Credit limit varies by segment
    SET @cst_credit_limit = CASE @cst_segment
        WHEN 'E' THEN 50000 + (@cst_counter % 50) * 1000.0
        WHEN 'W' THEN 20000 + (@cst_counter % 30) * 500.0
        ELSE 5000 + (@cst_counter % 20) * 250.0
    END;

    -- Create dates spread over 5 years (2020-2024)
    SET @cst_create_date = DATEADD(DAY, -(@cst_counter % 1825), '2025-01-01');

    -- Last order date (null for 20% of customers)
    SET @cst_last_order_date = CASE
        WHEN @cst_counter % 5 = 0 THEN NULL
        ELSE DATEADD(DAY, -((@cst_counter % 365)), '2025-01-01')
    END;

    INSERT INTO sales.cst (cst_id, nm, sts, dt, src, rep_id, seg, rtg, bal, cr_lmt, lst_ord)
    VALUES (
        @cst_counter,
        @customer_name,
        @cst_status,
        @cst_create_date,
        @cst_source,
        ((@cst_counter % 15) + 1),  -- 15 different sales reps (some don't exist = orphaned)
        @cst_segment,
        @cst_rating,
        @cst_balance,
        @cst_credit_limit,
        @cst_last_order_date
    );

    SET @cst_counter = @cst_counter + 1;
END

-- ============================================================================
-- ORDERS (2000 orders spread over 2 years)
-- ============================================================================
DECLARE @ord_counter INT = 1;
DECLARE @cst_id INT, @order_date DATE, @ship_date DATE, @order_status CHAR(1);
DECLARE @total DECIMAL(10,2), @tax DECIMAL(10,2), @shipping DECIMAL(10,2), @discount DECIMAL(5,2);
DECLARE @payment_terms CHAR(3);

WHILE @ord_counter <= 2000
BEGIN
    -- 5% orphaned customers
    SET @cst_id = CASE
        WHEN @ord_counter % 20 = 0 THEN 9999  -- Non-existent customer
        ELSE ((@ord_counter % 500) + 1)
    END;

    -- Order dates spread over 730 days (2 years)
    SET @order_date = DATEADD(DAY, -((@ord_counter % 730)), '2025-01-01');

    -- Order status distribution
    SET @order_status = CASE (@ord_counter % 10)
        WHEN 0 THEN 'P'  -- 10% Pending
        WHEN 1 THEN 'C'  -- 10% Confirmed
        WHEN 2 THEN 'C'  -- 10% Confirmed
        WHEN 3 THEN 'S'  -- 10% Shipped
        WHEN 4 THEN 'S'  -- 10% Shipped
        WHEN 5 THEN 'D'  -- 10% Delivered
        WHEN 6 THEN 'D'  -- 10% Delivered
        WHEN 7 THEN 'D'  -- 10% Delivered
        WHEN 8 THEN 'D'  -- 10% Delivered
        ELSE 'X'  -- 10% Cancelled
    END;

    -- Ship date depends on status
    SET @ship_date = CASE
        WHEN @order_status IN ('P','C','X') THEN NULL
        ELSE DATEADD(DAY, 3, @order_date)
    END;

    -- Order total: wide variance $50 - $10,000
    SET @total = 50.00 + (@ord_counter % 100) * 99.50;
    SET @tax = @total * 0.08;  -- 8% tax
    SET @shipping = CASE
        WHEN @total > 1000 THEN 0.00  -- Free shipping over $1000
        WHEN @total > 500 THEN 15.00
        ELSE 25.00
    END;
    SET @discount = CASE
        WHEN @ord_counter % 10 = 0 THEN 10.00  -- 10% off every 10th order
        WHEN @ord_counter % 20 = 0 THEN 15.00  -- 15% off every 20th
        ELSE 0.00
    END;

    SET @payment_terms = CASE (@ord_counter % 4)
        WHEN 0 THEN 'N30'
        WHEN 1 THEN 'N60'
        WHEN 2 THEN 'N45'
        ELSE 'COD'
    END;

    INSERT INTO sales.ord (ord_id, cst_id, ord_dt, ship_dt, sts, tot, tax, ship_amt, disc_pct, pmt_trm, notes)
    VALUES (
        @ord_counter,
        @cst_id,
        @order_date,
        @ship_date,
        @order_status,
        @total,
        @tax,
        @shipping,
        @discount,
        @payment_terms,
        CASE WHEN @ord_counter % 15 = 0 THEN 'Rush order - expedited shipping' ELSE NULL END
    );

    SET @ord_counter = @ord_counter + 1;
END

-- ============================================================================
-- ORDER LINE ITEMS (Average 3 items per order = ~6000 line items)
-- ============================================================================
DECLARE @oli_counter INT = 1;
DECLARE @ord_id_ref INT, @line_num INT, @quantity INT, @oli_prd_id INT;
DECLARE @unit_price DECIMAL(10,2), @line_discount DECIMAL(10,2), @line_tax DECIMAL(10,2);

SET @ord_counter = 1;
WHILE @ord_counter <= 2000
BEGIN
    -- 1-6 items per order
    SET @line_num = 1;
    DECLARE @items_in_order INT = ((@ord_counter % 6) + 1);

    WHILE @line_num <= @items_in_order
    BEGIN
        SET @quantity = ((@oli_counter % 10) + 1);  -- Quantity 1-10

        -- Pick a random product
        SET @oli_prd_id = ((@oli_counter % 200) + 1);

        -- Get product price (we'll use a calculated estimate)
        SET @unit_price = 25.99 + ((@oli_prd_id % 100) * 12.50);

        SET @line_discount = CASE
            WHEN @quantity > 5 THEN @unit_price * @quantity * 0.10  -- 10% bulk discount
            ELSE 0.00
        END;

        SET @line_tax = (@unit_price * @quantity - @line_discount) * 0.08;

        INSERT INTO sales.oli (oli_id, ord_id, prd_id, qty, prc, disc, tax_amt, seq)
        VALUES (
            @oli_counter,
            @ord_counter,
            @oli_prd_id,
            @quantity,
            @unit_price,
            @line_discount,
            @line_tax,
            @line_num
        );

        SET @oli_counter = @oli_counter + 1;
        SET @line_num = @line_num + 1;
    END

    SET @ord_counter = @ord_counter + 1;
END

-- ============================================================================
-- PAYMENTS (2200 payments - some orders have multiple payments, some account credits)
-- ============================================================================
DECLARE @pmt_counter INT = 1;
DECLARE @pmt_ord_id INT, @pmt_cst_id INT, @pmt_date DATE, @pmt_amount DECIMAL(10,2);
DECLARE @pmt_method CHAR(2), @pmt_status CHAR(1), @pmt_ref NVARCHAR(50);

WHILE @pmt_counter <= 2200
BEGIN
    -- 10% are account credits (NULL order ID)
    SET @pmt_ord_id = CASE
        WHEN @pmt_counter % 10 = 0 THEN NULL
        ELSE ((@pmt_counter % 2000) + 1)
    END;

    SET @pmt_cst_id = ((@pmt_counter % 500) + 1);
    SET @pmt_date = DATEADD(DAY, -((@pmt_counter % 730)) + 1, '2025-01-01');
    SET @pmt_amount = 100.00 + (@pmt_counter % 500) * 20.0;

    SET @pmt_method = CASE (@pmt_counter % 4)
        WHEN 0 THEN 'CC'  -- Credit Card
        WHEN 1 THEN 'CK'  -- Check
        WHEN 2 THEN 'WR'  -- Wire
        ELSE 'CA'  -- Cash
    END;

    -- Payment status: 5% failed/rejected
    SET @pmt_status = CASE
        WHEN @pmt_counter % 20 = 0 THEN 'F'  -- Failed
        WHEN @pmt_counter % 25 = 0 THEN 'R'  -- Rejected
        WHEN @pmt_counter % 10 = 0 THEN 'P'  -- Pending
        ELSE 'A'  -- Approved
    END;

    SET @pmt_ref = 'PMT-' + CAST(YEAR(@pmt_date) AS NVARCHAR) + '-' + RIGHT('00000' + CAST(@pmt_counter AS NVARCHAR), 5);

    INSERT INTO sales.pmt (pmt_id, ord_id, cst_id, pmt_dt, amt, mthd, sts, ref, notes)
    VALUES (
        @pmt_counter,
        @pmt_ord_id,
        @pmt_cst_id,
        @pmt_date,
        @pmt_amount,
        @pmt_method,
        @pmt_status,
        @pmt_ref,
        CASE WHEN @pmt_ord_id IS NULL THEN 'Account credit applied' ELSE NULL END
    );

    SET @pmt_counter = @pmt_counter + 1;
END

-- ============================================================================
-- SHIPMENTS (1500 shipments for delivered/shipped orders)
-- ============================================================================
DECLARE @shp_counter INT = 1;
DECLARE @shp_ord_id INT, @shp_whs_id INT, @shp_date DATE, @dlv_date DATE;
DECLARE @shp_carrier NVARCHAR(50), @shp_tracking NVARCHAR(100), @shp_status CHAR(1);
DECLARE @shp_weight DECIMAL(8,2), @shp_cost DECIMAL(10,2);

WHILE @shp_counter <= 1500
BEGIN
    SET @shp_ord_id = @shp_counter;  -- First 1500 orders
    SET @shp_whs_id = ((@shp_counter % 8) + 1);
    SET @shp_date = DATEADD(DAY, -((@shp_counter % 730)) + 4, '2025-01-01');

    SET @shp_status = CASE (@shp_counter % 5)
        WHEN 0 THEN 'N'  -- New
        WHEN 1 THEN 'P'  -- Packed
        WHEN 2 THEN 'S'  -- Shipped
        ELSE 'D'  -- Delivered
    END;

    SET @dlv_date = CASE
        WHEN @shp_status = 'D' THEN DATEADD(DAY, 5, @shp_date)
        ELSE NULL
    END;

    SET @shp_carrier = CASE (@shp_counter % 4)
        WHEN 0 THEN 'FedEx Ground'
        WHEN 1 THEN 'UPS Next Day'
        WHEN 2 THEN 'USPS Priority'
        ELSE 'DHL Express'
    END;

    SET @shp_tracking = 'TRK' + CAST(YEAR(@shp_date) AS NVARCHAR) + CAST(@shp_counter * 123456 AS NVARCHAR);
    SET @shp_weight = 5.0 + (@shp_counter % 50) * 2.5;
    SET @shp_cost = CASE
        WHEN @shp_weight > 50 THEN 45.00
        WHEN @shp_weight > 20 THEN 25.00
        ELSE 15.00
    END;

    INSERT INTO sales.shp (shp_id, ord_id, whs_id, ship_dt, dlv_dt, carr, trk, sts, wgt, cost)
    VALUES (
        @shp_counter,
        @shp_ord_id,
        @shp_whs_id,
        @shp_date,
        @dlv_date,
        @shp_carrier,
        @shp_tracking,
        @shp_status,
        @shp_weight,
        @shp_cost
    );

    SET @shp_counter = @shp_counter + 1;
END

-- ============================================================================
-- RETURNS (150 returns - about 2% of orders)
-- ============================================================================
DECLARE @rtn_counter INT = 1;
DECLARE @rtn_ord_id INT, @rtn_oli_id INT, @rtn_date DATE, @rtn_reason CHAR(3);
DECLARE @rtn_qty INT, @rtn_amt DECIMAL(10,2), @rtn_status CHAR(1);

WHILE @rtn_counter <= 150
BEGIN
    SET @rtn_ord_id = @rtn_counter * 10;  -- Every 10th order has a return
    SET @rtn_oli_id = @rtn_counter * 10;
    SET @rtn_date = DATEADD(DAY, -((@rtn_counter % 365)) + 10, '2025-01-01');

    SET @rtn_reason = CASE (@rtn_counter % 4)
        WHEN 0 THEN 'DMG'  -- Damaged
        WHEN 1 THEN 'WRG'  -- Wrong Item
        WHEN 2 THEN 'DOA'  -- Dead on Arrival
        ELSE 'CHG'  -- Changed Mind
    END;

    SET @rtn_qty = ((@rtn_counter % 5) + 1);
    SET @rtn_amt = 50.00 + (@rtn_counter % 50) * 10.0;

    SET @rtn_status = CASE (@rtn_counter % 4)
        WHEN 0 THEN 'P'  -- Pending
        WHEN 1 THEN 'A'  -- Approved
        WHEN 2 THEN 'R'  -- Rejected
        ELSE 'C'  -- Completed
    END;

    INSERT INTO sales.rtn (rtn_id, ord_id, oli_id, rtn_dt, rsn, qty, amt, sts, notes)
    VALUES (
        @rtn_counter,
        @rtn_ord_id,
        @rtn_oli_id,
        @rtn_date,
        @rtn_reason,
        @rtn_qty,
        @rtn_amt,
        @rtn_status,
        CASE @rtn_reason
            WHEN 'DMG' THEN 'Package arrived damaged during shipping'
            WHEN 'WRG' THEN 'Wrong item was shipped'
            WHEN 'DOA' THEN 'Product defective on arrival'
            ELSE 'Customer changed mind'
        END
    );

    SET @rtn_counter = @rtn_counter + 1;
END

-- ============================================================================
-- ADDRESSES (800 addresses for customers)
-- ============================================================================
DECLARE @addr_counter INT = 1;
DECLARE @addr_cst_id INT, @addr_type CHAR(1), @city NVARCHAR(50), @state CHAR(2);

DECLARE @Cities TABLE (name NVARCHAR(50), state CHAR(2));
INSERT INTO @Cities VALUES
('New York','NY'),('Los Angeles','CA'),('Chicago','IL'),('Houston','TX'),('Phoenix','AZ'),
('Philadelphia','PA'),('San Antonio','TX'),('San Diego','CA'),('Dallas','TX'),('San Jose','CA'),
('Austin','TX'),('Jacksonville','FL'),('Fort Worth','TX'),('Columbus','OH'),('Indianapolis','IN'),
('Charlotte','NC'),('San Francisco','CA'),('Seattle','WA'),('Denver','CO'),('Boston','MA'),
('Nashville','TN'),('Detroit','MI'),('Portland','OR'),('Las Vegas','NV'),('Miami','FL'),
('Atlanta','GA'),('Minneapolis','MN'),('Phoenix','AZ'),('Tampa','FL'),('St. Louis','MO');

WHILE @addr_counter <= 800
BEGIN
    -- 5% orphaned
    SET @addr_cst_id = CASE
        WHEN @addr_counter % 20 = 0 THEN 9999
        ELSE ((@addr_counter % 500) + 1)
    END;

    SET @addr_type = CASE (@addr_counter % 3)
        WHEN 0 THEN 'B'  -- Billing
        WHEN 1 THEN 'S'  -- Shipping
        ELSE 'O'  -- Other
    END;

    SELECT TOP 1 @city = name, @state = state FROM @Cities ORDER BY NEWID();

    INSERT INTO sales.addr (addr_id, cst_id, typ, ln1, ln2, cty, st, zip, ctry, dflt)
    VALUES (
        @addr_counter,
        @addr_cst_id,
        @addr_type,
        CAST(((@addr_counter % 9999) + 1) AS NVARCHAR) + ' ' +
            CASE (@addr_counter % 5)
                WHEN 0 THEN 'Main Street'
                WHEN 1 THEN 'Oak Avenue'
                WHEN 2 THEN 'Park Boulevard'
                WHEN 3 THEN 'Market Street'
                ELSE 'Industrial Drive'
            END,
        CASE WHEN @addr_counter % 4 = 0 THEN 'Suite ' + CAST(((@addr_counter % 500) + 1) AS NVARCHAR) ELSE NULL END,
        @city,
        @state,
        RIGHT('00000' + CAST(((@addr_counter % 99999) + 10000) AS NVARCHAR), 5),
        'US',
        CASE WHEN @addr_counter % 3 = 0 THEN 1 ELSE 0 END
    );

    SET @addr_counter = @addr_counter + 1;
END

-- ============================================================================
-- PHONE NUMBERS (600 phone numbers)
-- ============================================================================
DECLARE @phn_counter INT = 1;
DECLARE @phn_cst_id INT, @phn_type CHAR(1), @phone_num NVARCHAR(20);

WHILE @phn_counter <= 600
BEGIN
    SET @phn_cst_id = ((@phn_counter % 500) + 1);

    SET @phn_type = CASE (@phn_counter % 4)
        WHEN 0 THEN 'M'  -- Mobile
        WHEN 1 THEN 'H'  -- Home
        WHEN 2 THEN 'W'  -- Work
        ELSE 'F'  -- Fax
    END;

    -- Varied phone formats (inconsistent on purpose!)
    SET @phone_num = CASE (@phn_counter % 3)
        WHEN 0 THEN '(' + CAST(((@phn_counter % 900) + 100) AS NVARCHAR) + ') ' +
                    CAST(((@phn_counter % 900) + 100) AS NVARCHAR) + '-' +
                    RIGHT('0000' + CAST(@phn_counter AS NVARCHAR), 4)
        WHEN 1 THEN CAST(((@phn_counter % 900) + 100) AS NVARCHAR) + '-' +
                    CAST(((@phn_counter % 900) + 100) AS NVARCHAR) + '-' +
                    RIGHT('0000' + CAST(@phn_counter AS NVARCHAR), 4)
        ELSE CAST(((@phn_counter % 900) + 100) AS NVARCHAR) +
             CAST(((@phn_counter % 900) + 100) AS NVARCHAR) +
             RIGHT('0000' + CAST(@phn_counter AS NVARCHAR), 4)
    END;

    INSERT INTO sales.phn (phn_id, cst_id, typ, num, ext, dflt)
    VALUES (
        @phn_counter,
        @phn_cst_id,
        @phn_type,
        @phone_num,
        CASE WHEN @phn_type = 'W' AND @phn_counter % 5 = 0 THEN CAST(((@phn_counter % 9999) + 1) AS NVARCHAR) ELSE NULL END,
        CASE WHEN @phn_counter % 3 = 0 THEN 1 ELSE 0 END
    );

    SET @phn_counter = @phn_counter + 1;
END

-- ============================================================================
-- EMAIL ADDRESSES (550 emails)
-- ============================================================================
DECLARE @eml_counter INT = 1;
DECLARE @eml_cst_id INT, @eml_type CHAR(1), @email_addr NVARCHAR(100);

WHILE @eml_counter <= 550
BEGIN
    SET @eml_cst_id = ((@eml_counter % 500) + 1);

    SET @eml_type = CASE (@eml_counter % 3)
        WHEN 0 THEN 'P'  -- Primary
        WHEN 1 THEN 'W'  -- Work
        ELSE 'O'  -- Other
    END;

    SELECT TOP 1 @first = name FROM @FirstNames ORDER BY NEWID();
    SELECT TOP 1 @last = name FROM @LastNames ORDER BY NEWID();

    SET @email_addr = LOWER(@first + '.' + @last + CAST(@eml_counter AS NVARCHAR) + '@' +
        CASE (@eml_counter % 5)
            WHEN 0 THEN 'gmail.com'
            WHEN 1 THEN 'yahoo.com'
            WHEN 2 THEN 'outlook.com'
            WHEN 3 THEN 'company.com'
            ELSE 'business.net'
        END);

    INSERT INTO sales.eml (eml_id, cst_id, typ, adr, vrf, dflt)
    VALUES (
        @eml_counter,
        @eml_cst_id,
        @eml_type,
        @email_addr,
        CASE WHEN @eml_counter % 4 = 0 THEN 0 ELSE 1 END,  -- 25% unverified
        CASE WHEN @eml_counter % 3 = 0 THEN 1 ELSE 0 END
    );

    SET @eml_counter = @eml_counter + 1;
END

-- ============================================================================
-- CUSTOMER NOTES (450 notes)
-- ============================================================================
DECLARE @note_counter INT = 1;
DECLARE @note_cst_id INT, @note_date DATE, @note_user NVARCHAR(50), @note_type CHAR(1);

WHILE @note_counter <= 450
BEGIN
    SET @note_cst_id = ((@note_counter % 500) + 1);
    SET @note_date = DATEADD(DAY, -((@note_counter % 730)), '2025-01-01');

    SELECT TOP 1 @first = name FROM @FirstNames ORDER BY NEWID();
    SELECT TOP 1 @last = name FROM @LastNames ORDER BY NEWID();
    SET @note_user = @first + ' ' + @last;

    SET @note_type = CASE (@note_counter % 4)
        WHEN 0 THEN 'C'  -- Call
        WHEN 1 THEN 'M'  -- Meeting
        WHEN 2 THEN 'E'  -- Email
        ELSE 'O'  -- Other
    END;

    INSERT INTO sales.cst_note (note_id, cst_id, dt, usr, txt, typ)
    VALUES (
        @note_counter,
        @note_cst_id,
        @note_date,
        @note_user,
        CASE @note_type
            WHEN 'C' THEN 'Spoke with customer about order status and delivery timeline. Customer satisfied with explanation.'
            WHEN 'M' THEN 'In-person meeting to discuss bulk pricing and long-term contract opportunities.'
            WHEN 'E' THEN 'Email correspondence regarding product specifications and availability for upcoming project.'
            ELSE 'Follow-up regarding account status and payment arrangements for outstanding invoices.'
        END,
        @note_type
    );

    SET @note_counter = @note_counter + 1;
END

-- ============================================================================
-- STOCK LEVELS (Product x Warehouse = ~1200 combinations)
-- ============================================================================
DECLARE @stk_prd_id INT = 1, @stk_whs_id INT;
DECLARE @qty INT, @reserved INT, @min_qty INT, @max_qty INT;
DECLARE @last_count_date DATE, @last_received_date DATE;

WHILE @stk_prd_id <= 200
BEGIN
    SET @stk_whs_id = 1;
    WHILE @stk_whs_id <= 8
    BEGIN
        -- Not every product in every warehouse (70% coverage)
        IF (@stk_prd_id + @stk_whs_id) % 10 < 7
        BEGIN
            SET @qty = ((@stk_prd_id % 100) + 1) * (@stk_whs_id + 5) * 10;
            SET @reserved = CASE WHEN @qty > 100 THEN @qty / 10 ELSE 0 END;
            SET @min_qty = (@stk_prd_id % 50) + 10;
            SET @max_qty = @min_qty * 20;
            SET @last_count_date = DATEADD(DAY, -((@stk_prd_id + @stk_whs_id) % 90), '2025-01-01');
            SET @last_received_date = DATEADD(DAY, -((@stk_prd_id + @stk_whs_id) % 30), '2025-01-01');

            INSERT INTO inv.stk (prd_id, whs_id, qty, rsv, min_qty, max_qty, lst_cnt, lst_rcv)
            VALUES (
                @stk_prd_id,
                @stk_whs_id,
                @qty,
                @reserved,
                @min_qty,
                @max_qty,
                @last_count_date,
                @last_received_date
            );
        END

        SET @stk_whs_id = @stk_whs_id + 1;
    END
    SET @stk_prd_id = @stk_prd_id + 1;
END

-- ============================================================================
-- PURCHASE ORDERS (150 POs)
-- ============================================================================
DECLARE @po_counter INT = 1;
DECLARE @po_sup_id INT, @po_date DATE, @expected_date DATE, @po_status CHAR(1);
DECLARE @po_total DECIMAL(10,2), @po_shipping DECIMAL(10,2);

WHILE @po_counter <= 150
BEGIN
    SET @po_sup_id = ((@po_counter % 25) + 1);
    SET @po_date = DATEADD(DAY, -((@po_counter % 730)), '2025-01-01');
    SET @expected_date = DATEADD(DAY, 14, @po_date);

    SET @po_status = CASE (@po_counter % 5)
        WHEN 0 THEN 'P'  -- Pending
        WHEN 1 THEN 'A'  -- Approved
        WHEN 2 THEN 'S'  -- Sent
        WHEN 3 THEN 'R'  -- Received
        ELSE 'X'  -- Cancelled
    END;

    SET @po_total = 2000.00 + (@po_counter % 100) * 150.0;
    SET @po_shipping = CASE WHEN @po_total > 10000 THEN 0.00 ELSE 150.00 END;

    INSERT INTO inv.po (po_id, sup_id, po_dt, exp_dt, sts, tot, ship_amt, notes)
    VALUES (
        @po_counter,
        @po_sup_id,
        @po_date,
        @expected_date,
        @po_status,
        @po_total,
        @po_shipping,
        CASE WHEN @po_counter % 10 = 0 THEN 'Expedited shipping requested' ELSE NULL END
    );

    SET @po_counter = @po_counter + 1;
END

-- ============================================================================
-- PO DETAILS (3-7 lines per PO = ~750 line items)
-- ============================================================================
DECLARE @po_dtl_counter INT = 1;
DECLARE @dtl_po_id INT, @dtl_seq INT, @dtl_prd_id INT, @dtl_qty INT;
DECLARE @dtl_price DECIMAL(10,2), @dtl_rcv_qty INT;

SET @po_counter = 1;
WHILE @po_counter <= 150
BEGIN
    SET @dtl_seq = 1;
    DECLARE @lines_in_po INT = ((@po_counter % 5) + 3);  -- 3-7 lines

    WHILE @dtl_seq <= @lines_in_po
    BEGIN
        SET @dtl_prd_id = ((@po_dtl_counter % 200) + 1);
        SET @dtl_qty = ((@dtl_seq % 20) + 1) * 50;  -- Order in multiples of 50
        SET @dtl_price = 25.00 + ((@dtl_prd_id % 100) * 10.0);

        -- 10% of lines have discrepancy in received quantity
        SET @dtl_rcv_qty = CASE
            WHEN @po_dtl_counter % 10 = 0 THEN @dtl_qty - ((@dtl_seq % 5) + 1) * 10
            ELSE @dtl_qty
        END;

        INSERT INTO inv.po_dtl (po_id, seq, prd_id, qty, prc, rcv_qty)
        VALUES (
            @po_counter,
            @dtl_seq,
            @dtl_prd_id,
            @dtl_qty,
            @dtl_price,
            @dtl_rcv_qty
        );

        SET @po_dtl_counter = @po_dtl_counter + 1;
        SET @dtl_seq = @dtl_seq + 1;
    END

    SET @po_counter = @po_counter + 1;
END

-- ============================================================================
-- RECEIVING RECORDS (120 receiving records)
-- ============================================================================
DECLARE @rcv_counter INT = 1;
DECLARE @rcv_po_id INT, @rcv_date DATE, @rcv_whs_id INT;

WHILE @rcv_counter <= 120
BEGIN
    SET @rcv_po_id = @rcv_counter;
    SET @rcv_date = DATEADD(DAY, -((@rcv_counter % 730)) + 15, '2025-01-01');
    SET @rcv_whs_id = ((@rcv_counter % 8) + 1);

    INSERT INTO inv.rcv (rcv_id, po_id, rcv_dt, whs_id, notes)
    VALUES (
        @rcv_counter,
        @rcv_po_id,
        @rcv_date,
        @rcv_whs_id,
        CASE WHEN @rcv_counter % 15 = 0 THEN 'Partial shipment received - balance on backorder' ELSE NULL END
    );

    SET @rcv_counter = @rcv_counter + 1;
END

-- ============================================================================
-- INVENTORY ADJUSTMENTS (300 adjustments)
-- ============================================================================
DECLARE @adj_counter INT = 1;
DECLARE @adj_prd_id INT, @adj_whs_id INT, @adj_date DATE, @adj_qty INT;
DECLARE @adj_reason CHAR(3), @adj_user NVARCHAR(50);

WHILE @adj_counter <= 300
BEGIN
    SET @adj_prd_id = ((@adj_counter % 200) + 1);
    SET @adj_whs_id = ((@adj_counter % 8) + 1);
    SET @adj_date = DATEADD(DAY, -((@adj_counter % 365)), '2025-01-01');

    SET @adj_reason = CASE (@adj_counter % 4)
        WHEN 0 THEN 'DAM'  -- Damaged
        WHEN 1 THEN 'STL'  -- Stolen
        WHEN 2 THEN 'EXP'  -- Expired
        ELSE 'COR'  -- Correction
    END;

    -- Adjustments can be positive or negative
    SET @adj_qty = CASE
        WHEN @adj_reason = 'COR' THEN ((@adj_counter % 50) + 1)  -- Positive correction
        ELSE -((@adj_counter % 20) + 1)  -- Negative for damage/theft/expiration
    END;

    SELECT TOP 1 @first = name FROM @FirstNames ORDER BY NEWID();
    SELECT TOP 1 @last = name FROM @LastNames ORDER BY NEWID();
    SET @adj_user = @first + ' ' + @last;

    INSERT INTO inv.adj (adj_id, prd_id, whs_id, adj_dt, qty, rsn, usr, notes)
    VALUES (
        @adj_counter,
        @adj_prd_id,
        @adj_whs_id,
        @adj_date,
        @adj_qty,
        @adj_reason,
        @adj_user,
        CASE @adj_reason
            WHEN 'DAM' THEN 'Items damaged during warehouse operations'
            WHEN 'STL' THEN 'Inventory shrinkage detected during audit'
            WHEN 'EXP' THEN 'Products expired and removed from stock'
            ELSE 'Inventory count correction after cycle count'
        END
    );

    SET @adj_counter = @adj_counter + 1;
END

-- ============================================================================
-- CYCLE COUNTS (250 cycle counts)
-- ============================================================================
DECLARE @cnt_counter INT = 1;
DECLARE @cnt_whs_id INT, @cnt_date DATE, @cnt_prd_id INT;
DECLARE @expected_qty INT, @actual_qty INT, @variance INT, @cnt_user NVARCHAR(50);

WHILE @cnt_counter <= 250
BEGIN
    SET @cnt_whs_id = ((@cnt_counter % 8) + 1);
    SET @cnt_date = DATEADD(DAY, -((@cnt_counter % 180)), '2025-01-01');
    SET @cnt_prd_id = ((@cnt_counter % 200) + 1);

    SET @expected_qty = (@cnt_counter % 500) + 50;

    -- 20% have variance
    SET @actual_qty = CASE
        WHEN @cnt_counter % 5 = 0 THEN @expected_qty + ((@cnt_counter % 20) - 10)
        ELSE @expected_qty
    END;

    SET @variance = @actual_qty - @expected_qty;

    SELECT TOP 1 @first = name FROM @FirstNames ORDER BY NEWID();
    SELECT TOP 1 @last = name FROM @LastNames ORDER BY NEWID();
    SET @cnt_user = @first + ' ' + @last;

    INSERT INTO inv.cnt (cnt_id, whs_id, cnt_dt, prd_id, exp_qty, act_qty, var, usr)
    VALUES (
        @cnt_counter,
        @cnt_whs_id,
        @cnt_date,
        @cnt_prd_id,
        @expected_qty,
        @actual_qty,
        @variance,
        @cnt_user
    );

    SET @cnt_counter = @cnt_counter + 1;
END

GO

PRINT '==========================================================================';
PRINT 'LousyDB created successfully with REALISTIC, VOLUMINOUS DATA!';
PRINT '==========================================================================';
PRINT 'Schemas: sales, inv';
PRINT 'Tables: 20';
PRINT '';
PRINT 'DATA SUMMARY:';
PRINT '  - Customers: 500 (realistic names and company names)';
PRINT '  - Products: 200 (real product names and descriptions)';
PRINT '  - Categories: 20 (hierarchical structure)';
PRINT '  - Suppliers: 25 (realistic company names)';
PRINT '  - Warehouses: 8 (major US cities)';
PRINT '  - Orders: 2,000 (spread over 2 years: 2023-2024)';
PRINT '  - Order Line Items: ~6,000';
PRINT '  - Payments: 2,200';
PRINT '  - Shipments: 1,500';
PRINT '  - Returns: 150';
PRINT '  - Addresses: 800';
PRINT '  - Phone Numbers: 600';
PRINT '  - Email Addresses: 550';
PRINT '  - Customer Notes: 450';
PRINT '  - Stock Levels: ~1,200';
PRINT '  - Purchase Orders: 150';
PRINT '  - PO Details: ~750';
PRINT '  - Receiving Records: 120';
PRINT '  - Inventory Adjustments: 300';
PRINT '  - Cycle Counts: 250';
PRINT '';
PRINT 'TOTAL ROWS: ~17,000+';
PRINT '';
PRINT 'DATA CHARACTERISTICS:';
PRINT '  - Wide date ranges (2020-2024)';
PRINT '  - Realistic price variations ($1 - $10,000)';
PRINT '  - Wide variances in quantities, balances, ratings';
PRINT '  - Real customer and company names';
PRINT '  - Real product names and descriptions';
PRINT '  - Realistic addresses across major US cities';
PRINT '  - Intentional data quality issues (orphaned records, NULLs)';
PRINT '';
PRINT 'METADATA: NO PRIMARY KEYS or FOREIGN KEYS defined!';
PRINT 'Perfect for testing Relationship Discovery!';
PRINT '==========================================================================';
GO
