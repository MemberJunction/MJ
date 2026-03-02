-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS sample_lib;
SET search_path TO sample_lib, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER → BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER→bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

-- TODO: Review conditional DDL
-- /*
--  * Sample Library Management Migration (T-SQL)
--  * Schema: sample_lib
--  * 8 tables, 4 views, CHECK constraints (inline + ALTER TABLE),
--  * extended properties, GRANT/ROLE, 120+ seed rows.
--  * SQL constructs: DATEDIFF, ISNULL, GETUTCDATE(), YEAR(), COALESCE,
--  *                 CASE WHEN, COUNT, SUM, AVG, LEFT JOIN, LEN
--  */
-- 
-- -- ============================================================
-- -- Schema
-- -- ============================================================
-- IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sample_lib')
--     EXEC('CREATE SCHEMA sample_lib');


-- ============================================================
-- Tables
-- ============================================================

-- Branch
CREATE TABLE sample_lib."Branch" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Address" VARCHAR(300) NOT NULL,
 "City" VARCHAR(100) NOT NULL,
 "State" VARCHAR(2) NOT NULL,
 "ZipCode" VARCHAR(10) NOT NULL,
 "Phone" VARCHAR(20) NOT NULL,
 "Email" VARCHAR(255) NULL,
 "OpeningYear" SMALLINT NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT PK_Branch PRIMARY KEY ("ID")
);

-- Genre
CREATE TABLE sample_lib."Genre" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "Description" VARCHAR(500) NULL,
 CONSTRAINT PK_Genre PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Genre_Name UNIQUE ("Name")
);

-- Author
CREATE TABLE sample_lib."Author" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "BirthYear" SMALLINT NULL,
 "Nationality" VARCHAR(100) NULL,
 "Bio" TEXT NULL,
 CONSTRAINT PK_Author PRIMARY KEY ("ID")
);

-- Book
CREATE TABLE sample_lib."Book" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ISBN" VARCHAR(13) NOT NULL,
 "Title" VARCHAR(300) NOT NULL,
 "PublicationYear" SMALLINT NOT NULL,
 "Publisher" VARCHAR(200) NOT NULL,
 "PageCount" INTEGER NULL CHECK ("PageCount" > 0),
 "Language" VARCHAR(30) NOT NULL DEFAULT 'English',
 "GenreID" UUID NOT NULL,
 "AuthorID" UUID NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "AddedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_Book PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Book_ISBN UNIQUE ("ISBN"),
 CONSTRAINT FK_Book_Genre FOREIGN KEY ("GenreID") REFERENCES sample_lib."Genre"("ID"),
 CONSTRAINT FK_Book_Author FOREIGN KEY ("AuthorID") REFERENCES sample_lib."Author"("ID")
);

-- BookCopy
CREATE TABLE sample_lib."BookCopy" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "BookID" UUID NOT NULL,
 "BranchID" UUID NOT NULL,
 "Barcode" VARCHAR(30) NOT NULL,
 "Condition" VARCHAR(20) NOT NULL DEFAULT 'Good' CHECK ("Condition" IN ('New', 'Good', 'Fair', 'Poor', 'Damaged')),
 "AcquiredDate" DATE NOT NULL DEFAULT NOW(),
 "IsAvailable" BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT PK_BookCopy PRIMARY KEY ("ID"),
 CONSTRAINT UQ_BookCopy_Barcode UNIQUE ("Barcode"),
 CONSTRAINT FK_BookCopy_Book FOREIGN KEY ("BookID") REFERENCES sample_lib."Book"("ID"),
 CONSTRAINT FK_BookCopy_Branch FOREIGN KEY ("BranchID") REFERENCES sample_lib."Branch"("ID")
);

-- Patron
CREATE TABLE sample_lib."Patron" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "CardNumber" VARCHAR(20) NOT NULL,
 "FirstName" VARCHAR(100) NOT NULL,
 "LastName" VARCHAR(100) NOT NULL,
 "Email" VARCHAR(255) NULL,
 "Phone" VARCHAR(20) NULL,
 "DateOfBirth" DATE NULL,
 "Address" VARCHAR(300) NULL,
 "JoinDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "HomeBranchID" UUID NOT NULL,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "MaxCheckouts" INTEGER NOT NULL DEFAULT 10 CHECK ("MaxCheckouts" BETWEEN 1 AND 50),
 "FinesOwed" DECIMAL(8,2) NOT NULL DEFAULT 0 CHECK ("FinesOwed" >= 0),
 CONSTRAINT PK_Patron PRIMARY KEY ("ID"),
 CONSTRAINT UQ_Patron_CardNumber UNIQUE ("CardNumber"),
 CONSTRAINT FK_Patron_Branch FOREIGN KEY ("HomeBranchID") REFERENCES sample_lib."Branch"("ID")
);

-- Checkout
CREATE TABLE sample_lib."Checkout" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "BookCopyID" UUID NOT NULL,
 "PatronID" UUID NOT NULL,
 "CheckoutDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "DueDate" DATE NOT NULL,
 "ReturnDate" TIMESTAMPTZ NULL,
 "IsReturned" BOOLEAN NOT NULL DEFAULT FALSE,
 "LateFee" DECIMAL(6,2) NOT NULL DEFAULT 0 CHECK ("LateFee" >= 0),
 CONSTRAINT PK_Checkout PRIMARY KEY ("ID"),
 CONSTRAINT FK_Checkout_BookCopy FOREIGN KEY ("BookCopyID") REFERENCES sample_lib."BookCopy"("ID"),
 CONSTRAINT FK_Checkout_Patron FOREIGN KEY ("PatronID") REFERENCES sample_lib."Patron"("ID")
);

