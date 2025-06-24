# MemberJunction Business Applications Actions

This directory contains action packages for integrating with various business applications through MemberJunction's action framework. These packages provide standardized interfaces for common business system operations across different domains.

## Overview

The BizApps actions are organized by business domain, providing a comprehensive set of integrations for:

- **Accounting Systems** - Financial management and bookkeeping
- **CRM Systems** - Customer relationship management
- **LMS Systems** - Learning management systems

## Architecture

### Design Principles

1. **Domain-Specific Base Classes**: Each domain has its own base class that extends MemberJunction's `BaseAction`
2. **Provider-Specific Implementations**: Individual providers (QuickBooks, LearnWorlds, etc.) have their own base classes
3. **Multi-Tenant Support**: All actions support multiple company/tenant configurations
4. **Credential Management**: Flexible credential storage via environment variables or database
5. **Consistent Data Mapping**: Standardized interfaces across different provider formats

### Common Patterns

All BizApps actions follow these patterns:

```typescript
// Domain base class
export abstract class BaseDomainAction extends BaseAction {
    protected abstract domainProvider: string;
    protected abstract integrationName: string;
    
    // Common domain functionality
    protected async getCompanyIntegration(companyId: string, contextUser: UserInfo): Promise<CompanyIntegrationEntity>
    protected getCredentialFromEnv(companyId: string, credentialType: string): string | undefined
}

// Provider base class
export abstract class ProviderBaseAction extends BaseDomainAction {
    protected domainProvider = 'ProviderName';
    protected integrationName = 'Provider Full Name';
    
    // Provider-specific API methods
    protected async makeProviderRequest<T>(...): Promise<T>
}

// Individual action
export class GetProviderDataAction extends ProviderBaseAction {
    public get Description(): string { return 'Action description'; }
    public get Params(): ActionParam[] { return [...]; }
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple>
}
```

## Packages

### [@memberjunction/actions-bizapps-accounting](./Accounting/README.md)
Integrations for accounting and financial systems:
- QuickBooks Online
- Microsoft Dynamics 365 Business Central
- NetSuite (planned)
- Sage Intacct (planned)

### [@memberjunction/actions-bizapps-crm](./CRM/README.md)
Integrations for customer relationship management:
- Salesforce (planned)
- HubSpot (planned)
- Microsoft Dynamics 365 CRM (planned)
- Pipedrive (planned)

### [@memberjunction/actions-bizapps-lms](./LMS/README.md)
Integrations for learning management systems:
- LearnWorlds
- Moodle (planned)
- Canvas (planned)
- Blackboard (planned)

## Installation

Each package can be installed individually:

```bash
npm install @memberjunction/actions-bizapps-accounting
npm install @memberjunction/actions-bizapps-crm
npm install @memberjunction/actions-bizapps-lms
```

## Configuration

### CompanyIntegration Setup

All BizApps actions use the CompanyIntegration entity for multi-tenant configuration:

```sql
-- 1. Create Integration record
INSERT INTO Integration (Name, Description, NavigationBaseURL, ClassName)
VALUES ('Provider Name', 'Provider Description', 'https://api.provider.com', 'ProviderIntegration');

-- 2. Link to Company
INSERT INTO CompanyIntegration (CompanyID, IntegrationID, ExternalSystemID, IsActive)
VALUES (@CompanyID, @IntegrationID, @ExternalID, 1);
```

### Credential Management

Credentials can be stored in two ways:

#### Environment Variables (Recommended)
```bash
# Format: BIZAPPS_{PROVIDER}_{COMPANY_ID}_{CREDENTIAL_TYPE}
BIZAPPS_QUICKBOOKS_ONLINE_12345_ACCESS_TOKEN=your_token
BIZAPPS_LEARNWORLDS_12345_API_KEY=your_api_key
```

#### Database Storage
Store in CompanyIntegration fields:
- `AccessToken` - OAuth access tokens
- `RefreshToken` - OAuth refresh tokens  
- `APIKey` - API key authentication
- `CustomAttribute1` - Provider-specific data

## Usage

### In MemberJunction Actions

```typescript
import { GetQuickBooksGLCodesAction } from '@memberjunction/actions-bizapps-accounting';

const action = new GetQuickBooksGLCodesAction();
const result = await action.RunAction({
    Params: [
        { Name: 'CompanyID', Value: 'company-123' },
        { Name: 'IncludeInactive', Value: false }
    ],
    ContextUser: currentUser
});

if (result.Success) {
    const glCodes = result.Params.find(p => p.Name === 'GLCodes')?.Value;
    console.log(`Retrieved ${glCodes.length} GL codes`);
}
```

### In Workflows

BizApps actions can be used in MemberJunction workflows and automations:

```yaml
- action: GetQuickBooksInvoices
  params:
    CompanyID: ${companyId}
    Status: 'Overdue'
    IncludeLines: true
  output: overdueInvoices

- action: SendNotification
  params:
    Recipients: ${accountingTeam}
    Subject: 'Overdue Invoices Alert'
    Body: 'There are ${overdueInvoices.length} overdue invoices'
```

## Development

### Adding New Providers

1. Create provider directory: `src/providers/[provider-name]/`
2. Implement provider base class extending domain base
3. Add individual action classes
4. Update exports in `src/index.ts`
5. Add provider documentation

### Testing

Each package includes example usage and can be tested with:

```bash
npm test
```

### Building

Build all packages:
```bash
npm run build
```

Build specific package:
```bash
cd packages/Actions/BizApps/Accounting
npm run build
```

## Best Practices

1. **Error Handling**: Always wrap API calls in try-catch blocks
2. **Rate Limiting**: Implement appropriate delays for API limits
3. **Pagination**: Handle large datasets with pagination support
4. **Data Validation**: Validate required parameters before API calls
5. **Logging**: Use consistent logging for debugging
6. **Type Safety**: Leverage TypeScript generics for API responses

## Contributing

When adding new integrations:

1. Follow the established patterns for base classes
2. Implement comprehensive error handling
3. Add detailed documentation with examples
4. Include parameter validation
5. Support both environment variable and database credentials
6. Add unit tests for new actions

## License

ISC