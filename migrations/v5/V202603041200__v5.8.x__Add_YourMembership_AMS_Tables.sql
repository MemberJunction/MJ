/**************************************************************************************************
 * Migration: YourMembership AMS Integration Tables
 *
 * Purpose: Create the YourMembership schema and 7 sync tables for data from the
 * YourMembership REST API. These tables are populated by the YM sync actions (DML only).
 *
 * Schema: YourMembership (separate from MJ core schema)
 *
 * Standard integration columns (per Integration DDL plan):
 *   - ID                 MJ primary key (UNIQUEIDENTIFIER)
 *   - SourceRecordID     External system identifier for upsert matching
 *   - SourceJSON         Raw API response for debugging/auditing
 *   - SyncStatus         Track record state (Active, Deleted, Archived)
 *   - LastSyncedAt       Timestamp of last successful sync
 *
 * Tables created:
 *   1. YM_Member     - Members from MemberList endpoint
 *   2. YM_Event      - Event IDs from EventIDs endpoint
 *   3. YM_Order      - Order line items from StoreOrderDetails endpoint
 *   4. YM_Product    - Products from Products endpoint
 *   5. YM_Group      - Groups from Groups endpoint
 *   6. YM_MemberType - Member types from MemberTypes endpoint
 *   7. YM_Membership - Membership plans from Membership endpoint
 *
 * Version: 5.8.x
 **************************************************************************************************/

-- Create the YourMembership schema
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'YourMembership')
    EXEC('CREATE SCHEMA [YourMembership]')
GO

-- Grant DML permissions to MJ_Connect
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[YourMembership] TO [MJ_Connect];
GO