-- Fine
CREATE TABLE sample_lib."Fine" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PatronID" UUID NOT NULL,
 "CheckoutID" UUID NULL,
 "Amount" DECIMAL(6,2) NOT NULL CHECK ("Amount" > 0),
 "Reason" VARCHAR(200) NOT NULL,
 "IssuedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "PaidAt" TIMESTAMPTZ NULL,
 "IsPaid" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT PK_Fine PRIMARY KEY ("ID"),
 CONSTRAINT FK_Fine_Patron FOREIGN KEY ("PatronID") REFERENCES sample_lib."Patron"("ID"),
 CONSTRAINT FK_Fine_Checkout FOREIGN KEY ("CheckoutID") REFERENCES sample_lib."Checkout"("ID")
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'LibraryReadOnly') THEN
        CREATE ROLE "LibraryReadOnly";
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW sample_lib.vwAvailableBooks AS SELECT
    b."ID" AS "BookID",
    b."Title",
    b."ISBN",
    a."FirstName" || ' ' || a."LastName" AS "AuthorName",
    g."Name" AS "GenreName",
    br."ID" AS "BranchID",
    br."Name" AS "BranchName",
    COUNT(bc."ID") AS "AvailableCopies",
    CASE WHEN LENGTH(b."Title") > 50 THEN 'Long Title' ELSE 'Short Title' END AS "TitleLength"
FROM sample_lib."Book" b
INNER JOIN sample_lib."Author" a ON a."ID" = b."AuthorID"
INNER JOIN sample_lib."Genre" g ON g."ID" = b."GenreID"
INNER JOIN sample_lib."BookCopy" bc ON bc."BookID" = b."ID" AND bc."IsAvailable" = 1
INNER JOIN sample_lib."Branch" br ON br."ID" = bc."BranchID"
WHERE b."IsActive" = 1
GROUP BY b."ID", b."Title", b."ISBN", a."FirstName", a."LastName", g."Name", br."ID", br."Name";

CREATE OR REPLACE VIEW sample_lib.vwOverdueCheckouts AS SELECT
    c."ID" AS "CheckoutID",
    p."FirstName" || ' ' || p."LastName" AS "PatronName",
    p."CardNumber",
    bk."Title" AS "BookTitle",
    bk."ISBN",
    bc."Barcode",
    br."Name" AS "BranchName",
    c."CheckoutDate",
    c."DueDate",
    EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - c."DueDate"::TIMESTAMPTZ)) AS "DaysOverdue",
    CASE
        WHEN EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - c."DueDate"::TIMESTAMPTZ)) > 30 THEN 'Severely Overdue'
        WHEN EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - c."DueDate"::TIMESTAMPTZ)) > 14 THEN 'Very Overdue'
        ELSE 'Overdue'
    END AS "OverdueStatus"
FROM sample_lib."Checkout" c
INNER JOIN sample_lib."Patron" p ON p."ID" = c."PatronID"
INNER JOIN sample_lib."BookCopy" bc ON bc."ID" = c."BookCopyID"
INNER JOIN sample_lib."Book" bk ON bk."ID" = bc."BookID"
INNER JOIN sample_lib."Branch" br ON br."ID" = bc."BranchID"
WHERE c."IsReturned" = 0 AND c."DueDate" < NOW();

CREATE OR REPLACE VIEW sample_lib.vwPatronHistory AS SELECT
    p."ID" AS "PatronID",
    p."CardNumber",
    p."FirstName" || ' ' || p."LastName" AS "PatronName",
    COALESCE(p."Email", 'No email on file') AS "Email",
    br."Name" AS "HomeBranch",
    EXTRACT(YEAR FROM p."JoinDate") AS "JoinYear",
    COALESCE(total."TotalCheckouts", 0) AS "TotalCheckouts",
    COALESCE(current_co."CurrentCheckouts", 0) AS "CurrentCheckouts",
    COALESCE(overdue."OverdueCount", 0) AS "OverdueCount",
    COALESCE(fines."TotalFines", 0) AS "TotalFines",
    COALESCE(fines."UnpaidFines", 0) AS "UnpaidFines",
    p."FinesOwed",
    p."MaxCheckouts",
    CASE WHEN p."IsActive" = 1 THEN 'Active' ELSE 'Inactive' END AS "Status"
FROM sample_lib."Patron" p
INNER JOIN sample_lib."Branch" br ON br."ID" = p."HomeBranchID"
LEFT JOIN (
    SELECT "PatronID", COUNT(*) AS "TotalCheckouts"
    FROM sample_lib."Checkout"
    GROUP BY "PatronID"
) total ON total."PatronID" = p."ID"
LEFT JOIN (
    SELECT "PatronID", COUNT(*) AS "CurrentCheckouts"
    FROM sample_lib."Checkout"
    WHERE "IsReturned" = 0
    GROUP BY "PatronID"
) current_co ON current_co."PatronID" = p."ID"
LEFT JOIN (
    SELECT "PatronID", COUNT(*) AS "OverdueCount"
    FROM sample_lib."Checkout"
    WHERE "IsReturned" = 0 AND "DueDate" < NOW()
    GROUP BY "PatronID"
) overdue ON overdue."PatronID" = p."ID"
LEFT JOIN (
    SELECT "PatronID",
           SUM("Amount") AS "TotalFines",
           SUM(CASE WHEN "IsPaid" = 0 THEN "Amount" ELSE 0 END) AS "UnpaidFines"
    FROM sample_lib."Fine"
    GROUP BY "PatronID"
) fines ON fines."PatronID" = p."ID";

