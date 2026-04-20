# Connector Development Guide

How to build a new integration connector for MemberJunction.

## Overview

A connector is a TypeScript class that extends `BaseIntegrationConnector` and implements the methods needed to communicate with an external system. The engine handles orchestration, mapping, matching, and writing — the connector only handles the external system communication.

## Step 1: Create the Connector Class

```typescript
// packages/Integration/connectors/src/MySystemConnector.ts

import { RegisterClass } from '@memberjunction/global';
import {
    BaseIntegrationConnector,
    ConnectionTestResult,
    ExternalObjectSchema,
    ExternalFieldSchema,
    FetchContext,
    FetchBatchResult,
} from '@memberjunction/integration-engine';
import type { UserInfo } from '@memberjunction/core';

@RegisterClass(BaseIntegrationConnector, 'MySystemConnector')
export class MySystemConnector extends BaseIntegrationConnector {
    // ... implement required methods
}
```

The `@RegisterClass` decorator registers this class in `MJGlobal.ClassFactory` so `ConnectorFactory` can instantiate it at runtime.

## Step 2: Implement Required Methods

### `TestConnection(companyIntegration, contextUser): Promise<ConnectionTestResult>`

Validates that the credentials and endpoint are working.

```typescript
public async TestConnection(
    companyIntegration: MJCompanyIntegrationEntity,
    contextUser: UserInfo
): Promise<ConnectionTestResult> {
    try {
        const config = this.ParseCredentials(companyIntegration);
        const response = await fetch(`${config.BaseURL}/api/ping`, {
            headers: { 'Authorization': `Bearer ${config.ApiKey}` }
        });

        if (response.ok) {
            const data = await response.json();
            return { Success: true, Message: 'Connected', ServerVersion: data.version };
        }

        return { Success: false, Message: `HTTP ${response.status}: ${response.statusText}` };
    } catch (error) {
        return { Success: false, Message: `Connection failed: ${(error as Error).message}` };
    }
}
```

### `DiscoverObjects(companyIntegration, contextUser): Promise<ExternalObjectSchema[]>`

Lists all available objects/tables in the external system.

```typescript
public async DiscoverObjects(
    companyIntegration: MJCompanyIntegrationEntity,
    contextUser: UserInfo
): Promise<ExternalObjectSchema[]> {
    const config = this.ParseCredentials(companyIntegration);
    const objects = await this.callApi(config, '/api/objects');

    return objects.map(obj => ({
        Name: obj.id,                        // Internal API name
        Label: obj.displayName,              // Human-readable label
        SupportsIncrementalSync: obj.hasModifiedDate,
        SupportsWrite: obj.isWritable,
    }));
}
```

### `DiscoverFields(companyIntegration, objectName, contextUser): Promise<ExternalFieldSchema[]>`

Lists fields on a specific object.

```typescript
public async DiscoverFields(
    companyIntegration: MJCompanyIntegrationEntity,
    objectName: string,
    contextUser: UserInfo
): Promise<ExternalFieldSchema[]> {
    const config = this.ParseCredentials(companyIntegration);
    const fields = await this.callApi(config, `/api/objects/${objectName}/fields`);

    return fields.map(f => ({
        Name: f.name,
        Label: f.label,
        DataType: this.MapExternalType(f.type),  // Map to generic types
        IsRequired: f.required,
        IsUniqueKey: f.isPrimaryKey,
        IsReadOnly: f.computed,
    }));
}
```

### `FetchChanges(ctx: FetchContext): Promise<FetchBatchResult>`

Fetches a batch of records, optionally using a watermark for incremental sync.

```typescript
public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
    const config = this.ParseCredentials(ctx.CompanyIntegration);
    const objectName = ctx.EntityMap.ExternalObjectName;

    // Build query with watermark for incremental sync
    const params: Record<string, string> = {
        limit: String(ctx.BatchSize),
    };

    if (ctx.Watermark) {
        params.modifiedSince = ctx.Watermark as string;
    }

    const response = await this.callApi(config, `/api/objects/${objectName}/records`, params);

    return {
        Records: response.data.map(record => ({
            ExternalID: record.id,
            Fields: record,
            IsDeleted: record._deleted ?? false,
        })),
        HasMore: response.hasNextPage,
        NewWatermark: response.lastModified,  // Save for next incremental fetch
    };
}
```

## Step 3: Optional Methods

### `GetDefaultFieldMappings(objectName, entityName): FieldMappingSuggestion[]`

Provides intelligent defaults for field mapping. Not required but improves UX.

```typescript
public GetDefaultFieldMappings(
    objectName: string,
    entityName: string
): FieldMappingSuggestion[] {
    if (objectName === 'contacts') {
        return [
            { SourceField: 'email', DestField: 'EmailAddress', Confidence: 1.0 },
            { SourceField: 'firstName', DestField: 'FirstName', Confidence: 0.95 },
            { SourceField: 'lastName', DestField: 'LastName', Confidence: 0.95 },
            { SourceField: 'phone', DestField: 'Phone', Confidence: 0.8 },
        ];
    }
    return [];
}
```

### `IntrospectSchema(companyIntegration, contextUser): Promise<SourceSchemaInfo>`

Full schema introspection including foreign key relationships. Used by the schema builder for DDL generation.

```typescript
public async IntrospectSchema(
    companyIntegration: MJCompanyIntegrationEntity,
    contextUser: UserInfo
): Promise<SourceSchemaInfo> {
    const objects = await this.DiscoverObjects(companyIntegration, contextUser);

    return {
        Objects: await Promise.all(objects.map(async obj => {
            const fields = await this.DiscoverFields(companyIntegration, obj.Name, contextUser);
            return {
                ExternalName: obj.Name,
                Label: obj.Label,
                Fields: fields.map(f => ({
                    Name: f.Name,
                    SourceType: f.DataType,
                    IsRequired: f.IsRequired,
                    MaxLength: f.MaxLength,
                })),
                Relationships: [],  // FK relationships if available
            };
        }))
    };
}
```

