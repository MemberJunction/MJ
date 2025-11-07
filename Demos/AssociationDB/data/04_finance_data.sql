/******************************************************************************
 * Association Sample Database - Finance Data
 * File: 04_finance_data.sql
 *
 * Generates financial data including:
 * - Invoices (for dues, events, courses)
 * - Invoice Line Items
 * - Payments
 *
 * Uses programmatic generation for realistic transaction history
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- INVOICES - Generated Programmatically
-- ============================================================================


DECLARE @InvoiceCounter INT = 1;
DECLARE @TotalInvoices INT = 0;

-- Generate membership dues invoices (one per membership)
INSERT INTO [AssociationDemo].[Invoice] (ID, InvoiceNumber, MemberID, InvoiceDate, DueDate, SubTotal, Tax, Total, AmountPaid, Balance, Status)
SELECT
    NEWID(),
    'INV-' + FORMAT(YEAR(ms.StartDate), '0000') + '-' + RIGHT('000000' + CAST(ROW_NUMBER() OVER (ORDER BY ms.StartDate) AS VARCHAR), 6),
    ms.MemberID,
    ms.StartDate,
    DATEADD(DAY, 30, ms.StartDate),
    mt.AnnualDues,
    mt.AnnualDues * 0.08, -- 8% tax
    mt.AnnualDues * 1.08,
    CASE
        WHEN ms.Status IN ('Active', 'Lapsed') THEN mt.AnnualDues * 1.08
        ELSE 0
    END,
    CASE
        WHEN ms.Status IN ('Active', 'Lapsed') THEN 0
        ELSE mt.AnnualDues * 1.08
    END,
    CASE
        WHEN ms.Status = 'Active' THEN 'Paid'
        WHEN ms.Status = 'Lapsed' THEN 'Paid'
        WHEN ms.Status = 'Pending' THEN 'Sent'
        ELSE 'Overdue'
    END
FROM [AssociationDemo].[Membership] ms
INNER JOIN [AssociationDemo].[MembershipType] mt ON ms.MembershipTypeID = mt.ID;

SET @TotalInvoices = @@ROWCOUNT;

-- Generate event registration invoices
INSERT INTO [AssociationDemo].[Invoice] (ID, InvoiceNumber, MemberID, InvoiceDate, DueDate, SubTotal, Tax, Total, AmountPaid, Balance, Status)
SELECT
    NEWID(),
    'INV-' + FORMAT(YEAR(er.RegistrationDate), '0000') + '-' + RIGHT('000000' + CAST(@TotalInvoices + ROW_NUMBER() OVER (ORDER BY er.RegistrationDate) AS VARCHAR), 6),
    er.MemberID,
    er.RegistrationDate,
    DATEADD(DAY, 14, er.RegistrationDate),
    e.MemberPrice,
    e.MemberPrice * 0.08,
    e.MemberPrice * 1.08,
    CASE WHEN er.Status != 'Cancelled' THEN e.MemberPrice * 1.08 ELSE 0 END,
    CASE WHEN er.Status != 'Cancelled' THEN 0 ELSE e.MemberPrice * 1.08 END,
    CASE WHEN er.Status != 'Cancelled' THEN 'Paid' ELSE 'Cancelled' END
FROM [AssociationDemo].[EventRegistration] er
INNER JOIN [AssociationDemo].[Event] e ON er.EventID = e.ID
WHERE e.MemberPrice > 0;

SET @TotalInvoices = @TotalInvoices + @@ROWCOUNT;

-- Generate course enrollment invoices
INSERT INTO [AssociationDemo].[Invoice] (ID, InvoiceNumber, MemberID, InvoiceDate, DueDate, SubTotal, Tax, Total, AmountPaid, Balance, Status)
SELECT
    NEWID(),
    'INV-' + FORMAT(YEAR(en.EnrollmentDate), '0000') + '-' + RIGHT('000000' + CAST(@TotalInvoices + ROW_NUMBER() OVER (ORDER BY en.EnrollmentDate) AS VARCHAR), 6),
    en.MemberID,
    en.EnrollmentDate,
    DATEADD(DAY, 30, en.EnrollmentDate),
    c.MemberPrice,
    c.MemberPrice * 0.08,
    c.MemberPrice * 1.08,
    CASE WHEN en.Status IN ('Completed', 'In Progress') THEN c.MemberPrice * 1.08 ELSE 0 END,
    CASE WHEN en.Status IN ('Completed', 'In Progress') THEN 0 ELSE c.MemberPrice * 1.08 END,
    CASE
        WHEN en.Status IN ('Completed', 'In Progress') THEN 'Paid'
        WHEN en.Status = 'Withdrawn' THEN 'Cancelled'
        ELSE 'Sent'
    END
FROM [AssociationDemo].[Enrollment] en
INNER JOIN [AssociationDemo].[Course] c ON en.CourseID = c.ID;

SET @TotalInvoices = @TotalInvoices + @@ROWCOUNT;

-- ============================================================================
-- INVOICE LINE ITEMS
-- ============================================================================


DECLARE @TotalLineItems INT = 0;

-- Line items for membership dues
INSERT INTO [AssociationDemo].[InvoiceLineItem] (ID, InvoiceID, Description, ItemType, Quantity, UnitPrice, Amount, TaxAmount, RelatedEntityType, RelatedEntityID)
SELECT
    NEWID(),
    i.ID,
    mt.Name + ' - Annual Membership Dues',
    'Membership Dues',
    1,
    mt.AnnualDues,
    mt.AnnualDues,
    mt.AnnualDues * 0.08,
    'Membership',
    ms.ID
FROM [AssociationDemo].[Invoice] i
INNER JOIN [AssociationDemo].[Member] m ON i.MemberID = m.ID
INNER JOIN [AssociationDemo].[Membership] ms ON m.ID = ms.MemberID AND i.InvoiceDate = ms.StartDate
INNER JOIN [AssociationDemo].[MembershipType] mt ON ms.MembershipTypeID = mt.ID;

SET @TotalLineItems = @@ROWCOUNT;

-- Line items for event registrations
INSERT INTO [AssociationDemo].[InvoiceLineItem] (ID, InvoiceID, Description, ItemType, Quantity, UnitPrice, Amount, TaxAmount, RelatedEntityType, RelatedEntityID)
SELECT
    NEWID(),
    i.ID,
    e.Name + ' - Registration',
    'Event Registration',
    1,
    e.MemberPrice,
    e.MemberPrice,
    e.MemberPrice * 0.08,
    'Event',
    e.ID
FROM [AssociationDemo].[Invoice] i
INNER JOIN [AssociationDemo].[EventRegistration] er ON i.MemberID = er.MemberID AND i.InvoiceDate = er.RegistrationDate
INNER JOIN [AssociationDemo].[Event] e ON er.EventID = e.ID
WHERE e.MemberPrice > 0;

SET @TotalLineItems = @TotalLineItems + @@ROWCOUNT;

-- Line items for course enrollments
INSERT INTO [AssociationDemo].[InvoiceLineItem] (ID, InvoiceID, Description, ItemType, Quantity, UnitPrice, Amount, TaxAmount, RelatedEntityType, RelatedEntityID)
SELECT
    NEWID(),
    i.ID,
    c.Title + ' - Course Enrollment',
    'Course Enrollment',
    1,
    c.MemberPrice,
    c.MemberPrice,
    c.MemberPrice * 0.08,
    'Course',
    c.ID
FROM [AssociationDemo].[Invoice] i
INNER JOIN [AssociationDemo].[Enrollment] en ON i.MemberID = en.MemberID AND i.InvoiceDate = en.EnrollmentDate
INNER JOIN [AssociationDemo].[Course] c ON en.CourseID = c.ID;

SET @TotalLineItems = @TotalLineItems + @@ROWCOUNT;


-- ============================================================================
-- PAYMENTS
-- ============================================================================


-- Generate payments for paid invoices
INSERT INTO [AssociationDemo].[Payment] (ID, InvoiceID, PaymentDate, Amount, PaymentMethod, TransactionID, Status, ProcessedDate)
SELECT
    NEWID(),
    i.ID,
    DATEADD(DAY, ABS(CHECKSUM(NEWID()) % 20), CAST(i.InvoiceDate AS DATETIME)), -- Payment within 20 days
    i.Total,
    CASE ABS(CHECKSUM(NEWID()) % 5)
        WHEN 0 THEN 'Credit Card'
        WHEN 1 THEN 'ACH'
        WHEN 2 THEN 'Credit Card'
        WHEN 3 THEN 'PayPal'
        ELSE 'Stripe'
    END,
    'TXN-' + CAST(NEWID() AS VARCHAR(36)),
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.97 THEN 'Completed'
        ELSE 'Failed'
    END,
    DATEADD(MINUTE, 5, DATEADD(DAY, ABS(CHECKSUM(NEWID()) % 20), CAST(i.InvoiceDate AS DATETIME)))
FROM [AssociationDemo].[Invoice] i
WHERE i.Status = 'Paid';

DECLARE @TotalPayments INT = @@ROWCOUNT;

-- Note: No GO statement here - variables must persist within transaction
