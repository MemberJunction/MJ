-- Create the CRM Schema - Part 2
-- This file extends the base CRM schema with sales-specific tables for deals, products, and invoicing
-- Prerequisites: Base CRM schema must be created first (CRM Schema 1.sql)

-- =============================================
-- Product Table
-- =============================================
CREATE TABLE CRM.Product (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    ProductCode NVARCHAR(50) NOT NULL UNIQUE,
    ProductName NVARCHAR(200) NOT NULL,
    Category NVARCHAR(100),
    Description NVARCHAR(MAX),
    UnitPrice DECIMAL(18,2) NOT NULL,
    Cost DECIMAL(18,2),
    IsActive BIT DEFAULT 1,
    SKU NVARCHAR(50),
    UnitOfMeasure NVARCHAR(20),
    RecurringBillingPeriod NVARCHAR(20),
    CONSTRAINT CHK_Product_UnitOfMeasure CHECK (UnitOfMeasure IN ('Each', 'Hour', 'License', 'Subscription', 'User', 'GB', 'Unit')),
    CONSTRAINT CHK_Product_RecurringBilling CHECK (RecurringBillingPeriod IN (NULL, 'Monthly', 'Quarterly', 'Annual', 'Biannual'))
);
GO

-- Product table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Master catalog of products and services offered by the organization',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Product';
GO

-- Product column documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier code for the product, used in external systems and reports',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'ProductCode';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the product or service',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'ProductName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Product category for grouping and analysis (e.g., Advertising, Sponsorship, Events, Publications)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'Category';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of the product features and benefits',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Standard selling price per unit in local currency',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'UnitPrice';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Internal cost per unit for margin calculations',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'Cost';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if the product is currently available for sale',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'IsActive';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stock Keeping Unit identifier for inventory tracking',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'SKU';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How the product is measured and sold (Each, Hour, License, Subscription, User, GB, Unit)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'UnitOfMeasure';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Billing frequency for subscription products (NULL for one-time, Monthly, Quarterly, Annual, Biannual)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'RecurringBillingPeriod';
GO

-- =============================================
-- Deal Table (Opportunities/Pipeline)
-- =============================================
CREATE TABLE CRM.Deal (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    DealName NVARCHAR(200) NOT NULL,
    AccountID INT NOT NULL,
    ContactID INT NULL,
    Stage NVARCHAR(50) NOT NULL,
    Amount DECIMAL(18,2),
    Probability INT,
    ExpectedRevenue AS (Amount * Probability / 100.0) PERSISTED,
    CloseDate DATE,
    ActualCloseDate DATE NULL,
    DealSource NVARCHAR(50),
    CompetitorName NVARCHAR(100),
    LossReason NVARCHAR(200),
    NextStep NVARCHAR(500),
    Description NVARCHAR(MAX),
    OwnerID INT,
    CONSTRAINT FK_Deal_Account FOREIGN KEY (AccountID) REFERENCES CRM.Account(ID),
    CONSTRAINT FK_Deal_Contact FOREIGN KEY (ContactID) REFERENCES CRM.Contact(ID),
    CONSTRAINT FK_Deal_Owner FOREIGN KEY (OwnerID) REFERENCES CRM.Contact(ID),
    CONSTRAINT CHK_Deal_Stage CHECK (Stage IN ('Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost')),
    CONSTRAINT CHK_Deal_Probability CHECK (Probability >= 0 AND Probability <= 100),
    CONSTRAINT CHK_Deal_Source CHECK (DealSource IN ('Web', 'Referral', 'Cold Call', 'Trade Show', 'Marketing Campaign', 'Partner', 'Direct', 'Other'))
);
GO

-- Deal table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sales opportunities and deals in various stages of the sales pipeline',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal';
GO