CREATE OR REPLACE VIEW sample_lib.vwPopularBooks AS SELECT
    bk."ID" AS "BookID",
    bk."Title",
    bk."ISBN",
    a."FirstName" || ' ' || a."LastName" AS "AuthorName",
    g."Name" AS "GenreName",
    bk."PublicationYear",
    bk."Publisher",
    COUNT(c."ID") AS "TotalCheckouts",
    AVG(
        CASE
            WHEN c."ReturnDate" IS NOT NULL THEN EXTRACT(DAY FROM (c."ReturnDate"::TIMESTAMPTZ - c."CheckoutDate"::TIMESTAMPTZ))
            ELSE EXTRACT(DAY FROM (NOW()::TIMESTAMPTZ - c."CheckoutDate"::TIMESTAMPTZ))
        END
    ) AS "AvgDaysHeld",
    SUM(COALESCE(c."LateFee", 0)) AS "TotalLateFees"
FROM sample_lib."Book" bk
INNER JOIN sample_lib."Author" a ON a."ID" = bk."AuthorID"
INNER JOIN sample_lib."Genre" g ON g."ID" = bk."GenreID"
LEFT JOIN sample_lib."BookCopy" bc ON bc."BookID" = bk."ID"
LEFT JOIN sample_lib."Checkout" c ON c."BookCopyID" = bc."ID"
GROUP BY bk."ID", bk."Title", bk."ISBN", a."FirstName", a."LastName", g."Name", bk."PublicationYear", bk."Publisher";


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- ============================================================
-- Seed Data
-- ============================================================

-- Branches (4)
INSERT INTO sample_lib."Branch" ("ID", "Name", "Address", "City", "State", "ZipCode", "Phone", "Email", "OpeningYear", "IsActive") VALUES
    ('A0000001-0001-0001-0001-000000000001', 'Downtown Central Library', '100 Main Street', 'Springfield', 'IL', '62701', '217-555-0100', 'central@springlib.org', 1952, 1),
    ('A0000001-0001-0001-0001-000000000002', 'Westside Branch', '450 Oak Avenue', 'Springfield', 'IL', '62704', '217-555-0200', 'west@springlib.org', 1978, 1),
    ('A0000001-0001-0001-0001-000000000003', 'Eastgate Reading Center', '820 Elm Boulevard', 'Springfield', 'IL', '62702', '217-555-0300', NULL, 1995, 1),
    ('A0000001-0001-0001-0001-000000000004', 'Northfield Community Library', '1200 Pine Road', 'Springfield', 'IL', '62707', '217-555-0400', 'north@springlib.org', 2010, 1);

-- Genres (8)
INSERT INTO sample_lib."Genre" ("ID", "Name", "Description") VALUES
    ('B0000001-0001-0001-0001-000000000001', 'Fiction', 'Novels, short stories, and literary fiction'),
    ('B0000001-0001-0001-0001-000000000002', 'Science Fiction', 'Speculative fiction involving futuristic concepts'),
    ('B0000001-0001-0001-0001-000000000003', 'Mystery', 'Crime fiction and detective stories'),
    ('B0000001-0001-0001-0001-000000000004', 'Non-Fiction', 'Factual and informational works'),
    ('B0000001-0001-0001-0001-000000000005', 'Biography', 'Life stories of notable individuals'),
    ('B0000001-0001-0001-0001-000000000006', 'History', 'Historical accounts and analysis'),
    ('B0000001-0001-0001-0001-000000000007', 'Children', 'Books for young readers'),
    ('B0000001-0001-0001-0001-000000000008', 'Technology', 'Computing, engineering, and technical subjects');

-- Authors (10)
INSERT INTO sample_lib."Author" ("ID", "FirstName", "LastName", "BirthYear", "Nationality", "Bio") VALUES
    ('C0000001-0001-0001-0001-000000000001', 'Harper', 'Lee', 1926, 'American', 'Author of To Kill a Mockingbird'),
    ('C0000001-0001-0001-0001-000000000002', 'George', 'Orwell', 1903, 'British', 'Known for 1984 and Animal Farm'),
    ('C0000001-0001-0001-0001-000000000003', 'Agatha', 'Christie', 1890, 'British', 'Queen of mystery fiction'),
    ('C0000001-0001-0001-0001-000000000004', 'Isaac', 'Asimov', 1920, 'American', 'Prolific science fiction and popular science author'),
    ('C0000001-0001-0001-0001-000000000005', 'Jane', 'Austen', 1775, 'British', 'Author of Pride and Prejudice'),
    ('C0000001-0001-0001-0001-000000000006', 'Mark', 'Twain', 1835, 'American', 'Author of Adventures of Huckleberry Finn'),
    ('C0000001-0001-0001-0001-000000000007', 'Walter', 'Isaacson', 1952, 'American', 'Acclaimed biographer and journalist'),
    ('C0000001-0001-0001-0001-000000000008', 'Yuval Noah', 'Harari', 1976, 'Israeli', 'Author of Sapiens and Homo Deus'),
    ('C0000001-0001-0001-0001-000000000009', 'Roald', 'Dahl', 1916, 'British', 'Beloved children''s author'),
    ('C0000001-0001-0001-0001-000000000010', 'Martin', 'Fowler', 1963, 'British', 'Software engineering thought leader');

