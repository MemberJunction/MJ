# Integration Actions: Connector-Driven Action Generation

MemberJunction's integration layer automatically generates a full set of **CRUD + Search + List** actions for every object exposed by an integration connector. This means that adding a single connector to the system can produce dozens of ready-to-use actions, all discoverable by AI agents, workflow engines, and low-code tools through MJ's Actions framework.

## Overview

The architecture is built around three components:

1. **`BaseIntegrationConnector`** -- Each connector declares its objects and fields once. That declaration drives both action generation (design-time) and API routing (runtime).
2. **`ActionMetadataGenerator`** -- A CLI-invokable generator that reads connector metadata and produces mj-sync compatible JSON files, one action per verb per object.
3. **`IntegrationActionExecutor`** -- A single, shared `DriverClass` registered with the Actions system. At runtime it reads the action's `Config` JSON to determine which connector, object, and verb to dispatch to.

The result is a system where connectors only need to describe their object model; the framework handles everything else.

## Current Integrations

| Integration | Objects (Action-Enabled) | Total Objects | Write-Back | Verbs per Object |
|---|---|---|---|---|
| **HubSpot** | 6 (Contacts, Companies, Deals, Tasks, Tickets, Products) | 13 | Yes (all 6) | Get, Create, Update, Delete, Search, List |
| **Salesforce** | 8 (Account, Contact, Lead, Opportunity, Task, Event, Case, Campaign) | 9 | Yes (all 8) | Get, Create, Update, Delete, Search |
| **Rasa.io** | 4 (Persons, Posts, Insight Actions, Insight Topics) | 4 | No (read-only) | Get, Search, List |
| **YourMembership** | 9 (Members, Events, Event Registrations, Event Sessions, Groups, Invoice Items, Dues Transactions, Donations, Career Openings) | 9 | No (read-only) | Get, Search, List |

Additional connectors exist for **Wicket**, **Relational DB**, and **File Feed** data sources. These support data synchronization today and will gain action generation as their object models are formalized.

## Architecture

```
                  Design-Time                              Runtime
              ┌───────────────────┐                 ┌──────────────────────┐
              │  Connector class  │                 │  Agent / Workflow /  │
              │  GetIntegration-  │                 │   Low-Code Client    │
              │  Objects()        │                 └──────────┬───────────┘
              └────────┬──────────┘                            │
                       │                              Invoke Action by name
                       v                                       │
              ┌───────────────────┐                            v
              │ ActionMetadata-   │              ┌─────────────────────────┐
              │ Generator         │              │  IntegrationAction-     │
              │                   │              │  Executor               │
              │ Emits .json files │              │                         │
              │ per connector     │              │  1. Parse Config JSON   │
              └────────┬──────────┘              │  2. Resolve Connector   │
                       │                         │  3. Resolve CompanyInt. │
                       v                         │  4. Map Params → CRUD   │
              ┌───────────────────┐              │  5. Dispatch verb       │
              │  mj sync push    │              │  6. Return results      │
              │  → Database       │              └─────────────────────────┘
              └───────────────────┘
```

### Key Design Decisions

- **Single executor class.** Every generated action uses `DriverClass='IntegrationActionExecutor'`. Routing is determined entirely by the JSON stored in `Action.Config`:
  ```json
  {
    "IntegrationName": "HubSpot",
    "ObjectName": "contacts",
    "Verb": "Get"
  }
  ```

- **Declare once, use everywhere.** Each connector implements `GetIntegrationObjects()` returning an array of `IntegrationObjectInfo` with fields. The same declaration drives action generation, parameter schemas, and API property discovery.

- **Opt-in per object.** The `IncludeInActionGeneration` flag (default `true`) lets connectors expose objects for API property lookups while excluding them from CRUD action generation. HubSpot uses this for activity objects (calls, emails, notes, meetings) that don't fit generic CRUD patterns.

- **Write-back when supported.** Each object declares `SupportsWrite: true | false`. When true, the generator emits Create, Update, and Delete actions in addition to Get, Search, and List. The executor checks `connector.SupportsCreate` / `SupportsUpdate` / `SupportsDelete` at runtime and returns `NOT_SUPPORTED` if the connector does not implement that verb.

## How to Add a New Connector

### Step 1: Implement the Connector

Create a new class extending `BaseIntegrationConnector` in `packages/Integration/connectors/src/`:

