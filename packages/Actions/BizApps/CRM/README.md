# @memberjunction/actions-bizapps-crm

Customer Relationship Management (CRM) system integration actions for MemberJunction. This package provides a standardized way to interact with various CRM systems through MemberJunction's action framework.

## Overview

This package will implement actions for common CRM operations across multiple CRM systems:
- Salesforce (coming soon)
- HubSpot (coming soon)
- Microsoft Dynamics 365 CRM (coming soon)
- Pipedrive (coming soon)
- Zoho CRM (coming soon)

## Architecture

### Base Classes

- **BaseCRMAction**: Abstract base class providing common functionality for all CRM actions
  - Company-based credential management via CompanyIntegration entity
  - Common parameter definitions
  - Validation helpers for CRM data
  - Error handling patterns

- **Provider-Specific Base Classes** (e.g., SalesforceBaseAction):
  - Handle provider-specific authentication
  - API request/response handling
  - Data mapping between provider formats and standard formats

### Authentication

The package uses MemberJunction's CompanyIntegration entity to store credentials:
- Each Company can have multiple CRM system integrations
- OAuth tokens, API keys, and other credentials are stored securely
- Automatic token refresh for OAuth-based systems

## Planned Actions

### Contact Management
- **GetContacts** - Retrieve contacts with filtering and search
- **GetContactDetails** - Get detailed information for a specific contact
- **CreateContact** - Create a new contact
- **UpdateContact** - Update existing contact information
- **DeleteContact** - Remove a contact
- **MergeContacts** - Merge duplicate contacts

### Lead Management
- **GetLeads** - Retrieve leads with status filtering
- **CreateLead** - Create a new lead
- **UpdateLead** - Update lead information
- **ConvertLead** - Convert lead to contact/opportunity
- **AssignLead** - Assign lead to user/team

### Account/Company Management
- **GetAccounts** - Retrieve accounts/companies
- **GetAccountDetails** - Get detailed account information
- **CreateAccount** - Create a new account
- **UpdateAccount** - Update account information
- **GetAccountContacts** - Get all contacts for an account

### Opportunity/Deal Management
- **GetOpportunities** - Retrieve opportunities/deals
- **CreateOpportunity** - Create a new opportunity
- **UpdateOpportunity** - Update opportunity details
- **GetOpportunityStages** - Get pipeline stages
- **MoveOpportunityStage** - Move opportunity to different stage

### Activity Management
- **GetActivities** - Retrieve activities (calls, emails, meetings)
- **CreateActivity** - Log a new activity
- **UpdateActivity** - Update activity details
- **GetActivityTypes** - Get available activity types

### Custom Fields & Metadata
- **GetCustomFields** - Retrieve custom field definitions
- **GetPicklistValues** - Get values for dropdown fields
- **GetRecordTypes** - Get available record types

## Setup

### 1. Create Integration Records

For each CRM system, create an Integration entity record:

**Salesforce:**
```sql
INSERT INTO Integration (Name, Description, NavigationBaseURL, ClassName)
VALUES ('Salesforce', 'Salesforce CRM Integration', 
        'https://login.salesforce.com', 'SalesforceIntegration');
```

**HubSpot:**
```sql
INSERT INTO Integration (Name, Description, NavigationBaseURL, ClassName)
VALUES ('HubSpot', 'HubSpot CRM Integration', 
        'https://api.hubapi.com', 'HubSpotIntegration');
```

### 2. Configure CompanyIntegration

For each company, create a CompanyIntegration record:

```sql
INSERT INTO CompanyIntegration (CompanyID, IntegrationID, ExternalSystemID, 
                               CustomAttribute1, IsActive)
VALUES (@CompanyID, @CRMIntegrationID, @InstanceURL, @APIVersion, 1);
```

### 3. Set Environment Variables

Configure credentials via environment variables:

**Salesforce:**
```bash
# OAuth credentials
BIZAPPS_SALESFORCE_[COMPANY_ID]_ACCESS_TOKEN=your_access_token
BIZAPPS_SALESFORCE_[COMPANY_ID]_REFRESH_TOKEN=your_refresh_token
BIZAPPS_SALESFORCE_[COMPANY_ID]_INSTANCE_URL=https://yourinstance.salesforce.com
```

**HubSpot:**
```bash
# API key or OAuth
BIZAPPS_HUBSPOT_[COMPANY_ID]_API_KEY=your_api_key
# OR
BIZAPPS_HUBSPOT_[COMPANY_ID]_ACCESS_TOKEN=your_access_token
```

## Usage Examples

### Get Contacts
```typescript
import { GetCRMContactsAction } from '@memberjunction/actions-bizapps-crm';

const action = new GetCRMContactsAction();
const result = await action.RunAction({
    Params: [
        { Name: 'CompanyID', Value: 'company-123' },
        { Name: 'Provider', Value: 'Salesforce' },
        { Name: 'SearchText', Value: 'John' },
        { Name: 'MaxResults', Value: 50 }
    ],
    ContextUser: currentUser
});

if (result.Success) {
    const contacts = result.Params.find(p => p.Name === 'Contacts')?.Value;
    console.log(`Found ${contacts.length} contacts`);
}
```

### Create Opportunity
```typescript
import { CreateCRMOpportunityAction } from '@memberjunction/actions-bizapps-crm';

const action = new CreateCRMOpportunityAction();
const result = await action.RunAction({
    Params: [
        { Name: 'CompanyID', Value: 'company-123' },
        { Name: 'Provider', Value: 'HubSpot' },
        { Name: 'OpportunityName', Value: 'New Enterprise Deal' },
        { Name: 'Amount', Value: 50000 },
        { Name: 'CloseDate', Value: '2024-03-31' },
        { Name: 'Stage', Value: 'Qualification' },
        { Name: 'AccountID', Value: 'account-456' }
    ],
    ContextUser: currentUser
});
```

## Common Data Models

### Contact
```typescript
interface CRMContact {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    title?: string;
    accountId?: string;
    accountName?: string;
    ownerId?: string;
    ownerName?: string;
    createdDate: Date;
    modifiedDate: Date;
    customFields?: Record<string, any>;
}
```

### Opportunity
```typescript
interface CRMOpportunity {
    id: string;
    name: string;
    amount: number;
    currency: string;
    stage: string;
    probability?: number;
    closeDate: Date;
    accountId: string;
    accountName: string;
    ownerId: string;
    ownerName: string;
    createdDate: Date;
    modifiedDate: Date;
    customFields?: Record<string, any>;
}
```

## Development Status

🚧 **Under Development** - This package is currently being implemented. Check back for updates on available providers and actions.

### Roadmap
1. ✅ Package structure and base classes
2. 🔄 Salesforce integration
3. ⏳ HubSpot integration
4. ⏳ Dynamics 365 CRM integration
5. ⏳ Pipedrive integration
6. ⏳ Zoho CRM integration

## Contributing

To add a new CRM provider:

1. Create provider folder: `src/providers/[provider-name]/`
2. Extend `BaseCRMAction` with provider-specific base class
3. Implement authentication (OAuth or API key)
4. Add data mapping for standard CRM objects
5. Implement core actions (contacts, leads, opportunities)
6. Add comprehensive error handling
7. Write unit tests
8. Update documentation

## License

ISC