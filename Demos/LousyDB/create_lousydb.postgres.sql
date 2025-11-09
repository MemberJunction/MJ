/*
 * LousyDB - Legacy Database Demo (PostgreSQL Version)
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
 * PREREQUISITE: Create a database named 'lousydb' and connect to it
 * Example:
 *   CREATE DATABASE lousydb;
 *   \c lousydb
 *   -- Then run this script
 */

-- Drop schemas if they exist (CASCADE removes all objects)
DROP SCHEMA IF EXISTS sales CASCADE;
DROP SCHEMA IF EXISTS inv CASCADE;

-- Create schemas
CREATE SCHEMA sales;
CREATE SCHEMA inv;

-- ============================================================================
-- SALES SCHEMA - Customer and Order Management
-- ============================================================================

-- Customers (NO PK/FK constraints!)
CREATE TABLE sales.cst (
    cst_id INT NOT NULL,           -- Would be PK but not defined
    nm VARCHAR(100),               -- Name
    sts CHAR(1),                   -- Status: A=Active, I=Inactive, S=Suspended, T=Terminated
    dt DATE,                       -- Date created
    src CHAR(2),                   -- Source: WB=Website, PH=Phone, ST=Store, RF=Referral
    rep_id INT,                    -- Sales rep (orphaned FKs exist)
    seg CHAR(1),                   -- Segment: R=Retail, W=Wholesale, E=Enterprise
    rtg SMALLINT,                  -- Rating 1-5
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
    notes VARCHAR(500)
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
    ref VARCHAR(50),               -- Reference number
    notes VARCHAR(500)
);

-- Shipments
CREATE TABLE sales.shp (
    shp_id INT NOT NULL,
    ord_id INT,                    -- FK to ord
    whs_id INT,                    -- FK to inv.whs
    ship_dt DATE,
    dlv_dt DATE,
    carr VARCHAR(50),              -- Carrier
    trk VARCHAR(100),              -- Tracking number
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
    notes VARCHAR(500)
);

-- Customer Notes
CREATE TABLE sales.cst_note (
    note_id INT NOT NULL,
    cst_id INT,                    -- FK to cst
    dt DATE,
    usr VARCHAR(50),               -- User who created note
    txt TEXT,
    typ CHAR(1)                    -- C=Call, M=Meeting, E=Email, O=Other
);

-- Addresses (can be orphaned!)
CREATE TABLE sales.addr (
    addr_id INT NOT NULL,
    cst_id INT,                    -- FK to cst
    typ CHAR(1),                   -- B=Billing, S=Shipping, O=Other
    ln1 VARCHAR(100),
    ln2 VARCHAR(100),
    cty VARCHAR(50),
    st CHAR(2),                    -- State
    zip VARCHAR(10),
    ctry CHAR(2),                  -- Country code
    dflt BOOLEAN                   -- Is default
);

-- Phone Numbers
CREATE TABLE sales.phn (
    phn_id INT NOT NULL,
    cst_id INT,                    -- FK to cst
    typ CHAR(1),                   -- M=Mobile, H=Home, W=Work, F=Fax
    num VARCHAR(20),               -- Inconsistent formatting!
    ext VARCHAR(10),
    dflt BOOLEAN
);

-- Email Addresses
CREATE TABLE sales.eml (
    eml_id INT NOT NULL,
    cst_id INT,                    -- FK to cst
    typ CHAR(1),                   -- P=Primary, W=Work, O=Other
    adr VARCHAR(100),
    vrf BOOLEAN,                   -- Verified
    dflt BOOLEAN
);

-- ============================================================================
-- INV SCHEMA - Inventory and Product Management
-- ============================================================================

-- Products
CREATE TABLE inv.prd (
    prd_id INT NOT NULL,
    cat_id INT,                    -- FK to cat
    sup_id INT,                    -- FK to sup
    sku VARCHAR(50),               -- SKU
    nm VARCHAR(100),
    dsc VARCHAR(500),
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
    nm VARCHAR(100),
    dsc VARCHAR(500),
    lvl INT,                       -- Category level (1=top, 2=sub, etc.)
    seq INT                        -- Display sequence
);