-- ============================================================================
-- 1. YM_Member: Synced from YM MemberList endpoint
-- ============================================================================
CREATE TABLE [YourMembership].[YM_Member] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SourceRecordID] NVARCHAR(500) NOT NULL,
    [ProfileID] INT NULL,
    [FirstName] NVARCHAR(200) NULL,
    [LastName] NVARCHAR(200) NULL,
    [Email] NVARCHAR(255) NULL,
    [Status] NVARCHAR(100) NULL,
    [MemberTypeCode] NVARCHAR(100) NULL,
    [MemberSince] NVARCHAR(100) NULL,
    [ExpirationDate] NVARCHAR(100) NULL,
    [Phone] NVARCHAR(50) NULL,
    [Address1] NVARCHAR(500) NULL,
    [Address2] NVARCHAR(500) NULL,
    [City] NVARCHAR(200) NULL,
    [State] NVARCHAR(100) NULL,
    [PostalCode] NVARCHAR(20) NULL,
    [Country] NVARCHAR(100) NULL,
    [Company] NVARCHAR(500) NULL,
    [Title] NVARCHAR(200) NULL,
    [SourceJSON] NVARCHAR(MAX) NULL,
    [SyncStatus] NVARCHAR(50) NOT NULL DEFAULT 'Active',
    [LastSyncedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_YM_Member] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_YM_Member_SourceRecordID] UNIQUE ([SourceRecordID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'External system identifier for upsert matching', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'SourceRecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'YM member profile ID (primary key in YM system)', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'ProfileID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Member first name', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'FirstName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Member last name', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'LastName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Member email address', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'Email';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Membership status (e.g., Active, Expired)', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Member type code from YM', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'MemberTypeCode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the member joined', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'MemberSince';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Membership expiration date', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'ExpirationDate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Raw API response JSON for debugging', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'SourceJSON';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Record sync state: Active, Deleted, or Archived', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'SyncStatus';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp of last successful sync from YM API', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Member', @level2type=N'COLUMN', @level2name=N'LastSyncedAt';
GO

-- ============================================================================
-- 2. YM_Event: Synced from YM EventIDs endpoint (minimal — just event IDs)
-- ============================================================================
CREATE TABLE [YourMembership].[YM_Event] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SourceRecordID] NVARCHAR(500) NOT NULL,
    [YM_EventID] INT NULL,
    [SourceJSON] NVARCHAR(MAX) NULL,
    [SyncStatus] NVARCHAR(50) NOT NULL DEFAULT 'Active',
    [LastSyncedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_YM_Event] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_YM_Event_SourceRecordID] UNIQUE ([SourceRecordID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'External system identifier for upsert matching', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Event', @level2type=N'COLUMN', @level2name=N'SourceRecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Event ID from the YM system', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Event', @level2type=N'COLUMN', @level2name=N'YM_EventID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Raw API response JSON for debugging', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Event', @level2type=N'COLUMN', @level2name=N'SourceJSON';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Record sync state: Active, Deleted, or Archived', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Event', @level2type=N'COLUMN', @level2name=N'SyncStatus';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp of last successful sync from YM API', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Event', @level2type=N'COLUMN', @level2name=N'LastSyncedAt';
GO

-- ============================================================================
-- 3. YM_Order: Synced from YM StoreOrderDetails endpoint
--    Composite PK from YM: OrderID + ProductCode
-- ============================================================================
CREATE TABLE [YourMembership].[YM_Order] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SourceRecordID] NVARCHAR(500) NOT NULL,
    [OrderID] INT NULL,
    [InvoiceNumber] INT NULL,
    [DatePurchased] NVARCHAR(100) NULL,
    [OrderStatus] NVARCHAR(100) NULL,
    [ShipLastName] NVARCHAR(200) NULL,
    [ShipFirstName] NVARCHAR(200) NULL,
    [CardName] NVARCHAR(200) NULL,
    [CardType] NVARCHAR(100) NULL,
    [PaymentOption] NVARCHAR(100) NULL,
    [Terms] NVARCHAR(200) NULL,
    [OrderTotal] DECIMAL(18, 4) NULL,
    [BalanceDue] DECIMAL(18, 4) NULL,
    [ShippingTotal] DECIMAL(18, 4) NULL,
    [TaxVATTotal] DECIMAL(18, 4) NULL,
    [TaxVATPercent] DECIMAL(18, 4) NULL,
    [SalesDiscount] DECIMAL(18, 4) NULL,
    [ShippingDiscount] DECIMAL(18, 4) NULL,
    [PromoCodeUsed] NVARCHAR(200) NULL,
    [GiftMessage] NVARCHAR(MAX) NULL,
    [Category] NVARCHAR(200) NULL,
    [ProductCode] NVARCHAR(200) NULL,
    [Product] NVARCHAR(500) NULL,
    [Price] DECIMAL(18, 4) NULL,
    [Quantity] INT NULL,
    [ChargedTaxVAT] NVARCHAR(100) NULL,
    [SizeType] NVARCHAR(100) NULL,
    [Color] NVARCHAR(100) NULL,
    [CustomFieldName] NVARCHAR(500) NULL,
    [CustomFieldValue] NVARCHAR(MAX) NULL,
    [CustomerResponse] NVARCHAR(MAX) NULL,
    [MemberID] INT NULL,
    [MemberType] NVARCHAR(200) NULL,
    [PrimaryGroup] NVARCHAR(200) NULL,
    [ConstituentID] NVARCHAR(200) NULL,
    [Email] NVARCHAR(255) NULL,
    [DateProcessed] NVARCHAR(100) NULL,
    [DateShipped] NVARCHAR(100) NULL,
    [ShipMethod] NVARCHAR(200) NULL,
    [CompanyAttention] NVARCHAR(500) NULL,
    [ShipAddress1] NVARCHAR(500) NULL,
    [ShipAddress2] NVARCHAR(500) NULL,
    [ShipCity] NVARCHAR(200) NULL,
    [ShipState] NVARCHAR(100) NULL,
    [ShipPostal] NVARCHAR(20) NULL,
    [ShipProvince] NVARCHAR(200) NULL,
    [ShipCountry] NVARCHAR(100) NULL,
    [ShipBusPhone] NVARCHAR(50) NULL,
    [ShipHomePhone] NVARCHAR(50) NULL,
    [ShipMobilePhone] NVARCHAR(50) NULL,
    [CardNumber] NVARCHAR(100) NULL,
    [CardMonth] NVARCHAR(10) NULL,
    [CardYear] NVARCHAR(10) NULL,
    [BillAddress1] NVARCHAR(500) NULL,
    [BillAddress2] NVARCHAR(500) NULL,
    [BillCity] NVARCHAR(200) NULL,
    [BillState] NVARCHAR(100) NULL,
    [BillProvince] NVARCHAR(200) NULL,
    [BillPostal] NVARCHAR(20) NULL,
    [BillCountry] NVARCHAR(100) NULL,
    [CustomerComments] NVARCHAR(MAX) NULL,
    [InternalComments] NVARCHAR(MAX) NULL,
    [ClosedBy] NVARCHAR(200) NULL,
    [OrganizationAttention] NVARCHAR(500) NULL,
    [BillOrganization] NVARCHAR(500) NULL,
    [ShipAddressValidated] BIT NULL,
    [PO] NVARCHAR(200) NULL,
    [MemberAPIGUID] NVARCHAR(200) NULL,
    [ReferenceNumber] NVARCHAR(200) NULL,
    [EventRegistrationBadgeID] INT NULL,
    [EventRegistrationFirstName] NVARCHAR(200) NULL,
    [EventRegistrationLastName] NVARCHAR(200) NULL,
    [EventRegistrationAttendeeType] NVARCHAR(200) NULL,
    [InvoiceDate] NVARCHAR(100) NULL,
    [SourceJSON] NVARCHAR(MAX) NULL,
    [SyncStatus] NVARCHAR(50) NOT NULL DEFAULT 'Active',
    [LastSyncedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_YM_Order] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_YM_Order_SourceRecordID] UNIQUE ([SourceRecordID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'External system identifier (OrderID|ProductCode) for upsert matching', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Order', @level2type=N'COLUMN', @level2name=N'SourceRecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'YM order identifier', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Order', @level2type=N'COLUMN', @level2name=N'OrderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total amount for the order', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Order', @level2type=N'COLUMN', @level2name=N'OrderTotal';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Product code for this line item', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Order', @level2type=N'COLUMN', @level2name=N'ProductCode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'YM member ID associated with this order', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Order', @level2type=N'COLUMN', @level2name=N'MemberID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Raw API response JSON for debugging', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Order', @level2type=N'COLUMN', @level2name=N'SourceJSON';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Record sync state: Active, Deleted, or Archived', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Order', @level2type=N'COLUMN', @level2name=N'SyncStatus';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp of last successful sync from YM API', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Order', @level2type=N'COLUMN', @level2name=N'LastSyncedAt';
GO

-- ============================================================================
-- 4. YM_Product: Synced from YM Products endpoint
-- ============================================================================
CREATE TABLE [YourMembership].[YM_Product] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SourceRecordID] NVARCHAR(500) NOT NULL,
    [ProductID] NVARCHAR(200) NULL,
    [Name] NVARCHAR(500) NULL,
    [Price] DECIMAL(18, 4) NULL,
    [SalePrice] DECIMAL(18, 4) NULL,
    [SKU] NVARCHAR(200) NULL,
    [Description] NVARCHAR(MAX) NULL,
    [Category] NVARCHAR(200) NULL,
    [IsActive] BIT NULL,
    [InventoryCount] INT NULL,
    [SourceJSON] NVARCHAR(MAX) NULL,
    [SyncStatus] NVARCHAR(50) NOT NULL DEFAULT 'Active',
    [LastSyncedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_YM_Product] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_YM_Product_SourceRecordID] UNIQUE ([SourceRecordID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'External system identifier for upsert matching', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Product', @level2type=N'COLUMN', @level2name=N'SourceRecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Product identifier from YM system', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Product', @level2type=N'COLUMN', @level2name=N'ProductID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Product display name', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Product', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Regular price', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Product', @level2type=N'COLUMN', @level2name=N'Price';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Discounted sale price', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Product', @level2type=N'COLUMN', @level2name=N'SalePrice';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the product is currently active', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Product', @level2type=N'COLUMN', @level2name=N'IsActive';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Raw API response JSON for debugging', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Product', @level2type=N'COLUMN', @level2name=N'SourceJSON';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Record sync state: Active, Deleted, or Archived', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Product', @level2type=N'COLUMN', @level2name=N'SyncStatus';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp of last successful sync from YM API', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Product', @level2type=N'COLUMN', @level2name=N'LastSyncedAt';
GO

-- ============================================================================
-- 5. YM_Group: Synced from YM Groups endpoint
-- ============================================================================
CREATE TABLE [YourMembership].[YM_Group] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SourceRecordID] NVARCHAR(500) NOT NULL,
    [GroupID] NVARCHAR(200) NULL,
    [Name] NVARCHAR(500) NULL,
    [Description] NVARCHAR(MAX) NULL,
    [MemberCount] INT NULL,
    [IsPublic] BIT NULL,
    [GroupType] NVARCHAR(100) NULL,
    [SourceJSON] NVARCHAR(MAX) NULL,
    [SyncStatus] NVARCHAR(50) NOT NULL DEFAULT 'Active',
    [LastSyncedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_YM_Group] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_YM_Group_SourceRecordID] UNIQUE ([SourceRecordID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'External system identifier for upsert matching', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Group', @level2type=N'COLUMN', @level2name=N'SourceRecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Group identifier from YM system', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Group', @level2type=N'COLUMN', @level2name=N'GroupID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Group display name', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Group', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of members in this group', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Group', @level2type=N'COLUMN', @level2name=N'MemberCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the group is publicly visible', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Group', @level2type=N'COLUMN', @level2name=N'IsPublic';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Raw API response JSON for debugging', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Group', @level2type=N'COLUMN', @level2name=N'SourceJSON';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Record sync state: Active, Deleted, or Archived', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Group', @level2type=N'COLUMN', @level2name=N'SyncStatus';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp of last successful sync from YM API', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Group', @level2type=N'COLUMN', @level2name=N'LastSyncedAt';
GO

-- ============================================================================
-- 6. YM_MemberType: Synced from YM MemberTypes endpoint
-- ============================================================================
CREATE TABLE [YourMembership].[YM_MemberType] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SourceRecordID] NVARCHAR(500) NOT NULL,
    [YM_TypeID] INT NULL,
    [TypeCode] NVARCHAR(200) NULL,
    [Name] NVARCHAR(500) NULL,
    [IsDefault] BIT NULL,
    [Visibility] INT NULL,
    [PresetType] NVARCHAR(100) NULL,
    [SortOrder] INT NULL,
    [SourceJSON] NVARCHAR(MAX) NULL,
    [SyncStatus] NVARCHAR(50) NOT NULL DEFAULT 'Active',
    [LastSyncedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_YM_MemberType] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_YM_MemberType_SourceRecordID] UNIQUE ([SourceRecordID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'External system identifier for upsert matching', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_MemberType', @level2type=N'COLUMN', @level2name=N'SourceRecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Numeric type ID from YM system', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_MemberType', @level2type=N'COLUMN', @level2name=N'YM_TypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Type code identifier used in member records', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_MemberType', @level2type=N'COLUMN', @level2name=N'TypeCode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name for this member type', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_MemberType', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this is the default member type', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_MemberType', @level2type=N'COLUMN', @level2name=N'IsDefault';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sort order for display', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_MemberType', @level2type=N'COLUMN', @level2name=N'SortOrder';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Raw API response JSON for debugging', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_MemberType', @level2type=N'COLUMN', @level2name=N'SourceJSON';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Record sync state: Active, Deleted, or Archived', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_MemberType', @level2type=N'COLUMN', @level2name=N'SyncStatus';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp of last successful sync from YM API', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_MemberType', @level2type=N'COLUMN', @level2name=N'LastSyncedAt';
GO

-- ============================================================================
-- 7. YM_Membership: Synced from YM Membership endpoint
-- ============================================================================
CREATE TABLE [YourMembership].[YM_Membership] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SourceRecordID] NVARCHAR(500) NOT NULL,
    [MembershipID] NVARCHAR(200) NULL,
    [Name] NVARCHAR(500) NULL,
    [Price] DECIMAL(18, 4) NULL,
    [Duration] NVARCHAR(100) NULL,
    [BenefitsDescription] NVARCHAR(MAX) NULL,
    [IsActive] BIT NULL,
    [SourceJSON] NVARCHAR(MAX) NULL,
    [SyncStatus] NVARCHAR(50) NOT NULL DEFAULT 'Active',
    [LastSyncedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_YM_Membership] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_YM_Membership_SourceRecordID] UNIQUE ([SourceRecordID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'External system identifier for upsert matching', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Membership', @level2type=N'COLUMN', @level2name=N'SourceRecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Membership plan identifier from YM system', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Membership', @level2type=N'COLUMN', @level2name=N'MembershipID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Membership plan display name', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Membership', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Membership plan price', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Membership', @level2type=N'COLUMN', @level2name=N'Price';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Membership duration (e.g., 1 Year, Monthly)', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Membership', @level2type=N'COLUMN', @level2name=N'Duration';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this membership plan is currently active', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Membership', @level2type=N'COLUMN', @level2name=N'IsActive';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Raw API response JSON for debugging', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Membership', @level2type=N'COLUMN', @level2name=N'SourceJSON';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Record sync state: Active, Deleted, or Archived', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Membership', @level2type=N'COLUMN', @level2name=N'SyncStatus';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp of last successful sync from YM API', @level0type=N'SCHEMA', @level0name=N'YourMembership', @level1type=N'TABLE', @level1name=N'YM_Membership', @level2type=N'COLUMN', @level2name=N'LastSyncedAt';
GO