-- Books (20)
INSERT INTO sample_lib."Book" ("ID", "ISBN", "Title", "PublicationYear", "Publisher", "PageCount", "Language", "GenreID", "AuthorID") VALUES
    ('D0000001-0001-0001-0001-000000000001', '9780061120084', 'To Kill a Mockingbird', 1960, 'Harper Perennial', 336, 'English', 'B0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000001'),
    ('D0000001-0001-0001-0001-000000000002', '9780451524935', '1984', 1949, 'Signet Classics', 328, 'English', 'B0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000002'),
    ('D0000001-0001-0001-0001-000000000003', '9780451526342', 'Animal Farm', 1945, 'Signet Classics', 141, 'English', 'B0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000002'),
    ('D0000001-0001-0001-0001-000000000004', '9780062073488', 'Murder on the Orient Express', 1934, 'William Morrow', 274, 'English', 'B0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000003'),
    ('D0000001-0001-0001-0001-000000000005', '9780007136834', 'And Then There Were None', 1939, 'HarperCollins', 272, 'English', 'B0000001-0001-0001-0001-000000000003', 'C0000001-0001-0001-0001-000000000003'),
    ('D0000001-0001-0001-0001-000000000006', '9780553293357', 'Foundation', 1951, 'Bantam Books', 244, 'English', 'B0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000004'),
    ('D0000001-0001-0001-0001-000000000007', '9780553803716', 'I, Robot', 1950, 'Bantam Books', 224, 'English', 'B0000001-0001-0001-0001-000000000002', 'C0000001-0001-0001-0001-000000000004'),
    ('D0000001-0001-0001-0001-000000000008', '9780141439518', 'Pride and Prejudice', 1813, 'Penguin Classics', 432, 'English', 'B0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000005'),
    ('D0000001-0001-0001-0001-000000000009', '9780141439662', 'Sense and Sensibility', 1811, 'Penguin Classics', 409, 'English', 'B0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000005'),
    ('D0000001-0001-0001-0001-000000000010', '9780142437174', 'Adventures of Huckleberry Finn', 1884, 'Penguin Classics', 366, 'English', 'B0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000006'),
    ('D0000001-0001-0001-0001-000000000011', '9780143039433', 'The Adventures of Tom Sawyer', 1876, 'Penguin Classics', 244, 'English', 'B0000001-0001-0001-0001-000000000001', 'C0000001-0001-0001-0001-000000000006'),
    ('D0000001-0001-0001-0001-000000000012', '9781501127625', 'Steve Jobs', 2011, 'Simon and Schuster', 656, 'English', 'B0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000007'),
    ('D0000001-0001-0001-0001-000000000013', '9781982159061', 'Elon Musk', 2023, 'Simon and Schuster', 688, 'English', 'B0000001-0001-0001-0001-000000000005', 'C0000001-0001-0001-0001-000000000007'),
    ('D0000001-0001-0001-0001-000000000014', '9780062316097', 'Sapiens', 2015, 'Harper', 464, 'English', 'B0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000008'),
    ('D0000001-0001-0001-0001-000000000015', '9781784700621', 'Homo Deus', 2016, 'Vintage', 528, 'English', 'B0000001-0001-0001-0001-000000000006', 'C0000001-0001-0001-0001-000000000008'),
    ('D0000001-0001-0001-0001-000000000016', '9780142410363', 'Charlie and the Chocolate Factory', 1964, 'Puffin Books', 176, 'English', 'B0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000009'),
    ('D0000001-0001-0001-0001-000000000017', '9780142418222', 'Matilda', 1988, 'Puffin Books', 240, 'English', 'B0000001-0001-0001-0001-000000000007', 'C0000001-0001-0001-0001-000000000009'),
    ('D0000001-0001-0001-0001-000000000018', '9780201633610', 'Design Patterns', 1994, 'Addison-Wesley', 395, 'English', 'B0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000010'),
    ('D0000001-0001-0001-0001-000000000019', '9780134757599', 'Refactoring', 2018, 'Addison-Wesley', 448, 'English', 'B0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000010'),
    ('D0000001-0001-0001-0001-000000000020', '9780321125217', 'Patterns of Enterprise Application Architecture', 2002, 'Addison-Wesley', 560, 'English', 'B0000001-0001-0001-0001-000000000008', 'C0000001-0001-0001-0001-000000000010');