## Step 4: Export from Package

Add your connector to the barrel export:

```typescript
// packages/Integration/connectors/src/index.ts
export { MySystemConnector } from './MySystemConnector.js';
```

## Step 5: Create Integration Metadata

Add a record in `metadata/integrations/.integrations.json`:

```json
{
    "fields": {
        "Name": "My System",
        "Description": "My System connector for syncing data via REST API",
        "ClassName": "MySystemConnector",
        "ImportPath": "@memberjunction/integration-connectors",
        "NavigationBaseURL": "https://mysystem.com",
        "BatchMaxRequestCount": 100,
        "BatchRequestWaitTime": 250,
        "IntegrationSourceTypeID": "@lookup:MJ: Integration Source Types.Name=SaaS API",
        "CredentialTypeID": "@lookup:MJ: Credential Types.Name=API Key"
    }
}
```

Key fields:
- **ClassName**: Must match the `@RegisterClass` registration name exactly
- **IntegrationSourceTypeID**: Points to a general category (SaaS API, Relational Database, or File Feed)
- **CredentialTypeID**: Points to the credential type for authentication

## Step 6: Create Credential Type (if needed)

If your system uses a unique authentication pattern, create a credential type with a JSON schema:

```json
// metadata/credential-types/schemas/mysystem-api.schema.json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "apiKey": {
            "type": "string",
            "title": "API Key",
            "description": "Your My System API key"
        },
        "baseUrl": {
            "type": "string",
            "title": "API Base URL",
            "default": "https://api.mysystem.com/v2"
        }
    },
    "required": ["apiKey"]
}
```

## Step 7: Push Metadata & Regenerate Manifest

```bash
# Push integration + credential type metadata to DB
npx mj sync push --dir=metadata --include="integrations,credential-types"

# Regenerate server-bootstrap manifest to include your connector
npm run mj:manifest:server-bootstrap
```

## Schema Introspection Strategies by Connector Type

Each connector type has a different strategy for discovering the source schema:

| Connector Type | Introspection Strategy |
|---------------|----------------------|
| **RelationalDB** | `INFORMATION_SCHEMA.TABLES` + `INFORMATION_SCHEMA.COLUMNS` — straightforward SQL metadata |
| **HubSpot** | `GET /crm/v3/schemas` API — returns object definitions with custom properties |
| **Salesforce** | `describe` REST API — returns SObject metadata including custom fields |
| **YourMembership** | API docs + hardcoded schema (API doesn't expose metadata discovery) |
| **FileFeed (CSV)** | Read header row + sample rows to infer types |
| **FileFeed (JSON)** | Parse sample records to infer schema from property types |

When building a new connector, choose the strategy that best fits your external system. Some APIs have rich metadata endpoints; others require hardcoded schemas or sample-based inference.

## Data Type Mapping

When implementing `DiscoverFields`, map external types to these generic types:

| Generic Type | Examples |
|-------------|---------|
| `string` | text, varchar, char, name, email |
| `integer` | int, smallint, bigint, count |
| `decimal` | float, double, number, currency |
| `boolean` | bool, bit, flag, checkbox |
| `datetime` | date, timestamp, datetime, created_at |
| `uuid` | guid, unique_id |
| `json` | object, array, map |

The `TypeMapper` in schema-builder converts these to SQL-specific types.

## Testing Your Connector

### Unit Tests

```typescript
// packages/Integration/connectors/src/__tests__/MySystemConnector.test.ts

import { describe, it, expect, vi } from 'vitest';
import { MySystemConnector } from '../MySystemConnector.js';

describe('MySystemConnector', () => {
    it('should discover objects', async () => {
        const connector = new MySystemConnector();
        // Mock the API call
        vi.spyOn(connector as never, 'callApi').mockResolvedValue([
            { id: 'contacts', displayName: 'Contacts', hasModifiedDate: true, isWritable: false }
        ]);

        const objects = await connector.DiscoverObjects(mockCompanyIntegration, mockUser);
        expect(objects).toHaveLength(1);
        expect(objects[0].Name).toBe('contacts');
    });
});
```

### E2E Tests

For connectors that support real API calls, use the e2e test pattern:

```typescript
// packages/Integration/connectors/src/__tests__/e2e-mysystem.test.ts

describe('MySystem E2E', () => {
    it('should connect and discover objects', async () => {
        const connector = new MySystemConnector();
        const result = await connector.TestConnection(realCompanyIntegration, realUser);
        expect(result.Success).toBe(true);
    });
});
```

## Checklist

- [ ] Class extends `BaseIntegrationConnector`
- [ ] `@RegisterClass(BaseIntegrationConnector, 'ClassName')` decorator applied
- [ ] `TestConnection()` validates credentials and returns meaningful messages
- [ ] `DiscoverObjects()` returns all available objects with correct capability flags
- [ ] `DiscoverFields()` returns complete field metadata with proper types
- [ ] `FetchChanges()` supports watermark-based incremental sync
- [ ] `FetchChanges()` respects `BatchSize` and returns `HasMore` correctly
- [ ] Exported from `connectors/src/index.ts`
- [ ] Integration metadata JSON created with correct `ClassName`
- [ ] Credential type and schema created (if needed)
- [ ] Unit tests written
- [ ] Manifest regenerated
