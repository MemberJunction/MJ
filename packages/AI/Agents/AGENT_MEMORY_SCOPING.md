# Agent Memory Scoping Architecture

This guide explains how MemberJunction agents support multi-tenant scoping for memory (notes and examples), enabling multi-tenant applications to isolate agent memory by custom entity hierarchies.

## Overview

Agent memory scoping allows notes and examples to be filtered based on runtime context. This enables:

- **Tenant isolation**: Notes created for one organization don't leak to others
- **Hierarchical retrieval**: Broader notes (org-level) surface in specific contexts (contact-level)
- **Custom dimensions**: Applications define their own scope dimensions beyond built-in fields

## Scope Levels

### Built-in Fixed Scopes (Always Available)

These fields are indexed for fast filtering and always available:

| Field | Purpose |
|-------|---------|
| `AgentID` | Agent-specific notes/examples |
| `UserID` | User-specific notes/examples |
| `CompanyID` | Company/tenant isolation |

### Primary Scope (Entity-Based)

For entity-backed scoping with fast indexed lookups:

| Field | Purpose |
|-------|---------|
| `PrimaryScopeEntityID` | Which entity type (e.g., "Organizations") |
| `PrimaryScopeRecordID` | Specific record ID (indexed for performance) |

### Secondary Scopes (Flexible JSON)

Additional dimensions stored as JSON for fine-grained filtering:

| Field | Purpose |
|-------|---------|
| `SecondaryScopes` | JSON object with dimension values |

## Configuration: SecondaryScopeConfig

Agents can define their supported secondary dimensions in the `ScopeConfig` field on `AIAgent`. The JSON is parsed into the TypeScript `SecondaryScopeConfig` interface:

```json
{
    "dimensions": [
        {
            "name": "ContactID",
            "entityId": "uuid-for-contacts-entity",
            "required": false,
            "inheritanceMode": "cascading",
            "description": "Customer contact within the organization"
        },
        {
            "name": "TeamID",
            "entityId": "uuid-for-teams-entity",
            "required": false,
            "inheritanceMode": "strict",
            "description": "Support team handling the interaction"
        }
    ],
    "defaultInheritanceMode": "cascading",
    "allowSecondaryOnly": false,
    "strictValidation": true
}
```

### Configuration Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dimensions` | Array | Required | Array of dimension definitions |
| `defaultInheritanceMode` | `'cascading'` \| `'strict'` | `'cascading'` | Default inheritance for dimensions |
| `allowSecondaryOnly` | boolean | `false` | Allow scoping without primary entity |
| `strictValidation` | boolean | `false` | Reject undefined dimensions |

### Dimension Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | Required | Dimension key in SecondaryScopes JSON |
| `entityId` | string \| null | `null` | Optional entity for record validation |
| `required` | boolean | `false` | Must be provided at runtime |
| `inheritanceMode` | `'cascading'` \| `'strict'` | Uses default | Per-dimension inheritance |
| `defaultValue` | string \| null | `null` | Value if not provided |
| `description` | string | - | Documentation |

## Inheritance Modes

### Cascading (Default)

Notes **without** a dimension match queries **with** that dimension. This enables broader notes to surface in specific contexts.

**Example:**
- Query: `ContactID = "123"`
- Note with `ContactID = "123"`: **Matches**
- Note without `ContactID` (empty): **Matches** (cascading allows it)
- Note with `ContactID = "456"`: **No match** (different value)

### Strict

Notes must **exactly match** the dimension value. Notes without the dimension do NOT match.

**Example:**
- Query: `DealStage = "Negotiation"`
- Note with `DealStage = "Negotiation"`: **Matches**
- Note without `DealStage`: **No match** (strict requires exact match)
- Note with `DealStage = "Prospecting"`: **No match**

### Inheritance Behavior Matrix

| Dimension Mode | Query Has Value | Note Has Value | Matches? |
|---------------|-----------------|----------------|----------|
| cascading | `ContactID=123` | `ContactID=123` | Yes |
| cascading | `ContactID=123` | (missing) | Yes |
| cascading | `ContactID=123` | `ContactID=456` | No |
| strict | `DealStage=A` | `DealStage=A` | Yes |
| strict | `DealStage=A` | (missing) | No |
| strict | `DealStage=A` | `DealStage=B` | No |

## Runtime Usage

### Providing Scope at Execution Time

Pass scope as top-level params on `ExecuteAgentParams`:

```typescript
const params: ExecuteAgentParams = {
    agent: myAgent,
    conversationMessages: messages,
    contextUser: user,
    // Primary scope (indexed, fast filtering)
    PrimaryScopeEntityName: 'Organizations',
    PrimaryScopeRecordID: 'org-123',
    // Secondary scopes (arbitrary dimensions, stored as JSON)
    SecondaryScopes: {
        ContactID: 'contact-456',
        TeamID: 'team-alpha'
    }
};

const result = await agentRunner.executeAgent(params);
```

