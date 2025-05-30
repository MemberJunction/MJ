# @memberjunction/actions-apollo

Apollo.io data enrichment action classes for MemberJunction that enable automated enrichment of contact and account records using the Apollo.io API.

## Overview

This package provides two primary action classes that integrate with Apollo.io's data enrichment services:

- **ApolloAccountsEnrichmentAction** - Enriches account/organization records with company information, technologies used, and associated contacts
- **ApolloContactsEnrichmentAction** - Enriches contact records with verified email addresses, employment history, and education details

These actions are designed to work within the MemberJunction framework and can be configured through action parameters to map Apollo.io data to your custom entity fields.

## Installation

```bash
npm install @memberjunction/actions-apollo
```

## Prerequisites

1. An active Apollo.io account with API access
2. Apollo.io API key (set as environment variable `APOLLO_API_KEY`)
3. MemberJunction framework properly configured
4. Target entities for storing enriched data (Accounts, Contacts, etc.)

## Configuration

### Environment Variables

```bash
APOLLO_API_KEY=your_apollo_api_key_here
```

### Configuration Constants

The package uses the following configuration values (defined in `config.ts`):

- `GroupSize`: 10 - Maximum records per API batch request
- `ConcurrentGroups`: 1 - Number of concurrent API request groups
- `MaxPeopleToEnrichPerOrg`: 500 - Maximum contacts to enrich per organization

## Usage

### Apollo Accounts Enrichment Action

This action enriches account/organization records by looking up company information using domain names.

#### Parameters

```typescript
{
  // Required - JSON mapping for account entity fields
  AccountEntityFieldNameJSON: {
    EntityName: "Accounts",
    DomainParamName: "Domain",
    AccountIDName: "ID",
    EnrichedAtField: "LastEnrichedAt",
    AddressFieldName: "Address",
    CityFieldNameName: "City",
    StateProvinceFieldName: "State",
    PostalCodeFieldName: "PostalCode",
    DescriptionFieldName: "Description",
    PhoneNumberFieldName: "Phone",
    CountryFieldName: "Country",
    LinkedInFieldName: "LinkedIn",
    LogoURLFieldName: "LogoURL",
    FacebookFieldName: "Facebook",
    TwitterFieldName: "Twitter",
    ExtraFilter: "Domain IS NOT NULL AND LastEnrichedAt IS NULL"
  },

  // Optional - JSON mapping for technology tracking
  AccountTechnologyEntityFieldNameJSON: {
    EntityName: "AccountTechnologies",
    AccountIDFieldName: "AccountID",
    TechnologyIDFieldName: "TechnologyID",
    MatchFoundFieldName: "MatchFound",
    EndedUseAtFieldName: "EndedAt"
  },

  // Optional - JSON mapping for technology categories
  TechnologyCategoryEntityFieldNameJSON: {
    EntityName: "TechnologyCategories",
    NameFieldName: "Name",
    IDFieldName: "ID"
  },

  // Optional - JSON mapping for contacts
  ContactEntityFieldNameJSON: {
    EntityName: "Contacts",
    EmailFieldName: "Email",
    AccountIDFieldName: "AccountID",
    FirstNameFieldName: "FirstName",
    LastNameFieldName: "LastName",
    // ... other field mappings
  }
}
```

#### Example Usage

```typescript
import { ApolloAccountsEnrichmentAction } from '@memberjunction/actions-apollo';
import { ActionEngine } from '@memberjunction/actions';

// Register the action with the engine
const engine = new ActionEngine();
const action = new ApolloAccountsEnrichmentAction();

// Execute the action
const result = await engine.RunAction({
  ActionName: 'Apollo Enrichment - Accounts',
  Params: [
    {
      Name: 'AccountEntityFieldNameJSON',
      Value: JSON.stringify({
        EntityName: 'Accounts',
        DomainParamName: 'Domain',
        AccountIDName: 'ID',
        EnrichedAtField: 'LastEnrichedAt',
        // ... other mappings
      })
    }
  ],
  ContextUser: currentUser
});
```

### Apollo Contacts Enrichment Action

This action enriches contact records by matching on name and email combinations.

#### Parameters

