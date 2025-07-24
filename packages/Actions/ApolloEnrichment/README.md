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

- `ApolloAPIEndpoint`: 'https://api.apollo.io/v1' - Apollo.io API base URL
- `EmailSourceName`: 'Apollo.io' - Source name for enriched emails
- `GroupSize`: 10 - Maximum records per API batch request
- `ConcurrentGroups`: 1 - Number of concurrent API request groups
- `MaxPeopleToEnrichPerOrg`: 500 - Maximum contacts to enrich per organization
- `ApolloAPIKey`: Read from environment variable `APOLLO_API_KEY`

## Usage

### Apollo Accounts Enrichment Action

This action enriches account/organization records by looking up company information using domain names.

#### Parameters

The action accepts the following parameters as JSON strings:

**Required:**
- `AccountEntityFieldNameJSON` - Maps account entity fields

**Optional:**
- `AccountTechnologyEntityFieldNameJSON` - Maps account technology relationship fields
- `TechnologyCategoryEntityFieldNameJSON` - Maps technology category fields  
- `ContactEntityFieldNameJSON` - Maps contact entity fields
- `ContactEducationHistoryEntityFieldNameJSON` - Maps contact education history fields

**AccountEntityFieldNameJSON Structure:**
```typescript
{
  EntityName: string;           // Target entity name (e.g., "Accounts")
  DomainParamName: string;      // Field containing company domain
  AccountIDName: string;        // Primary key field name
  EnrichedAtField: string;      // Timestamp field for tracking enrichment
  ExtraFilter?: string;         // SQL filter for selecting records to process
  
  // Optional mapping fields
  AddressFieldName?: string;    // Street address field
  CityFieldNameName?: string;   // City field
  StateProvinceFieldName?: string; // State/province field
  PostalCodeFieldName?: string; // Postal code field
  DescriptionFieldName?: string; // Company description field
  PhoneNumberFieldName?: string; // Phone number field
  CountryFieldName?: string;    // Country field
  LinkedInFieldName?: string;   // LinkedIn URL field
  LogoURLFieldName?: string;    // Company logo URL field
  FacebookFieldName?: string;   // Facebook URL field
  TwitterFieldName?: string;    // Twitter URL field
}
```

**AccountTechnologyEntityFieldNameJSON Structure:**
```typescript
{
  EntityName: string;              // Technology relationship entity name
  AccountIDFieldName: string;      // Foreign key to account
  TechnologyIDFieldName: string;   // Foreign key to technology
  MatchFoundFieldName: string;     // Field indicating if match was found
  EndedUseAtFieldName: string;     // Field for marking end of technology use
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

The action accepts the following string parameters:

**Required:**
- `EntityName` - Target entity name containing contacts
- `EmailField` - Field name containing email addresses  
- `FirstNameField` - Field name containing first names
- `LastNameField` - Field name containing last names
- `AccountNameField` - Field name containing account/organization names
- `EnrichedAtField` - Field name for tracking enrichment timestamp
- `FilterParam` - SQL filter for selecting records to process

**Optional:**
- `domainParam` - Field name containing company domain
- `linkedinParam` - Field name for storing LinkedIn URLs
- `EmploymentHistoryFieldMappings` - JSON string with employment history field mappings
- `EducationHistoryFieldMappings` - JSON string with education history field mappings

**EmploymentHistoryFieldMappings Structure:**
```typescript
{
  EmploymentHistoryEntityName: string;              // Employment history entity name
  EmploymentHistoryContactIDFieldName: string;      // Foreign key to contact
  EmploymentHistoryOrganizationFieldName: string;   // Organization name field
  EmploymentHistoryTitleFieldName: string;          // Job title field
}
```

**EducationHistoryFieldMappings Structure:**
```typescript
{
  EducationHistoryEntityName: string;              // Education history entity name
  EducationtHistoryContactIDFieldName: string;     // Foreign key to contact  
  EducationtHistoryInstitutionFieldName: string;   // Institution name field
  EducationtHistoryDegreeFieldName: string;        // Degree field
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
    { Name: 'FilterParam', Value: 'Email IS NOT NULL AND LastEnrichedAt IS NULL' },
    { Name: 'domainParam', Value: 'Domain' },
    { Name: 'linkedinParam', Value: 'LinkedIn' },
    { 
      Name: 'EmploymentHistoryFieldMappings', 
      Value: JSON.stringify({
        EmploymentHistoryEntityName: 'ContactEmploymentHistory',
        EmploymentHistoryContactIDFieldName: 'ContactID',
        EmploymentHistoryOrganizationFieldName: 'Organization', 
        EmploymentHistoryTitleFieldName: 'Title'
      })
    }
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
- Bulk email verification and discovery (up to 10 contacts per API call)
- Employment history tracking with date ranges
- Education history tracking with degree information
- Social media profile URLs (LinkedIn, Twitter, Facebook)
- Title exclusion filtering (excludes members, students, volunteers)
- Pagination support for processing large datasets
- Duplicate contact detection across accounts

### Error Handling & Rate Limiting
- Automatic retry with intelligent backoff for rate limits (1 minute for general limits, 1 hour for hourly limits)
- Handles both per-minute and per-hour rate limits with different wait times
- Comprehensive error logging using MemberJunction's logging system
- Batch processing to optimize API usage and respect Apollo.io limits
- Graceful handling of missing or incomplete data
- Transaction rollback support for failed operations

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
- Rate limits apply based on your Apollo.io subscription (handled automatically with retries)
- Personal emails may not be revealed in GDPR-compliant regions
- Some enrichment data may be incomplete depending on Apollo.io's data coverage
- Account enrichment processes domains sequentially to avoid overwhelming the system
- Contact enrichment uses pagination with a maximum of 500 contacts per organization
- Excluded job titles (member, student member, student, volunteer) are automatically skipped

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