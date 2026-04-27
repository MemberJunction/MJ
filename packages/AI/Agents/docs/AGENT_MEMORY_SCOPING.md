# Agent Memory Scoping Architecture

This guide explains how MemberJunction agents support multi-tenant scoping for memory (notes and examples), enabling multi-tenant applications to isolate agent memory by custom entity hierarchies.

## Overview

Agent memory scoping allows notes and examples to be filtered based on runtime context. This enables:

- **Tenant isolation**: Notes created for one organization don't leak to others
- **Hierarchical retrieval**: Broader notes (org-level) surface in specific contexts (contact-level)
- **Custom dimensions**: Applications define their own scope dimensions beyond built-in fields

## Scope Levels

### Built-in Fixed Scopes: Agent / User / Company

Every `AIAgentNote` and `AIAgentExample` row carries three indexed nullable foreign keys that form the foundation of MJ's memory scoping:

| Field | Purpose |
|---|---|
| `AgentID` | Restrict memory to a specific agent |
| `UserID` | Restrict memory to a specific user |
| `CompanyID` | Restrict memory to a specific tenant/company |

Any field can be `NULL`. NULL is how broader (less-specific) levels are represented — e.g. a note with `UserID=alice, AgentID=NULL, CompanyID=NULL` is a user-wide note that any agent will see when running for Alice. The combination of which fields are set determines which scope level the note belongs to (see priority tables below).

#### Where they come from at runtime

When `BaseAgent.executeAgent()` initializes a run (`packages/AI/Agents/src/base-agent.ts:1289-1290`):

- `userId = params.userId ?? params.contextUser?.ID` — `contextUser` is the implicit fallback. If the caller passes `userId` explicitly it wins; otherwise the user ID from `contextUser` is used.
- `companyId = params.companyId` — explicit only, no fallback. `contextUser` does not auto-populate this. If you want company scoping you must pass it.
- `agentId = params.agent.ID` — derived from the agent being executed.

These flow into `AgentContextInjector` for retrieval and onto the `AIAgentRun` record (`UserID`, `CompanyID` columns at `base-agent.ts:5048-5049`) so that Memory Manager can copy them onto new notes when the run produces memory updates.

#### Note retrieval priority (8 levels)

`AgentContextInjector.buildNotesScopingFilter()` (`agent-context-injector.ts:282-337`) returns notes whose `(AgentID, UserID, CompanyID)` tuple matches **any** of these levels — the SQL filter is an `OR` across all matching levels for the runtime triplet:

| Level | AgentID | UserID | CompanyID | Description |
|---|---|---|---|---|
| 1 | match | match | match | Agent + user + company specific (most specific) |
| 2 | match | match | NULL | Agent + user specific |
| 3 | match | NULL | match | Agent + company specific |
| 4 | NULL | match | match | User + company specific (cross-agent) |
| 5 | match | NULL | NULL | Agent-specific |
| 6 | NULL | match | NULL | User-specific (cross-agent) |
| 7 | NULL | NULL | match | Company-wide (cross-agent) |
| 8 | NULL | NULL | NULL | Global (cross-everything) |

A single retrieval naturally pulls in the most-specific notes plus all broader-applicable notes the runtime triplet inherits from. There's no priority tie-breaking — every level whose conditions match is included. After this OR filter the candidate set goes through vector similarity ranking and (if configured) reranking.

#### Example retrieval priority (4 levels)

Examples are always agent-specific (the AgentID match is enforced before the priority check, not part of it). The priority therefore collapses to 4 levels (`agent-context-injector.ts:459-495`):

| Level | AgentID match | UserID | CompanyID | Description |
|---|---|---|---|---|
| 1 | required | match | match | User + company specific |
| 2 | required | match | NULL | User-specific within agent |
| 3 | required | NULL | match | Company-wide within agent |
| 4 | required | NULL | NULL | Global within agent |

#### Usage patterns

**Single-user app (no companies):**

```typescript
await runner.ExecuteAgent({
    agent, conversationMessages,
    contextUser: alice  // userId derived from contextUser.ID
});
```

Retrieves: agent+alice notes, alice notes, agent-specific notes, global notes.

**Multi-tenant app (per-tenant + per-user isolation):**

```typescript
await runner.ExecuteAgent({
    agent, conversationMessages,
    contextUser: alice,
    companyId: 'acme-corp'  // explicit — required for company scoping
});
```