-- BookCopy (40 copies across branches)
INSERT INTO sample_lib."BookCopy" ("ID", "BookID", "BranchID", "Barcode", "Condition", "AcquiredDate", "IsAvailable") VALUES
    ('E0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000001', 'BC-0001-001', 'Good', '2020-01-15', 1),
    ('E0000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000001', 'A0000001-0001-0001-0001-000000000002', 'BC-0001-002', 'New', '2023-06-01', 1),
    ('E0000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000002', 'A0000001-0001-0001-0001-000000000001', 'BC-0002-001', 'Good', '2019-03-10', 0),
    ('E0000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000002', 'A0000001-0001-0001-0001-000000000003', 'BC-0002-002', 'Fair', '2018-07-20', 1),
    ('E0000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000003', 'A0000001-0001-0001-0001-000000000001', 'BC-0003-001', 'Good', '2020-05-01', 1),
    ('E0000001-0001-0001-0001-000000000006', 'D0000001-0001-0001-0001-000000000004', 'A0000001-0001-0001-0001-000000000002', 'BC-0004-001', 'Good', '2021-02-14', 0),
    ('E0000001-0001-0001-0001-000000000007', 'D0000001-0001-0001-0001-000000000004', 'A0000001-0001-0001-0001-000000000004', 'BC-0004-002', 'New', '2024-01-10', 1),
    ('E0000001-0001-0001-0001-000000000008', 'D0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000001', 'BC-0005-001', 'Good', '2019-11-05', 1),
    ('E0000001-0001-0001-0001-000000000009', 'D0000001-0001-0001-0001-000000000006', 'A0000001-0001-0001-0001-000000000001', 'BC-0006-001', 'Fair', '2017-08-22', 0),
    ('E0000001-0001-0001-0001-000000000010', 'D0000001-0001-0001-0001-000000000006', 'A0000001-0001-0001-0001-000000000003', 'BC-0006-002', 'Good', '2022-04-15', 1),
    ('E0000001-0001-0001-0001-000000000011', 'D0000001-0001-0001-0001-000000000007', 'A0000001-0001-0001-0001-000000000002', 'BC-0007-001', 'Good', '2020-09-30', 1),
    ('E0000001-0001-0001-0001-000000000012', 'D0000001-0001-0001-0001-000000000008', 'A0000001-0001-0001-0001-000000000001', 'BC-0008-001', 'Good', '2018-01-20', 0),
    ('E0000001-0001-0001-0001-000000000013', 'D0000001-0001-0001-0001-000000000008', 'A0000001-0001-0001-0001-000000000004', 'BC-0008-002', 'New', '2024-03-05', 1),
    ('E0000001-0001-0001-0001-000000000014', 'D0000001-0001-0001-0001-000000000009', 'A0000001-0001-0001-0001-000000000002', 'BC-0009-001', 'Good', '2021-06-18', 1),
    ('E0000001-0001-0001-0001-000000000015', 'D0000001-0001-0001-0001-000000000010', 'A0000001-0001-0001-0001-000000000001', 'BC-0010-001', 'Fair', '2016-12-01', 1),
    ('E0000001-0001-0001-0001-000000000016', 'D0000001-0001-0001-0001-000000000010', 'A0000001-0001-0001-0001-000000000003', 'BC-0010-002', 'Good', '2022-08-10', 0),
    ('E0000001-0001-0001-0001-000000000017', 'D0000001-0001-0001-0001-000000000011', 'A0000001-0001-0001-0001-000000000001', 'BC-0011-001', 'Good', '2019-04-25', 1),
    ('E0000001-0001-0001-0001-000000000018', 'D0000001-0001-0001-0001-000000000012', 'A0000001-0001-0001-0001-000000000002', 'BC-0012-001', 'Good', '2021-10-12', 0),
    ('E0000001-0001-0001-0001-000000000019', 'D0000001-0001-0001-0001-000000000012', 'A0000001-0001-0001-0001-000000000004', 'BC-0012-002', 'New', '2024-02-28', 1),
    ('E0000001-0001-0001-0001-000000000020', 'D0000001-0001-0001-0001-000000000013', 'A0000001-0001-0001-0001-000000000001', 'BC-0013-001', 'New', '2024-01-15', 1),
    ('E0000001-0001-0001-0001-000000000021', 'D0000001-0001-0001-0001-000000000014', 'A0000001-0001-0001-0001-000000000001', 'BC-0014-001', 'Good', '2020-07-20', 0),
    ('E0000001-0001-0001-0001-000000000022', 'D0000001-0001-0001-0001-000000000014', 'A0000001-0001-0001-0001-000000000003', 'BC-0014-002', 'Good', '2022-01-05', 1),
    ('E0000001-0001-0001-0001-000000000023', 'D0000001-0001-0001-0001-000000000015', 'A0000001-0001-0001-0001-000000000002', 'BC-0015-001', 'Good', '2021-11-30', 1),
    ('E0000001-0001-0001-0001-000000000024', 'D0000001-0001-0001-0001-000000000016', 'A0000001-0001-0001-0001-000000000001', 'BC-0016-001', 'Good', '2019-06-15', 1),
    ('E0000001-0001-0001-0001-000000000025', 'D0000001-0001-0001-0001-000000000016', 'A0000001-0001-0001-0001-000000000004', 'BC-0016-002', 'Fair', '2020-12-01', 0),
    ('E0000001-0001-0001-0001-000000000026', 'D0000001-0001-0001-0001-000000000017', 'A0000001-0001-0001-0001-000000000002', 'BC-0017-001', 'New', '2023-09-10', 1),
    ('E0000001-0001-0001-0001-000000000027', 'D0000001-0001-0001-0001-000000000017', 'A0000001-0001-0001-0001-000000000003', 'BC-0017-002', 'Good', '2021-03-22', 1),
    ('E0000001-0001-0001-0001-000000000028', 'D0000001-0001-0001-0001-000000000018', 'A0000001-0001-0001-0001-000000000001', 'BC-0018-001', 'Fair', '2015-05-10', 1),
    ('E0000001-0001-0001-0001-000000000029', 'D0000001-0001-0001-0001-000000000018', 'A0000001-0001-0001-0001-000000000002', 'BC-0018-002', 'Good', '2021-07-14', 0),
    ('E0000001-0001-0001-0001-000000000030', 'D0000001-0001-0001-0001-000000000019', 'A0000001-0001-0001-0001-000000000001', 'BC-0019-001', 'New', '2024-04-01', 1),
    ('E0000001-0001-0001-0001-000000000031', 'D0000001-0001-0001-0001-000000000019', 'A0000001-0001-0001-0001-000000000003', 'BC-0019-002', 'Good', '2022-10-20', 0),
    ('E0000001-0001-0001-0001-000000000032', 'D0000001-0001-0001-0001-000000000020', 'A0000001-0001-0001-0001-000000000001', 'BC-0020-001', 'Good', '2019-02-28', 1),
    ('E0000001-0001-0001-0001-000000000033', 'D0000001-0001-0001-0001-000000000020', 'A0000001-0001-0001-0001-000000000004', 'BC-0020-002', 'New', '2024-05-10', 1),
    ('E0000001-0001-0001-0001-000000000034', 'D0000001-0001-0001-0001-000000000003', 'A0000001-0001-0001-0001-000000000003', 'BC-0003-002', 'Good', '2021-01-10', 1),
    ('E0000001-0001-0001-0001-000000000035', 'D0000001-0001-0001-0001-000000000005', 'A0000001-0001-0001-0001-000000000002', 'BC-0005-002', 'New', '2023-11-15', 0),
    ('E0000001-0001-0001-0001-000000000036', 'D0000001-0001-0001-0001-000000000007', 'A0000001-0001-0001-0001-000000000004', 'BC-0007-002', 'Good', '2022-06-20', 1),
    ('E0000001-0001-0001-0001-000000000037', 'D0000001-0001-0001-0001-000000000011', 'A0000001-0001-0001-0001-000000000002', 'BC-0011-002', 'Fair', '2018-03-05', 1),
    ('E0000001-0001-0001-0001-000000000038', 'D0000001-0001-0001-0001-000000000013', 'A0000001-0001-0001-0001-000000000003', 'BC-0013-002', 'New', '2024-06-01', 0),
    ('E0000001-0001-0001-0001-000000000039', 'D0000001-0001-0001-0001-000000000015', 'A0000001-0001-0001-0001-000000000004', 'BC-0015-002', 'Good', '2023-01-18', 1),
    ('E0000001-0001-0001-0001-000000000040', 'D0000001-0001-0001-0001-000000000009', 'A0000001-0001-0001-0001-000000000004', 'BC-0009-002', 'New', '2024-07-01', 1);

