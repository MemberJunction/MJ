/******************************************************************************
 * Association Sample Database - Finance Schema Tables
 * File: V005__finance_tables.sql
 *
 * Creates financial management tables including:
 * - Invoice: Member invoices for dues, events, courses
 * - InvoiceLineItem: Detailed line items on invoices
 * - Payment: Payment transactions and processing
 ******************************************************************************/

-- ============================================================================
-- Invoice Table
-- ============================================================================
CREATE TABLE [finance].[Invoice] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [InvoiceNumber] NVARCHAR(50) NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [InvoiceDate] DATE NOT NULL,
    [DueDate] DATE NOT NULL,
    [SubTotal] DECIMAL(12,2) NOT NULL,
    [Tax] DECIMAL(12,2) DEFAULT 0,
    [Discount] DECIMAL(12,2) DEFAULT 0,
    [Total] DECIMAL(12,2) NOT NULL,
    [AmountPaid] DECIMAL(12,2) DEFAULT 0,
    [Balance] DECIMAL(12,2) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Draft', 'Sent', 'Partial', 'Paid', 'Overdue', 'Cancelled', 'Refunded')),
    [Notes] NVARCHAR(MAX),
    [PaymentTerms] NVARCHAR(100),
    CONSTRAINT FK_Invoice_Member FOREIGN KEY ([MemberID])
        REFERENCES [membership].[Member]([ID])
);
GO

-- Create unique index on invoice number
CREATE UNIQUE INDEX IX_Invoice_Number ON [finance].[Invoice]([InvoiceNumber]);
GO

-- Create indexes for common queries
CREATE INDEX IX_Invoice_Member ON [finance].[Invoice]([MemberID]);
CREATE INDEX IX_Invoice_Status ON [finance].[Invoice]([Status]);
CREATE INDEX IX_Invoice_Dates ON [finance].[Invoice]([InvoiceDate], [DueDate]);
GO

-- ============================================================================
-- InvoiceLineItem Table
-- ============================================================================
CREATE TABLE [finance].[InvoiceLineItem] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [InvoiceID] UNIQUEIDENTIFIER NOT NULL,
    [Description] NVARCHAR(500) NOT NULL,
    [ItemType] NVARCHAR(50) NOT NULL CHECK ([ItemType] IN ('Membership Dues', 'Event Registration', 'Course Enrollment', 'Merchandise', 'Donation', 'Other')),
    [Quantity] INT DEFAULT 1,
    [UnitPrice] DECIMAL(10,2) NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [TaxAmount] DECIMAL(12,2) DEFAULT 0,
    [RelatedEntityType] NVARCHAR(100),
    [RelatedEntityID] UNIQUEIDENTIFIER,
    CONSTRAINT FK_LineItem_Invoice FOREIGN KEY ([InvoiceID])
        REFERENCES [finance].[Invoice]([ID])
);
GO

-- Create index for invoice lookups
CREATE INDEX IX_LineItem_Invoice ON [finance].[InvoiceLineItem]([InvoiceID]);
GO

-- ============================================================================
-- Payment Table
-- ============================================================================
CREATE TABLE [finance].[Payment] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [InvoiceID] UNIQUEIDENTIFIER NOT NULL,
    [PaymentDate] DATETIME NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [PaymentMethod] NVARCHAR(50) NOT NULL CHECK ([PaymentMethod] IN ('Credit Card', 'ACH', 'Check', 'Wire', 'PayPal', 'Stripe', 'Cash')),
    [TransactionID] NVARCHAR(255),
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Pending', 'Completed', 'Failed', 'Refunded', 'Cancelled')),
    [ProcessedDate] DATETIME,
    [FailureReason] NVARCHAR(MAX),
    [Notes] NVARCHAR(MAX),
    CONSTRAINT FK_Payment_Invoice FOREIGN KEY ([InvoiceID])
        REFERENCES [finance].[Invoice]([ID])
);
GO

-- Create indexes for common queries
CREATE INDEX IX_Payment_Invoice ON [finance].[Payment]([InvoiceID]);
CREATE INDEX IX_Payment_Status ON [finance].[Payment]([Status]);
CREATE INDEX IX_Payment_Date ON [finance].[Payment]([PaymentDate]);
GO

PRINT 'Finance schema tables created successfully!';
PRINT 'Tables: Invoice, InvoiceLineItem, Payment';
GO