Retrieves the full 8-level cascade: starting from agent+alice+acme notes (level 1), down through every broader combination, ending with global notes (level 8).

**Company-wide agent (no user-specific memory):**

```typescript
await runner.ExecuteAgent({
    agent, conversationMessages,
    contextUser: systemUser,  // service account with no personal notes
    companyId: 'acme-corp'
});
```

Useful for notes shared across an entire company — e.g. an org's policies, defaults, or team-wide preferences. The `systemUser`'s `UserID` will be carried by the run for audit, but matches no UserID-scoped notes, so retrieval lands on company-wide (level 7), agent-specific (level 5), and global (level 8) levels.

**Cross-agent user memory (no agent-specific filter):**

This case isn't surfaced through `ExecuteAgentParams` directly — it's how Memory Manager creates user-wide notes that flow across all of a user's agents. When `scopeLevel='global'` or `scopeLevel='organization'` is set on note creation, MM writes a row with `AgentID=NULL`, which makes that note available to every agent the user runs. See *Memory Manager Integration* below.

**Note creation by Memory Manager:**

Memory Manager inherits the runtime `userId`/`companyId` from the source agent run when persisting new notes — see `packages/AI/Agents/src/memory-manager-agent.ts:1156` (the conversation-context enrichment step) and `:1120-1121` (carrying forward the candidate's `UserID`/`CompanyID` onto the saved note). The `scopeLevel` returned by the LLM determines which combination of fields is set vs left NULL on the new row (see the *Scope Level Behavior* table further down).

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

## Sub-Agent Scope Propagation

Scope is inherited by sub-agent invocations by default. When a parent agent (e.g., Sage) delegates to a sub-agent (e.g., Memory Manager, or any user-defined sub-agent), `BaseAgent` propagates `PrimaryScopeEntityName`, `PrimaryScopeRecordID`, and `SecondaryScopes` from the parent's `ExecuteAgentParams` onto the sub-agent's params before its run begins (see `packages/AI/Agents/src/base-agent.ts:4378-4380`).

This has two consequences:

- **Retrieval**: the sub-agent's `AgentContextInjector` queries notes and examples in the same scope cohort the parent saw — a sub-agent invoked from an org-scoped Sage run sees only that org's notes, not global-pool notes from other orgs.
- **Creation**: notes created by the sub-agent (typically via Memory Manager) inherit the same scope fields, so they land in the cohort the user expects.

If you need a sub-agent to operate in a different scope (e.g., a system-level utility agent that always reads from the global pool), don't delegate to it as a sub-agent — invoke it as a separate top-level run with its own scope params.

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

### Consolidation Interaction with Scopes

When MemoryManagerAgent runs its consolidation pipeline, scope fields are preserved alongside the consolidation provenance fields introduced in v5.30.x (`ConsolidatedIntoNoteID`, `ConsolidationCount`, `DerivedFromNoteIDs`, `ProtectionTier`, `ImportanceScore`). Scope and consolidation are independent layers — neither overrides the other:

- **Consolidated notes inherit scope from their source notes.** A merged note copies `PrimaryScopeEntityID`, `PrimaryScopeRecordID`, and `SecondaryScopes` from the cluster's input notes, which by construction share scope (clustering operates within a scope cohort, not across).
- **Protection tiers do not bypass scope-based access.** `Immutable` and `Protected` notes still respect `PrimaryScopeRecordID` / `SecondaryScopes` filtering during retrieval — a Protected note from one organization is not visible to runs scoped to another.
- **`mergeWithExistingId` revocation invariant.** When the LLM consolidates a cluster, source notes are revoked (Status flipped from `Active`) and their entry in `_noteVectorService` is removed in the same transaction by `MJAIAgentNoteEntityServer.Save/Delete`. This means revoked sources stop appearing in `FindSimilarAgentNotes` immediately — without an MJAPI restart — so subsequent retrieval at the same scope sees only the consolidated successor.
- **Contradiction resolution respects scope.** Entity-attribute-value triple extraction operates within a scope cohort; a contradiction between a note scoped to org A and a note scoped to org B is not flagged.

For the consolidation pipeline itself (clustering threshold, drift prevention, decay, protection tiers), see [`packages/AI/Agents/README.md`](../README.md) and [`specs/001-memory-consolidation/spec.md`](../../../../specs/001-memory-consolidation/spec.md).

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
