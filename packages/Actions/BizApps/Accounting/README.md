# @memberjunction/actions-bizapps-accounting

Accounting system integration actions for MemberJunction. This package provides a standardized way to interact with various accounting systems through MemberJunction's action framework.

## Overview

This package implements actions for common accounting operations across multiple accounting systems:
- QuickBooks Online ✅
- Microsoft Dynamics 365 Business Central ✅
- NetSuite (coming soon)
- Sage Intacct (coming soon)
- Microsoft Dynamics GP (coming soon)

## Architecture

### Base Classes

- **BaseAccountingAction**: Abstract base class providing common functionality for all accounting actions
  - Company-based credential management via CompanyIntegration entity
  - Common parameter definitions
  - Validation helpers for accounting data
  - Error handling patterns

- **Provider-Specific Base Classes** (e.g., QuickBooksBaseAction):
  - Handle provider-specific authentication
  - API request/response handling
  - Data mapping between provider formats and standard formats

### Authentication

The package uses MemberJunction's CompanyIntegration entity to store credentials:
- Each Company can have multiple accounting system integrations
- OAuth tokens, API keys, and other credentials are stored securely
- Automatic token expiration checking

### Setup

1. **Create Integration Records**: First, create Integration entity records for your accounting systems:

**QuickBooks Online:**
```sql
INSERT INTO Integration (Name, Description, NavigationBaseURL, ClassName)
VALUES ('QuickBooks Online', 'QuickBooks Online Accounting Integration', 
        'https://quickbooks.api.intuit.com', 'QuickBooksIntegration');
```

**Business Central:**
```sql
INSERT INTO Integration (Name, Description, NavigationBaseURL, ClassName)
VALUES ('Microsoft Dynamics 365 Business Central', 'Business Central Accounting Integration', 
        '', 'BusinessCentralIntegration');
```

2. **Configure CompanyIntegration**: For each company, create a CompanyIntegration record:

**QuickBooks Online:**
```sql
INSERT INTO CompanyIntegration (CompanyID, IntegrationID, ExternalSystemID, 
                               CustomAttribute1, IsActive)
VALUES (@CompanyID, @QuickBooksIntegrationID, @RealmID, 'production', 1); -- or 'sandbox'
```

**Business Central:**
```sql
INSERT INTO CompanyIntegration (CompanyID, IntegrationID, ExternalSystemID, 
                               CustomAttribute1, IsActive)
VALUES (@CompanyID, @BCIntegrationID, @BCCompanyID, 'production', 1); 
-- CustomAttribute1: environment name (production, sandbox, or custom)
-- ExternalSystemID: Business Central company ID (GUID)
```

3. **Set Environment Variables**: Configure credentials via environment variables:

**QuickBooks Online:**
```bash
# QuickBooks credentials for a specific company
BIZAPPS_QUICKBOOKS_ONLINE_[COMPANY_ID]_ACCESS_TOKEN=your_access_token
BIZAPPS_QUICKBOOKS_ONLINE_[COMPANY_ID]_REFRESH_TOKEN=your_refresh_token
BIZAPPS_QUICKBOOKS_ONLINE_[COMPANY_ID]_REALM_ID=your_realm_id  # Optional if in DB

# Example for company ID "12345-67890"
BIZAPPS_QUICKBOOKS_ONLINE_12345-67890_ACCESS_TOKEN=eyJhbGc...
BIZAPPS_QUICKBOOKS_ONLINE_12345-67890_REFRESH_TOKEN=AB11590...
```

**Business Central:**
```bash
# Business Central credentials for a specific company
BIZAPPS_BUSINESS_CENTRAL_[COMPANY_ID]_ACCESS_TOKEN=your_access_token
BIZAPPS_BUSINESS_CENTRAL_[COMPANY_ID]_REFRESH_TOKEN=your_refresh_token
BIZAPPS_BUSINESS_CENTRAL_[COMPANY_ID]_TENANT_ID=your_tenant_id

# Example for company ID "12345-67890"
BIZAPPS_BUSINESS_CENTRAL_12345-67890_ACCESS_TOKEN=eyJhbGc...
BIZAPPS_BUSINESS_CENTRAL_12345-67890_REFRESH_TOKEN=AB11590...
BIZAPPS_BUSINESS_CENTRAL_12345-67890_TENANT_ID=00000000-0000-0000-0000-000000000000
```

### Credential Priority

The system checks for credentials in this order:
1. **Environment Variables** (recommended for security)
2. **Database** (CompanyIntegration entity - for backwards compatibility)

This allows you to:
- Keep sensitive credentials out of the database
- Use the database for non-sensitive configuration (realm ID, environment, etc.)
- Gradually migrate existing implementations

## Available Actions

### QuickBooks Online

#### 1. GetQuickBooksGLCodesAction
Retrieves the Chart of Accounts from QuickBooks Online.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `IncludeInactive`: Include inactive accounts
- `AccountTypes`: Filter by account types (comma-separated)
- `ParentAccountID`: Filter by parent account

#### 2. GetQuickBooksTransactionsAction
Retrieves transactions with flexible filtering across multiple transaction types.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `TransactionType`: Specific type (Invoice, Bill, Payment, etc.) or leave empty for all
- `StartDate/EndDate`: Transaction date range
- `EntityID`: Filter by customer or vendor
- `Status`: Transaction status filter
- `MinAmount/MaxAmount`: Amount range
- `MaxResults`: Limit results (default: 100, max: 1000)