Secondary scopes are arbitrary key/value pairs for external applications (Skip, Izzy, etc.). MJ's own chat infrastructure does not use them.

### GraphQL Callers

GraphQL callers pass scope info via the `data` JSON parameter. BaseAgent reads them from `params.data` as a fallback:

```json
{
    "data": {
        "PrimaryScopeEntityName": "Organizations",
        "PrimaryScopeRecordID": "org-123",
        "SecondaryScopes": { "ContactID": "contact-456" }
    }
}
```

### Secondary-Only Scoping

If `allowSecondaryOnly: true` in the agent's config, you can omit primary scope:

```typescript
{
    SecondaryScopes: {
        Region: 'EMEA',
        ProductLine: 'Enterprise'
    }
}
```

## Memory Manager Integration

The Memory Manager agent automatically inherits scope from the source agent run when creating notes:

1. **Source Run**: The conversation that generated the memory has scope attached
2. **Note Creation**: Memory Manager copies scope fields to new notes
3. **Scope Level Override**: LLM can suggest `scopeLevel` ('global', 'organization', 'contact')

### Scope Level Behavior

| scopeLevel | PrimaryScopeRecordID | SecondaryScopes | UserID |
|------------|---------------------|-----------------|--------|
| `global` | null | null | null |
| `organization` | Copied from run | null | null |
| `contact` | Copied from run | Copied from run | Set |

## Data Flow

```
ExecuteAgentParams.PrimaryScopeEntityName / PrimaryScopeRecordID / SecondaryScopes
  (or params.data.* fallback for GraphQL callers)
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ BaseAgent.initializeAgentRun()                                  │
│                                                                 │
│ 1. Resolve scope from params or data fallback                   │
│ 2. Parse agent's SecondaryScopeConfig                           │
│ 3. Validate runtime scope against config                        │
│ 4. Apply default values for missing dimensions                  │
│ 5. Set PrimaryScopeEntityID/RecordID on AgentRun                │
│ 6. Set SecondaryScopes JSON on AgentRun                         │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ AIAgentRunEntity (stored in database)                           │
│                                                                 │
│ - PrimaryScopeEntityID: string | null                           │
│ - PrimaryScopeRecordID: string | null                           │
│ - SecondaryScopes: string | null (JSON)                         │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Memory Manager Note Creation                                    │
│                                                                 │
│ Copies scope from source AgentRun to new notes                  │
│ Applies scopeLevel to determine scope depth                     │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ AgentContextInjector Note Retrieval                             │
│                                                                 │
│ Builds SQL filters using per-dimension inheritance:             │
│ 1. Always include global notes (no scope)                       │
│ 2. Include primary-scope notes if primary matches               │
│ 3. Apply per-dimension inheritance for secondary scopes         │
└─────────────────────────────────────────────────────────────────┘
```

## Examples

### Example 1: Customer Service App (Izzy)

```json
{
    "dimensions": [
        {"name": "ContactID", "entityId": "...", "inheritanceMode": "cascading"},
        {"name": "TeamID", "entityId": "...", "inheritanceMode": "strict"}
    ],
    "allowSecondaryOnly": false
}
```

**Behavior:**
- Notes about a contact surface for any team working with that contact (cascading)
- Notes about a specific team only surface for that team (strict)
- Primary org scope is always required

### Example 2: Analytics App with Arbitrary Values

```json
{
    "dimensions": [
        {"name": "Region", "inheritanceMode": "cascading"},
        {"name": "DealStage", "inheritanceMode": "strict"}
    ],
    "allowSecondaryOnly": true
}
```

**Behavior:**
- Dimensions are string values, not entity IDs
- Can scope by region and deal stage without an org entity
- Region notes cascade; deal stage notes are strict

### Example 3: Global Agent (No Scoping)

```json
null
```

Or simply don't set `ScopeConfig` on the agent. All notes are global and visible to everyone.

## Performance Considerations

1. **Primary Scope is Indexed**: `PrimaryScopeRecordID` has a database index for fast filtering
2. **Secondary Scopes Use JSON_VALUE**: SQL Server's JSON functions are used; consider computed columns for frequently-queried dimensions
3. **Cascading is Broader**: Cascading mode retrieves more notes than strict mode

## Related Files

- `packages/AI/CorePlus/src/agent-types.ts`: `SecondaryScopeConfig`, `SecondaryDimension`, `SecondaryScopeValue` types
- `packages/AI/Agents/src/agent-context-injector.ts`: Query building logic
- `packages/AI/Agents/src/base-agent.ts`: Scope validation in `initializeAgentRun()`
- `packages/AI/Agents/src/memory-manager-agent.ts`: Scope inheritance for note creation
