-- Inject known data quality defects into a copy of AdventureWorks (see make-db.sql). Each block is
-- one expected finding in expected.json; the comment names it. Run with:
--   sqlcmd -S host,port -U sa -P ... -C -d AW_Quality -i inject-defects.sql
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

-- UntrustedForeignKey + OrphanedForeignKey (error): a declared key switched off and broken.
ALTER TABLE Sales.SalesOrderHeader NOCHECK CONSTRAINT FK_SalesOrderHeader_Address_BillToAddressID;
UPDATE TOP (500) Sales.SalesOrderHeader SET BillToAddressID = 2147480000;

-- UntrustedForeignKey + OrphanedForeignKey on a COMPOSITE declared key (SpecialOfferID, ProductID).
ALTER TABLE Sales.SalesOrderDetail NOCHECK CONSTRAINT FK_SalesOrderDetail_SpecialOfferProduct_SpecialOfferIDProductID;
UPDATE TOP (100) Sales.SalesOrderDetail SET SpecialOfferID = 999;

-- CaseWhitespaceVariants: the CHECK constraint compares upper(PersonType), so lower case passes.
UPDATE TOP (200) Person.Person SET PersonType = LOWER(PersonType);

-- UntrimmedString (trailing spaces) and CaseWhitespaceVariants (a leading space is a distinct spelling).
UPDATE TOP (100) Production.Product SET Color = Color + N' ' WHERE Color = N'Black';
UPDATE TOP (10) Production.Product SET Color = N' ' + Color WHERE Color = N'Red';

-- BlankString: empty and whitespace-only strings where NULL was meant.
UPDATE TOP (300) Person.Person SET Suffix = N'' WHERE Suffix IS NULL;
UPDATE TOP (100) Sales.SalesOrderHeader SET Comment = N'   ';

-- SentinelDate: placeholder dates instead of NULL (both satisfy the table's CHECK constraints).
UPDATE TOP (200) Sales.SalesOrderHeader SET ShipDate = '9999-12-31';
UPDATE TOP (50) Production.Product SET SellStartDate = '1900-01-01';

-- FutureDate: rows modified "five years from now".
UPDATE TOP (100) Person.Person SET ModifiedDate = DATEADD(year, 5, GETDATE());

-- NearUnique: five addresses copied onto other rows of an otherwise unique, non-unique-indexed column.
UPDATE TOP (5) Person.EmailAddress
SET EmailAddress = (SELECT TOP (1) EmailAddress FROM Person.EmailAddress ORDER BY EmailAddressID)
WHERE EmailAddressID > 100;

-- NegativeValue: a quantity below zero (no CHECK constraint on this column).
UPDATE TOP (10) Production.ProductInventory SET Quantity = -5;

-- A table of typed-as-text and unused columns.
--   NumericStoredAsText (AmountText), DateStoredAsText (WhenText), AlwaysNull (UnusedCol),
--   ConstantValue (ConstantCol), LengthAtCapacity (Clipped)
CREATE TABLE dbo.QualityBench (
    Id int IDENTITY PRIMARY KEY,
    AmountText nvarchar(20) NULL,
    WhenText nvarchar(30) NULL,
    UnusedCol int NULL,
    ConstantCol nvarchar(5) NOT NULL CONSTRAINT DF_QualityBench_ConstantCol DEFAULT N'X',
    Clipped nvarchar(10) NULL
);
-- Clipped holds street addresses cut to 10 characters: varied lengths, many at the limit (truncation),
-- unlike a fixed-format code where every value is exactly the declared length.
INSERT dbo.QualityBench (AmountText, WhenText, Clipped)
SELECT TOP (5000) CAST(h.TotalDue AS nvarchar(20)), CONVERT(nvarchar(30), h.OrderDate, 120), LEFT(a.AddressLine1, 10)
FROM Sales.SalesOrderHeader h
JOIN Person.Address a ON a.AddressID = h.ShipToAddressID;

-- NoPrimaryKey + ExactDuplicateRows: a heap with 100 exact copies.
CREATE TABLE dbo.QualityBenchNoPK (A int NULL, B nvarchar(50) NULL);
INSERT dbo.QualityBenchNoPK (A, B) SELECT TOP (500) ProductID, Name FROM Production.Product;
INSERT dbo.QualityBenchNoPK (A, B) SELECT TOP (100) A, B FROM dbo.QualityBenchNoPK;