-- Patrons (15)
INSERT INTO sample_lib."Patron" ("ID", "CardNumber", "FirstName", "LastName", "Email", "Phone", "DateOfBirth", "Address", "JoinDate", "HomeBranchID", "IsActive", "MaxCheckouts", "FinesOwed") VALUES
    ('F0000001-0001-0001-0001-000000000001', 'LIB-2020-0001', 'Alice', 'Johnson', 'alice.j@email.com', '217-555-1001', '1985-03-15', '123 Maple Lane', '2020-01-10', 'A0000001-0001-0001-0001-000000000001', 1, 10, 0.00),
    ('F0000001-0001-0001-0001-000000000002', 'LIB-2020-0002', 'Bob', 'Smith', 'bob.smith@email.com', '217-555-1002', '1990-07-22', '456 Cedar Drive', '2020-02-15', 'A0000001-0001-0001-0001-000000000001', 1, 10, 5.50),
    ('F0000001-0001-0001-0001-000000000003', 'LIB-2020-0003', 'Carol', 'Williams', NULL, '217-555-1003', '1978-11-08', '789 Birch Road', '2020-03-20', 'A0000001-0001-0001-0001-000000000002', 1, 15, 0.00),
    ('F0000001-0001-0001-0001-000000000004', 'LIB-2021-0004', 'David', 'Brown', 'david.b@email.com', NULL, '1995-01-30', NULL, '2021-01-05', 'A0000001-0001-0001-0001-000000000002', 1, 10, 12.75),
    ('F0000001-0001-0001-0001-000000000005', 'LIB-2021-0005', 'Emily', 'Davis', 'emily.d@email.com', '217-555-1005', '1988-06-14', '321 Walnut Street', '2021-04-12', 'A0000001-0001-0001-0001-000000000003', 1, 10, 0.00),
    ('F0000001-0001-0001-0001-000000000006', 'LIB-2021-0006', 'Frank', 'Miller', 'frank.m@email.com', '217-555-1006', '1972-09-03', '654 Spruce Avenue', '2021-06-30', 'A0000001-0001-0001-0001-000000000001', 1, 20, 3.25),
    ('F0000001-0001-0001-0001-000000000007', 'LIB-2022-0007', 'Grace', 'Wilson', NULL, '217-555-1007', '2001-12-25', '987 Ash Lane', '2022-01-18', 'A0000001-0001-0001-0001-000000000004', 1, 10, 0.00),
    ('F0000001-0001-0001-0001-000000000008', 'LIB-2022-0008', 'Henry', 'Moore', 'henry.m@email.com', '217-555-1008', '1968-04-17', '147 Poplar Court', '2022-03-25', 'A0000001-0001-0001-0001-000000000003', 1, 10, 0.00),
    ('F0000001-0001-0001-0001-000000000009', 'LIB-2022-0009', 'Iris', 'Taylor', 'iris.t@email.com', NULL, '1993-08-09', '258 Willow Way', '2022-07-10', 'A0000001-0001-0001-0001-000000000001', 1, 10, 8.00),
    ('F0000001-0001-0001-0001-000000000010', 'LIB-2023-0010', 'Jack', 'Anderson', 'jack.a@email.com', '217-555-1010', '1982-02-28', '369 Hickory Boulevard', '2023-01-05', 'A0000001-0001-0001-0001-000000000002', 1, 10, 0.00),
    ('F0000001-0001-0001-0001-000000000011', 'LIB-2023-0011', 'Karen', 'Thomas', 'karen.t@email.com', '217-555-1011', '1999-05-20', NULL, '2023-04-15', 'A0000001-0001-0001-0001-000000000004', 1, 15, 0.00),
    ('F0000001-0001-0001-0001-000000000012', 'LIB-2023-0012', 'Leo', 'Jackson', NULL, '217-555-1012', '1975-10-11', '482 Oak Terrace', '2023-08-20', 'A0000001-0001-0001-0001-000000000001', 1, 10, 2.00),
    ('F0000001-0001-0001-0001-000000000013', 'LIB-2024-0013', 'Mia', 'White', 'mia.w@email.com', '217-555-1013', '2005-07-04', '571 Magnolia Place', '2024-01-10', 'A0000001-0001-0001-0001-000000000003', 1, 10, 0.00),
    ('F0000001-0001-0001-0001-000000000014', 'LIB-2024-0014', 'Nathan', 'Harris', 'nathan.h@email.com', NULL, '1987-03-19', '693 Sycamore Drive', '2024-03-22', 'A0000001-0001-0001-0001-000000000002', 1, 10, 0.00),
    ('F0000001-0001-0001-0001-000000000015', 'LIB-2024-0015', 'Olivia', 'Martin', 'olivia.m@email.com', '217-555-1015', '1991-11-30', '814 Chestnut Circle', '2024-06-01', 'A0000001-0001-0001-0001-000000000004', 1, 10, 0.00);