#### 3. GetQuickBooksAccountBalancesAction
Retrieves account balances (trial balance) for a specific date.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `AsOfDate`: Balance snapshot date (defaults to today)
- `AccountTypes`: Filter by account types
- `IncludeInactive`: Include inactive accounts
- `IncludeZeroBalances`: Include zero balance accounts (default: true)
- `SummarizeByType`: Return summary by account type

#### 4. GetQuickBooksInvoicesAction
Retrieves customer invoices with comprehensive filtering.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `CustomerID`: Filter by specific customer
- `Status`: All, Open, Paid, Overdue
- `StartDate/EndDate`: Invoice date range
- `DueStartDate/DueEndDate`: Due date range
- `MinAmount/MaxAmount`: Amount range
- `IncludeLines`: Include line items (default: true)

#### 5. GetQuickBooksBillsAction
Retrieves vendor bills with comprehensive filtering.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `VendorID`: Filter by specific vendor
- `Status`: All, Open, Paid, Overdue
- `StartDate/EndDate`: Bill date range
- `DueStartDate/DueEndDate`: Due date range
- `MinAmount/MaxAmount`: Amount range
- `IncludeLines`: Include line items (default: true)

#### 6. GetQuickBooksCustomersAction
Retrieves customers with search and filtering options.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `SearchText`: Search by name, email, or phone
- `IncludeInactive`: Include inactive customers
- `MinBalance/MaxBalance`: Balance range
- `SortBy`: DisplayName, Balance, CreatedDate
- `IncludeBalances`: Include balance info (default: true)

#### 7. GetQuickBooksVendorsAction
Retrieves vendors with search and filtering options.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `SearchText`: Search by name, email, or phone
- `IncludeInactive`: Include inactive vendors
- `Only1099Vendors`: Only 1099-eligible vendors
- `MinBalance/MaxBalance`: Balance range
- `SortBy`: DisplayName, Balance, CreatedDate

#### 8. CreateQuickBooksJournalEntryAction
Creates a journal entry with automatic validation.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `Lines` (required): Array of journal entry lines
- `EntryDate`: Date of entry (defaults to today)
- `DocNumber`: Journal entry number (auto-generated if not provided)
- `PrivateNote`: Internal memo
- `AdjustmentEntry`: Mark as adjustment

**Line Format:**
```typescript
{
  accountId: string;
  debit?: number;    // Either debit or credit
  credit?: number;   // Must balance to zero
  description?: string;
  entityType?: 'Customer' | 'Vendor' | 'Employee';
  entityId?: string;
  classId?: string;
  departmentId?: string;
}
```

### Microsoft Dynamics 365 Business Central

#### 1. GetBusinessCentralGLAccountsAction
Retrieves the Chart of Accounts from Business Central.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `IncludeBlocked`: Include blocked accounts
- `AccountTypes`: Filter by types (Posting, Heading, Total)
- `Categories`: Filter by categories (Assets, Liabilities, Equity, etc.)
- `MinBalance/MaxBalance`: Balance range filters
- `MaxResults`: Limit results (default: 1000)

#### 2. GetBusinessCentralGeneralLedgerEntriesAction
Retrieves general ledger entries (journal entries) from Business Central.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `StartDate/EndDate`: Posting date range
- `AccountNumber`: Filter by GL account
- `DocumentNumber`: Filter by document number
- `DocumentType`: Filter by type (Payment, Invoice, etc.)
- `MinAmount/MaxAmount`: Amount range
- `IncludeDimensions`: Include dimension details
- `MaxResults`: Limit results (default: 500)

#### 3. GetBusinessCentralCustomersAction
Retrieves customers from Business Central.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `SearchText`: Search by name, number, or email
- `IncludeBlocked`: Include blocked customers
- `CustomerType`: Filter by Company or Person
- `MinBalance/MaxBalance`: Balance range
- `OnlyOverdue`: Only customers with overdue amounts
- `SortBy`: Sort field (displayName, number, balance, etc.)
- `MaxResults`: Limit results (default: 100)

#### 4. GetBusinessCentralSalesInvoicesAction
Retrieves sales invoices from Business Central.

**Parameters:**
- `CompanyID` (required): MemberJunction Company ID
- `CustomerNumber`: Filter by customer
- `Status`: Filter by status (Draft, Open, Paid, etc.)
- `StartDate/EndDate`: Invoice date range
- `DueStartDate/DueEndDate`: Due date range
- `MinAmount/MaxAmount`: Amount range
- `OnlyUnpaid`: Only invoices with balance
- `IncludeLines`: Include line items
- `MaxResults`: Limit results (default: 100)

## Usage Example

```typescript
import { GetQuickBooksGLCodesAction } from '@memberjunction/actions-bizapps-accounting';

// In your action execution context
const action = new GetQuickBooksGLCodesAction();
const result = await action.RunAction({
  CompanyID: 'your-company-id',
  IncludeInactive: false,
  AccountTypes: 'Bank,Expense,Income'
}, contextUser);

if (result.Success) {
  const glCodes = result.Results.GLCodes;
  console.log(`Retrieved ${glCodes.length} GL codes`);
}
```

## Adding New Providers

To add support for a new accounting system:

1. Create a provider folder: `src/providers/[provider-name]/`
2. Extend `BaseAccountingAction` with a provider-specific base class
3. Implement the required actions extending your provider base class
4. Update exports in `src/index.ts`

## Development

```bash
# Build the package
npm run build

# Watch mode for development
npm run watch
```

## Future Enhancements

- Automatic token refresh for OAuth providers
- Webhook support for real-time updates
- Bulk operations support
- Advanced filtering and pagination
- Write operations (create journal entries, etc.)