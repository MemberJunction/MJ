/******************************************************************************
 * Association Sample Database - Finance Schema Documentation
 * File: V005__finance_documentation.sql
 *
 * Extended properties (documentation) for finance schema tables.
 * This file is separate to allow optional installation of documentation.
 ******************************************************************************/

-- ============================================================================
-- Extended properties for Invoice
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Invoices for membership dues, event registrations, course enrollments, and other charges',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Invoice';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique invoice number',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'InvoiceNumber';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member being invoiced',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date invoice was created',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'InvoiceDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment due date',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'DueDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Subtotal before tax and discounts',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'SubTotal';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Total invoice amount',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'Total';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Amount paid to date',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'AmountPaid';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Remaining balance due',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'Balance';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Invoice status: Draft, Sent, Partial, Paid, Overdue, Cancelled, or Refunded',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'Status';


-- ============================================================================
-- Extended properties for InvoiceLineItem
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Detailed line items for each invoice',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Parent invoice',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'InvoiceID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Line item description',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of item: Membership Dues, Event Registration, Course Enrollment, Merchandise, Donation, or Other',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'ItemType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Related entity type (Event, Course, Membership, etc.)',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'RelatedEntityType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'ID of related entity (EventID, CourseID, etc.)',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'RelatedEntityID';


-- ============================================================================
-- Extended properties for Payment
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment transactions for invoices',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Payment';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Invoice being paid',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'InvoiceID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date payment was initiated',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'PaymentDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment amount',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'Amount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment method: Credit Card, ACH, Check, Wire, PayPal, Stripe, or Cash',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'PaymentMethod';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'External payment provider transaction ID',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'TransactionID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment status: Pending, Completed, Failed, Refunded, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'finance',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'Status';


PRINT 'Finance schema documentation added successfully!';