-- Checkouts (30 - mix of returned, overdue, and current)
INSERT INTO sample_lib."Checkout" ("ID", "BookCopyID", "PatronID", "CheckoutDate", "DueDate", "ReturnDate", "IsReturned", "LateFee") VALUES
    -- Returned on time
    ('A2000001-0001-0001-0001-000000000001', 'E0000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000001', '2024-01-10', '2024-02-10', '2024-02-05', 1, 0.00),
    ('A2000001-0001-0001-0001-000000000002', 'E0000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000003', '2024-01-15', '2024-02-15', '2024-02-14', 1, 0.00),
    ('A2000001-0001-0001-0001-000000000003', 'E0000001-0001-0001-0001-000000000011', 'F0000001-0001-0001-0001-000000000005', '2024-02-01', '2024-03-01', '2024-02-25', 1, 0.00),
    ('A2000001-0001-0001-0001-000000000004', 'E0000001-0001-0001-0001-000000000017', 'F0000001-0001-0001-0001-000000000007', '2024-02-10', '2024-03-10', '2024-03-08', 1, 0.00),
    ('A2000001-0001-0001-0001-000000000005', 'E0000001-0001-0001-0001-000000000024', 'F0000001-0001-0001-0001-000000000010', '2024-03-01', '2024-04-01', '2024-03-28', 1, 0.00),
    ('A2000001-0001-0001-0001-000000000006', 'E0000001-0001-0001-0001-000000000030', 'F0000001-0001-0001-0001-000000000008', '2024-03-15', '2024-04-15', '2024-04-10', 1, 0.00),
    ('A2000001-0001-0001-0001-000000000007', 'E0000001-0001-0001-0001-000000000032', 'F0000001-0001-0001-0001-000000000001', '2024-04-01', '2024-05-01', '2024-04-29', 1, 0.00),
    ('A2000001-0001-0001-0001-000000000008', 'E0000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000013', '2024-04-10', '2024-05-10', '2024-05-08', 1, 0.00),
    -- Returned late (with fees)
    ('A2000001-0001-0001-0001-000000000009', 'E0000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000002', '2024-01-20', '2024-02-20', '2024-03-05', 1, 3.50),
    ('A2000001-0001-0001-0001-000000000010', 'E0000001-0001-0001-0001-000000000012', 'F0000001-0001-0001-0001-000000000004', '2024-02-05', '2024-03-05', '2024-04-01', 1, 6.75),
    ('A2000001-0001-0001-0001-000000000011', 'E0000001-0001-0001-0001-000000000018', 'F0000001-0001-0001-0001-000000000006', '2024-03-10', '2024-04-10', '2024-04-20', 1, 2.50),
    ('A2000001-0001-0001-0001-000000000012', 'E0000001-0001-0001-0001-000000000023', 'F0000001-0001-0001-0001-000000000009', '2024-04-05', '2024-05-05', '2024-05-25', 1, 5.00),
    ('A2000001-0001-0001-0001-000000000013', 'E0000001-0001-0001-0001-000000000015', 'F0000001-0001-0001-0001-000000000012', '2024-05-01', '2024-06-01', '2024-06-10', 1, 2.25),
    ('A2000001-0001-0001-0001-000000000014', 'E0000001-0001-0001-0001-000000000028', 'F0000001-0001-0001-0001-000000000002', '2024-05-15', '2024-06-15', '2024-07-01', 1, 4.00),
    -- Currently checked out (not overdue)
    ('A2000001-0001-0001-0001-000000000015', 'E0000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000001', '2025-12-01', '2026-03-15', NULL, 0, 0.00),
    ('A2000001-0001-0001-0001-000000000016', 'E0000001-0001-0001-0001-000000000006', 'F0000001-0001-0001-0001-000000000003', '2025-12-10', '2026-03-20', NULL, 0, 0.00),
    ('A2000001-0001-0001-0001-000000000017', 'E0000001-0001-0001-0001-000000000012', 'F0000001-0001-0001-0001-000000000005', '2025-12-15', '2026-03-25', NULL, 0, 0.00),
    ('A2000001-0001-0001-0001-000000000018', 'E0000001-0001-0001-0001-000000000021', 'F0000001-0001-0001-0001-000000000011', '2025-12-20', '2026-03-30', NULL, 0, 0.00),
    ('A2000001-0001-0001-0001-000000000019', 'E0000001-0001-0001-0001-000000000029', 'F0000001-0001-0001-0001-000000000014', '2026-01-05', '2026-04-05', NULL, 0, 0.00),
    ('A2000001-0001-0001-0001-000000000020', 'E0000001-0001-0001-0001-000000000035', 'F0000001-0001-0001-0001-000000000007', '2026-01-10', '2026-04-10', NULL, 0, 0.00),
    -- Overdue (not returned, due date in the past)
    ('A2000001-0001-0001-0001-000000000021', 'E0000001-0001-0001-0001-000000000009', 'F0000001-0001-0001-0001-000000000002', '2025-08-01', '2025-09-01', NULL, 0, 0.00),
    ('A2000001-0001-0001-0001-000000000022', 'E0000001-0001-0001-0001-000000000016', 'F0000001-0001-0001-0001-000000000004', '2025-09-15', '2025-10-15', NULL, 0, 0.00),
    ('A2000001-0001-0001-0001-000000000023', 'E0000001-0001-0001-0001-000000000025', 'F0000001-0001-0001-0001-000000000006', '2025-10-01', '2025-11-01', NULL, 0, 0.00),
    ('A2000001-0001-0001-0001-000000000024', 'E0000001-0001-0001-0001-000000000031', 'F0000001-0001-0001-0001-000000000009', '2025-11-01', '2025-12-01', NULL, 0, 0.00),
    ('A2000001-0001-0001-0001-000000000025', 'E0000001-0001-0001-0001-000000000038', 'F0000001-0001-0001-0001-000000000012', '2025-10-20', '2025-11-20', NULL, 0, 0.00),
    ('A2000001-0001-0001-0001-000000000026', 'E0000001-0001-0001-0001-000000000018', 'F0000001-0001-0001-0001-000000000004', '2025-07-01', '2025-08-01', NULL, 0, 0.00),
    -- More returned for history
    ('A2000001-0001-0001-0001-000000000027', 'E0000001-0001-0001-0001-000000000010', 'F0000001-0001-0001-0001-000000000010', '2024-06-01', '2024-07-01', '2024-06-28', 1, 0.00),
    ('A2000001-0001-0001-0001-000000000028', 'E0000001-0001-0001-0001-000000000020', 'F0000001-0001-0001-0001-000000000015', '2024-07-15', '2024-08-15', '2024-08-10', 1, 0.00),
    ('A2000001-0001-0001-0001-000000000029', 'E0000001-0001-0001-0001-000000000033', 'F0000001-0001-0001-0001-000000000011', '2024-08-01', '2024-09-01', '2024-09-05', 1, 1.25),
    ('A2000001-0001-0001-0001-000000000030', 'E0000001-0001-0001-0001-000000000036', 'F0000001-0001-0001-0001-000000000008', '2024-09-10', '2024-10-10', '2024-10-08', 1, 0.00);