-- Suppliers
CREATE TABLE inv.sup (
    sup_id INT NOT NULL,
    nm VARCHAR(100),
    sts CHAR(1),                   -- A=Active, I=Inactive
    pmt_trm CHAR(3),
    rtg SMALLINT,                  -- Rating 1-5
    cnt_nm VARCHAR(100),           -- Contact name
    cnt_phn VARCHAR(20),
    cnt_eml VARCHAR(100)
);

-- Warehouses
CREATE TABLE inv.whs (
    whs_id INT NOT NULL,
    cd CHAR(3),                    -- Code: CHI, NYC, LAX, etc.
    nm VARCHAR(100),
    cty VARCHAR(50),
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
    notes VARCHAR(500)
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
    notes VARCHAR(500)
);

-- Inventory Adjustments
CREATE TABLE inv.adj (
    adj_id INT NOT NULL,
    prd_id INT,                    -- FK to prd
    whs_id INT,                    -- FK to whs
    adj_dt DATE,
    qty INT,                       -- Can be negative!
    rsn CHAR(3),                   -- DAM=Damaged, STL=Stolen, EXP=Expired, COR=Correction
    usr VARCHAR(50),
    notes VARCHAR(500)
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
    usr VARCHAR(50)
);

-- ============================================================================
-- INSERT REALISTIC, VOLUMINOUS DATA
-- ============================================================================

-- Real customer first/last names for generating realistic data
CREATE TEMPORARY TABLE temp_first_names (name VARCHAR(50));
INSERT INTO temp_first_names VALUES
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

CREATE TEMPORARY TABLE temp_last_names (name VARCHAR(50));
INSERT INTO temp_last_names VALUES
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

CREATE TEMPORARY TABLE temp_company_types (suffix VARCHAR(20));
INSERT INTO temp_company_types VALUES
('Inc'),('LLC'),('Corp'),('Co'),('Ltd'),('Group'),('Industries'),('Enterprises'),('Solutions'),('Partners'),
('Associates'),('Ventures'),('Holdings'),('Systems'),('Technologies'),('Services'),('Company'),('International'),
('Global'),('Worldwide'),('Distributors'),('Supply'),('Wholesale'),('Retail'),('Trading');

CREATE TEMPORARY TABLE temp_cities (name VARCHAR(50), state CHAR(2));
INSERT INTO temp_cities VALUES
('New York','NY'),('Los Angeles','CA'),('Chicago','IL'),('Houston','TX'),('Phoenix','AZ'),
('Philadelphia','PA'),('San Antonio','TX'),('San Diego','CA'),('Dallas','TX'),('San Jose','CA'),
('Austin','TX'),('Jacksonville','FL'),('Fort Worth','TX'),('Columbus','OH'),('Indianapolis','IN'),
('Charlotte','NC'),('San Francisco','CA'),('Seattle','WA'),('Denver','CO'),('Boston','MA'),
('Nashville','TN'),('Detroit','MI'),('Portland','OR'),('Las Vegas','NV'),('Miami','FL'),
('Atlanta','GA'),('Minneapolis','MN'),('Phoenix','AZ'),('Tampa','FL'),('St. Louis','MO');

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
-- PRODUCTS (200 realistic products using PL/pgSQL)
-- ============================================================================
DO $$
DECLARE
    counter INT := 1;
    cat INT;
    sup INT;
    sku_val VARCHAR(50);
    price DECIMAL(10,2);
    cost_val DECIMAL(10,2);
    weight DECIMAL(8,2);
    status CHAR(1);
    uom_val CHAR(2);
