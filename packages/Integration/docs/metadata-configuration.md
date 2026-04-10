# Metadata & Configuration

How integration metadata is structured, stored, and synced to the database.

## Metadata Directory Structure

```
metadata/
├── integrations/
│   ├── .mj-sync.json                    Sync config for Integration entity
│   ├── .mj-folder.json                  Folder metadata
│   └── .integrations.json               Integration definitions
│
├── integration-source-types/
│   ├── .mj-sync.json                    Sync config
│   └── .integration-source-types.json   Source type categories
│
├── credential-types/
│   ├── .credential-types.json           Credential type definitions
│   └── schemas/
│       ├── yourmembership-api.schema.json
│       └── (other credential schemas)
│
└── applications/
    └── .integrations-application.json    Dashboard app config
```

## Integration Definitions

Each record in `.integrations.json` defines a vendor/system:

```json
{
    "fields": {
        "Name": "YourMembership",
        "Description": "YourMembership AMS REST API connector",
        "ClassName": "YourMembershipConnector",
        "ImportPath": "@memberjunction/integration-connectors",
        "NavigationBaseURL": "https://yourmembership.com",
        "BatchMaxRequestCount": 100,
        "BatchRequestWaitTime": 250,
        "IntegrationSourceTypeID": "@lookup:MJ: Integration Source Types.Name=SaaS API",
        "CredentialTypeID": "@lookup:MJ: Credential Types.Name=YourMembership API"
    }
}
```

### Key Fields

| Field | Purpose |
|-------|---------|
| `Name` | Display name (used in UI and logs) |
| `ClassName` | Must match `@RegisterClass` registration exactly |
| `ImportPath` | NPM package that exports the connector class |
| `IntegrationSourceTypeID` | General category (SaaS API, Relational Database, File Feed) |
| `CredentialTypeID` | Authentication method (links to credential type with JSON schema) |
| `BatchMaxRequestCount` | Max API calls per batch (rate limiting) |
| `BatchRequestWaitTime` | Delay in ms between API calls |
| `NavigationBaseURL` | Link to the external system's web UI |

### Connector Resolution Flow

```
Integration.ClassName = "YourMembershipConnector"
       │
       ▼
ConnectorFactory.Resolve(integration)
       │
       ▼
MJGlobal.ClassFactory.GetRegistration(BaseIntegrationConnector, "YourMembershipConnector")
       │
       ▼
ClassFactory.CreateInstance() → YourMembershipConnector instance
```

The `IntegrationSourceType` is NOT used for connector resolution — it's a general category for UI grouping only.

## Integration Source Types

Three general categories in `.integration-source-types.json`:

| Name | DriverClass | Icon | Purpose |
|------|------------|------|---------|
| SaaS API | `SaaSAPIConnector` | `fa-solid fa-cloud` | Cloud API connectors (HubSpot, Salesforce, YM) |
| Relational Database | `RelationalDBConnector` | `fa-solid fa-database` | Direct DB connections |
| File Feed | `FileFeedConnector` | `fa-solid fa-file-csv` | CSV, Excel, JSON, XML files |

These are **general categories**, not per-vendor entries. Multiple integrations can share the same source type.

## Credential Types

Each integration that requires authentication references a credential type. The credential type defines a JSON Schema that drives the credential edit form in the UI.

### Schema Example

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "apiKey": {
            "type": "string",
            "title": "API Key",
            "description": "Your API key from the Settings page"
        },
        "baseUrl": {
            "type": "string",
            "title": "API Base URL",
            "default": "https://api.yourmembership.com/v2"
        },
        "clientId": {
            "type": "string",
            "title": "Client ID"
        }
    },
    "required": ["apiKey", "clientId"]
}
```

The credential edit panel renders form fields from this schema automatically.

### Credential Linking

```
CredentialType ← Integration.CredentialTypeID
       │
CredentialType ← Credential.CredentialTypeID
       │
Credential ← CompanyIntegration.CredentialID
```

This three-level linking allows:
- One credential type definition (e.g., "OAuth2 Client Credentials")
- Multiple credentials using that type (different API keys for different orgs)
- Each CompanyIntegration references a specific credential

## Application Metadata

The Integration dashboard is registered as an MJ Application:

```json
{
    "fields": {
        "Name": "Integrations",
        "Description": "Integration management dashboard",
        "DefaultForNewUser": false,
        "Icon": "fa-solid fa-plug",
        "DefaultNavItems": [
            {
                "Label": "Control Tower",
                "Icon": "fa-solid fa-tower-control",
                "ResourceType": "Custom",
                "DriverClass": "IntegrationControlTower",
                "isDefault": true
            },
            {
                "Label": "Connection Studio",
                "Icon": "fa-solid fa-plug-circle-check",
                "ResourceType": "Custom",
                "DriverClass": "IntegrationConnectionStudio"
            },
            {
                "Label": "Mapping Workspace",
                "Icon": "fa-solid fa-diagram-project",
                "ResourceType": "Custom",
                "DriverClass": "IntegrationMappingWorkspace"
            },
            {
                "Label": "Sync Activity",
                "Icon": "fa-solid fa-chart-line",
                "ResourceType": "Custom",
                "DriverClass": "IntegrationSyncActivity"
            }
        ]
    }
}
```

## Entity Settings for Write Access

Integration tables need `IntegrationWriteAllowed=true` to accept writes from the sync engine. This is managed via mj-sync metadata:

```json
{
    "fields": {
        "EntityName": "YM Members",
        "IntegrationWriteAllowed": true
    }
}
```

For entities in custom schemas (e.g., `ym.Members`), write access is automatically allowed. The setting is only required for entities in the `__mj` schema.

## Pushing Metadata

```bash
# Push all integration metadata
npx mj sync push --dir=metadata --include="integrations,integration-source-types,credential-types,applications"

# Push only integrations
npx mj sync push --dir=metadata --include="integrations"

# Dry run to preview
npx mj sync push --dir=metadata --include="integrations" --dry-run
```

### Important Notes

- Run from the **repository root**, not from inside `metadata/`
- `@lookup:` references are resolved at push time
- `@file:` references load external file content at push time
- `primaryKey` and `sync` objects are auto-managed — never include them in new records
- Validation errors in any directory cause a full rollback — use `--include` to scope pushes

## Database Entities

These MJ entities store integration configuration at runtime:

| Entity | Purpose |
|--------|---------|
| `MJ: Integrations` | Integration definitions (from metadata) |
| `MJ: Integration Source Types` | Source type categories (from metadata) |
| `MJ: Company Integrations` | Instance for a company (created in UI) |
| `MJ: Company Integration Entity Maps` | Object→entity mappings (created in UI) |
| `MJ: Company Integration Field Maps` | Field mappings with transforms (created in UI) |
| `MJ: Company Integration Runs` | Sync run audit trail (auto-created) |
| `MJ: Company Integration Run Details` | Per-entity run stats (auto-created) |
| `MJ: Company Integration Record Maps` | External↔MJ record ID mapping (auto-created) |
| `MJ: Company Integration Sync Watermarks` | Incremental sync state (auto-created) |

Records marked "from metadata" are pushed via mj-sync. Records marked "created in UI" are created through the Angular dashboard. Records marked "auto-created" are managed by the engine at runtime.