-- Deal column documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Descriptive name for the deal or opportunity',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'DealName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current stage in the sales pipeline (Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'Stage';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total potential value of the deal in local currency',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'Amount';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Estimated probability of closing the deal (0-100 percent)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'Probability';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calculated field: Amount multiplied by Probability percentage',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'ExpectedRevenue';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Target date for closing the deal',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'CloseDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Actual date the deal was closed (won or lost)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'ActualCloseDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Origin of the deal (Web, Referral, Cold Call, Trade Show, Marketing Campaign, Partner, Direct, Other)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'DealSource';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of competing company or solution being considered',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'CompetitorName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reason for losing the deal if Stage is Closed Lost',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'LossReason';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description of the next action to be taken for this deal',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'NextStep';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of the deal, requirements, and notes',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sales representative or owner responsible for this deal',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'OwnerID';
GO

-- =============================================
-- DealProduct Table (Line Items for Deals)
-- =============================================
CREATE TABLE CRM.DealProduct (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    DealID INT NOT NULL,
    ProductID INT NOT NULL,
    Quantity DECIMAL(18,4) NOT NULL,
    UnitPrice DECIMAL(18,2) NOT NULL,
    Discount DECIMAL(5,2) DEFAULT 0,
    TotalPrice AS (Quantity * UnitPrice * (1 - Discount/100.0)) PERSISTED,
    Notes NVARCHAR(500),
    CONSTRAINT FK_DealProduct_Deal FOREIGN KEY (DealID) REFERENCES CRM.Deal(ID) ON DELETE CASCADE,
    CONSTRAINT FK_DealProduct_Product FOREIGN KEY (ProductID) REFERENCES CRM.Product(ID),
    CONSTRAINT CHK_DealProduct_Quantity CHECK (Quantity > 0),
    CONSTRAINT CHK_DealProduct_Discount CHECK (Discount >= 0 AND Discount <= 100)
);
GO

-- DealProduct table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Line items representing products and services included in a deal',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'DealProduct';
GO

-- DealProduct column documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of units of the product included in the deal',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'DealProduct',
    @level2type = N'COLUMN', @level2name = N'Quantity';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Negotiated price per unit for this deal (may differ from standard price)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'DealProduct',
    @level2type = N'COLUMN', @level2name = N'UnitPrice';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Discount percentage applied to this line item (0-100)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'DealProduct',
    @level2type = N'COLUMN', @level2name = N'Discount';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calculated field: Quantity × UnitPrice × (1 - Discount percentage)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'DealProduct',
    @level2type = N'COLUMN', @level2name = N'TotalPrice';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Additional notes or specifications for this line item',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'DealProduct',
    @level2type = N'COLUMN', @level2name = N'Notes';
GO

-- =============================================
-- Invoice Table
-- =============================================
CREATE TABLE CRM.Invoice (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    InvoiceNumber NVARCHAR(50) NOT NULL UNIQUE,
    AccountID INT NOT NULL,
    DealID INT NULL,
    InvoiceDate DATE NOT NULL,
    DueDate DATE NOT NULL,
    Status NVARCHAR(20) NOT NULL,
    SubTotal DECIMAL(18,2) NOT NULL,
    TaxRate DECIMAL(5,2) DEFAULT 0,
    TaxAmount AS (SubTotal * TaxRate / 100.0) PERSISTED,
    TotalAmount AS (SubTotal * (1 + TaxRate / 100.0)) PERSISTED,
    AmountPaid DECIMAL(18,2) DEFAULT 0,
    BalanceDue AS (SubTotal * (1 + TaxRate / 100.0) - AmountPaid) PERSISTED,
    Terms NVARCHAR(100),
    Notes NVARCHAR(MAX),
    BillingStreet NVARCHAR(100),
    BillingCity NVARCHAR(50),
    BillingState NVARCHAR(50),
    BillingPostalCode NVARCHAR(20),
    BillingCountry NVARCHAR(50),
    CONSTRAINT FK_Invoice_Account FOREIGN KEY (AccountID) REFERENCES CRM.Account(ID),
    CONSTRAINT FK_Invoice_Deal FOREIGN KEY (DealID) REFERENCES CRM.Deal(ID),
    CONSTRAINT CHK_Invoice_Status CHECK (Status IN ('Draft', 'Sent', 'Paid', 'Partial', 'Overdue', 'Cancelled')),
    CONSTRAINT CHK_Invoice_TaxRate CHECK (TaxRate >= 0 AND TaxRate <= 100),
    CONSTRAINT CHK_Invoice_DueDate CHECK (DueDate >= InvoiceDate)
);
GO

-- Invoice table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Customer invoices for products and services rendered',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice';
GO

-- Invoice column documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique invoice identifier for external reference',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'InvoiceNumber';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the invoice was issued',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'InvoiceDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Payment due date for the invoice',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'DueDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the invoice (Draft, Sent, Paid, Partial, Overdue, Cancelled)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sum of all line items before tax',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'SubTotal';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tax rate percentage to apply to the subtotal',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'TaxRate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calculated field: SubTotal × TaxRate percentage',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'TaxAmount';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calculated field: SubTotal + TaxAmount',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'TotalAmount';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total amount paid against this invoice',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'AmountPaid';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calculated field: TotalAmount - AmountPaid',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'BalanceDue';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Payment terms (e.g., Net 30, Net 15, Due on Receipt, 2/10 Net 30)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'Terms';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Additional notes or special instructions for the invoice',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'Notes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Billing address street',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'BillingStreet';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Billing address city',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'BillingCity';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Billing address state or province',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'BillingState';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Billing address postal or ZIP code',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'BillingPostalCode';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Billing address country',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Invoice',
    @level2type = N'COLUMN', @level2name = N'BillingCountry';
GO

-- =============================================
-- InvoiceLineItem Table
-- =============================================
CREATE TABLE CRM.InvoiceLineItem (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    InvoiceID INT NOT NULL,
    ProductID INT NULL,
    Description NVARCHAR(500) NOT NULL,
    Quantity DECIMAL(18,4) NOT NULL,
    UnitPrice DECIMAL(18,2) NOT NULL,
    Discount DECIMAL(5,2) DEFAULT 0,
    TotalPrice AS (Quantity * UnitPrice * (1 - Discount/100.0)) PERSISTED,
    CONSTRAINT FK_InvoiceLineItem_Invoice FOREIGN KEY (InvoiceID) REFERENCES CRM.Invoice(ID) ON DELETE CASCADE,
    CONSTRAINT FK_InvoiceLineItem_Product FOREIGN KEY (ProductID) REFERENCES CRM.Product(ID),
    CONSTRAINT CHK_InvoiceLineItem_Quantity CHECK (Quantity > 0),
    CONSTRAINT CHK_InvoiceLineItem_Discount CHECK (Discount >= 0 AND Discount <= 100)
);
GO

-- InvoiceLineItem table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Individual line items that appear on an invoice',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'InvoiceLineItem';
GO

-- InvoiceLineItem column documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description of the product or service being invoiced',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of units being invoiced',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = N'Quantity';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Price per unit for this line item',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = N'UnitPrice';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Discount percentage applied to this line item (0-100)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = N'Discount';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calculated field: Quantity × UnitPrice × (1 - Discount percentage)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = N'TotalPrice';
GO

-- =============================================
-- Payment Table
-- =============================================
CREATE TABLE CRM.Payment (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    InvoiceID INT NOT NULL,
    PaymentDate DATE NOT NULL,
    Amount DECIMAL(18,2) NOT NULL,
    PaymentMethod NVARCHAR(50),
    ReferenceNumber NVARCHAR(100),
    Notes NVARCHAR(500),
    CONSTRAINT FK_Payment_Invoice FOREIGN KEY (InvoiceID) REFERENCES CRM.Invoice(ID),
    CONSTRAINT CHK_Payment_Method CHECK (PaymentMethod IN ('Check', 'Credit Card', 'Wire Transfer', 'ACH', 'Cash', 'Other')),
    CONSTRAINT CHK_Payment_Amount CHECK (Amount > 0)
);
GO

-- Payment table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Payment transactions recorded against invoices',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Payment';
GO

-- Payment column documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the payment was received',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Payment',
    @level2type = N'COLUMN', @level2name = N'PaymentDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Amount of the payment in local currency',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Payment',
    @level2type = N'COLUMN', @level2name = N'Amount';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Method of payment (Check, Credit Card, Wire Transfer, ACH, Cash, Other)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Payment',
    @level2type = N'COLUMN', @level2name = N'PaymentMethod';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Check number, transaction ID, or other payment reference',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Payment',
    @level2type = N'COLUMN', @level2name = N'ReferenceNumber';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Additional notes about the payment',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Payment',
    @level2type = N'COLUMN', @level2name = N'Notes';
GO

-- =============================================
-- Sample Data for Association Business Model
-- =============================================
-- Sample Data for CRM Schema Part 2
-- Using valid Account (1-35) and Contact (1-65) IDs from CRM Script 1
-- =============================================

-- Safely turn off IDENTITY_INSERT if it's on for any table
BEGIN TRY
    SET IDENTITY_INSERT CRM.Product OFF;
END TRY
BEGIN CATCH
    -- Ignore if not on
END CATCH

BEGIN TRY
    SET IDENTITY_INSERT CRM.Deal OFF;
END TRY
BEGIN CATCH
    -- Ignore if not on
END CATCH

BEGIN TRY
    SET IDENTITY_INSERT CRM.Invoice OFF;
END TRY
BEGIN CATCH
    -- Ignore if not on
END CATCH

-- Insert Products (35 records with explicit IDs)
SET IDENTITY_INSERT CRM.Product ON;

INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (1, 'PA001', 'Full Page Ad - Monthly Magazine', 'Publication Advertising', 'Full Page Ad - Monthly Magazine - Premium publication advertising offering for association members and partners', 2500.00, 1800.00, 1, 'SKU-PA001', 'Subscription', 'Monthly');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (2, 'PA002', 'Half Page Ad - Monthly Magazine', 'Publication Advertising', 'Half Page Ad - Monthly Magazine - Premium publication advertising offering for association members and partners', 1500.00, 1000.00, 1, 'SKU-PA002', 'Subscription', 'Monthly');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (3, 'PA003', 'Quarter Page Ad - Monthly Magazine', 'Publication Advertising', 'Quarter Page Ad - Monthly Magazine - Premium publication advertising offering for association members and partners', 800.00, 500.00, 1, 'SKU-PA003', 'Subscription', 'Monthly');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (4, 'PA004', 'Business Card Ad - Monthly Magazine', 'Publication Advertising', 'Business Card Ad - Monthly Magazine - Premium publication advertising offering for association members and partners', 250.00, 150.00, 1, 'SKU-PA004', 'Subscription', 'Monthly');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (5, 'PA005', 'Cover Page Ad - Annual Report', 'Publication Advertising', 'Cover Page Ad - Annual Report - Premium publication advertising offering for association members and partners', 5000.00, 3500.00, 1, 'SKU-PA005', 'Subscription', 'Annual');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (6, 'DA001', 'Website Banner - Monthly', 'Digital Advertising', 'Website Banner - Monthly - Premium digital advertising offering for association members and partners', 1000.00, 600.00, 1, 'SKU-DA001', 'Subscription', 'Monthly');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (7, 'DA002', 'Newsletter Sponsorship - Quarterly', 'Digital Advertising', 'Newsletter Sponsorship - Quarterly - Premium digital advertising offering for association members and partners', 1500.00, 900.00, 1, 'SKU-DA002', 'Subscription', 'Quarterly');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (8, 'DA003', 'Email Campaign Feature', 'Digital Advertising', 'Email Campaign Feature - Premium digital advertising offering for association members and partners', 2000.00, 1200.00, 1, 'SKU-DA003', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (9, 'DA004', 'Social Media Campaign Package', 'Digital Advertising', 'Social Media Campaign Package - Premium digital advertising offering for association members and partners', 3000.00, 2000.00, 1, 'SKU-DA004', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (10, 'DA005', 'Digital Directory Listing - Annual', 'Digital Advertising', 'Digital Directory Listing - Annual - Premium digital advertising offering for association members and partners', 500.00, 200.00, 1, 'SKU-DA005', 'Subscription', 'Annual');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (11, 'ES001', 'Platinum Event Sponsorship', 'Event Sponsorship', 'Platinum Event Sponsorship - Premium event sponsorship offering for association members and partners', 25000.00, 15000.00, 1, 'SKU-ES001', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (12, 'ES002', 'Gold Event Sponsorship', 'Event Sponsorship', 'Gold Event Sponsorship - Premium event sponsorship offering for association members and partners', 15000.00, 9000.00, 1, 'SKU-ES002', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (13, 'ES003', 'Silver Event Sponsorship', 'Event Sponsorship', 'Silver Event Sponsorship - Premium event sponsorship offering for association members and partners', 10000.00, 6000.00, 1, 'SKU-ES003', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (14, 'ES004', 'Bronze Event Sponsorship', 'Event Sponsorship', 'Bronze Event Sponsorship - Premium event sponsorship offering for association members and partners', 5000.00, 3000.00, 1, 'SKU-ES004', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (15, 'ES005', 'Exhibitor Booth - Standard', 'Event Sponsorship', 'Exhibitor Booth - Standard - Premium event sponsorship offering for association members and partners', 3000.00, 1800.00, 1, 'SKU-ES005', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (16, 'TS001', 'Premium Booth Space (20x20)', 'Trade Show', 'Premium Booth Space (20x20) - Premium trade show offering for association members and partners', 8000.00, 5000.00, 1, 'SKU-TS001', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (17, 'TS002', 'Standard Booth Space (10x10)', 'Trade Show', 'Standard Booth Space (10x10) - Premium trade show offering for association members and partners', 4000.00, 2500.00, 1, 'SKU-TS002', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (18, 'TS003', 'Tabletop Display', 'Trade Show', 'Tabletop Display - Premium trade show offering for association members and partners', 1500.00, 900.00, 1, 'SKU-TS003', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (19, 'TS004', 'Speaking Opportunity', 'Trade Show', 'Speaking Opportunity - Premium trade show offering for association members and partners', 5000.00, 2000.00, 1, 'SKU-TS004', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (20, 'TS005', 'Trade Show Program Ad', 'Trade Show', 'Trade Show Program Ad - Premium trade show offering for association members and partners', 1000.00, 600.00, 1, 'SKU-TS005', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (21, 'VE001', 'Virtual Conference Sponsorship', 'Virtual Events', 'Virtual Conference Sponsorship - Premium virtual events offering for association members and partners', 10000.00, 6000.00, 1, 'SKU-VE001', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (22, 'VE002', 'Webinar Sponsorship', 'Virtual Events', 'Webinar Sponsorship - Premium virtual events offering for association members and partners', 3000.00, 1800.00, 1, 'SKU-VE002', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (23, 'VE003', 'Virtual Booth', 'Virtual Events', 'Virtual Booth - Premium virtual events offering for association members and partners', 2000.00, 1200.00, 1, 'SKU-VE003', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (24, 'VE004', 'Online Workshop Host', 'Virtual Events', 'Online Workshop Host - Premium virtual events offering for association members and partners', 4000.00, 2400.00, 1, 'SKU-VE004', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (25, 'VE005', 'Virtual Networking Session Sponsor', 'Virtual Events', 'Virtual Networking Session Sponsor - Premium virtual events offering for association members and partners', 1500.00, 900.00, 1, 'SKU-VE005', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (26, 'MB001', 'Corporate Membership - Platinum', 'Membership', 'Corporate Membership - Platinum - Premium membership offering for association members and partners', 10000.00, 5000.00, 1, 'SKU-MB001', 'Subscription', 'Annual');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (27, 'MB002', 'Corporate Membership - Gold', 'Membership', 'Corporate Membership - Gold - Premium membership offering for association members and partners', 5000.00, 2500.00, 1, 'SKU-MB002', 'Subscription', 'Annual');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (28, 'MB003', 'Corporate Membership - Silver', 'Membership', 'Corporate Membership - Silver - Premium membership offering for association members and partners', 2500.00, 1250.00, 1, 'SKU-MB003', 'Subscription', 'Annual');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (29, 'MB004', 'Individual Professional Membership', 'Membership', 'Individual Professional Membership - Premium membership offering for association members and partners', 500.00, 200.00, 1, 'SKU-MB004', 'Subscription', 'Annual');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (30, 'MB005', 'Student Membership', 'Membership', 'Student Membership - Premium membership offering for association members and partners', 100.00, 25.00, 1, 'SKU-MB005', 'Subscription', 'Annual');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (31, 'ED001', 'Professional Certification Program', 'Education', 'Professional Certification Program - Premium education offering for association members and partners', 2500.00, 1500.00, 1, 'SKU-ED001', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (32, 'ED002', 'Training Workshop - Full Day', 'Education', 'Training Workshop - Full Day - Premium education offering for association members and partners', 1500.00, 900.00, 1, 'SKU-ED002', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (33, 'ED003', 'Training Workshop - Half Day', 'Education', 'Training Workshop - Half Day - Premium education offering for association members and partners', 800.00, 480.00, 1, 'SKU-ED003', 'Each', NULL);
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (34, 'ED004', 'Online Course Access - Annual', 'Education', 'Online Course Access - Annual - Premium education offering for association members and partners', 1200.00, 600.00, 1, 'SKU-ED004', 'Subscription', 'Annual');
INSERT INTO CRM.Product (ID, ProductCode, ProductName, Category, Description, UnitPrice, Cost, IsActive, SKU, UnitOfMeasure, RecurringBillingPeriod)
VALUES (35, 'ED005', 'Custom Training Program', 'Education', 'Custom Training Program - Premium education offering for association members and partners', 8000.00, 5000.00, 1, 'SKU-ED005', 'Each', NULL);

SET IDENTITY_INSERT CRM.Product OFF;

-- Insert Deals (250 records with explicit IDs)
SET IDENTITY_INSERT CRM.Deal ON;

INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (1, 'Q1 2022 - Membership Deal #1', 16, 29, 'Qualification', 37087.09, 25, '2025-10-17', NULL, 'Referral', NULL, NULL, 'Get approval from board', 'Deal for Q1 2022 - Membership Deal #1 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (2, 'Q1 2022 - Advertising Deal #2', 15, 65, 'Closed Won', 2300.26, 100, '2023-02-12', '2025-08-23', 'Direct', 'RivalCorp', NULL, NULL, 'Deal for Q1 2022 - Advertising Deal #2 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (3, 'Q3 2022 - Advertising Deal #3', 28, 44, 'Proposal', 8618.50, 50, '2026-04-13', NULL, 'Partner', 'CompetitorCo', NULL, 'Schedule follow-up call', 'Deal for Q3 2022 - Advertising Deal #3 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (4, 'Q1 2024 - Membership Deal #4', 17, 6, 'Closed Lost', 23511.82, 0, '2022-09-13', '2024-02-15', 'Referral', NULL, 'Went with competitor', NULL, 'Deal for Q1 2024 - Membership Deal #4 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (5, 'Q3 2023 - Sponsorship Deal #5', 3, 30, 'Proposal', 49275.85, 50, '2023-04-22', NULL, 'Referral', 'DirectCompete Inc', NULL, 'Negotiate terms', 'Deal for Q3 2023 - Sponsorship Deal #5 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (6, 'Q3 2023 - Membership Deal #6', 23, 27, 'Closed Lost', 14081.91, 0, '2025-10-31', '2025-08-20', 'Referral', NULL, 'Timing not right', NULL, 'Deal for Q3 2023 - Membership Deal #6 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (7, 'Q2 2023 - Event Deal #7', 25, 35, 'Closed Lost', 34719.94, 0, '2023-03-26', '2023-10-27', 'Web', 'RivalCorp', 'Price too high', NULL, 'Deal for Q2 2023 - Event Deal #7 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (8, 'Q4 2024 - Sponsorship Deal #8', 14, 41, 'Qualification', 33116.49, 25, '2024-03-21', NULL, 'Other', 'RivalCorp', NULL, 'Negotiate terms', 'Deal for Q4 2024 - Sponsorship Deal #8 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (9, 'Q2 2024 - Training Deal #9', 28, 52, 'Proposal', 11746.72, 50, '2022-10-11', NULL, 'Other', 'CompetitorCo', NULL, 'Schedule follow-up call', 'Deal for Q2 2024 - Training Deal #9 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (10, 'Q2 2023 - Event Deal #10', 5, 50, 'Negotiation', 30198.53, 75, '2024-08-16', NULL, 'Marketing Campaign', NULL, NULL, 'Schedule follow-up call', 'Deal for Q2 2023 - Event Deal #10 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (11, 'Q3 2024 - Sponsorship Deal #11', 19, 56, 'Qualification', 23232.46, 25, '2026-01-18', NULL, 'Marketing Campaign', NULL, NULL, 'Send proposal', 'Deal for Q3 2024 - Sponsorship Deal #11 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (12, 'Q1 2024 - Training Deal #12', 13, 20, 'Proposal', 38363.03, 50, '2025-01-09', NULL, 'Web', NULL, NULL, 'Negotiate terms', 'Deal for Q1 2024 - Training Deal #12 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (13, 'Q1 2022 - Membership Deal #13', 20, 31, 'Prospecting', 12802.71, 10, '2025-03-07', NULL, 'Referral', 'CompetitorCo', NULL, 'Get approval from board', 'Deal for Q1 2022 - Membership Deal #13 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (14, 'Q2 2023 - Event Deal #14', 11, 34, 'Closed Won', 43749.22, 100, '2024-05-16', '2023-03-10', 'Trade Show', NULL, NULL, NULL, 'Deal for Q2 2023 - Event Deal #14 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (15, 'Q4 2024 - Event Deal #15', 34, 58, 'Prospecting', 13147.38, 10, '2022-05-12', NULL, 'Partner', 'CompetitorCo', NULL, 'Finalize contract', 'Deal for Q4 2024 - Event Deal #15 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (16, 'Q2 2023 - Sponsorship Deal #16', 5, 8, 'Qualification', 4302.62, 25, '2022-03-06', NULL, 'Partner', 'CompetitorCo', NULL, 'Finalize contract', 'Deal for Q2 2023 - Sponsorship Deal #16 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (17, 'Q3 2025 - Advertising Deal #17', 35, 17, 'Closed Lost', 46840.20, 0, '2025-03-15', '2025-03-26', 'Other', 'RivalCorp', 'Project cancelled', NULL, 'Deal for Q3 2025 - Advertising Deal #17 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (18, 'Q2 2022 - Sponsorship Deal #18', 28, 46, 'Negotiation', 21144.01, 75, '2026-02-02', NULL, 'Web', NULL, NULL, 'Schedule follow-up call', 'Deal for Q2 2022 - Sponsorship Deal #18 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (19, 'Q4 2024 - Sponsorship Deal #19', 16, 25, 'Qualification', 27278.00, 25, '2022-10-15', NULL, 'Direct', 'RivalCorp', NULL, 'Negotiate terms', 'Deal for Q4 2024 - Sponsorship Deal #19 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (20, 'Q2 2022 - Event Deal #20', 7, 7, 'Closed Lost', 49964.84, 0, '2022-01-31', '2022-07-11', 'Trade Show', 'RivalCorp', 'Project cancelled', NULL, 'Deal for Q2 2022 - Event Deal #20 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (21, 'Q4 2023 - Event Deal #21', 4, 22, 'Negotiation', 1105.61, 75, '2024-03-10', NULL, 'Marketing Campaign', NULL, NULL, 'Get approval from board', 'Deal for Q4 2023 - Event Deal #21 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (22, 'Q4 2025 - Advertising Deal #22', 13, 38, 'Qualification', 48466.76, 25, '2025-04-01', NULL, 'Web', NULL, NULL, 'Negotiate terms', 'Deal for Q4 2025 - Advertising Deal #22 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (23, 'Q1 2025 - Training Deal #23', 34, 21, 'Prospecting', 48078.17, 10, '2022-06-14', NULL, 'Cold Call', 'CompetitorCo', NULL, 'Finalize contract', 'Deal for Q1 2025 - Training Deal #23 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (24, 'Q2 2025 - Sponsorship Deal #24', 16, 6, 'Closed Won', 5017.19, 100, '2025-09-08', '2025-04-10', 'Partner', 'AlternativeSolutions', NULL, NULL, 'Deal for Q2 2025 - Sponsorship Deal #24 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (25, 'Q3 2023 - Membership Deal #25', 26, 17, 'Closed Lost', 32629.54, 0, '2024-07-25', '2023-10-10', 'Referral', 'CompetitorCo', 'Project cancelled', NULL, 'Deal for Q3 2023 - Membership Deal #25 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (26, 'Q1 2022 - Training Deal #26', 14, 65, 'Proposal', 7490.37, 50, '2023-12-16', NULL, 'Referral', 'RivalCorp', NULL, 'Negotiate terms', 'Deal for Q1 2022 - Training Deal #26 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (27, 'Q2 2025 - Training Deal #27', 20, 2, 'Closed Lost', 41038.10, 0, '2023-09-06', '2022-08-01', 'Cold Call', 'AlternativeSolutions', 'Price too high', NULL, 'Deal for Q2 2025 - Training Deal #27 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (28, 'Q2 2024 - Membership Deal #28', 14, 44, 'Qualification', 34687.36, 25, '2023-06-25', NULL, 'Other', 'AlternativeSolutions', NULL, 'Schedule follow-up call', 'Deal for Q2 2024 - Membership Deal #28 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (29, 'Q4 2024 - Sponsorship Deal #29', 1, 43, 'Qualification', 32218.56, 25, '2023-06-21', NULL, 'Cold Call', NULL, NULL, 'Get approval from board', 'Deal for Q4 2024 - Sponsorship Deal #29 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (30, 'Q4 2022 - Sponsorship Deal #30', 5, 20, 'Closed Won', 2765.38, 100, '2024-01-27', '2025-04-07', 'Cold Call', 'DirectCompete Inc', NULL, NULL, 'Deal for Q4 2022 - Sponsorship Deal #30 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (31, 'Q1 2024 - Membership Deal #31', 3, 46, 'Qualification', 34421.27, 25, '2025-09-27', NULL, 'Referral', 'AlternativeSolutions', NULL, 'Finalize contract', 'Deal for Q1 2024 - Membership Deal #31 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (32, 'Q2 2023 - Advertising Deal #32', 12, 53, 'Prospecting', 9788.67, 10, '2023-11-12', NULL, 'Direct', NULL, NULL, 'Send proposal', 'Deal for Q2 2023 - Advertising Deal #32 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (33, 'Q2 2022 - Event Deal #33', 3, 61, 'Qualification', 10779.07, 25, '2024-07-31', NULL, 'Partner', 'AlternativeSolutions', NULL, 'Send proposal', 'Deal for Q2 2022 - Event Deal #33 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (34, 'Q1 2023 - Event Deal #34', 22, 36, 'Prospecting', 48377.57, 10, '2023-07-26', NULL, 'Partner', NULL, NULL, 'Finalize contract', 'Deal for Q1 2023 - Event Deal #34 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (35, 'Q3 2022 - Sponsorship Deal #35', 17, 23, 'Closed Won', 48164.18, 100, '2023-06-28', '2022-03-20', 'Referral', NULL, NULL, NULL, 'Deal for Q3 2022 - Sponsorship Deal #35 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (36, 'Q3 2024 - Event Deal #36', 33, 15, 'Negotiation', 45075.73, 75, '2023-01-25', NULL, 'Marketing Campaign', 'CompetitorCo', NULL, 'Get approval from board', 'Deal for Q3 2024 - Event Deal #36 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (37, 'Q2 2024 - Event Deal #37', 5, 43, 'Closed Won', 16381.87, 100, '2022-09-13', '2023-09-08', 'Marketing Campaign', NULL, NULL, NULL, 'Deal for Q2 2024 - Event Deal #37 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (38, 'Q3 2025 - Membership Deal #38', 9, 25, 'Negotiation', 33581.54, 75, '2024-02-16', NULL, 'Cold Call', NULL, NULL, 'Finalize contract', 'Deal for Q3 2025 - Membership Deal #38 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (39, 'Q4 2022 - Membership Deal #39', 19, 27, 'Negotiation', 39502.18, 75, '2025-05-27', NULL, 'Partner', 'DirectCompete Inc', NULL, 'Get approval from board', 'Deal for Q4 2022 - Membership Deal #39 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (40, 'Q2 2025 - Advertising Deal #40', 6, 37, 'Closed Won', 33528.84, 100, '2025-06-22', '2023-11-18', 'Referral', NULL, NULL, NULL, 'Deal for Q2 2025 - Advertising Deal #40 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (41, 'Q3 2023 - Advertising Deal #41', 10, 4, 'Prospecting', 12997.28, 10, '2024-08-31', NULL, 'Referral', 'DirectCompete Inc', NULL, 'Get approval from board', 'Deal for Q3 2023 - Advertising Deal #41 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (42, 'Q2 2025 - Event Deal #42', 26, 32, 'Qualification', 33146.84, 25, '2022-01-12', NULL, 'Referral', NULL, NULL, 'Get approval from board', 'Deal for Q2 2025 - Event Deal #42 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (43, 'Q2 2025 - Sponsorship Deal #43', 16, 16, 'Negotiation', 7533.62, 75, '2024-08-09', NULL, 'Partner', NULL, NULL, 'Get approval from board', 'Deal for Q2 2025 - Sponsorship Deal #43 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (44, 'Q4 2025 - Advertising Deal #44', 31, 58, 'Proposal', 37837.06, 50, '2025-07-29', NULL, 'Marketing Campaign', NULL, NULL, 'Finalize contract', 'Deal for Q4 2025 - Advertising Deal #44 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (45, 'Q2 2024 - Event Deal #45', 5, 37, 'Qualification', 14314.04, 25, '2023-10-17', NULL, 'Referral', 'RivalCorp', NULL, 'Send proposal', 'Deal for Q2 2024 - Event Deal #45 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (46, 'Q4 2023 - Advertising Deal #46', 5, 54, 'Negotiation', 17213.19, 75, '2024-08-12', NULL, 'Direct', 'CompetitorCo', NULL, 'Send proposal', 'Deal for Q4 2023 - Advertising Deal #46 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (47, 'Q4 2022 - Training Deal #47', 25, 62, 'Prospecting', 47194.34, 10, '2023-09-04', NULL, 'Direct', NULL, NULL, 'Get approval from board', 'Deal for Q4 2022 - Training Deal #47 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (48, 'Q2 2025 - Advertising Deal #48', 18, 56, 'Negotiation', 2422.22, 75, '2023-11-20', NULL, 'Direct', NULL, NULL, 'Send proposal', 'Deal for Q2 2025 - Advertising Deal #48 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (49, 'Q2 2022 - Event Deal #49', 2, 11, 'Closed Lost', 22002.03, 0, '2024-08-03', '2023-01-08', 'Web', 'AlternativeSolutions', 'Project cancelled', NULL, 'Deal for Q2 2022 - Event Deal #49 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (50, 'Q2 2025 - Membership Deal #50', 22, 49, 'Proposal', 37848.48, 50, '2024-05-13', NULL, 'Marketing Campaign', NULL, NULL, 'Schedule follow-up call', 'Deal for Q2 2025 - Membership Deal #50 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (51, 'Q1 2022 - Membership Deal #51', 15, 9, 'Closed Lost', 2972.65, 0, '2022-03-05', '2023-05-22', 'Trade Show', NULL, 'Price too high', NULL, 'Deal for Q1 2022 - Membership Deal #51 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (52, 'Q2 2023 - Advertising Deal #52', 31, 15, 'Closed Won', 47440.09, 100, '2024-08-10', '2023-06-09', 'Partner', 'RivalCorp', NULL, NULL, 'Deal for Q2 2023 - Advertising Deal #52 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (53, 'Q1 2023 - Membership Deal #53', 7, 4, 'Proposal', 29214.04, 50, '2024-02-08', NULL, 'Direct', NULL, NULL, 'Send proposal', 'Deal for Q1 2023 - Membership Deal #53 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (54, 'Q2 2022 - Membership Deal #54', 8, 6, 'Proposal', 27104.52, 50, '2025-09-16', NULL, 'Partner', 'CompetitorCo', NULL, 'Finalize contract', 'Deal for Q2 2022 - Membership Deal #54 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (55, 'Q1 2025 - Event Deal #55', 7, 56, 'Proposal', 32143.67, 50, '2024-07-30', NULL, 'Cold Call', 'DirectCompete Inc', NULL, 'Send proposal', 'Deal for Q1 2025 - Event Deal #55 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (56, 'Q3 2025 - Event Deal #56', 28, 35, 'Proposal', 42733.94, 50, '2022-06-27', NULL, 'Marketing Campaign', 'DirectCompete Inc', NULL, 'Send proposal', 'Deal for Q3 2025 - Event Deal #56 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (57, 'Q4 2024 - Sponsorship Deal #57', 32, 42, 'Qualification', 24889.95, 25, '2023-12-28', NULL, 'Marketing Campaign', 'AlternativeSolutions', NULL, 'Negotiate terms', 'Deal for Q4 2024 - Sponsorship Deal #57 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (58, 'Q3 2022 - Training Deal #58', 13, 11, 'Qualification', 36283.66, 25, '2024-09-27', NULL, 'Trade Show', NULL, NULL, 'Get approval from board', 'Deal for Q3 2022 - Training Deal #58 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (59, 'Q4 2022 - Sponsorship Deal #59', 19, 29, 'Negotiation', 34897.57, 75, '2023-09-20', NULL, 'Partner', 'DirectCompete Inc', NULL, 'Finalize contract', 'Deal for Q4 2022 - Sponsorship Deal #59 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (60, 'Q3 2025 - Training Deal #60', 22, 46, 'Closed Lost', 23233.52, 0, '2023-09-20', '2023-05-30', 'Trade Show', 'CompetitorCo', 'Timing not right', NULL, 'Deal for Q3 2025 - Training Deal #60 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (61, 'Q3 2022 - Training Deal #61', 12, 25, 'Qualification', 37191.63, 25, '2023-07-21', NULL, 'Marketing Campaign', 'CompetitorCo', NULL, 'Send proposal', 'Deal for Q3 2022 - Training Deal #61 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (62, 'Q2 2024 - Advertising Deal #62', 20, 2, 'Closed Lost', 27172.62, 0, '2023-07-16', '2022-04-04', 'Web', NULL, 'Went with competitor', NULL, 'Deal for Q2 2024 - Advertising Deal #62 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (63, 'Q4 2022 - Sponsorship Deal #63', 19, 61, 'Negotiation', 22582.97, 75, '2023-01-13', NULL, 'Web', 'AlternativeSolutions', NULL, 'Get approval from board', 'Deal for Q4 2022 - Sponsorship Deal #63 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (64, 'Q1 2025 - Event Deal #64', 5, 7, 'Qualification', 8310.68, 25, '2025-02-26', NULL, 'Marketing Campaign', 'CompetitorCo', NULL, 'Send proposal', 'Deal for Q1 2025 - Event Deal #64 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (65, 'Q4 2023 - Training Deal #65', 25, 58, 'Negotiation', 15570.30, 75, '2025-04-20', NULL, 'Direct', 'AlternativeSolutions', NULL, 'Finalize contract', 'Deal for Q4 2023 - Training Deal #65 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (66, 'Q1 2022 - Advertising Deal #66', 14, 34, 'Closed Lost', 4978.19, 0, '2023-05-07', '2022-12-22', 'Referral', 'RivalCorp', 'Price too high', NULL, 'Deal for Q1 2022 - Advertising Deal #66 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (67, 'Q4 2025 - Membership Deal #67', 3, 30, 'Proposal', 35640.84, 50, '2025-12-10', NULL, 'Other', 'CompetitorCo', NULL, 'Send proposal', 'Deal for Q4 2025 - Membership Deal #67 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (68, 'Q2 2025 - Sponsorship Deal #68', 35, 29, 'Closed Lost', 8300.48, 0, '2023-06-29', '2022-10-19', 'Referral', 'CompetitorCo', 'Missing features', NULL, 'Deal for Q2 2025 - Sponsorship Deal #68 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (69, 'Q3 2025 - Sponsorship Deal #69', 30, 39, 'Closed Lost', 20722.92, 0, '2023-07-12', '2024-10-21', 'Other', 'DirectCompete Inc', 'Price too high', NULL, 'Deal for Q3 2025 - Sponsorship Deal #69 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (70, 'Q1 2025 - Membership Deal #70', 17, 4, 'Prospecting', 12217.30, 10, '2025-10-12', NULL, 'Web', NULL, NULL, 'Negotiate terms', 'Deal for Q1 2025 - Membership Deal #70 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (71, 'Q1 2023 - Event Deal #71', 34, 57, 'Proposal', 9892.97, 50, '2025-04-13', NULL, 'Direct', NULL, NULL, 'Get approval from board', 'Deal for Q1 2023 - Event Deal #71 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (72, 'Q4 2024 - Event Deal #72', 22, 42, 'Closed Lost', 6125.39, 0, '2022-11-26', '2023-11-07', 'Direct', NULL, 'Project cancelled', NULL, 'Deal for Q4 2024 - Event Deal #72 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (73, 'Q4 2022 - Event Deal #73', 6, 41, 'Proposal', 16840.42, 50, '2026-05-02', NULL, 'Direct', NULL, NULL, 'Finalize contract', 'Deal for Q4 2022 - Event Deal #73 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (74, 'Q4 2025 - Sponsorship Deal #74', 13, 47, 'Closed Won', 38065.71, 100, '2025-07-04', '2024-06-24', 'Web', 'RivalCorp', NULL, NULL, 'Deal for Q4 2025 - Sponsorship Deal #74 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (75, 'Q2 2024 - Event Deal #75', 32, 16, 'Prospecting', 48684.19, 10, '2025-05-31', NULL, 'Trade Show', NULL, NULL, 'Send proposal', 'Deal for Q2 2024 - Event Deal #75 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (76, 'Q1 2025 - Sponsorship Deal #76', 15, 15, 'Negotiation', 47405.98, 75, '2025-08-19', NULL, 'Cold Call', 'DirectCompete Inc', NULL, 'Negotiate terms', 'Deal for Q1 2025 - Sponsorship Deal #76 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (77, 'Q3 2025 - Event Deal #77', 31, 32, 'Negotiation', 28011.99, 75, '2024-02-25', NULL, 'Trade Show', NULL, NULL, 'Finalize contract', 'Deal for Q3 2025 - Event Deal #77 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (78, 'Q1 2024 - Event Deal #78', 22, 65, 'Proposal', 41206.92, 50, '2023-08-03', NULL, 'Marketing Campaign', NULL, NULL, 'Finalize contract', 'Deal for Q1 2024 - Event Deal #78 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (79, 'Q4 2023 - Event Deal #79', 35, 62, 'Proposal', 17289.56, 50, '2026-04-12', NULL, 'Direct', 'DirectCompete Inc', NULL, 'Negotiate terms', 'Deal for Q4 2023 - Event Deal #79 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (80, 'Q2 2025 - Advertising Deal #80', 27, 6, 'Proposal', 37490.55, 50, '2025-12-15', NULL, 'Direct', 'DirectCompete Inc', NULL, 'Send proposal', 'Deal for Q2 2025 - Advertising Deal #80 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (81, 'Q1 2023 - Training Deal #81', 22, 13, 'Negotiation', 5885.87, 75, '2024-07-24', NULL, 'Web', NULL, NULL, 'Send proposal', 'Deal for Q1 2023 - Training Deal #81 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (82, 'Q2 2022 - Event Deal #82', 17, 44, 'Closed Won', 34942.53, 100, '2025-08-23', '2022-06-14', 'Partner', NULL, NULL, NULL, 'Deal for Q2 2022 - Event Deal #82 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (83, 'Q4 2024 - Event Deal #83', 35, 5, 'Closed Won', 4352.62, 100, '2025-07-16', '2023-08-12', 'Trade Show', NULL, NULL, NULL, 'Deal for Q4 2024 - Event Deal #83 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (84, 'Q4 2022 - Sponsorship Deal #84', 29, 22, 'Closed Lost', 15673.84, 0, '2022-03-01', '2022-04-05', 'Partner', NULL, 'Price too high', NULL, 'Deal for Q4 2022 - Sponsorship Deal #84 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (85, 'Q3 2024 - Event Deal #85', 10, 32, 'Closed Won', 21190.54, 100, '2025-10-28', '2023-01-04', 'Cold Call', 'RivalCorp', NULL, NULL, 'Deal for Q3 2024 - Event Deal #85 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (86, 'Q4 2023 - Event Deal #86', 10, 30, 'Negotiation', 32257.33, 75, '2024-07-30', NULL, 'Marketing Campaign', NULL, NULL, 'Schedule follow-up call', 'Deal for Q4 2023 - Event Deal #86 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (87, 'Q3 2023 - Sponsorship Deal #87', 29, 45, 'Closed Won', 15658.56, 100, '2024-05-18', '2023-05-28', 'Other', NULL, NULL, NULL, 'Deal for Q3 2023 - Sponsorship Deal #87 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (88, 'Q2 2025 - Event Deal #88', 7, 31, 'Negotiation', 29024.21, 75, '2025-03-23', NULL, 'Marketing Campaign', NULL, NULL, 'Negotiate terms', 'Deal for Q2 2025 - Event Deal #88 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (89, 'Q4 2024 - Sponsorship Deal #89', 4, 64, 'Proposal', 39011.31, 50, '2023-04-17', NULL, 'Partner', 'RivalCorp', NULL, 'Send proposal', 'Deal for Q4 2024 - Sponsorship Deal #89 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (90, 'Q3 2023 - Sponsorship Deal #90', 3, 40, 'Negotiation', 2634.86, 75, '2024-01-18', NULL, 'Cold Call', 'CompetitorCo', NULL, 'Negotiate terms', 'Deal for Q3 2023 - Sponsorship Deal #90 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (91, 'Q4 2023 - Advertising Deal #91', 9, 47, 'Closed Won', 25587.94, 100, '2023-07-13', '2022-12-03', 'Marketing Campaign', NULL, NULL, NULL, 'Deal for Q4 2023 - Advertising Deal #91 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (92, 'Q3 2024 - Sponsorship Deal #92', 30, 10, 'Qualification', 37953.42, 25, '2023-04-08', NULL, 'Direct', NULL, NULL, 'Finalize contract', 'Deal for Q3 2024 - Sponsorship Deal #92 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (93, 'Q1 2025 - Sponsorship Deal #93', 17, 16, 'Negotiation', 19060.70, 75, '2026-03-14', NULL, 'Marketing Campaign', NULL, NULL, 'Get approval from board', 'Deal for Q1 2025 - Sponsorship Deal #93 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (94, 'Q1 2023 - Event Deal #94', 2, 42, 'Closed Won', 11846.99, 100, '2022-05-10', '2025-07-25', 'Other', NULL, NULL, NULL, 'Deal for Q1 2023 - Event Deal #94 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (95, 'Q4 2022 - Advertising Deal #95', 3, 5, 'Proposal', 49800.44, 50, '2022-08-26', NULL, 'Referral', 'RivalCorp', NULL, 'Finalize contract', 'Deal for Q4 2022 - Advertising Deal #95 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (96, 'Q4 2025 - Membership Deal #96', 35, 54, 'Closed Won', 37371.18, 100, '2022-11-13', '2024-04-29', 'Referral', NULL, NULL, NULL, 'Deal for Q4 2025 - Membership Deal #96 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (97, 'Q4 2024 - Sponsorship Deal #97', 24, 28, 'Negotiation', 22790.10, 75, '2023-04-29', NULL, 'Partner', 'CompetitorCo', NULL, 'Negotiate terms', 'Deal for Q4 2024 - Sponsorship Deal #97 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (98, 'Q3 2022 - Event Deal #98', 18, 25, 'Prospecting', 47501.53, 10, '2024-07-20', NULL, 'Referral', NULL, NULL, 'Send proposal', 'Deal for Q3 2022 - Event Deal #98 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (99, 'Q1 2022 - Membership Deal #99', 16, 17, 'Closed Won', 11055.07, 100, '2026-04-17', '2025-02-09', 'Trade Show', NULL, NULL, NULL, 'Deal for Q1 2022 - Membership Deal #99 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (100, 'Q2 2024 - Advertising Deal #100', 1, 36, 'Qualification', 49388.84, 25, '2025-01-11', NULL, 'Marketing Campaign', NULL, NULL, 'Send proposal', 'Deal for Q2 2024 - Advertising Deal #100 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (101, 'Q1 2023 - Sponsorship Deal #101', 23, 31, 'Closed Won', 16864.80, 100, '2022-12-23', '2023-06-28', 'Web', 'RivalCorp', NULL, NULL, 'Deal for Q1 2023 - Sponsorship Deal #101 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (102, 'Q1 2022 - Event Deal #102', 29, 47, 'Closed Won', 30089.63, 100, '2024-07-14', '2024-10-28', 'Trade Show', NULL, NULL, NULL, 'Deal for Q1 2022 - Event Deal #102 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (103, 'Q3 2025 - Sponsorship Deal #103', 4, 62, 'Negotiation', 21887.41, 75, '2022-08-10', NULL, 'Other', NULL, NULL, 'Get approval from board', 'Deal for Q3 2025 - Sponsorship Deal #103 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (104, 'Q1 2024 - Training Deal #104', 10, 9, 'Qualification', 14475.78, 25, '2025-07-20', NULL, 'Partner', 'DirectCompete Inc', NULL, 'Finalize contract', 'Deal for Q1 2024 - Training Deal #104 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (105, 'Q3 2025 - Training Deal #105', 28, 13, 'Closed Lost', 6606.29, 0, '2025-09-02', '2025-08-26', 'Trade Show', 'DirectCompete Inc', 'Project cancelled', NULL, 'Deal for Q3 2025 - Training Deal #105 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (106, 'Q4 2024 - Event Deal #106', 26, 54, 'Closed Lost', 5659.21, 0, '2024-05-24', '2023-10-03', 'Marketing Campaign', 'AlternativeSolutions', 'Missing features', NULL, 'Deal for Q4 2024 - Event Deal #106 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (107, 'Q1 2022 - Sponsorship Deal #107', 6, 56, 'Prospecting', 37484.86, 10, '2024-02-03', NULL, 'Cold Call', NULL, NULL, 'Schedule follow-up call', 'Deal for Q1 2022 - Sponsorship Deal #107 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (108, 'Q3 2022 - Event Deal #108', 23, 55, 'Closed Lost', 3520.86, 0, '2023-08-13', '2025-05-14', 'Marketing Campaign', 'AlternativeSolutions', 'Price too high', NULL, 'Deal for Q3 2022 - Event Deal #108 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (109, 'Q2 2023 - Event Deal #109', 15, 14, 'Proposal', 42423.30, 50, '2024-01-23', NULL, 'Referral', NULL, NULL, 'Negotiate terms', 'Deal for Q2 2023 - Event Deal #109 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (110, 'Q2 2025 - Training Deal #110', 2, 35, 'Prospecting', 9840.39, 10, '2025-12-10', NULL, 'Marketing Campaign', 'AlternativeSolutions', NULL, 'Negotiate terms', 'Deal for Q2 2025 - Training Deal #110 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (111, 'Q2 2023 - Training Deal #111', 26, 9, 'Qualification', 37307.48, 25, '2022-03-04', NULL, 'Referral', NULL, NULL, 'Finalize contract', 'Deal for Q2 2023 - Training Deal #111 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (112, 'Q4 2025 - Event Deal #112', 22, 21, 'Proposal', 16270.23, 50, '2023-10-27', NULL, 'Referral', 'CompetitorCo', NULL, 'Send proposal', 'Deal for Q4 2025 - Event Deal #112 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (113, 'Q1 2022 - Membership Deal #113', 29, 55, 'Negotiation', 30746.72, 75, '2024-04-28', NULL, 'Marketing Campaign', 'RivalCorp', NULL, 'Finalize contract', 'Deal for Q1 2022 - Membership Deal #113 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (114, 'Q3 2025 - Sponsorship Deal #114', 19, 63, 'Closed Won', 33689.50, 100, '2022-04-04', '2023-03-28', 'Direct', NULL, NULL, NULL, 'Deal for Q3 2025 - Sponsorship Deal #114 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (115, 'Q1 2023 - Membership Deal #115', 14, 18, 'Proposal', 15182.91, 50, '2022-09-03', NULL, 'Web', 'DirectCompete Inc', NULL, 'Get approval from board', 'Deal for Q1 2023 - Membership Deal #115 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (116, 'Q2 2025 - Training Deal #116', 15, 65, 'Closed Won', 41834.36, 100, '2023-12-27', '2022-05-28', 'Direct', NULL, NULL, NULL, 'Deal for Q2 2025 - Training Deal #116 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (117, 'Q4 2022 - Event Deal #117', 5, 41, 'Closed Won', 22034.93, 100, '2024-04-08', '2025-08-04', 'Direct', 'AlternativeSolutions', NULL, NULL, 'Deal for Q4 2022 - Event Deal #117 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (118, 'Q4 2022 - Membership Deal #118', 11, 59, 'Closed Lost', 46068.72, 0, '2022-06-30', '2024-06-13', 'Referral', 'RivalCorp', 'Project cancelled', NULL, 'Deal for Q4 2022 - Membership Deal #118 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (119, 'Q4 2022 - Event Deal #119', 20, 44, 'Qualification', 17320.36, 25, '2022-12-11', NULL, 'Referral', NULL, NULL, 'Schedule follow-up call', 'Deal for Q4 2022 - Event Deal #119 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (120, 'Q2 2024 - Membership Deal #120', 10, 31, 'Prospecting', 8175.77, 10, '2023-02-09', NULL, 'Cold Call', NULL, NULL, 'Send proposal', 'Deal for Q2 2024 - Membership Deal #120 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (121, 'Q2 2025 - Event Deal #121', 29, 42, 'Closed Lost', 16490.81, 0, '2024-06-19', '2022-05-20', 'Other', 'DirectCompete Inc', 'Timing not right', NULL, 'Deal for Q2 2025 - Event Deal #121 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (122, 'Q3 2022 - Membership Deal #122', 33, 10, 'Proposal', 23625.38, 50, '2022-03-19', NULL, 'Web', 'AlternativeSolutions', NULL, 'Negotiate terms', 'Deal for Q3 2022 - Membership Deal #122 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (123, 'Q1 2025 - Event Deal #123', 3, 58, 'Closed Won', 32940.04, 100, '2023-10-21', '2025-05-24', 'Other', NULL, NULL, NULL, 'Deal for Q1 2025 - Event Deal #123 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (124, 'Q1 2025 - Sponsorship Deal #124', 22, 11, 'Closed Won', 32660.23, 100, '2022-03-22', '2023-05-23', 'Other', 'DirectCompete Inc', NULL, NULL, 'Deal for Q1 2025 - Sponsorship Deal #124 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (125, 'Q2 2024 - Membership Deal #125', 19, 50, 'Negotiation', 38948.77, 75, '2025-10-22', NULL, 'Web', NULL, NULL, 'Negotiate terms', 'Deal for Q2 2024 - Membership Deal #125 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (126, 'Q3 2022 - Training Deal #126', 25, 37, 'Proposal', 36462.95, 50, '2025-09-06', NULL, 'Cold Call', 'AlternativeSolutions', NULL, 'Schedule follow-up call', 'Deal for Q3 2022 - Training Deal #126 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (127, 'Q2 2024 - Membership Deal #127', 26, 17, 'Closed Won', 35732.87, 100, '2022-06-23', '2023-09-27', 'Direct', NULL, NULL, NULL, 'Deal for Q2 2024 - Membership Deal #127 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (128, 'Q2 2022 - Event Deal #128', 33, 47, 'Prospecting', 18767.29, 10, '2023-01-05', NULL, 'Trade Show', 'AlternativeSolutions', NULL, 'Get approval from board', 'Deal for Q2 2022 - Event Deal #128 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (129, 'Q2 2023 - Advertising Deal #129', 5, 38, 'Prospecting', 25876.80, 10, '2025-01-10', NULL, 'Web', NULL, NULL, 'Negotiate terms', 'Deal for Q2 2023 - Advertising Deal #129 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (130, 'Q2 2025 - Advertising Deal #130', 11, 24, 'Closed Lost', 38783.79, 0, '2022-12-06', '2024-06-15', 'Web', 'DirectCompete Inc', 'Went with competitor', NULL, 'Deal for Q2 2025 - Advertising Deal #130 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (131, 'Q4 2024 - Event Deal #131', 15, 31, 'Proposal', 48314.24, 50, '2026-05-26', NULL, 'Other', NULL, NULL, 'Send proposal', 'Deal for Q4 2024 - Event Deal #131 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (132, 'Q4 2025 - Membership Deal #132', 25, 65, 'Closed Won', 21514.38, 100, '2022-11-28', '2023-02-13', 'Cold Call', NULL, NULL, NULL, 'Deal for Q4 2025 - Membership Deal #132 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (133, 'Q1 2025 - Membership Deal #133', 7, 16, 'Proposal', 5109.88, 50, '2022-11-25', NULL, 'Marketing Campaign', 'DirectCompete Inc', NULL, 'Finalize contract', 'Deal for Q1 2025 - Membership Deal #133 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (134, 'Q4 2022 - Advertising Deal #134', 29, 45, 'Prospecting', 21329.95, 10, '2024-03-22', NULL, 'Partner', 'RivalCorp', NULL, 'Get approval from board', 'Deal for Q4 2022 - Advertising Deal #134 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (135, 'Q3 2023 - Sponsorship Deal #135', 21, 13, 'Closed Lost', 32848.07, 0, '2026-06-09', '2022-10-27', 'Cold Call', 'CompetitorCo', 'Went with competitor', NULL, 'Deal for Q3 2023 - Sponsorship Deal #135 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (136, 'Q2 2025 - Event Deal #136', 1, 11, 'Prospecting', 13540.27, 10, '2022-11-03', NULL, 'Direct', 'CompetitorCo', NULL, 'Negotiate terms', 'Deal for Q2 2025 - Event Deal #136 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (137, 'Q3 2022 - Sponsorship Deal #137', 16, 54, 'Closed Lost', 39901.06, 0, '2024-07-25', '2022-05-09', 'Referral', NULL, 'Project cancelled', NULL, 'Deal for Q3 2022 - Sponsorship Deal #137 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (138, 'Q1 2023 - Advertising Deal #138', 19, 55, 'Prospecting', 31125.67, 10, '2023-05-08', NULL, 'Direct', 'RivalCorp', NULL, 'Schedule follow-up call', 'Deal for Q1 2023 - Advertising Deal #138 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (139, 'Q3 2022 - Training Deal #139', 35, 65, 'Closed Won', 28153.45, 100, '2024-03-10', '2024-08-20', 'Web', NULL, NULL, NULL, 'Deal for Q3 2022 - Training Deal #139 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (140, 'Q3 2024 - Sponsorship Deal #140', 23, 9, 'Proposal', 12815.17, 50, '2025-09-07', NULL, 'Referral', NULL, NULL, 'Finalize contract', 'Deal for Q3 2024 - Sponsorship Deal #140 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (141, 'Q2 2022 - Membership Deal #141', 35, 44, 'Closed Lost', 9579.37, 0, '2026-05-15', '2024-08-09', 'Other', NULL, 'Missing features', NULL, 'Deal for Q2 2022 - Membership Deal #141 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (142, 'Q1 2025 - Sponsorship Deal #142', 19, 26, 'Prospecting', 39764.35, 10, '2022-03-27', NULL, 'Partner', 'AlternativeSolutions', NULL, 'Finalize contract', 'Deal for Q1 2025 - Sponsorship Deal #142 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (143, 'Q4 2024 - Sponsorship Deal #143', 13, 37, 'Proposal', 43244.79, 50, '2022-04-08', NULL, 'Partner', 'AlternativeSolutions', NULL, 'Schedule follow-up call', 'Deal for Q4 2024 - Sponsorship Deal #143 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (144, 'Q4 2025 - Event Deal #144', 25, 44, 'Qualification', 25313.96, 25, '2024-10-15', NULL, 'Partner', NULL, NULL, 'Finalize contract', 'Deal for Q4 2025 - Event Deal #144 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (145, 'Q1 2025 - Sponsorship Deal #145', 28, 24, 'Closed Won', 15394.55, 100, '2022-07-30', '2022-06-13', 'Partner', NULL, NULL, NULL, 'Deal for Q1 2025 - Sponsorship Deal #145 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (146, 'Q3 2025 - Training Deal #146', 28, 22, 'Closed Lost', 22751.51, 0, '2024-07-04', '2022-03-28', 'Partner', NULL, 'Project cancelled', NULL, 'Deal for Q3 2025 - Training Deal #146 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (147, 'Q1 2022 - Event Deal #147', 24, 21, 'Prospecting', 7996.19, 10, '2025-05-29', NULL, 'Other', 'CompetitorCo', NULL, 'Send proposal', 'Deal for Q1 2022 - Event Deal #147 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (148, 'Q2 2024 - Membership Deal #148', 25, 5, 'Closed Won', 8518.47, 100, '2024-07-10', '2024-01-30', 'Partner', 'DirectCompete Inc', NULL, NULL, 'Deal for Q2 2024 - Membership Deal #148 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (149, 'Q2 2024 - Event Deal #149', 21, 36, 'Qualification', 48065.48, 25, '2022-02-23', NULL, 'Cold Call', 'DirectCompete Inc', NULL, 'Finalize contract', 'Deal for Q2 2024 - Event Deal #149 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (150, 'Q1 2024 - Membership Deal #150', 29, 28, 'Closed Won', 14993.27, 100, '2024-10-02', '2023-02-14', 'Referral', 'RivalCorp', NULL, NULL, 'Deal for Q1 2024 - Membership Deal #150 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (151, 'Q4 2023 - Event Deal #151', 6, 41, 'Closed Lost', 18023.84, 0, '2022-05-13', '2025-01-31', 'Marketing Campaign', 'AlternativeSolutions', 'Missing features', NULL, 'Deal for Q4 2023 - Event Deal #151 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (152, 'Q3 2023 - Sponsorship Deal #152', 13, 18, 'Qualification', 39728.28, 25, '2022-02-23', NULL, 'Partner', NULL, NULL, 'Finalize contract', 'Deal for Q3 2023 - Sponsorship Deal #152 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (153, 'Q4 2023 - Training Deal #153', 6, 9, 'Proposal', 20509.84, 50, '2026-01-08', NULL, 'Other', NULL, NULL, 'Get approval from board', 'Deal for Q4 2023 - Training Deal #153 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (154, 'Q1 2023 - Membership Deal #154', 5, 58, 'Negotiation', 34325.34, 75, '2023-12-07', NULL, 'Cold Call', NULL, NULL, 'Finalize contract', 'Deal for Q1 2023 - Membership Deal #154 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (155, 'Q2 2023 - Event Deal #155', 33, 8, 'Prospecting', 26387.00, 10, '2023-09-15', NULL, 'Cold Call', 'RivalCorp', NULL, 'Negotiate terms', 'Deal for Q2 2023 - Event Deal #155 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (156, 'Q3 2024 - Sponsorship Deal #156', 17, 26, 'Closed Lost', 47861.23, 0, '2023-07-17', '2022-09-14', 'Marketing Campaign', NULL, 'Budget constraints', NULL, 'Deal for Q3 2024 - Sponsorship Deal #156 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (157, 'Q2 2023 - Advertising Deal #157', 22, 6, 'Prospecting', 4979.92, 10, '2025-08-06', NULL, 'Marketing Campaign', NULL, NULL, 'Send proposal', 'Deal for Q2 2023 - Advertising Deal #157 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (158, 'Q4 2022 - Event Deal #158', 35, 38, 'Closed Lost', 47875.86, 0, '2024-09-16', '2023-05-17', 'Direct', 'AlternativeSolutions', 'Project cancelled', NULL, 'Deal for Q4 2022 - Event Deal #158 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (159, 'Q1 2023 - Event Deal #159', 27, 62, 'Negotiation', 10997.13, 75, '2025-05-27', NULL, 'Cold Call', 'AlternativeSolutions', NULL, 'Negotiate terms', 'Deal for Q1 2023 - Event Deal #159 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (160, 'Q4 2023 - Membership Deal #160', 33, 14, 'Proposal', 12845.16, 50, '2022-09-08', NULL, 'Marketing Campaign', 'DirectCompete Inc', NULL, 'Send proposal', 'Deal for Q4 2023 - Membership Deal #160 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (161, 'Q1 2022 - Membership Deal #161', 25, 54, 'Qualification', 48171.61, 25, '2022-11-24', NULL, 'Partner', NULL, NULL, 'Negotiate terms', 'Deal for Q1 2022 - Membership Deal #161 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (162, 'Q2 2025 - Training Deal #162', 30, 64, 'Proposal', 25371.14, 50, '2022-07-04', NULL, 'Direct', NULL, NULL, 'Get approval from board', 'Deal for Q2 2025 - Training Deal #162 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (163, 'Q2 2024 - Sponsorship Deal #163', 4, 37, 'Negotiation', 30278.42, 75, '2025-09-01', NULL, 'Other', 'AlternativeSolutions', NULL, 'Finalize contract', 'Deal for Q2 2024 - Sponsorship Deal #163 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (164, 'Q1 2025 - Advertising Deal #164', 17, 47, 'Negotiation', 18930.93, 75, '2024-03-31', NULL, 'Web', NULL, NULL, 'Finalize contract', 'Deal for Q1 2025 - Advertising Deal #164 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (165, 'Q3 2024 - Sponsorship Deal #165', 25, 65, 'Negotiation', 38455.80, 75, '2023-07-27', NULL, 'Referral', 'RivalCorp', NULL, 'Schedule follow-up call', 'Deal for Q3 2024 - Sponsorship Deal #165 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (166, 'Q3 2024 - Training Deal #166', 24, 19, 'Qualification', 30520.68, 25, '2024-04-02', NULL, 'Web', 'CompetitorCo', NULL, 'Schedule follow-up call', 'Deal for Q3 2024 - Training Deal #166 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (167, 'Q3 2025 - Training Deal #167', 30, 20, 'Closed Won', 44763.45, 100, '2022-10-14', '2023-11-03', 'Partner', 'RivalCorp', NULL, NULL, 'Deal for Q3 2025 - Training Deal #167 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (168, 'Q3 2024 - Training Deal #168', 33, 63, 'Closed Lost', 28583.29, 0, '2024-08-30', '2022-02-04', 'Partner', 'AlternativeSolutions', 'Timing not right', NULL, 'Deal for Q3 2024 - Training Deal #168 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (169, 'Q4 2024 - Sponsorship Deal #169', 31, 34, 'Closed Lost', 39362.30, 0, '2026-05-09', '2025-03-30', 'Trade Show', NULL, 'Price too high', NULL, 'Deal for Q4 2024 - Sponsorship Deal #169 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (170, 'Q4 2023 - Training Deal #170', 25, 19, 'Closed Lost', 12867.63, 0, '2025-03-18', '2022-08-14', 'Trade Show', 'CompetitorCo', 'Project cancelled', NULL, 'Deal for Q4 2023 - Training Deal #170 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (171, 'Q4 2023 - Event Deal #171', 14, 53, 'Closed Won', 38973.64, 100, '2024-08-23', '2022-05-08', 'Cold Call', NULL, NULL, NULL, 'Deal for Q4 2023 - Event Deal #171 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (172, 'Q3 2025 - Training Deal #172', 25, 41, 'Qualification', 23523.51, 25, '2024-12-27', NULL, 'Partner', NULL, NULL, 'Negotiate terms', 'Deal for Q3 2025 - Training Deal #172 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (173, 'Q4 2023 - Advertising Deal #173', 18, 39, 'Qualification', 47132.79, 25, '2023-09-02', NULL, 'Marketing Campaign', NULL, NULL, 'Send proposal', 'Deal for Q4 2023 - Advertising Deal #173 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (174, 'Q3 2025 - Membership Deal #174', 18, 37, 'Prospecting', 29100.36, 10, '2025-01-17', NULL, 'Direct', 'DirectCompete Inc', NULL, 'Negotiate terms', 'Deal for Q3 2025 - Membership Deal #174 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (175, 'Q3 2022 - Membership Deal #175', 6, 45, 'Negotiation', 33142.63, 75, '2026-03-11', NULL, 'Other', 'RivalCorp', NULL, 'Send proposal', 'Deal for Q3 2022 - Membership Deal #175 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (176, 'Q3 2024 - Advertising Deal #176', 7, 31, 'Qualification', 3487.51, 25, '2024-12-23', NULL, 'Trade Show', NULL, NULL, 'Send proposal', 'Deal for Q3 2024 - Advertising Deal #176 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (177, 'Q1 2025 - Membership Deal #177', 31, 13, 'Closed Lost', 38767.54, 0, '2022-01-11', '2025-02-01', 'Cold Call', 'DirectCompete Inc', 'Timing not right', NULL, 'Deal for Q1 2025 - Membership Deal #177 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (178, 'Q4 2023 - Membership Deal #178', 21, 37, 'Closed Lost', 3898.97, 0, '2026-04-24', '2022-07-03', 'Trade Show', NULL, 'Timing not right', NULL, 'Deal for Q4 2023 - Membership Deal #178 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (179, 'Q2 2025 - Advertising Deal #179', 3, 51, 'Negotiation', 10129.27, 75, '2026-03-14', NULL, 'Marketing Campaign', 'CompetitorCo', NULL, 'Schedule follow-up call', 'Deal for Q2 2025 - Advertising Deal #179 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (180, 'Q1 2024 - Membership Deal #180', 30, 64, 'Qualification', 42701.93, 25, '2024-08-16', NULL, 'Marketing Campaign', 'RivalCorp', NULL, 'Schedule follow-up call', 'Deal for Q1 2024 - Membership Deal #180 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (181, 'Q2 2025 - Membership Deal #181', 12, 2, 'Closed Lost', 17518.50, 0, '2023-08-28', '2025-03-08', 'Trade Show', 'RivalCorp', 'Budget constraints', NULL, 'Deal for Q2 2025 - Membership Deal #181 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (182, 'Q4 2024 - Sponsorship Deal #182', 26, 13, 'Qualification', 49102.57, 25, '2024-09-04', NULL, 'Partner', 'RivalCorp', NULL, 'Schedule follow-up call', 'Deal for Q4 2024 - Sponsorship Deal #182 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (183, 'Q4 2023 - Event Deal #183', 18, 43, 'Proposal', 29540.58, 50, '2025-03-19', NULL, 'Web', 'AlternativeSolutions', NULL, 'Negotiate terms', 'Deal for Q4 2023 - Event Deal #183 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (184, 'Q1 2022 - Event Deal #184', 20, 21, 'Negotiation', 34617.61, 75, '2025-12-11', NULL, 'Marketing Campaign', NULL, NULL, 'Schedule follow-up call', 'Deal for Q1 2022 - Event Deal #184 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (185, 'Q3 2023 - Advertising Deal #185', 9, 62, 'Qualification', 23293.95, 25, '2025-05-25', NULL, 'Partner', 'DirectCompete Inc', NULL, 'Finalize contract', 'Deal for Q3 2023 - Advertising Deal #185 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (186, 'Q2 2023 - Training Deal #186', 6, 58, 'Closed Won', 35484.54, 100, '2022-06-09', '2025-03-01', 'Referral', 'CompetitorCo', NULL, NULL, 'Deal for Q2 2023 - Training Deal #186 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (187, 'Q2 2023 - Advertising Deal #187', 21, 57, 'Prospecting', 34334.47, 10, '2026-01-08', NULL, 'Other', 'CompetitorCo', NULL, 'Finalize contract', 'Deal for Q2 2023 - Advertising Deal #187 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (188, 'Q1 2025 - Advertising Deal #188', 33, 54, 'Negotiation', 28631.65, 75, '2025-02-18', NULL, 'Other', NULL, NULL, 'Negotiate terms', 'Deal for Q1 2025 - Advertising Deal #188 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (189, 'Q4 2024 - Sponsorship Deal #189', 14, 10, 'Prospecting', 21761.17, 10, '2025-12-05', NULL, 'Referral', NULL, NULL, 'Schedule follow-up call', 'Deal for Q4 2024 - Sponsorship Deal #189 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (190, 'Q4 2022 - Membership Deal #190', 27, 24, 'Qualification', 38525.56, 25, '2026-02-02', NULL, 'Direct', 'AlternativeSolutions', NULL, 'Get approval from board', 'Deal for Q4 2022 - Membership Deal #190 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (191, 'Q4 2025 - Sponsorship Deal #191', 35, 18, 'Closed Lost', 43154.04, 0, '2022-08-31', '2023-01-01', 'Direct', NULL, 'Missing features', NULL, 'Deal for Q4 2025 - Sponsorship Deal #191 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (192, 'Q1 2022 - Membership Deal #192', 30, 55, 'Closed Won', 19584.55, 100, '2023-04-16', '2023-05-22', 'Other', 'AlternativeSolutions', NULL, NULL, 'Deal for Q1 2022 - Membership Deal #192 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (193, 'Q3 2023 - Sponsorship Deal #193', 3, 54, 'Closed Won', 38536.62, 100, '2022-02-02', '2023-05-08', 'Trade Show', 'CompetitorCo', NULL, NULL, 'Deal for Q3 2023 - Sponsorship Deal #193 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (194, 'Q1 2025 - Training Deal #194', 4, 32, 'Closed Lost', 3167.60, 0, '2024-06-17', '2023-04-25', 'Trade Show', NULL, 'Price too high', NULL, 'Deal for Q1 2025 - Training Deal #194 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (195, 'Q3 2023 - Training Deal #195', 21, 42, 'Qualification', 15786.46, 25, '2022-10-21', NULL, 'Trade Show', 'DirectCompete Inc', NULL, 'Negotiate terms', 'Deal for Q3 2023 - Training Deal #195 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (196, 'Q1 2023 - Event Deal #196', 32, 7, 'Proposal', 47137.73, 50, '2025-10-06', NULL, 'Direct', NULL, NULL, 'Finalize contract', 'Deal for Q1 2023 - Event Deal #196 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (197, 'Q4 2025 - Advertising Deal #197', 20, 49, 'Qualification', 37966.39, 25, '2024-08-27', NULL, 'Trade Show', NULL, NULL, 'Send proposal', 'Deal for Q4 2025 - Advertising Deal #197 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (198, 'Q2 2025 - Sponsorship Deal #198', 27, 54, 'Closed Won', 26969.60, 100, '2024-03-06', '2023-05-13', 'Marketing Campaign', 'RivalCorp', NULL, NULL, 'Deal for Q2 2025 - Sponsorship Deal #198 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (199, 'Q1 2025 - Membership Deal #199', 6, 25, 'Prospecting', 14154.62, 10, '2025-10-11', NULL, 'Web', NULL, NULL, 'Schedule follow-up call', 'Deal for Q1 2025 - Membership Deal #199 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (200, 'Q2 2025 - Advertising Deal #200', 22, 39, 'Prospecting', 11378.58, 10, '2023-01-25', NULL, 'Referral', NULL, NULL, 'Get approval from board', 'Deal for Q2 2025 - Advertising Deal #200 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (201, 'Q2 2025 - Advertising Deal #201', 21, 37, 'Negotiation', 23846.27, 75, '2025-08-21', NULL, 'Partner', 'AlternativeSolutions', NULL, 'Negotiate terms', 'Deal for Q2 2025 - Advertising Deal #201 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (202, 'Q4 2025 - Sponsorship Deal #202', 31, 41, 'Qualification', 19164.54, 25, '2024-04-27', NULL, 'Web', NULL, NULL, 'Send proposal', 'Deal for Q4 2025 - Sponsorship Deal #202 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (203, 'Q1 2024 - Training Deal #203', 27, 38, 'Qualification', 10613.40, 25, '2023-04-17', NULL, 'Direct', NULL, NULL, 'Send proposal', 'Deal for Q1 2024 - Training Deal #203 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (204, 'Q3 2024 - Event Deal #204', 32, 59, 'Qualification', 36905.84, 25, '2023-12-23', NULL, 'Cold Call', 'RivalCorp', NULL, 'Finalize contract', 'Deal for Q3 2024 - Event Deal #204 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (205, 'Q2 2022 - Training Deal #205', 3, 10, 'Closed Lost', 3377.21, 0, '2022-01-14', '2024-04-24', 'Cold Call', NULL, 'Timing not right', NULL, 'Deal for Q2 2022 - Training Deal #205 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (206, 'Q1 2023 - Sponsorship Deal #206', 14, 65, 'Negotiation', 19286.83, 75, '2025-06-19', NULL, 'Other', NULL, NULL, 'Get approval from board', 'Deal for Q1 2023 - Sponsorship Deal #206 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (207, 'Q1 2025 - Sponsorship Deal #207', 2, 36, 'Closed Won', 48896.49, 100, '2022-02-05', '2024-10-25', 'Direct', NULL, NULL, NULL, 'Deal for Q1 2025 - Sponsorship Deal #207 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (208, 'Q1 2022 - Training Deal #208', 10, 31, 'Qualification', 31369.26, 25, '2023-06-01', NULL, 'Partner', 'AlternativeSolutions', NULL, 'Get approval from board', 'Deal for Q1 2022 - Training Deal #208 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (209, 'Q3 2025 - Event Deal #209', 16, 29, 'Proposal', 34518.04, 50, '2022-06-15', NULL, 'Web', 'CompetitorCo', NULL, 'Get approval from board', 'Deal for Q3 2025 - Event Deal #209 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (210, 'Q4 2025 - Sponsorship Deal #210', 1, 22, 'Prospecting', 25493.06, 10, '2024-06-07', NULL, 'Partner', NULL, NULL, 'Schedule follow-up call', 'Deal for Q4 2025 - Sponsorship Deal #210 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (211, 'Q1 2023 - Advertising Deal #211', 31, 35, 'Prospecting', 46283.80, 10, '2025-11-02', NULL, 'Marketing Campaign', NULL, NULL, 'Finalize contract', 'Deal for Q1 2023 - Advertising Deal #211 with focus on association services and member benefits', 1);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (212, 'Q2 2024 - Sponsorship Deal #212', 14, 19, 'Closed Lost', 41224.22, 0, '2022-06-07', '2023-09-05', 'Cold Call', NULL, 'Missing features', NULL, 'Deal for Q2 2024 - Sponsorship Deal #212 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (213, 'Q4 2024 - Event Deal #213', 9, 11, 'Closed Won', 37527.37, 100, '2023-12-10', '2022-04-20', 'Referral', 'DirectCompete Inc', NULL, NULL, 'Deal for Q4 2024 - Event Deal #213 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (214, 'Q1 2024 - Training Deal #214', 26, 42, 'Prospecting', 32072.02, 10, '2026-05-24', NULL, 'Other', 'DirectCompete Inc', NULL, 'Send proposal', 'Deal for Q1 2024 - Training Deal #214 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (215, 'Q4 2025 - Advertising Deal #215', 25, 11, 'Closed Won', 15473.59, 100, '2023-05-20', '2022-05-31', 'Referral', 'AlternativeSolutions', NULL, NULL, 'Deal for Q4 2025 - Advertising Deal #215 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (216, 'Q4 2023 - Event Deal #216', 21, 47, 'Prospecting', 5484.50, 10, '2023-09-24', NULL, 'Other', 'AlternativeSolutions', NULL, 'Negotiate terms', 'Deal for Q4 2023 - Event Deal #216 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (217, 'Q2 2022 - Advertising Deal #217', 28, 58, 'Closed Won', 28182.26, 100, '2024-04-15', '2022-07-31', 'Web', 'CompetitorCo', NULL, NULL, 'Deal for Q2 2022 - Advertising Deal #217 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (218, 'Q1 2024 - Event Deal #218', 1, 38, 'Negotiation', 20002.18, 75, '2022-06-23', NULL, 'Trade Show', NULL, NULL, 'Finalize contract', 'Deal for Q1 2024 - Event Deal #218 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (219, 'Q4 2023 - Advertising Deal #219', 18, 39, 'Proposal', 25163.07, 50, '2022-05-10', NULL, 'Cold Call', 'DirectCompete Inc', NULL, 'Negotiate terms', 'Deal for Q4 2023 - Advertising Deal #219 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (220, 'Q3 2025 - Sponsorship Deal #220', 24, 33, 'Qualification', 36324.07, 25, '2024-10-12', NULL, 'Trade Show', 'DirectCompete Inc', NULL, 'Schedule follow-up call', 'Deal for Q3 2025 - Sponsorship Deal #220 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (221, 'Q3 2022 - Event Deal #221', 22, 49, 'Proposal', 22570.92, 50, '2024-05-31', NULL, 'Cold Call', 'AlternativeSolutions', NULL, 'Negotiate terms', 'Deal for Q3 2022 - Event Deal #221 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (222, 'Q2 2025 - Membership Deal #222', 12, 51, 'Proposal', 15280.96, 50, '2025-11-24', NULL, 'Other', NULL, NULL, 'Send proposal', 'Deal for Q2 2025 - Membership Deal #222 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (223, 'Q4 2024 - Event Deal #223', 24, 15, 'Closed Won', 10790.20, 100, '2025-01-22', '2023-01-04', 'Web', NULL, NULL, NULL, 'Deal for Q4 2024 - Event Deal #223 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (224, 'Q2 2025 - Membership Deal #224', 5, 53, 'Closed Lost', 25465.86, 0, '2025-07-21', '2023-09-13', 'Trade Show', 'AlternativeSolutions', 'Timing not right', NULL, 'Deal for Q2 2025 - Membership Deal #224 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (225, 'Q4 2025 - Sponsorship Deal #225', 29, 62, 'Closed Won', 20639.45, 100, '2024-11-03', '2024-05-06', 'Web', NULL, NULL, NULL, 'Deal for Q4 2025 - Sponsorship Deal #225 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (226, 'Q1 2022 - Advertising Deal #226', 23, 22, 'Closed Lost', 31021.22, 0, '2025-02-27', '2025-08-14', 'Direct', NULL, 'Went with competitor', NULL, 'Deal for Q1 2022 - Advertising Deal #226 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (227, 'Q1 2022 - Sponsorship Deal #227', 17, 29, 'Closed Won', 37595.80, 100, '2025-02-16', '2025-04-03', 'Trade Show', 'DirectCompete Inc', NULL, NULL, 'Deal for Q1 2022 - Sponsorship Deal #227 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (228, 'Q4 2025 - Training Deal #228', 33, 20, 'Proposal', 49887.43, 50, '2024-09-15', NULL, 'Referral', 'AlternativeSolutions', NULL, 'Get approval from board', 'Deal for Q4 2025 - Training Deal #228 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (229, 'Q1 2023 - Membership Deal #229', 20, 44, 'Negotiation', 39429.23, 75, '2024-12-03', NULL, 'Other', 'AlternativeSolutions', NULL, 'Get approval from board', 'Deal for Q1 2023 - Membership Deal #229 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (230, 'Q4 2025 - Membership Deal #230', 5, 39, 'Prospecting', 40699.11, 10, '2022-08-24', NULL, 'Web', NULL, NULL, 'Negotiate terms', 'Deal for Q4 2025 - Membership Deal #230 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (231, 'Q2 2023 - Training Deal #231', 12, 21, 'Proposal', 28432.60, 50, '2024-08-04', NULL, 'Trade Show', NULL, NULL, 'Get approval from board', 'Deal for Q2 2023 - Training Deal #231 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (232, 'Q2 2025 - Event Deal #232', 2, 26, 'Negotiation', 30017.95, 75, '2024-03-07', NULL, 'Web', NULL, NULL, 'Send proposal', 'Deal for Q2 2025 - Event Deal #232 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (233, 'Q3 2022 - Training Deal #233', 7, 24, 'Proposal', 16973.26, 50, '2024-07-26', NULL, 'Referral', 'AlternativeSolutions', NULL, 'Get approval from board', 'Deal for Q3 2022 - Training Deal #233 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (234, 'Q3 2025 - Training Deal #234', 26, 15, 'Proposal', 18247.26, 50, '2024-07-26', NULL, 'Cold Call', NULL, NULL, 'Negotiate terms', 'Deal for Q3 2025 - Training Deal #234 with focus on association services and member benefits', 10);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (235, 'Q1 2023 - Membership Deal #235', 8, 31, 'Proposal', 6730.50, 50, '2024-02-04', NULL, 'Cold Call', NULL, NULL, 'Get approval from board', 'Deal for Q1 2023 - Membership Deal #235 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (236, 'Q2 2025 - Event Deal #236', 12, 63, 'Closed Lost', 27331.58, 0, '2025-08-14', '2022-12-21', 'Cold Call', 'DirectCompete Inc', 'Went with competitor', NULL, 'Deal for Q2 2025 - Event Deal #236 with focus on association services and member benefits', 3);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (237, 'Q2 2024 - Event Deal #237', 4, 46, 'Prospecting', 24745.84, 10, '2023-02-04', NULL, 'Direct', NULL, NULL, 'Finalize contract', 'Deal for Q2 2024 - Event Deal #237 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (238, 'Q4 2025 - Event Deal #238', 29, 63, 'Qualification', 5050.86, 25, '2022-03-05', NULL, 'Trade Show', 'AlternativeSolutions', NULL, 'Schedule follow-up call', 'Deal for Q4 2025 - Event Deal #238 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (239, 'Q2 2024 - Advertising Deal #239', 30, 64, 'Closed Won', 26029.49, 100, '2025-03-18', '2022-08-22', 'Marketing Campaign', NULL, NULL, NULL, 'Deal for Q2 2024 - Advertising Deal #239 with focus on association services and member benefits', 9);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (240, 'Q3 2022 - Event Deal #240', 35, 28, 'Negotiation', 6018.41, 75, '2025-08-31', NULL, 'Trade Show', 'AlternativeSolutions', NULL, 'Schedule follow-up call', 'Deal for Q3 2022 - Event Deal #240 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (241, 'Q3 2024 - Sponsorship Deal #241', 29, 16, 'Qualification', 11284.03, 25, '2026-02-19', NULL, 'Partner', NULL, NULL, 'Finalize contract', 'Deal for Q3 2024 - Sponsorship Deal #241 with focus on association services and member benefits', 7);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (242, 'Q2 2023 - Advertising Deal #242', 14, 8, 'Closed Won', 18189.96, 100, '2023-07-30', '2025-05-07', 'Cold Call', 'AlternativeSolutions', NULL, NULL, 'Deal for Q2 2023 - Advertising Deal #242 with focus on association services and member benefits', 5);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (243, 'Q3 2024 - Training Deal #243', 7, 18, 'Negotiation', 46019.67, 75, '2023-07-22', NULL, 'Cold Call', NULL, NULL, 'Send proposal', 'Deal for Q3 2024 - Training Deal #243 with focus on association services and member benefits', 4);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (244, 'Q2 2024 - Advertising Deal #244', 26, 63, 'Qualification', 29293.85, 25, '2023-07-05', NULL, 'Direct', 'DirectCompete Inc', NULL, 'Get approval from board', 'Deal for Q2 2024 - Advertising Deal #244 with focus on association services and member benefits', 2);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (245, 'Q1 2025 - Training Deal #245', 18, 48, 'Negotiation', 47562.45, 75, '2023-11-02', NULL, 'Web', NULL, NULL, 'Schedule follow-up call', 'Deal for Q1 2025 - Training Deal #245 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (246, 'Q3 2022 - Training Deal #246', 26, 28, 'Negotiation', 41417.53, 75, '2024-10-10', NULL, 'Marketing Campaign', 'AlternativeSolutions', NULL, 'Negotiate terms', 'Deal for Q3 2022 - Training Deal #246 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (247, 'Q2 2025 - Membership Deal #247', 4, 6, 'Prospecting', 31682.80, 10, '2024-07-30', NULL, 'Web', 'CompetitorCo', NULL, 'Send proposal', 'Deal for Q2 2025 - Membership Deal #247 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (248, 'Q4 2022 - Event Deal #248', 13, 17, 'Closed Lost', 15791.41, 0, '2023-07-16', '2022-07-11', 'Partner', 'AlternativeSolutions', 'Price too high', NULL, 'Deal for Q4 2022 - Event Deal #248 with focus on association services and member benefits', 6);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (249, 'Q2 2022 - Event Deal #249', 20, 30, 'Negotiation', 33118.78, 75, '2025-12-12', NULL, 'Referral', 'CompetitorCo', NULL, 'Send proposal', 'Deal for Q2 2022 - Event Deal #249 with focus on association services and member benefits', 8);
INSERT INTO CRM.Deal (ID, DealName, AccountID, ContactID, Stage, Amount, Probability, CloseDate, ActualCloseDate, DealSource, CompetitorName, LossReason, NextStep, Description, OwnerID)
VALUES (250, 'Q1 2023 - Training Deal #250', 15, 57, 'Prospecting', 1395.07, 10, '2023-12-05', NULL, 'Referral', NULL, NULL, 'Get approval from board', 'Deal for Q1 2023 - Training Deal #250 with focus on association services and member benefits', 3);

SET IDENTITY_INSERT CRM.Deal OFF;

-- Insert Deal Products (line items for closed won deals)
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (2, 5, 2.0000, 2103.20, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (2, 15, 3.0000, 15849.46, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (2, 25, 10.0000, 3180.02, 0.00, 'Special terms for deal 2');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (2, 6, 3.0000, 1751.94, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (14, 6, 16.0000, 1553.74, 0.00, 'Special terms for deal 14');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (14, 7, 3.0000, 1348.67, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (24, 19, 4.0000, 4396.55, 6.00, 'Special terms for deal 24');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (24, 2, 4.0000, 2494.89, 20.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (24, 20, 2.0000, 4779.01, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (24, 14, 10.0000, 14525.18, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (24, 34, 2.0000, 1613.35, 13.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (30, 26, 9.0000, 5534.22, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (35, 35, 27.0000, 2379.45, 15.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (35, 10, 2.0000, 1386.10, 0.00, 'Special terms for deal 35');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (35, 18, 32.0000, 3337.94, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (35, 6, 5.0000, 1599.65, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (35, 20, 18.0000, 4322.40, 16.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (37, 11, 5.0000, 16397.62, 5.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (37, 24, 9.0000, 2476.65, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (37, 9, 59.0000, 1506.47, 23.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (40, 17, 2.0000, 3565.45, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (40, 7, 4.0000, 1227.59, 0.00, 'Special terms for deal 40');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (52, 3, 32.0000, 2416.26, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (52, 27, 48.0000, 4238.80, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (74, 34, 2.0000, 2301.59, 0.00, 'Special terms for deal 74');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (74, 3, 2.0000, 2553.09, 11.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (82, 16, 8.0000, 4796.46, 0.00, 'Special terms for deal 82');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (82, 30, 4.0000, 4301.13, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (82, 24, 1.0000, 3541.19, 17.00, 'Special terms for deal 82');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (83, 7, 7.0000, 1495.22, 9.00, 'Special terms for deal 83');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (83, 14, 30.0000, 17383.72, 0.00, 'Special terms for deal 83');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (83, 34, 2.0000, 2064.62, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (85, 5, 34.0000, 2850.91, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (85, 4, 6.0000, 2318.06, 7.00, 'Special terms for deal 85');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (85, 28, 99.0000, 5169.42, 10.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (85, 9, 2.0000, 1521.55, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (87, 30, 88.0000, 4608.43, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (87, 17, 42.0000, 3437.32, 0.00, 'Special terms for deal 87');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (87, 8, 1.0000, 1606.31, 10.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (91, 29, 18.0000, 4242.91, 12.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (91, 16, 6.0000, 4298.06, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (91, 7, 2.0000, 1213.08, 25.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (91, 30, 43.0000, 4245.06, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (94, 28, 3.0000, 4707.89, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (94, 26, 3.0000, 4069.30, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (94, 32, 53.0000, 2306.22, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (94, 2, 7.0000, 2199.46, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (94, 25, 9.0000, 3353.82, 0.00, 'Special terms for deal 94');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (96, 31, 10.0000, 2001.91, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (96, 35, 4.0000, 1623.44, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (96, 32, 8.0000, 2023.55, 0.00, 'Special terms for deal 96');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (99, 7, 5.0000, 1520.21, 0.00, 'Special terms for deal 99');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (99, 16, 4.0000, 4121.11, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (101, 12, 6.0000, 17483.88, 16.00, 'Special terms for deal 101');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (101, 16, 10.0000, 4717.39, 0.00, 'Special terms for deal 101');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (102, 35, 8.0000, 1786.10, 21.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (102, 20, 10.0000, 3522.34, 10.00, 'Special terms for deal 102');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (102, 12, 6.0000, 12357.34, 9.00, 'Special terms for deal 102');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (102, 32, 6.0000, 2368.45, 0.00, 'Special terms for deal 102');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (114, 7, 21.0000, 1639.41, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (114, 22, 6.0000, 2609.04, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (114, 20, 6.0000, 3557.18, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (114, 21, 5.0000, 2552.82, 0.00, 'Special terms for deal 114');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (116, 26, 2.0000, 5873.38, 7.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (116, 3, 3.0000, 2636.19, 0.00, 'Special terms for deal 116');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (116, 12, 6.0000, 14679.78, 12.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (116, 21, 2.0000, 3264.50, 19.00, 'Special terms for deal 116');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (116, 15, 7.0000, 14958.49, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (117, 31, 10.0000, 2120.78, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (123, 3, 41.0000, 2261.13, 15.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (124, 11, 10.0000, 17359.36, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (124, 5, 10.0000, 2889.75, 8.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (124, 6, 7.0000, 1618.32, 0.00, 'Special terms for deal 124');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (124, 22, 37.0000, 2756.88, 17.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (127, 10, 5.0000, 1694.34, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (127, 4, 27.0000, 2170.83, 7.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (127, 24, 51.0000, 2965.13, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (127, 1, 7.0000, 2184.88, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (132, 3, 35.0000, 2564.25, 8.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (132, 17, 9.0000, 3862.38, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (132, 29, 50.0000, 5636.81, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (132, 30, 8.0000, 5145.43, 14.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (139, 33, 9.0000, 2240.36, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (145, 29, 22.0000, 5944.33, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (148, 6, 5.0000, 1391.85, 0.00, 'Special terms for deal 148');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (148, 28, 72.0000, 4794.71, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (148, 13, 1.0000, 16719.30, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (148, 10, 7.0000, 1289.79, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (150, 7, 2.0000, 1671.45, 0.00, 'Special terms for deal 150');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (167, 17, 36.0000, 3844.76, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (167, 25, 7.0000, 3467.49, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (167, 32, 5.0000, 2317.63, 14.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (167, 31, 2.0000, 2378.00, 14.00, 'Special terms for deal 167');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (171, 21, 28.0000, 3496.12, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (171, 18, 6.0000, 4513.63, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (171, 27, 9.0000, 4806.77, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (171, 6, 3.0000, 1315.66, 0.00, 'Special terms for deal 171');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (186, 3, 47.0000, 2704.63, 19.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (186, 30, 2.0000, 5362.35, 20.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (192, 31, 5.0000, 2199.17, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (192, 23, 3.0000, 3424.59, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (193, 15, 53.0000, 15079.69, 0.00, 'Special terms for deal 193');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (193, 14, 8.0000, 17469.09, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (198, 15, 40.0000, 16276.44, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (207, 23, 9.0000, 3389.17, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (207, 30, 6.0000, 5122.91, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (207, 17, 8.0000, 3302.14, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (207, 14, 5.0000, 15936.72, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (213, 10, 1.0000, 1683.26, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (213, 34, 3.0000, 2177.03, 0.00, 'Special terms for deal 213');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (215, 27, 10.0000, 5416.14, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (215, 26, 4.0000, 5372.64, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (215, 25, 6.0000, 3008.78, 0.00, 'Special terms for deal 215');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (217, 12, 9.0000, 16577.51, 15.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (217, 19, 29.0000, 4390.74, 0.00, 'Special terms for deal 217');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (217, 7, 5.0000, 1551.34, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (217, 31, 82.0000, 2066.86, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (217, 9, 9.0000, 1271.89, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (223, 4, 10.0000, 2892.85, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (223, 10, 3.0000, 1667.36, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (223, 9, 82.0000, 1234.81, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (223, 13, 10.0000, 16586.90, 0.00, 'Special terms for deal 223');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (225, 9, 7.0000, 1442.04, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (227, 35, 48.0000, 2360.05, 0.00, 'Special terms for deal 227');
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (239, 13, 6.0000, 13872.55, 21.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (239, 2, 6.0000, 2298.20, 21.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (239, 1, 3.0000, 2342.73, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (239, 16, 52.0000, 3230.60, 9.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (239, 15, 65.0000, 13013.91, 0.00, NULL);
INSERT INTO CRM.DealProduct (DealID, ProductID, Quantity, UnitPrice, Discount, Notes)
VALUES (242, 25, 5.0000, 3325.50, 0.00, NULL);

-- Insert Invoices (for closed won deals with explicit IDs)
SET IDENTITY_INSERT CRM.Invoice ON;

INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (1, 'INV-2025-00001', 13, 30, '2023-06-23', '2023-07-23', 'Paid', 35468.40, 7.00, 37951.19, 'Net 15', NULL, '321 Pine St', 'Chicago', 'IL', '60601', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (2, 'INV-2025-00002', 31, 227, '2023-11-09', '2023-12-09', 'Paid', 1624.72, 0.00, 1624.72, 'Net 30', 'Invoice for association services - Deal #227', '321 Pine St', 'Chicago', 'IL', '60601', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (3, 'INV-2025-00003', 6, 40, '2024-11-13', '2024-11-28', 'Paid', 45334.19, 6.50, 48280.91, '2/10 Net 30', 'Invoice for association services - Deal #40', '789 Elm Blvd', 'Los Angeles', 'CA', '90001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (4, 'INV-2025-00004', 30, 225, '2022-04-13', '2022-04-28', 'Paid', 43832.88, 7.00, 46901.18, 'Due on Receipt', 'Invoice for association services - Deal #225', '789 Elm Blvd', 'Houston', 'TX', '77001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (5, 'INV-2025-00005', 8, 14, '2022-07-14', '2022-07-29', 'Paid', 42747.94, 6.50, 45526.56, 'Due on Receipt', NULL, '321 Pine St', 'Phoenix', 'AZ', '85001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (6, 'INV-2025-00006', 18, 242, '2022-07-10', '2022-08-24', 'Paid', 9960.60, 8.25, 10782.35, '2/10 Net 30', 'Invoice for association services - Deal #242', '789 Elm Blvd', 'San Antonio', 'TX', '78201', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (7, 'INV-2025-00007', 25, 52, '2024-09-06', '2024-11-05', 'Paid', 6539.77, 0.00, 6539.77, 'Net 15', NULL, '654 Maple Dr', 'Houston', 'TX', '77001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (8, 'INV-2025-00008', 29, 139, '2023-01-07', '2023-03-08', 'Paid', 30956.56, 6.50, 32968.74, '2/10 Net 30', 'Invoice for association services - Deal #139', '123 Main St', 'Houston', 'TX', '77001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (9, 'INV-2025-00009', 29, 148, '2022-04-05', '2022-04-20', 'Paid', 33093.70, 0.00, 33093.70, 'Net 60', 'Invoice for association services - Deal #148', '654 Maple Dr', 'San Antonio', 'TX', '78201', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (10, 'INV-2025-00010', 15, 127, '2023-11-24', '2023-12-09', 'Partial', 33423.95, 6.50, 17412.31, 'Net 60', 'Invoice for association services - Deal #127', '321 Pine St', 'Chicago', 'IL', '60601', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (11, 'INV-2025-00011', 4, 215, '2022-01-24', '2022-02-23', 'Overdue', 42593.43, 8.25, 0.00, 'Net 15', NULL, '321 Pine St', 'Los Angeles', 'CA', '90001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (12, 'INV-2025-00012', 16, 99, '2023-11-09', '2023-12-24', 'Paid', 25839.54, 8.88, 28132.80, 'Net 60', NULL, '456 Oak Ave', 'New York', 'NY', '10001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (13, 'INV-2025-00013', 30, 167, '2024-06-28', '2024-08-27', 'Paid', 42972.87, 8.25, 46518.13, 'Due on Receipt', NULL, '321 Pine St', 'Philadelphia', 'PA', '19101', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (14, 'INV-2025-00014', 2, 82, '2022-07-30', '2022-09-28', 'Partial', 2755.76, 8.88, 600.37, 'Net 30', 'Invoice for association services - Deal #82', '654 Maple Dr', 'Philadelphia', 'PA', '19101', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (15, 'INV-2025-00015', 20, 239, '2024-11-07', '2024-12-07', 'Partial', 47567.40, 7.00, 35382.99, 'Net 15', 'Invoice for association services - Deal #239', '789 Elm Blvd', 'Phoenix', 'AZ', '85001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (16, 'INV-2025-00016', 31, 123, '2024-01-15', '2024-03-15', 'Paid', 5774.41, 6.50, 6149.75, 'Net 30', NULL, '789 Elm Blvd', 'Phoenix', 'AZ', '85001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (17, 'INV-2025-00017', 34, 117, '2024-02-05', '2024-02-20', 'Paid', 44946.98, 8.25, 48655.11, 'Net 15', 'Invoice for association services - Deal #117', '321 Pine St', 'New York', 'NY', '10001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (18, 'INV-2025-00018', 17, 116, '2025-06-05', '2025-07-05', 'Paid', 6916.54, 8.25, 7487.15, 'Net 15', NULL, '456 Oak Ave', 'Philadelphia', 'PA', '19101', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (19, 'INV-2025-00019', 22, 2, '2022-08-09', '2022-10-08', 'Paid', 46404.70, 8.88, 50523.12, 'Net 30', 'Invoice for association services - Deal #2', '321 Pine St', 'Houston', 'TX', '77001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (20, 'INV-2025-00020', 33, 171, '2022-10-03', '2022-12-02', 'Paid', 26987.85, 0.00, 26987.85, 'Net 45', 'Invoice for association services - Deal #171', '654 Maple Dr', 'Houston', 'TX', '77001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (21, 'INV-2025-00021', 33, 91, '2022-12-29', '2023-01-28', 'Paid', 6074.14, 8.88, 6613.22, 'Net 45', 'Invoice for association services - Deal #91', '654 Maple Dr', 'Houston', 'TX', '77001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (22, 'INV-2025-00022', 27, 207, '2025-06-01', '2025-07-01', 'Paid', 20495.63, 7.00, 21930.32, 'Due on Receipt', NULL, '456 Oak Ave', 'Chicago', 'IL', '60601', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (23, 'INV-2025-00023', 27, 217, '2025-05-18', '2025-07-02', 'Overdue', 43174.67, 8.88, 0.00, 'Net 60', NULL, '456 Oak Ave', 'Phoenix', 'AZ', '85001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (24, 'INV-2025-00024', 19, 124, '2023-12-09', '2024-01-08', 'Paid', 25690.78, 7.00, 27489.13, 'Net 60', NULL, '789 Elm Blvd', 'Phoenix', 'AZ', '85001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (25, 'INV-2025-00025', 31, 192, '2025-04-08', '2025-06-07', 'Overdue', 15010.47, 8.25, 0.00, 'Net 30', 'Invoice for association services - Deal #192', '123 Main St', 'Houston', 'TX', '77001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (26, 'INV-2025-00026', 10, 74, '2022-04-19', '2022-05-04', 'Paid', 14081.94, 6.50, 14997.27, 'Due on Receipt', 'Invoice for association services - Deal #74', '456 Oak Ave', 'San Antonio', 'TX', '78201', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (27, 'INV-2025-00027', 4, 35, '2023-08-28', '2023-09-27', 'Overdue', 2583.01, 8.25, 0.00, 'Net 30', 'Invoice for association services - Deal #35', '654 Maple Dr', 'San Antonio', 'TX', '78201', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (28, 'INV-2025-00028', 15, 198, '2025-08-18', '2025-10-17', 'Draft', 26035.19, 7.00, 0.00, 'Net 60', 'Invoice for association services - Deal #198', '321 Pine St', 'Houston', 'TX', '77001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (29, 'INV-2025-00029', 27, 150, '2023-10-03', '2023-10-18', 'Paid', 37439.83, 6.50, 39873.42, 'Net 45', 'Invoice for association services - Deal #150', '321 Pine St', 'San Antonio', 'TX', '78201', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (30, 'INV-2025-00030', 15, 145, '2025-07-21', '2025-09-04', 'Draft', 39031.19, 6.50, 0.00, 'Due on Receipt', NULL, '123 Main St', 'Chicago', 'IL', '60601', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (31, 'INV-2025-00031', 12, 102, '2024-11-18', '2024-12-03', 'Partial', 2991.08, 7.00, 1708.91, 'Net 15', NULL, '789 Elm Blvd', 'New York', 'NY', '10001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (32, 'INV-2025-00032', 22, 223, '2024-08-13', '2024-09-12', 'Paid', 8531.47, 7.00, 9128.67, 'Net 45', NULL, '654 Maple Dr', 'San Antonio', 'TX', '78201', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (33, 'INV-2025-00033', 20, 87, '2024-10-01', '2024-11-15', 'Paid', 39417.54, 7.00, 42176.77, 'Net 45', NULL, '456 Oak Ave', 'Phoenix', 'AZ', '85001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (34, 'INV-2025-00034', 5, 101, '2024-10-31', '2024-11-30', 'Partial', 27610.93, 8.25, 7626.65, 'Net 15', 'Invoice for association services - Deal #101', '789 Elm Blvd', 'Los Angeles', 'CA', '90001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (35, 'INV-2025-00035', 24, 193, '2023-08-25', '2023-09-24', 'Overdue', 26994.45, 8.88, 0.00, 'Net 60', NULL, '789 Elm Blvd', 'Houston', 'TX', '77001', 'USA');
INSERT INTO CRM.Invoice (ID, InvoiceNumber, AccountID, DealID, InvoiceDate, DueDate, Status, SubTotal, TaxRate, AmountPaid, Terms, Notes, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry)
VALUES (36, 'INV-2025-00036', 16, 96, '2025-08-08', '2025-09-07', 'Draft', 34445.02, 7.00, 0.00, '2/10 Net 30', 'Invoice for association services - Deal #96', '123 Main St', 'Houston', 'TX', '77001', 'USA');

SET IDENTITY_INSERT CRM.Invoice OFF;

-- Insert Invoice Line Items
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (1, 19, 'Professional services rendered', 16.6201, 3812.08, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (1, 3, 'Membership dues', 4.6577, 5187.56, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (1, NULL, 'Publication advertising', 12.9117, 2186.74, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (2, 28, 'Consulting and advisory services', 82.9605, 8798.51, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (2, 5, 'Event sponsorship package', 71.8284, 475.07, 10.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (3, 15, 'Membership dues', 9.5714, 4104.04, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (3, 8, 'Publication advertising', 72.1684, 726.05, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (3, NULL, 'Consulting and advisory services', 10.5539, 2969.38, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (4, NULL, 'Digital marketing services', 16.6203, 405.11, 12.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (4, NULL, 'Trade show participation', 17.1399, 3020.29, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (4, 24, 'Professional services rendered', 11.5463, 1320.03, 17.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (4, 6, 'Membership dues', 74.2723, 7286.78, 9.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (4, NULL, 'Advertising placement', 5.8021, 1234.76, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (5, 30, 'Publication advertising', 67.3327, 2581.81, 20.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (5, 23, 'Event sponsorship package', 5.4561, 2922.86, 11.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (5, 29, 'Training and certification', 6.8078, 5883.28, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (5, 21, 'Trade show participation', 31.6649, 7878.04, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (5, 18, 'Training and certification', 73.4308, 8791.07, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (6, 32, 'Publication advertising', 64.7324, 911.54, 9.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (6, 13, 'Membership dues', 12.9058, 7301.51, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (6, 2, 'Custom project work', 15.6148, 2206.33, 13.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (7, 35, 'Digital marketing services', 3.8240, 3985.73, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (7, 19, 'Event sponsorship package', 10.6978, 4028.17, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (7, 11, 'Publication advertising', 16.3426, 5706.94, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (7, 10, 'Digital marketing services', 1.7680, 7638.58, 13.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (7, 3, 'Advertising placement', 16.0377, 3942.12, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (8, NULL, 'Training and certification', 96.8599, 6372.31, 13.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (9, 12, 'Trade show participation', 7.9406, 6568.03, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (9, 25, 'Advertising placement', 7.7051, 8690.42, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (9, 1, 'Publication advertising', 9.3581, 2376.91, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (9, 10, 'Event sponsorship package', 60.4010, 8187.86, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (9, 22, 'Consulting and advisory services', 10.0975, 2185.97, 18.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (10, 9, 'Custom project work', 3.5598, 5175.16, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (11, NULL, 'Membership dues', 10.8162, 4114.02, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (11, 19, 'Consulting and advisory services', 60.8493, 4766.99, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (12, 10, 'Custom project work', 4.4558, 6630.52, 15.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (12, 5, 'Advertising placement', 3.5121, 263.97, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (13, 10, 'Custom project work', 47.8490, 6186.01, 8.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (13, NULL, 'Event sponsorship package', 11.2464, 111.88, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (13, 28, 'Publication advertising', 17.6217, 7006.66, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (13, 31, 'Trade show participation', 16.2878, 9087.80, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (13, 28, 'Event sponsorship package', 76.7030, 9109.85, 18.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (14, NULL, 'Professional services rendered', 3.2387, 171.22, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (14, 21, 'Trade show participation', 3.9408, 6550.60, 18.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (14, 18, 'Trade show participation', 8.8513, 7859.51, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (15, 31, 'Membership dues', 11.9754, 7764.53, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (15, NULL, 'Consulting and advisory services', 9.4853, 7023.18, 11.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (15, 22, 'Publication advertising', 14.0067, 615.32, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (16, 10, 'Digital marketing services', 9.2722, 734.40, 7.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (17, NULL, 'Trade show participation', 8.6123, 6596.13, 6.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (17, 12, 'Digital marketing services', 4.8324, 6603.15, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (17, 3, 'Custom project work', 14.2705, 6190.38, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (17, 1, 'Event sponsorship package', 27.9557, 4054.39, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (17, 13, 'Publication advertising', 70.5104, 9199.86, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (18, 23, 'Training and certification', 6.2536, 6103.00, 17.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (18, 17, 'Event sponsorship package', 3.0228, 816.62, 8.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (18, 17, 'Publication advertising', 11.9230, 6972.50, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (18, 16, 'Training and certification', 9.7181, 4661.13, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (18, NULL, 'Consulting and advisory services', 38.5760, 7907.69, 12.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (19, 23, 'Publication advertising', 14.3156, 2707.16, 17.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (19, 22, 'Consulting and advisory services', 4.3912, 3207.34, 13.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (19, NULL, 'Advertising placement', 4.7937, 7380.75, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (20, 16, 'Custom project work', 15.7998, 1286.80, 20.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (20, 35, 'Professional services rendered', 8.0527, 3222.63, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (21, 32, 'Event sponsorship package', 18.4041, 2874.64, 9.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (21, NULL, 'Trade show participation', 11.2746, 5074.50, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (21, 12, 'Digital marketing services', 14.2666, 4654.70, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (21, NULL, 'Advertising placement', 2.9142, 3679.86, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (21, NULL, 'Membership dues', 47.3989, 6169.53, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (22, 27, 'Training and certification', 8.6113, 4562.22, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (22, 15, 'Consulting and advisory services', 16.2777, 5597.87, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (22, NULL, 'Event sponsorship package', 1.1851, 4273.05, 15.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (22, 20, 'Membership dues', 11.7889, 4044.18, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (23, 17, 'Digital marketing services', 2.8297, 7471.47, 16.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (24, 17, 'Training and certification', 12.5631, 8686.95, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (24, NULL, 'Custom project work', 11.2303, 9795.79, 15.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (24, 32, 'Digital marketing services', 8.2403, 2936.58, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (24, NULL, 'Event sponsorship package', 18.6428, 4275.98, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (24, 5, 'Consulting and advisory services', 23.2077, 3237.09, 13.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (25, 18, 'Digital marketing services', 18.8366, 7504.17, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (25, 11, 'Event sponsorship package', 3.3758, 2422.81, 7.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (25, 26, 'Consulting and advisory services', 93.7110, 4784.54, 17.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (25, 6, 'Consulting and advisory services', 15.9498, 6582.84, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (25, 16, 'Membership dues', 3.4018, 5314.75, 6.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (26, 21, 'Digital marketing services', 17.5471, 9355.09, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (26, NULL, 'Publication advertising', 59.9596, 6347.37, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (26, 34, 'Publication advertising', 7.5962, 5442.71, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (27, 27, 'Membership dues', 1.5503, 5280.83, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (27, NULL, 'Membership dues', 1.1580, 9228.68, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (27, 1, 'Trade show participation', 12.3431, 7988.00, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (27, NULL, 'Publication advertising', 5.7480, 7177.89, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (28, 6, 'Trade show participation', 10.8156, 8019.59, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (28, 18, 'Membership dues', 11.1069, 2761.34, 7.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (28, NULL, 'Membership dues', 45.8066, 4582.40, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (28, 21, 'Professional services rendered', 96.9868, 319.10, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (29, 29, 'Professional services rendered', 15.4930, 4986.44, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (29, 32, 'Training and certification', 16.0371, 3369.46, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (29, 4, 'Membership dues', 2.3563, 4754.45, 13.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (30, 8, 'Advertising placement', 19.5245, 2546.91, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (30, NULL, 'Consulting and advisory services', 19.6602, 4780.97, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (30, 21, 'Event sponsorship package', 1.8015, 9380.47, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (30, 20, 'Advertising placement', 1.9897, 6700.28, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (31, 21, 'Professional services rendered', 27.9720, 1284.53, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (31, NULL, 'Professional services rendered', 14.1243, 6915.22, 7.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (32, NULL, 'Consulting and advisory services', 7.4300, 9699.55, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (32, NULL, 'Training and certification', 14.3252, 7935.52, 12.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (33, 23, 'Digital marketing services', 1.4057, 3839.91, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (33, 3, 'Digital marketing services', 11.6215, 5473.07, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (33, 35, 'Training and certification', 9.8995, 8689.85, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (34, NULL, 'Publication advertising', 29.9194, 2707.16, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (34, NULL, 'Publication advertising', 4.5252, 285.33, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (34, 16, 'Training and certification', 13.5075, 5435.67, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (34, 32, 'Publication advertising', 28.6713, 4157.06, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (34, NULL, 'Consulting and advisory services', 93.8111, 1868.52, 8.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (35, NULL, 'Professional services rendered', 16.8897, 6613.42, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (35, 17, 'Professional services rendered', 12.5131, 801.65, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (35, 32, 'Consulting and advisory services', 13.1394, 3673.17, 0.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (35, 24, 'Professional services rendered', 6.0505, 502.47, 14.00);
INSERT INTO CRM.InvoiceLineItem (InvoiceID, ProductID, Description, Quantity, UnitPrice, Discount)
VALUES (36, 34, 'Consulting and advisory services', 23.4863, 3914.78, 12.00);

-- Insert Payments (250 records)
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (12, '2025-02-17', 18855.26, 'ACH', 'ACH882351', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (23, '2024-07-28', 17712.49, 'ACH', 'ACH209159', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (12, '2025-01-31', 10338.15, 'Wire Transfer', 'WT789472', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2023-12-23', 22610.88, 'Cash', NULL, 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (24, '2024-04-24', 19222.52, 'ACH', 'ACH966286', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (16, '2025-02-27', 13867.84, 'ACH', 'ACH902903', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (17, '2024-01-08', 24060.47, 'ACH', 'ACH516379', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (3, '2023-08-06', 15096.19, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (20, '2022-01-14', 7858.18, 'Credit Card', '****4519', 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (18, '2025-02-07', 13026.15, 'Cash', NULL, 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (7, '2022-03-19', 11779.06, 'Credit Card', '****3267', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (16, '2023-04-23', 6777.97, 'Wire Transfer', 'WT196369', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (14, '2022-06-08', 18227.72, 'ACH', 'ACH281301', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (7, '2025-05-04', 16235.24, 'Check', '7251', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (4, '2023-11-16', 9024.29, 'ACH', 'ACH536754', 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (15, '2025-08-29', 21312.22, 'Check', '7266', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (34, '2022-03-26', 8323.26, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (33, '2023-03-29', 4253.34, 'Other', NULL, 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2025-05-03', 14593.74, 'Check', '4638', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (26, '2022-10-31', 3738.63, 'Check', '8796', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (4, '2025-01-27', 10280.19, 'Check', '7529', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (9, '2022-10-04', 12282.60, 'Credit Card', '****8993', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (13, '2025-02-23', 15591.92, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (16, '2022-05-27', 7023.30, 'ACH', 'ACH439121', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (6, '2022-08-19', 16957.82, 'ACH', 'ACH483010', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (21, '2023-12-07', 15049.99, 'Check', '5994', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (23, '2025-06-16', 20628.81, 'ACH', 'ACH753453', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (3, '2023-04-24', 5392.29, 'Wire Transfer', 'WT263568', 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (8, '2022-04-22', 6454.68, 'Cash', NULL, 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2023-12-05', 17497.98, 'Check', '5999', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (2, '2023-11-11', 5620.73, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (35, '2024-12-07', 18883.70, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (10, '2022-02-07', 9726.86, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (17, '2022-12-15', 1972.70, 'Credit Card', '****5444', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2022-05-17', 10021.81, 'Wire Transfer', 'WT795186', 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (7, '2022-02-09', 7666.14, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (25, '2024-11-07', 24426.99, 'Check', '6168', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (35, '2022-06-30', 5067.23, 'Cash', NULL, 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (2, '2022-03-23', 6561.11, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (32, '2024-03-16', 18737.57, 'Check', '6681', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (23, '2025-07-04', 7906.99, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (4, '2025-07-05', 6813.14, 'ACH', 'ACH954441', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (18, '2023-04-07', 4216.85, 'ACH', 'ACH788842', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (25, '2024-12-02', 24034.84, 'Cash', NULL, 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (27, '2023-05-08', 14536.01, 'ACH', 'ACH427557', 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2025-01-15', 3728.42, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (35, '2023-02-19', 21633.40, 'Wire Transfer', 'WT821978', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (9, '2024-05-30', 24894.30, 'Credit Card', '****3589', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (36, '2024-12-27', 23740.74, 'Check', '4016', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (10, '2022-03-02', 19253.16, 'ACH', 'ACH531228', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (18, '2022-11-08', 19588.14, 'Check', '3155', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (18, '2025-05-25', 14392.56, 'Credit Card', '****4804', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (2, '2024-01-06', 2447.15, 'ACH', 'ACH240600', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (31, '2025-08-23', 9662.01, 'ACH', 'ACH615318', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (11, '2023-01-31', 6043.69, 'ACH', 'ACH901677', 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (27, '2023-04-01', 18687.98, 'Credit Card', '****4351', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2025-06-17', 12503.60, 'Wire Transfer', 'WT579770', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (26, '2022-03-27', 15394.28, 'ACH', 'ACH855185', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (35, '2024-12-11', 16214.15, 'Other', NULL, 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (7, '2024-07-13', 11694.06, 'Check', '5025', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (26, '2022-03-22', 14163.67, 'Cash', NULL, 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (13, '2023-08-20', 11269.07, 'Wire Transfer', 'WT911259', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (11, '2024-05-15', 7713.28, 'Check', '9470', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2022-07-05', 18204.85, 'Check', '3945', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (9, '2024-03-16', 10632.20, 'ACH', 'ACH126122', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (13, '2024-07-20', 2709.40, 'Wire Transfer', 'WT825318', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (11, '2022-09-11', 2734.19, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (24, '2022-06-24', 13333.52, 'ACH', 'ACH862182', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (11, '2024-02-15', 13983.47, 'Check', '3799', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (10, '2022-11-29', 21786.05, 'Credit Card', '****1840', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (20, '2024-07-02', 7575.12, 'Credit Card', '****2926', 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2025-06-29', 19252.20, 'Check', '8514', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (32, '2025-01-18', 20282.64, 'Cash', NULL, 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (14, '2025-04-20', 16657.03, 'ACH', 'ACH530074', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2023-05-17', 22113.11, 'Wire Transfer', 'WT749871', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (14, '2022-04-11', 5028.58, 'Check', '6718', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (3, '2025-03-29', 21031.35, 'Wire Transfer', 'WT447195', 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (7, '2024-05-03', 24846.51, 'Credit Card', '****5659', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (36, '2022-12-30', 24174.18, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (3, '2022-07-10', 19328.54, 'Wire Transfer', 'WT486473', 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (28, '2025-02-01', 2090.68, 'ACH', 'ACH241081', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (18, '2023-11-06', 13412.79, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (14, '2025-06-07', 1925.52, 'Cash', NULL, 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (6, '2024-09-17', 18239.82, 'Cash', NULL, 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (28, '2025-05-31', 21271.05, 'Wire Transfer', 'WT650912', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (23, '2022-09-23', 15550.10, 'ACH', 'ACH644951', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (32, '2023-01-04', 22149.76, 'Credit Card', '****5759', 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (8, '2022-02-19', 11889.70, 'Check', '4396', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (27, '2022-04-04', 8677.91, 'Cash', NULL, 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2025-08-04', 5429.08, 'Wire Transfer', 'WT366776', 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (20, '2024-11-03', 13974.84, 'Check', '2865', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (22, '2024-03-22', 18247.72, 'Cash', NULL, 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (13, '2023-11-08', 20928.72, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (31, '2022-03-14', 16318.48, 'ACH', 'ACH262934', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (35, '2023-11-18', 11830.52, 'ACH', 'ACH878656', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (34, '2023-09-06', 14341.09, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (35, '2022-02-08', 5602.43, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (23, '2022-05-16', 24255.53, 'Wire Transfer', 'WT981578', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (25, '2025-07-07', 13589.69, 'Credit Card', '****7382', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (8, '2023-09-24', 17779.02, 'Wire Transfer', 'WT844321', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (27, '2022-06-27', 12677.83, 'Credit Card', '****7088', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (20, '2023-03-19', 13364.96, 'Credit Card', '****2838', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (3, '2023-02-18', 22877.17, 'ACH', 'ACH630573', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (31, '2024-10-21', 4274.91, 'Wire Transfer', 'WT606957', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (20, '2023-11-02', 4010.73, 'Check', '9456', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (9, '2023-02-25', 18251.98, 'ACH', 'ACH506415', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (8, '2022-01-09', 8119.04, 'Check', '2426', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (3, '2022-07-31', 13254.15, 'Other', NULL, 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (20, '2025-08-01', 22357.32, 'Wire Transfer', 'WT310297', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (18, '2024-12-26', 8319.17, 'ACH', 'ACH803724', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (10, '2022-11-19', 7204.10, 'Check', '9422', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (35, '2023-12-19', 13959.46, 'Wire Transfer', 'WT248433', 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (16, '2022-12-17', 2245.45, 'Cash', NULL, 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2022-04-14', 3686.81, 'ACH', 'ACH808308', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (25, '2022-04-21', 2609.93, 'ACH', 'ACH287677', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2025-06-16', 9212.80, 'Wire Transfer', 'WT957150', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (35, '2022-06-10', 24355.21, 'ACH', 'ACH695370', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (30, '2022-07-19', 11661.81, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (30, '2024-08-21', 6176.51, 'Credit Card', '****3354', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (17, '2024-01-15', 10105.88, 'Other', NULL, 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (21, '2024-07-17', 12443.91, 'Check', '8787', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (31, '2024-08-02', 21221.27, 'Wire Transfer', 'WT905245', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (9, '2024-11-06', 3021.84, 'Other', NULL, 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (36, '2025-08-23', 2237.64, 'Wire Transfer', 'WT658624', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (27, '2023-05-04', 15711.43, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (31, '2024-02-26', 2118.47, 'Credit Card', '****8063', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (22, '2025-01-20', 17506.26, 'Credit Card', '****2276', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (32, '2022-08-23', 15008.00, 'ACH', 'ACH441183', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2022-12-27', 8046.88, 'ACH', 'ACH172988', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (25, '2023-11-02', 12610.23, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (14, '2022-10-12', 22237.91, 'Other', NULL, 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (10, '2024-07-16', 13515.77, 'ACH', 'ACH745474', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (13, '2023-02-26', 17197.16, 'Wire Transfer', 'WT414295', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (20, '2024-06-09', 18085.88, 'Wire Transfer', 'WT193624', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (33, '2024-04-07', 21267.10, 'Wire Transfer', 'WT165442', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (36, '2022-04-19', 520.66, 'Cash', NULL, 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (8, '2023-08-01', 21709.15, 'Credit Card', '****8073', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (21, '2024-02-23', 10447.80, 'ACH', 'ACH671598', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (12, '2024-08-30', 3907.19, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (24, '2024-05-04', 4279.55, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2022-05-27', 16385.54, 'Credit Card', '****8974', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (9, '2022-06-23', 3861.90, 'ACH', 'ACH578180', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (28, '2025-06-30', 4905.04, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2024-02-27', 9205.03, 'Credit Card', '****7959', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (32, '2023-04-30', 17947.18, 'Wire Transfer', 'WT530794', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (24, '2022-03-10', 24466.72, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (24, '2022-08-20', 14716.59, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (34, '2023-07-27', 11890.94, 'Check', '9574', 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (16, '2024-08-25', 15951.24, 'Other', NULL, 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (35, '2025-04-02', 8156.24, 'Check', '6628', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2024-08-18', 11623.85, 'ACH', 'ACH701846', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (23, '2023-08-27', 7585.61, 'Check', '5981', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (17, '2022-05-06', 15917.85, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (4, '2023-08-21', 20317.95, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (32, '2022-06-18', 3607.12, 'Check', '5552', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (18, '2023-07-18', 21517.53, 'Check', '2827', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (10, '2024-07-03', 9559.29, 'Credit Card', '****5280', 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (32, '2023-01-06', 20084.61, 'Check', '6617', 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (10, '2024-10-12', 18942.65, 'ACH', 'ACH907789', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2025-07-29', 4598.44, 'Cash', NULL, 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (4, '2025-08-08', 6977.69, 'Check', '1860', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (26, '2024-09-02', 7883.49, 'Other', NULL, 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (15, '2024-02-17', 17245.99, 'ACH', 'ACH597643', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (34, '2024-06-09', 790.64, 'ACH', 'ACH500560', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (34, '2022-03-26', 2885.43, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (28, '2025-06-04', 22992.03, 'Wire Transfer', 'WT451238', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (7, '2023-06-07', 16531.41, 'ACH', 'ACH583507', 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (13, '2024-11-30', 8766.46, 'Other', NULL, 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (36, '2022-01-22', 16983.65, 'Check', '1195', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (34, '2022-08-01', 17294.74, 'Wire Transfer', 'WT330074', 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (13, '2022-03-11', 1080.66, 'Check', '1931', 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (8, '2022-09-03', 2616.47, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (12, '2022-08-16', 17543.51, 'Wire Transfer', 'WT408877', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (5, '2025-08-01', 11609.37, 'Wire Transfer', 'WT906731', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (21, '2023-06-12', 4468.17, 'Check', '5543', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (25, '2023-11-13', 24900.98, 'Wire Transfer', 'WT952283', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2022-05-23', 12547.18, 'Credit Card', '****7432', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (32, '2022-08-11', 4024.88, 'ACH', 'ACH328994', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (7, '2024-06-23', 18027.31, 'Check', '1571', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (17, '2024-07-02', 959.74, 'ACH', 'ACH256085', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2022-03-19', 16782.84, 'Wire Transfer', 'WT258971', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2024-11-21', 17836.34, 'ACH', 'ACH601365', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (5, '2025-01-11', 6033.25, 'ACH', 'ACH822742', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (8, '2025-03-07', 13614.95, 'Wire Transfer', 'WT449636', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (26, '2022-04-24', 15990.68, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (35, '2023-11-28', 2471.19, 'ACH', 'ACH897392', 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (12, '2025-02-09', 1463.61, 'ACH', 'ACH792829', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (25, '2022-08-07', 15950.12, 'Wire Transfer', 'WT610135', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2023-01-24', 3928.60, 'Credit Card', '****1415', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (16, '2024-09-28', 10024.80, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (32, '2024-12-29', 24141.37, 'ACH', 'ACH117215', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (4, '2023-11-23', 19800.57, 'Check', '7643', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (34, '2024-07-27', 23532.20, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (15, '2022-05-28', 1403.50, 'Credit Card', '****9010', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (31, '2025-06-20', 1622.14, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2022-12-19', 16000.21, 'Wire Transfer', 'WT960607', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (11, '2025-04-25', 2066.96, 'Check', '2870', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (15, '2022-05-10', 20209.11, 'ACH', 'ACH453729', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (21, '2022-09-05', 24408.41, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (21, '2023-03-13', 19223.58, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (5, '2022-09-05', 7210.39, 'ACH', 'ACH276214', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (36, '2022-12-04', 11247.20, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (7, '2025-07-18', 15504.82, 'Credit Card', '****1256', 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2022-01-15', 4895.61, 'Check', '5648', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (31, '2022-09-17', 5550.93, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (29, '2024-04-23', 6361.72, 'Credit Card', '****1616', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (32, '2025-06-07', 23782.30, 'Other', NULL, 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (23, '2024-05-07', 611.97, 'Credit Card', '****4144', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (34, '2022-07-15', 15663.56, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (30, '2025-07-06', 16653.52, 'Wire Transfer', 'WT155646', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (10, '2024-08-29', 12689.11, 'Credit Card', '****1706', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (24, '2023-08-07', 5634.95, 'Wire Transfer', 'WT450533', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (30, '2022-03-30', 3058.32, 'Check', '9804', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (2, '2024-09-20', 13115.14, 'Check', '4855', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (21, '2024-05-08', 5369.41, 'Other', NULL, 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (8, '2023-10-30', 6080.66, 'Credit Card', '****7759', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (15, '2022-05-31', 12039.26, 'ACH', 'ACH156978', 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (14, '2025-06-02', 11647.28, 'ACH', 'ACH491627', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (13, '2025-07-18', 9285.46, 'Wire Transfer', 'WT312033', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (3, '2025-03-10', 1961.47, 'Credit Card', '****2820', 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (27, '2022-12-17', 19128.32, 'Credit Card', '****5835', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (11, '2025-03-29', 24268.33, 'Credit Card', '****2416', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (34, '2024-09-28', 21623.88, 'Credit Card', '****8757', 'Deposit');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (1, '2024-05-26', 18536.38, 'Credit Card', '****5060', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (15, '2025-04-26', 23683.18, 'Cash', NULL, 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (3, '2022-03-24', 24786.20, 'Other', NULL, 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (28, '2024-12-23', 10160.84, 'Other', NULL, 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (32, '2023-05-08', 2535.74, 'Check', '7662', 'Final payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (23, '2023-08-29', 6357.03, 'Check', '1260', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (20, '2022-11-28', 17730.96, 'Cash', NULL, 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (30, '2024-08-07', 19409.96, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (24, '2025-07-07', 11875.25, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (5, '2024-02-28', 22389.14, 'Wire Transfer', 'WT656710', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (28, '2023-07-07', 17602.35, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (14, '2022-06-15', 15701.15, 'Wire Transfer', 'WT871501', 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (24, '2022-04-16', 3218.68, 'Wire Transfer', 'WT587957', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (24, '2024-01-21', 4794.05, 'Cash', NULL, 'Quarterly payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (14, '2022-10-11', 24540.66, 'Credit Card', '****9841', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (31, '2025-04-03', 21842.72, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (15, '2023-10-19', 9141.44, 'Wire Transfer', 'WT628027', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (18, '2022-04-22', 2052.54, 'Wire Transfer', 'WT574386', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (34, '2022-09-09', 12019.01, 'Cash', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (35, '2023-08-22', 11573.47, 'Wire Transfer', 'WT938759', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (5, '2023-01-21', 22351.63, 'ACH', 'ACH191549', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (12, '2023-08-14', 23977.28, 'Check', '2791', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (8, '2022-10-31', 12660.05, 'Credit Card', '****9530', 'Partial payment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (19, '2024-05-03', 24254.58, 'Cash', NULL, 'Monthly installment');
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (23, '2024-05-10', 11374.57, 'Other', NULL, NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (13, '2022-05-09', 1039.90, 'Credit Card', '****9513', NULL);
INSERT INTO CRM.Payment (InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes)
VALUES (27, '2025-03-31', 8898.42, 'Other', NULL, 'Monthly installment');

-- Update invoice payment status based on actual payments
UPDATE inv
SET inv.AmountPaid = ISNULL(p.TotalPaid, 0),
    inv.Status = CASE 
        WHEN ISNULL(p.TotalPaid, 0) >= inv.SubTotal * (1 + inv.TaxRate / 100.0) THEN 'Paid'
        WHEN ISNULL(p.TotalPaid, 0) > 0 THEN 'Partial'
        WHEN inv.DueDate < GETDATE() THEN 'Overdue'
        ELSE inv.Status
    END
FROM CRM.Invoice inv
LEFT JOIN (
    SELECT InvoiceID, SUM(Amount) as TotalPaid
    FROM CRM.Payment
    GROUP BY InvoiceID
) p ON inv.ID = p.InvoiceID;

-- Sample data generation complete
-- Generated: 2025-08-16 18:55:32
-- Account IDs used: 1-35 (from CRM Script 1)
-- Contact IDs used: 1-65 (from CRM Script 1)