```typescript
import { BaseIntegrationConnector } from '@memberjunction/integration-engine';
import type { IntegrationObjectInfo } from '@memberjunction/integration-engine';

export class AcmeCRMConnector extends BaseIntegrationConnector {

    public override get IntegrationName(): string { return 'AcmeCRM'; }

    // Enable capabilities
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }
    public override get SupportsListing(): boolean { return true; }

    // Declare objects and their fields
    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return [
            {
                Name: 'contacts',
                DisplayName: 'Contact',
                Description: 'A contact in AcmeCRM',
                SupportsWrite: true,
                Fields: [
                    { Name: 'email', DisplayName: 'Email', Type: 'string',
                      IsRequired: true, IsReadOnly: false, IsPrimaryKey: false },
                    { Name: 'name',  DisplayName: 'Name',  Type: 'string',
                      IsRequired: true, IsReadOnly: false, IsPrimaryKey: false },
                    // ... additional fields
                ],
            },
            // ... additional objects
        ];
    }

    // Implement the abstract methods:
    // TestConnection, DiscoverObjects, DiscoverFields, FetchChanges
    // And override CRUD methods: GetRecord, CreateRecord, UpdateRecord, DeleteRecord,
    // SearchRecords, ListRecords
}
```

### Step 2: Register the Connector

Add an entry to the `CONNECTOR_REGISTRY` in `packages/Integration/connectors/src/generate-integration-actions.ts`:

```typescript
import { AcmeCRMConnector } from './AcmeCRMConnector.js';

const CONNECTOR_REGISTRY = {
    // ... existing connectors
    acme: { Connector: new AcmeCRMConnector(), FileName: '.acme-actions.json' },
};
```

### Step 3: Generate Action Metadata

Run the generator CLI:

```bash
cd packages/Integration/connectors
npx tsx src/generate-integration-actions.ts acme
```

This produces JSON files in `metadata/actions/integrations-auto-generated/` and category records in `metadata/action-categories/`.

### Step 4: Push to Database

```bash
npx mj sync push --dir=metadata --include="actions/integrations-auto-generated"
npx mj sync push --dir=metadata --include="action-categories"
```

The actions are now live in the database, discoverable by agents, and executable through the standard Actions API.

## How Actions Are Generated

The `ActionMetadataGenerator` iterates over each object in the connector's config and emits one action record per verb:

| Verb | Condition | Input Params | Output Params |
|---|---|---|---|
| **Get** | Always | `ExternalID` (required) | `Record`, all object fields |
| **Create** | `SupportsWrite: true` | All writable fields | `ExternalID` |
| **Update** | `SupportsWrite: true` | `ExternalID` + all writable fields (optional) | -- |
| **Delete** | `SupportsWrite: true` | `ExternalID` | -- |
| **Search** | `IncludeSearch` config | All fields as optional filters, `PageSize`, `Page`, `Sort` | `Records`, `TotalCount`, `HasMore` |
| **List** | `IncludeList` config | `PageSize`, `Cursor`, `Sort` | `Records`, `HasMore`, `NextCursor`, `TotalCount` |

Every action also receives an optional `CompanyIntegrationID` input parameter. If omitted, the executor resolves the first active `CompanyIntegration` for the integration name.

Each action includes standard result codes: `SUCCESS`, `EXECUTOR_ERROR`, and verb-specific codes like `NOT_FOUND`, `CREATE_FAILED`, and `NOT_SUPPORTED`.

Action names follow the pattern `{IntegrationName} - {Verb} {DisplayName}` (e.g., "HubSpot - Get Contact", "YourMembership - List Member").

## Write-Back and Bidirectional Sync

MemberJunction supports bidirectional data flow with external systems:

- **Inbound sync** uses the `IntegrationOrchestrator` to pull data from external systems into MJ entities via watermark-based incremental fetching.
- **Outbound write-back** uses the generated Create, Update, and Delete actions. When a connector declares `SupportsWrite: true` for an object, any consumer (agent, workflow, or application) can push changes back to the external system through the standard Actions API.

For systems that support it, this enables patterns like:

1. Sync HubSpot contacts into MJ on a schedule (inbound).
2. An agent or user modifies a contact record locally.
3. A workflow action pushes the change back to HubSpot via "HubSpot - Update Contact" (outbound).

The `CompanyIntegrationRecordMap` entity tracks the mapping between MJ record IDs and external system IDs, ensuring round-trip fidelity.

## Roadmap

The long-term vision is a broad ecosystem of open-source integration connectors covering every major AMS (Association Management System), CRM, marketing automation tool, accounting system, LMS, and SaaS product. Each new connector plugs into the same generation and execution infrastructure, instantly producing a full suite of discoverable actions.

Combined with MJ's AI agent framework, this creates a platform where agents can read from and write to an arbitrarily large number of external systems through a uniform, metadata-driven interface -- without custom code for each integration point.

Connectors in active development include Salesforce and Wicket, with the existing BizApps action library (covering accounting, LMS, social media, and form builder domains) progressively migrating to this generic architecture for consistency and reduced maintenance overhead.