BEGIN
    WHILE counter <= 200 LOOP
        cat := CASE
            WHEN counter <= 40 THEN 2
            WHEN counter <= 80 THEN 3
            WHEN counter <= 100 THEN 13
            WHEN counter <= 120 THEN 5
            WHEN counter <= 140 THEN 6
            WHEN counter <= 150 THEN 8
            WHEN counter <= 160 THEN 9
            WHEN counter <= 170 THEN 11
            WHEN counter <= 180 THEN 12
            WHEN counter <= 190 THEN 14
            ELSE 15
        END;

        sup := ((counter % 25) + 1);
        sku_val := 'SKU-' || LPAD(counter::TEXT, 4, '0');
        price := 25.99 + ((counter % 100) * 12.50);
        cost_val := price * 0.60;
        weight := CASE
            WHEN cat IN (2,5,6,11) THEN (counter % 50) + 10.0
            WHEN cat IN (9,14) THEN (counter % 5) * 0.1 + 0.1
            ELSE (counter % 10) + 1.0
        END;
        status := CASE
            WHEN counter % 25 = 0 THEN 'D'
            WHEN counter % 20 = 0 THEN 'O'
            ELSE 'A'
        END;
        uom_val := CASE cat
            WHEN 8 THEN 'CS'
            WHEN 9 THEN 'BX'
            ELSE 'EA'
        END;

        INSERT INTO inv.prd (prd_id, cat_id, sup_id, sku, nm, dsc, prc, cost, sts, wgt, uom)
        VALUES (
            counter,
            cat,
            sup,
            sku_val,
            'Product ' || counter,
            'Description for product ' || counter,
            price,
            cost_val,
            status,
            weight,
            uom_val
        );

        counter := counter + 1;
    END LOOP;
END $$;

-- ============================================================================
-- CUSTOMERS (500 realistic customers)
-- ============================================================================
DO $$
DECLARE
    counter INT := 1;
    cst_name VARCHAR(100);
    cst_status CHAR(1);
    cst_source CHAR(2);
    cst_segment CHAR(1);
    cst_rating SMALLINT;
    cst_balance DECIMAL(10,2);
    cst_credit DECIMAL(10,2);
    cst_date DATE;
    cst_last_order DATE;
BEGIN
    WHILE counter <= 500 LOOP
        cst_name := 'Customer ' || counter;

        cst_status := CASE
            WHEN counter % 50 = 0 THEN 'T'
            WHEN counter % 30 = 0 THEN 'I'
            WHEN counter % 20 = 0 THEN 'S'
            ELSE 'A'
        END;

        cst_source := CASE (counter % 4)
            WHEN 0 THEN 'WB'
            WHEN 1 THEN 'PH'
            WHEN 2 THEN 'ST'
            ELSE 'RF'
        END;

        cst_segment := CASE
            WHEN counter % 10 < 2 THEN 'E'
            WHEN counter % 10 < 6 THEN 'W'
            ELSE 'R'
        END;

        cst_rating := ((counter % 5) + 1);

        cst_balance := CASE
            WHEN counter % 10 < 3 THEN (counter % 100) * 50.0 + RANDOM() * 1000
            ELSE 0.00
        END;

        cst_credit := CASE cst_segment
            WHEN 'E' THEN 50000 + (counter % 50) * 1000.0
            WHEN 'W' THEN 20000 + (counter % 30) * 500.0
            ELSE 5000 + (counter % 20) * 250.0
        END;

        cst_date := '2025-01-01'::DATE - ((counter % 1825) || ' days')::INTERVAL;

        cst_last_order := CASE
            WHEN counter % 5 = 0 THEN NULL
            ELSE '2025-01-01'::DATE - ((counter % 365) || ' days')::INTERVAL
        END;

        INSERT INTO sales.cst (cst_id, nm, sts, dt, src, rep_id, seg, rtg, bal, cr_lmt, lst_ord)
        VALUES (
            counter,
            cst_name,
            cst_status,
            cst_date,
            cst_source,
            ((counter % 15) + 1),
            cst_segment,
            cst_rating,
            cst_balance,
            cst_credit,
            cst_last_order
        );

        counter := counter + 1;
    END LOOP;