-- Fines (10)
INSERT INTO sample_lib."Fine" ("ID", "PatronID", "CheckoutID", "Amount", "Reason", "IssuedAt", "PaidAt", "IsPaid") VALUES
    ('A2000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000009', 3.50, 'Late return - 13 days overdue', '2024-03-06', '2024-03-10', 1),
    ('A2000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000004', 'A2000001-0001-0001-0001-000000000010', 6.75, 'Late return - 27 days overdue', '2024-04-02', NULL, 0),
    ('A2000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000006', 'A2000001-0001-0001-0001-000000000011', 2.50, 'Late return - 10 days overdue', '2024-04-21', '2024-04-25', 1),
    ('A2000001-0001-0001-0001-000000000004', 'F0000001-0001-0001-0001-000000000009', 'A2000001-0001-0001-0001-000000000012', 5.00, 'Late return - 20 days overdue', '2024-05-26', NULL, 0),
    ('A2000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000012', 'A2000001-0001-0001-0001-000000000013', 2.25, 'Late return - 9 days overdue', '2024-06-11', '2024-06-15', 1),
    ('A2000001-0001-0001-0001-000000000006', 'F0000001-0001-0001-0001-000000000002', 'A2000001-0001-0001-0001-000000000014', 4.00, 'Late return - 16 days overdue', '2024-07-02', NULL, 0),
    ('A2000001-0001-0001-0001-000000000007', 'F0000001-0001-0001-0001-000000000004', NULL, 6.00, 'Damaged book - water damage to pages', '2024-08-15', NULL, 0),
    ('A2000001-0001-0001-0001-000000000008', 'F0000001-0001-0001-0001-000000000006', NULL, 0.75, 'Lost library card replacement fee', '2024-09-01', '2024-09-05', 1),
    ('A2000001-0001-0001-0001-000000000009', 'F0000001-0001-0001-0001-000000000009', NULL, 3.00, 'Excessive noise in reading area - repeat offense', '2024-10-10', NULL, 0),
    ('A2000001-0001-0001-0001-000000000010', 'F0000001-0001-0001-0001-000000000012', NULL, 2.00, 'Lost book processing fee', '2024-11-01', NULL, 0);


-- ===================== FK & CHECK Constraints =====================

-- ALTER TABLE CHECK for PublicationYear
ALTER TABLE sample_lib."Book" ADD CONSTRAINT CK_Book_PublicationYear CHECK ("PublicationYear" BETWEEN 1000 AND 2100) NOT VALID;


-- ===================== Grants =====================

GRANT SELECT ON ALL TABLES IN SCHEMA sample_lib TO "LibraryReadOnly";


-- ===================== Comments =====================

COMMENT ON TABLE sample_lib."Branch" IS 'Library branch locations';

COMMENT ON TABLE sample_lib."Genre" IS 'Book genres/categories';

COMMENT ON TABLE sample_lib."Author" IS 'Book authors';

COMMENT ON TABLE sample_lib."Book" IS 'Catalog of books in the library system';

COMMENT ON TABLE sample_lib."BookCopy" IS 'Physical copies of books at branches';

COMMENT ON TABLE sample_lib."Patron" IS 'Library patrons/members';

COMMENT ON TABLE sample_lib."Checkout" IS 'Book checkout records';

COMMENT ON TABLE sample_lib."Fine" IS 'Patron fines and fees';

COMMENT ON COLUMN sample_lib."BookCopy"."Barcode" IS 'Unique barcode for physical copy tracking';

COMMENT ON COLUMN sample_lib."BookCopy"."Condition" IS 'Physical condition of the copy';

COMMENT ON COLUMN sample_lib."BookCopy"."IsAvailable" IS 'Whether the copy is available for checkout';

COMMENT ON COLUMN sample_lib."Patron"."CardNumber" IS 'Library card number for patron identification';

COMMENT ON COLUMN sample_lib."Patron"."MaxCheckouts" IS 'Maximum number of books a patron can check out simultaneously';

COMMENT ON COLUMN sample_lib."Patron"."FinesOwed" IS 'Total outstanding fines owed by the patron';

COMMENT ON COLUMN sample_lib."Checkout"."DueDate" IS 'Expected return date for the checked out book';

COMMENT ON COLUMN sample_lib."Checkout"."LateFee" IS 'Fee charged for late return';

COMMENT ON COLUMN sample_lib."Book"."ISBN" IS 'International Standard Book Number';


-- ===================== Other =====================

-- ============================================================
-- Extended Properties
-- ============================================================

-- Tables

-- Important columns

-- ============================================================
-- Security: Role + GRANT
-- ============================================================