```typescript
{
  EntityName: "Contacts",              // Target entity name
  EmailField: "Email",                 // Email field name
  FirstNameField: "FirstName",         // First name field name
  LastNameField: "LastName",           // Last name field name
  AccountNameField: "AccountName",     // Account name field name
  EnrichedAtField: "LastEnrichedAt",  // Enrichment timestamp field
  FilterParam: "Email IS NOT NULL",    // Filter for records to enrich
  domainParam: "Domain",               // Domain field name (optional)
  linkedinParam: "LinkedIn",           // LinkedIn URL field name (optional)
  
  // Optional - Employment history field mappings
  EmploymentHistoryFieldMappings: {
    EmploymentHistoryEntityName: "ContactEmploymentHistory",
    EmploymentHistoryContactIDFieldName: "ContactID",
    EmploymentHistoryOrganizationFieldName: "Organization",
    EmploymentHistoryTitleFieldName: "Title"
  },
  
  // Optional - Education history field mappings
  EducationHistoryFieldMappings: {
    EducationHistoryEntityName: "ContactEducationHistory",
    EducationtHistoryContactIDFieldName: "ContactID",
    EducationtHistoryInstitutionFieldName: "Institution",
    EducationtHistoryDegreeFieldName: "Degree"
  }
}
```

#### Example Usage

```typescript
import { ApolloContactsEnrichmentAction } from '@memberjunction/actions-apollo';

const result = await engine.RunAction({
  ActionName: 'Apollo Enrichment - Contacts',
  Params: [
    { Name: 'EntityName', Value: 'Contacts' },
    { Name: 'EmailField', Value: 'Email' },
    { Name: 'FirstNameField', Value: 'FirstName' },
    { Name: 'LastNameField', Value: 'LastName' },
    { Name: 'AccountNameField', Value: 'AccountName' },
    { Name: 'EnrichedAtField', Value: 'LastEnrichedAt' },
    { Name: 'FilterParam', Value: 'Email IS NOT NULL AND LastEnrichedAt IS NULL' }
  ],
  ContextUser: currentUser
});
```

## Features

### Account Enrichment
- Company information (address, phone, description, social media URLs)
- Technology stack detection and tracking
- Automatic contact discovery and creation
- Technology category management
- Historical technology usage tracking

### Contact Enrichment
- Email verification and discovery
- Employment history tracking
- Education history tracking
- Social media profile URLs
- Title exclusion filtering (excludes students, volunteers, etc.)

### Error Handling & Rate Limiting
- Automatic retry with exponential backoff for rate limits
- Handles both per-minute and per-hour rate limits
- Comprehensive error logging
- Batch processing to optimize API usage

## API Integration

The package integrates with the following Apollo.io API endpoints:

- `/organizations/enrich` - Organization enrichment
- `/people/bulk_match` - Bulk contact matching
- `/mixed_people/search` - People search by domain

## Dependencies

- `@memberjunction/core` - Core MemberJunction functionality
- `@memberjunction/core-entities` - Entity definitions
- `@memberjunction/actions` - Action framework
- `@memberjunction/global` - Global utilities
- `axios` - HTTP client for API requests

## Best Practices

1. **Batch Processing**: The actions automatically batch records to optimize API usage and respect rate limits.

2. **Field Mapping**: Carefully map Apollo.io fields to your entity fields to ensure data consistency.

3. **Filtering**: Use the filter parameters to process only records that need enrichment, avoiding unnecessary API calls.

4. **Error Monitoring**: Monitor the action logs for failed enrichments and rate limit issues.

5. **Data Quality**: The actions include validation for email domains and exclude certain titles to maintain data quality.

## Limitations

- Maximum 10 records per bulk API request (Apollo.io limitation)
- Rate limits apply based on your Apollo.io subscription
- Personal emails may not be revealed in GDPR-compliant regions
- Some enrichment data may be incomplete depending on Apollo.io's data coverage

## Troubleshooting

### Common Issues

1. **Missing API Key**: Ensure `APOLLO_API_KEY` environment variable is set
2. **Rate Limits**: The action will automatically retry after waiting for rate limit windows
3. **No Matches Found**: Check that input data (domains, emails) are valid and formatted correctly
4. **Field Mapping Errors**: Verify that all mapped fields exist in your target entities

### Debug Logging

The actions use MemberJunction's logging system. Monitor logs for:
- Enrichment progress
- API response details
- Error messages
- Rate limit notifications

## Contributing

This package is part of the MemberJunction open-source project. Contributions are welcome following the project's contribution guidelines.

## License

ISC License - see the MemberJunction project license for details.