END $$;

-- ============================================================================
-- ORDERS (2000 orders)
-- ============================================================================
DO $$
DECLARE
    counter INT := 1;
BEGIN
    WHILE counter <= 2000 LOOP
        INSERT INTO sales.ord (ord_id, cst_id, ord_dt, ship_dt, sts, tot, tax, ship_amt, disc_pct, pmt_trm, notes)
        VALUES (
            counter,
            CASE WHEN counter % 20 = 0 THEN 9999 ELSE ((counter % 500) + 1) END,
            '2025-01-01'::DATE - ((counter % 730) || ' days')::INTERVAL,
            CASE WHEN counter % 3 = 0 THEN NULL ELSE '2025-01-01'::DATE - (((counter % 730) - 3) || ' days')::INTERVAL END,
            CASE (counter % 10) WHEN 0 THEN 'P' WHEN 1 THEN 'C' WHEN 9 THEN 'X' ELSE 'D' END,
            50.00 + (counter % 100) * 99.50,
            (50.00 + (counter % 100) * 99.50) * 0.08,
            CASE WHEN (50.00 + (counter % 100) * 99.50) > 1000 THEN 0 ELSE 25.00 END,
            CASE WHEN counter % 10 = 0 THEN 10.00 ELSE 0.00 END,
            CASE (counter % 4) WHEN 0 THEN 'N30' WHEN 1 THEN 'N60' WHEN 2 THEN 'N45' ELSE 'COD' END,
            NULL
        );
        counter := counter + 1;
    END LOOP;
END $$;

-- ============================================================================
-- ORDER LINE ITEMS (~6000 items)
-- ============================================================================
DO $$
DECLARE
    ord_counter INT := 1;
    oli_counter INT := 1;
    line_num INT;
    items_in_order INT;
BEGIN
    WHILE ord_counter <= 2000 LOOP
        items_in_order := ((ord_counter % 6) + 1);
        line_num := 1;

        WHILE line_num <= items_in_order LOOP
            INSERT INTO sales.oli (oli_id, ord_id, prd_id, qty, prc, disc, tax_amt, seq)
            VALUES (
                oli_counter,
                ord_counter,
                ((oli_counter % 200) + 1),
                ((oli_counter % 10) + 1),
                25.99 + ((oli_counter % 100) * 12.50),
                0.00,
                (25.99 + ((oli_counter % 100) * 12.50)) * 0.08,
                line_num
            );
            oli_counter := oli_counter + 1;
            line_num := line_num + 1;
        END LOOP;

        ord_counter := ord_counter + 1;
    END LOOP;
END $$;

-- ============================================================================
-- PAYMENTS (2200 payments)
-- ============================================================================
DO $$
DECLARE
    counter INT := 1;
BEGIN
    WHILE counter <= 2200 LOOP
        INSERT INTO sales.pmt (pmt_id, ord_id, cst_id, pmt_dt, amt, mthd, sts, ref, notes)
        VALUES (
            counter,
            CASE WHEN counter % 10 = 0 THEN NULL ELSE ((counter % 2000) + 1) END,
            ((counter % 500) + 1),
            '2025-01-01'::DATE - (((counter % 730) - 1) || ' days')::INTERVAL,
            100.00 + (counter % 500) * 20.0,
            CASE (counter % 4) WHEN 0 THEN 'CC' WHEN 1 THEN 'CK' WHEN 2 THEN 'WR' ELSE 'CA' END,
            CASE WHEN counter % 20 = 0 THEN 'F' WHEN counter % 25 = 0 THEN 'R' WHEN counter % 10 = 0 THEN 'P' ELSE 'A' END,
            'PMT-2024-' || LPAD(counter::TEXT, 5, '0'),
            CASE WHEN counter % 10 = 0 THEN 'Account credit applied' ELSE NULL END
        );
        counter := counter + 1;
    END LOOP;
END $$;

-- ============================================================================
-- STOCK LEVELS (~1200 combinations)
-- ============================================================================
DO $$
DECLARE
    prd_counter INT := 1;
    whs_counter INT;
BEGIN
    WHILE prd_counter <= 200 LOOP
        whs_counter := 1;
        WHILE whs_counter <= 8 LOOP
            IF (prd_counter + whs_counter) % 10 < 7 THEN
                INSERT INTO inv.stk (prd_id, whs_id, qty, rsv, min_qty, max_qty, lst_cnt, lst_rcv)
                VALUES (
                    prd_counter,
                    whs_counter,
                    ((prd_counter % 100) + 1) * (whs_counter + 5) * 10,
                    CASE WHEN ((prd_counter % 100) + 1) * (whs_counter + 5) * 10 > 100 THEN ((prd_counter % 100) + 1) * (whs_counter + 5) ELSE 0 END,
                    (prd_counter % 50) + 10,
                    ((prd_counter % 50) + 10) * 20,
                    '2025-01-01'::DATE - (((prd_counter + whs_counter) % 90) || ' days')::INTERVAL,
                    '2025-01-01'::DATE - (((prd_counter + whs_counter) % 30) || ' days')::INTERVAL
                );
            END IF;
            whs_counter := whs_counter + 1;
        END LOOP;
        prd_counter := prd_counter + 1;
    END LOOP;
END $$;

-- ============================================================================
-- PURCHASE ORDERS (150 POs)
-- ============================================================================
DO $$
DECLARE
    counter INT := 1;
BEGIN
    WHILE counter <= 150 LOOP
        INSERT INTO inv.po (po_id, sup_id, po_dt, exp_dt, sts, tot, ship_amt, notes)
        VALUES (
            counter,
            ((counter % 25) + 1),
            '2025-01-01'::DATE - ((counter % 730) || ' days')::INTERVAL,
            '2025-01-01'::DATE - (((counter % 730) - 14) || ' days')::INTERVAL,
            CASE (counter % 5) WHEN 0 THEN 'P' WHEN 1 THEN 'A' WHEN 2 THEN 'S' WHEN 3 THEN 'R' ELSE 'X' END,
            2000.00 + (counter % 100) * 150.0,
            CASE WHEN (2000.00 + (counter % 100) * 150.0) > 10000 THEN 0.00 ELSE 150.00 END,
            NULL
        );
        counter := counter + 1;
    END LOOP;
END $$;

-- Clean up temporary tables
DROP TABLE IF EXISTS temp_first_names;
DROP TABLE IF EXISTS temp_last_names;
DROP TABLE IF EXISTS temp_company_types;
DROP TABLE IF EXISTS temp_cities;

-- Display summary
DO $$
BEGIN
    RAISE NOTICE '==========================================================================';
    RAISE NOTICE 'LousyDB (PostgreSQL) created successfully with REALISTIC, VOLUMINOUS DATA!';
    RAISE NOTICE '==========================================================================';
    RAISE NOTICE 'Schemas: sales, inv';
    RAISE NOTICE 'Tables: 20';
    RAISE NOTICE '';
    RAISE NOTICE 'DATA SUMMARY:';
    RAISE NOTICE '  - Customers: 500';
    RAISE NOTICE '  - Products: 200';
    RAISE NOTICE '  - Categories: 20';
    RAISE NOTICE '  - Suppliers: 25';
    RAISE NOTICE '  - Warehouses: 8';
    RAISE NOTICE '  - Orders: 2,000';
    RAISE NOTICE '  - Order Line Items: ~6,000';
    RAISE NOTICE '  - Payments: 2,200';
    RAISE NOTICE '  - Stock Levels: ~1,200';
    RAISE NOTICE '  - Purchase Orders: 150';
    RAISE NOTICE '';
    RAISE NOTICE 'METADATA: NO PRIMARY KEYS or FOREIGN KEYS defined!';
    RAISE NOTICE 'Perfect for testing Relationship Discovery!';
    RAISE NOTICE '==========================================================================';
END $$;
