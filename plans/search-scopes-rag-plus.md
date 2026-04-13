# Search Scopes & RAG+ Agent Integration — Comprehensive Plan

## Executive Summary

This plan introduces **Search Scopes** — a configurable, permission-aware layer that lets users and agents define precisely *what* to search across MJ's multi-provider search infrastructure. Combined with agent integration, this creates a **RAG+** engine where agents can receive pre-execution retrieval context and/or invoke scoped search as a tool during execution.

**Key outcomes:**
1. Users can create named Search Scopes that filter which providers, vector indexes, entities, and storage accounts participate in a search
2. Agents can be assigned 1+ Search Scopes with phase control (pre-execution RAG, agent-invoked tool, or both)
3. Pre-execution RAG runs automatically in parallel with existing Phase 2 initialization — zero added latency
4. A new `ScopedSearchAction` enforces scope restrictions when agents invoke search as a tool
5. Search Scope permissions (Phase 2 of this plan) will allow org-level control over who can search what

**What this is NOT:**
- Notes & Examples (AgentContextInjector) = the agent's **brain** — learned behaviors, personality, few-shot patterns. Shapes *how* the agent thinks.
- Data Sources (AgentDataPreloader) = the agent's **briefing packet** — static reference data loaded before execution. Config tables, user profiles, org settings.
- Search Scopes (this plan) = the agent's **research library** — dynamic, query-dependent knowledge retrieval. Documents, policies, vectorized content relevant to *this specific question*.

Each subsystem serves a distinct purpose. Documentation must make this distinction crystal clear.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Entity Model](#2-entity-model)
3. [SearchEngine Scope Integration](#3-searchengine-scope-integration)
4. [Agent Integration — Pre-Execution RAG](#4-agent-integration--pre-execution-rag)
5. [Agent Integration — Scoped Search Action](#5-agent-integration--scoped-search-action)
6. [Search UI — Scope Selector](#6-search-ui--scope-selector)
7. [Template System Integration](#7-template-system-integration)
8. [Multi-Scope RRF Fusion](#8-multi-scope-rrf-fusion)
9. [Search Scope Permissions (Phase 2)](#9-search-scope-permissions-phase-2)
10. [Existing System Touchpoints](#10-existing-system-touchpoints)
11. [Documentation Requirements](#11-documentation-requirements)
12. [Task Breakdown](#12-task-breakdown)

---

## 1. Architecture Overview

### Current Search Flow
```
User Query → SearchEngine.Search(params)
  → Run ALL active providers in parallel
  → RRF Fusion → Dedup → Permission filter → Enrich
  → SearchResult
```

### New Search Flow with Scopes
```
User Query + ScopeID(s)
  → SearchEngine.Search(params) — params now has optional ScopeIDs
  → Load SearchScope config(s) from metadata
  → For EACH scope:
  │   → Determine which providers/indexes/entities/accounts participate
  │   → Run scoped providers in parallel
  │   → Collect per-scope ranked lists
  → Cross-scope RRF Fusion (if multiple scopes)
  → Dedup → Permission filter → Enrich
  → SearchResult
```

### Agent RAG+ Flow
```
BaseAgent.Execute()
  Phase 2 (all parallel):
  ├── Config load
  ├── Data preload (AgentDataPreloader)        — static briefing
  ├── Context injection (AgentContextInjector) — brain/memory
  └── Pre-execution RAG (NEW):                 — research library
      ├── Load AIAgentSearchScope rows where Phase IN ('PreExecution','Both')
      │   AND Status='Active' AND within StartAt/EndAt window
      ├── For each scope (by Priority):
      │   ├── Render QueryTemplateID with conversation context
      │   │   (or use lastUserMessage if no template)
      │   └── Call SearchEngine.Search(query, scopeId)
      ├── Cross-scope RRF if multiple scopes
      ├── Format results as system message
      └── Inject into conversation (unshift, like notes/examples)

  Phase 3 (agent execution):
  ├── Agent sees pre-execution RAG in conversation context
  ├── Agent has ScopedSearchAction tool (for 'AgentInvoked'/'Both' scopes)
  │   └── Action checks agent's SearchScopeAccess + allowed scopes
  └── Agent can search iteratively with specific scopes
```

---

## 2. Entity Model

### 2.1 SearchScope (New Entity)

The core configuration entity. Each scope defines a named, reusable search boundary.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | uniqueidentifier | NO | NEWSEQUENTIALID() | Primary key |
| Name | nvarchar(200) | NO | | Human-readable scope name (e.g., "HR Policies", "Engineering Docs") |
| Description | nvarchar(max) | YES | | Detailed description of what this scope covers |
| Icon | nvarchar(200) | YES | | Font Awesome icon class for UI display |
| IsGlobal | bit | NO | 0 | If true, this scope includes everything (equivalent to no scope filtering). Only one global scope should exist. |
| IsDefault | bit | NO | 0 | If true, this is the default scope for users/agents that don't specify one |
| OwnerUserID | uniqueidentifier | YES | NULL | NULL = organization-wide scope. Set = personal scope owned by this user. FK to User. |
| Status | nvarchar(20) | NO | 'Active' | 'Active' or 'Inactive'. CHECK constraint. |
| StartAt | datetimeoffset | YES | NULL | If set, scope is only active after this timestamp. NULL = immediately active. |
| EndAt | datetimeoffset | YES | NULL | If set, scope auto-deactivates after this timestamp. NULL = no expiry. |
| ScopeConfig | nvarchar(max) | YES | NULL | JSON for advanced overrides: `{ "rrfK": 60, "fusionWeights": { "vector": 1.5, "fulltext": 1.0 } }` |

**Constraints:**
- `CONSTRAINT UQ_SearchScope_Name UNIQUE (Name)`
- `CONSTRAINT FK_SearchScope_OwnerUser FOREIGN KEY (OwnerUserID) REFERENCES User(ID)`
- `CONSTRAINT CK_SearchScope_Status CHECK (Status IN ('Active', 'Inactive'))`

**Seed data:** Create one built-in "Global" scope with `IsGlobal=1, IsDefault=1, Status='Active'`.

### 2.2 SearchScopeProvider (New Entity)

Controls which search providers participate in a scope.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | uniqueidentifier | NO | NEWSEQUENTIALID() | Primary key |
| SearchScopeID | uniqueidentifier | NO | | FK to SearchScope |
| SearchProviderID | uniqueidentifier | NO | | FK to MJ: Search Providers. Which provider is included. |
| Enabled | bit | NO | 1 | Whether this provider is active for this scope |
| MaxResultsOverride | int | YES | NULL | Override max results for this provider within this scope. NULL = use provider default. |
| ProviderConfigOverride | nvarchar(max) | YES | NULL | JSON override for provider-specific config within this scope |

**Constraints:**
- `CONSTRAINT FK_SearchScopeProvider_Scope FOREIGN KEY (SearchScopeID) REFERENCES SearchScope(ID)`
- `CONSTRAINT FK_SearchScopeProvider_Provider FOREIGN KEY (SearchProviderID) REFERENCES SearchProvider(ID)`
- `CONSTRAINT UQ_SearchScopeProvider UNIQUE (SearchScopeID, SearchProviderID)`

### 2.3 SearchScopeVectorIndex (New Entity)

Controls which specific vector indexes a scope queries (subset of what VectorSearchProvider would normally query).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | uniqueidentifier | NO | NEWSEQUENTIALID() | Primary key |
| SearchScopeID | uniqueidentifier | NO | | FK to SearchScope |
| VectorIndexID | uniqueidentifier | NO | | FK to MJ: Vector Indexes. Which index is included. |

**Constraints:**
- `CONSTRAINT FK_SearchScopeVectorIndex_Scope FOREIGN KEY (SearchScopeID) REFERENCES SearchScope(ID)`
- `CONSTRAINT FK_SearchScopeVectorIndex_VectorIndex FOREIGN KEY (VectorIndexID) REFERENCES VectorIndex(ID)`
- `CONSTRAINT UQ_SearchScopeVectorIndex UNIQUE (SearchScopeID, VectorIndexID)`

**Behavior:** When VectorSearchProvider runs within a scope, it queries ONLY the vector indexes listed here. If no rows exist for a scope, VectorSearchProvider is skipped for that scope (unless the scope is Global).

### 2.4 SearchScopeEntity (New Entity)

Controls which entities participate in entity and full-text search within a scope.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | uniqueidentifier | NO | NEWSEQUENTIALID() | Primary key |
| SearchScopeID | uniqueidentifier | NO | | FK to SearchScope |
| EntityID | uniqueidentifier | NO | | FK to Entity. Which entity is included. |
| ExtraFilter | nvarchar(max) | YES | NULL | Optional SQL filter applied to this entity's search within this scope. Example: `Status='Published' AND DepartmentID='abc'` |
| UserSearchString | nvarchar(max) | YES | NULL | Optional override for the UserSearchString parameter passed to RunView. When set, this is used INSTEAD of the user's query for this specific entity. Useful for targeting specific field search behavior configured via `IncludeInUserSearchAPI` and `UserSearchParamFormatAPI` on the entity's fields. |

**How UserSearchString works here:** The `UserSearchString` parameter on `RunView` triggers the entity's configured field-level search. Each entity field has `IncludeInUserSearchAPI` (which fields to search) and `UserSearchParamFormatAPI` (how to search — LIKE pattern format using `{0}` placeholder). When `UserSearchString` is set on `SearchScopeEntity`, it provides a template/override for what gets passed as `UserSearchString` to RunView for this entity within this scope. If NULL, the user's actual query is passed through as-is. This could be a Nunjucks template: `{{ query }} AND type:policy` to append scope-specific search terms.

**Constraints:**
- `CONSTRAINT FK_SearchScopeEntity_Scope FOREIGN KEY (SearchScopeID) REFERENCES SearchScope(ID)`
- `CONSTRAINT FK_SearchScopeEntity_Entity FOREIGN KEY (EntityID) REFERENCES Entity(ID)`
- `CONSTRAINT UQ_SearchScopeEntity UNIQUE (SearchScopeID, EntityID)`

**Behavior:** When EntitySearchProvider or FullTextSearchProvider runs within a scope, they search ONLY the entities listed here. If no rows exist, the provider is skipped for that scope (unless Global).

### 2.5 SearchScopeStorageAccount (New Entity)

Controls which file storage accounts/folders participate in a scope.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | uniqueidentifier | NO | NEWSEQUENTIALID() | Primary key |
| SearchScopeID | uniqueidentifier | NO | | FK to SearchScope |
| FileStorageAccountID | uniqueidentifier | NO | | FK to File Storage Accounts |
| FolderPath | nvarchar(1000) | YES | NULL | Optional folder path restriction. NULL = entire account. Example: `/policies/hr/` |

**Constraints:**
- `CONSTRAINT FK_SearchScopeStorageAccount_Scope FOREIGN KEY (SearchScopeID) REFERENCES SearchScope(ID)`
- `CONSTRAINT FK_SearchScopeStorageAccount_Account FOREIGN KEY (FileStorageAccountID) REFERENCES FileStorageAccount(ID)`
- `CONSTRAINT UQ_SearchScopeStorageAccount UNIQUE (SearchScopeID, FileStorageAccountID, FolderPath)`

### 2.6 AIAgentSearchScope (New Entity)

Many-to-many join between agents and search scopes, with phase and scheduling control.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | uniqueidentifier | NO | NEWSEQUENTIALID() | Primary key |
| AgentID | uniqueidentifier | NO | | FK to AI Agents |
| SearchScopeID | uniqueidentifier | NO | | FK to Search Scopes |
| Phase | nvarchar(20) | NO | 'Both' | 'PreExecution', 'AgentInvoked', or 'Both'. Controls when this scope is used. |
| Status | nvarchar(20) | NO | 'Active' | 'Active' or 'Inactive' |
| StartAt | datetimeoffset | YES | NULL | Time-windowed activation. NULL = immediately active. |
| EndAt | datetimeoffset | YES | NULL | Time-windowed deactivation. NULL = no expiry. |
| Priority | int | NO | 100 | Ordering within phase. Lower = higher priority. Used for pre-execution ordering and as default preference for agent-invoked. |
| MaxResults | int | YES | NULL | Override max results for this scope when used by this agent. NULL = use scope/engine default. |
| MinScore | decimal(5,4) | YES | NULL | Override min score threshold. NULL = use engine default. |
| QueryTemplateID | uniqueidentifier | YES | NULL | FK to Templates. MJ Template used to generate the search query from conversation context. NULL = use lastUserMessage as-is. |
| IsDefault | bit | NO | 0 | If true, this is the agent's default scope when no scope is specified in a tool call |

**Constraints:**
- `CONSTRAINT FK_AIAgentSearchScope_Agent FOREIGN KEY (AgentID) REFERENCES AIAgent(ID)`
- `CONSTRAINT FK_AIAgentSearchScope_Scope FOREIGN KEY (SearchScopeID) REFERENCES SearchScope(ID)`
- `CONSTRAINT FK_AIAgentSearchScope_Template FOREIGN KEY (QueryTemplateID) REFERENCES Template(ID)`
- `CONSTRAINT CK_AIAgentSearchScope_Phase CHECK (Phase IN ('PreExecution', 'AgentInvoked', 'Both'))`
- `CONSTRAINT CK_AIAgentSearchScope_Status CHECK (Status IN ('Active', 'Inactive'))`

**How time-windowing works at runtime:**
```typescript
// Filter active scopes
const now = new Date();
const activeScopes = allScopes.filter(s =>
    s.Status === 'Active' &&
    (s.StartAt == null || s.StartAt <= now) &&
    (s.EndAt == null || s.EndAt >= now)
);
```

**Use cases for time-windowing:**
- "Give the support agent access to Holiday Policy scope Nov 1 – Jan 15"
- "Temporarily add infrastructure logs scope for 48 hours during incident response"
- "Enable Q4 financial reports scope from Oct 1 – Jan 31"

### 2.7 AIAgent — New Field

Add one field to the existing `AIAgent` entity:

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| SearchScopeAccess | nvarchar(20) | NO | 'None' | Controls search scope access: 'All' (can search anything), 'Assigned' (restricted to AIAgentSearchScope rows), 'None' (no search capability). CHECK constraint. |

**Behavior:**
- `All`: Agent can use any scope including Global. The search Action does not restrict.
- `Assigned`: Agent can ONLY use scopes linked via `AIAgentSearchScope`. The scoped search Action enforces this.
- `None`: Agent has no search capability. The scoped search Action rejects all requests.

---

## 3. SearchEngine Scope Integration

### 3.1 Extend SearchParams

Add optional scope support to the search parameter interface:

```typescript
// In packages/SearchEngine/src/generic/search.types.ts
export interface SearchParams {
    Query: string;
    MaxResults?: number;
    Filters?: SearchFilters;
    MinScore?: number;
    Mode?: SearchMode;
    ScopeIDs?: string[];       // NEW — optional array of scope IDs
}
```

### 3.2 Scope Resolution in SearchEngine

When `ScopeIDs` is provided in `SearchParams`:

1. **Load scope metadata** — query `SearchScope` + child tables for each scope ID
2. **Validate scope is active** — check `Status`, `StartAt`, `EndAt`
3. **For each active scope:**
   a. Determine which providers participate (`SearchScopeProvider` rows where `Enabled=true`)
   b. For VectorSearchProvider: pass only the `SearchScopeVectorIndex` index IDs
   c. For EntitySearchProvider/FullTextSearchProvider: pass only the `SearchScopeEntity` entity IDs + ExtraFilters + UserSearchString overrides
   d. For StorageSearchProvider: pass only the `SearchScopeStorageAccount` accounts + FolderPaths
   e. Execute scoped providers in parallel
   f. Collect per-scope ranked result lists
4. **Cross-scope RRF fusion** if multiple scopes (see section 8)
5. Continue with existing dedup → permissions → enrich pipeline

### 3.3 Provider Interface Changes

Each provider's `search()` method currently receives:

```typescript
search(query: string, topK: number, filters: SearchFilters | undefined, contextUser: UserInfo): Promise<SearchResultItem[]>
```

Add an optional scope constraint parameter:

```typescript
search(
    query: string,
    topK: number,
    filters: SearchFilters | undefined,
    contextUser: UserInfo,
    scopeConstraints?: ScopeConstraints  // NEW
): Promise<SearchResultItem[]>
```

```typescript
// New type
export interface ScopeConstraints {
    /** For VectorSearchProvider: only query these index IDs */
    VectorIndexIDs?: string[];
    /** For EntitySearchProvider/FullTextSearchProvider: only search these entities */
    Entities?: ScopeEntityConstraint[];
    /** For StorageSearchProvider: only search these accounts/folders */
    StorageAccounts?: ScopeStorageConstraint[];
}

export interface ScopeEntityConstraint {
    EntityID: string;
    EntityName: string;
    ExtraFilter?: string;
    UserSearchString?: string;
}

export interface ScopeStorageConstraint {
    FileStorageAccountID: string;
    FolderPath?: string;
}
```

### 3.4 Scope Metadata Caching

Add scope metadata to `SearchEngineBase` alongside existing provider metadata caching:

- Load all `SearchScope` records + child tables on first use
- Cache with same pattern as provider metadata
- Invalidate on scope entity changes (BaseEntity event-driven invalidation)

### 3.5 Global Scope Behavior

When `ScopeIDs` contains a Global scope (or is empty/undefined):
- All providers run with no constraints (current behavior)
- This ensures backward compatibility — existing code that doesn't pass `ScopeIDs` works exactly as before

---

## 4. Agent Integration — Pre-Execution RAG

### 4.1 New Module: AgentPreExecutionRAG

Create a new file in `packages/AI/Agents/src/`:

**File:** `agent-pre-execution-rag.ts`

**Responsibilities:**
1. Load active `AIAgentSearchScope` rows for the agent where `Phase IN ('PreExecution', 'Both')`
2. Filter by `Status='Active'` and `StartAt`/`EndAt` time window
3. Sort by `Priority` (ascending)
4. For each active scope:
   a. Render `QueryTemplateID` using MJ's TemplateEngine with conversation context variables (see section 7)
   b. If no template, use the last user message as the query
   c. Call `SearchEngine.Search()` with `ScopeIDs: [scopeId]`, respecting `MaxResults` and `MinScore` overrides
5. If multiple scopes produced results, apply cross-scope RRF fusion
6. Format results into a system message and return it

### 4.2 Injection Pattern

Follow the exact same pattern as `AgentContextInjector` (notes/examples):

```typescript
// In base-agent.ts, add to Phase 2 parallel execution:
const [config] = await Promise.all([
    this.loadAgentConfiguration(params.agent),
    this.preloadAgentData(wrappedParams),
    this.InjectContextMemory(...),
    this.InjectPreExecutionRAG(wrappedParams)  // NEW — runs in parallel
]);
```

The `InjectPreExecutionRAG` method:
1. Calls `AgentPreExecutionRAG.Execute()`
2. If results are returned, creates a system message:
```
<retrieved_context>
The following information was retrieved from [Scope Name] based on the current query.
Use this context to inform your response. If the retrieved information conflicts
with your training data, prefer the retrieved information as it may be more current.

--- Results from "HR Policies" (5 results, min score 0.42) ---

1. [Employee Handbook - Section 4.2] (Score: 0.89)
   "All employees are entitled to 15 days of paid time off per year..."
   Source: vector | Entity: Documents | Tags: hr, policy, pto

2. [PTO Policy Update 2025] (Score: 0.76)
   "Effective January 2025, rollover is limited to 5 days..."
   Source: fulltext | Entity: Knowledge Articles | Tags: hr, pto, update

--- Results from "Company Wiki" (3 results, min score 0.51) ---

3. [Benefits FAQ] (Score: 0.71)
   ...

</retrieved_context>
```
3. Injects via `conversationMessages.unshift({ role: 'system', content: formattedContext })`

### 4.3 Pre-Execution RAG Activation Logic

Pre-execution RAG is activated if ANY `AIAgentSearchScope` rows exist for the agent with:
- `Phase IN ('PreExecution', 'Both')`
- `Status = 'Active'`
- Within `StartAt`/`EndAt` window

No separate flag on the agent is needed — the presence of active pre-execution scope rows is the trigger.

---

## 5. Agent Integration — Scoped Search Action

### 5.1 New Action: ScopedSearchAction

**File:** `packages/Actions/CoreActions/src/custom/search/scoped-search.action.ts`

This action wraps the existing `SearchAction` but enforces scope restrictions based on the calling agent's configuration.

**Registration:** `@RegisterClass(BaseAction, "__Scoped_Search")`

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | YES | Search query text |
| scopeid | string | NO | Specific scope ID to search. If omitted, uses agent's default scope. |
| maxresults | number | NO | Max results (default: 25) |
| minscore | number | NO | Min score threshold (default: 0) |

**Enforcement Logic:**

```
1. Get the calling agent's ID from params context
2. Load the agent's SearchScopeAccess field
3. If 'None' → reject with error
4. If 'Assigned':
   a. Load AIAgentSearchScope rows where Phase IN ('AgentInvoked', 'Both')
      AND Status='Active' AND within StartAt/EndAt window
   b. If scopeid provided, verify it's in the allowed list
   c. If scopeid not provided, use the IsDefault=true scope (or first by Priority)
   d. If requested scope not in allowed list → reject with error
5. If 'All':
   a. Use provided scopeid, or Global if not specified
   b. No restriction
6. Call SearchEngine.Search() with ScopeIDs: [resolvedScopeId]
7. Return results in same format as existing SearchAction
```

### 5.2 Agent Action Assignment

The `ScopedSearchAction` should be assigned to agents instead of (or in addition to) the existing `__Internal_Search` action. When an agent has `SearchScopeAccess='Assigned'`, only the scoped action should be available to prevent the agent from bypassing scope restrictions via the unscoped action.

**Migration consideration:** Existing agents using `__Internal_Search` continue to work. New agents or agents with scope restrictions should use `__Scoped_Search`.

### 5.3 Agent Awareness of Available Scopes

When the scoped search Action is invoked by an agent, the agent needs to know which scopes are available. This information should be included in the agent's system prompt or tool description:

```
You have access to the following search scopes:
- "HR Policies" (ID: abc-123): Company HR documents and policies
- "Engineering Docs" (ID: def-456): Technical documentation and runbooks

Use the search tool with a specific scopeid to search within a scope,
or omit scopeid to use your default scope ("HR Policies").
```

This can be injected during agent initialization by reading the agent's `AIAgentSearchScope` rows.

---

## 6. Search UI — Scope Selector

### 6.1 Scope Selector Component

Add a scope selector to the existing search UI components in `packages/Angular/Generic/search/`.

**New component:** `SearchScopeSelector`

**UX:**
- Dropdown/chip selector next to the search input
- Default shows "Global" or the user's default scope
- User can select 1 or more scopes
- Personal scopes (user-created) appear in a separate section from org-wide scopes
- Selected scopes are passed as `ScopeIDs` in the search request

**Data flow:**
1. Component loads available scopes from GraphQL (filtered by user permissions in Phase 2)
2. User selects scope(s)
3. `SearchService` passes `ScopeIDs` to the GraphQL search resolver
4. Resolver passes to `SearchEngine.Search()`

### 6.2 GraphQL Schema Changes

Add `scopeIDs` parameter to the existing search query/mutation:

```graphql
type Query {
    search(
        query: String!
        maxResults: Int
        minScore: Float
        scopeIDs: [ID]          # NEW
        entityNames: [String]
        includeSources: [String]
        tags: [String]
    ): SearchResult!
}
```

Add scope query for the UI:

```graphql
type Query {
    searchScopes: [SearchScope!]!
}

type SearchScope {
    ID: ID!
    Name: String!
    Description: String
    Icon: String
    IsGlobal: Boolean!
    IsDefault: Boolean!
    IsPersonal: Boolean!       # Derived: OwnerUserID is not null
}
```

---

## 7. Template System Integration

### 7.1 Query Template for Pre-Execution RAG

When `AIAgentSearchScope.QueryTemplateID` is set, the system uses MJ's full template engine to generate the search query. The template is a standard MJ Template entity with TemplateContent and TemplateParams.

**Template rendering uses MJ's TemplateEngine** (`packages/Templates/engine/src/TemplateEngine.ts`) which supports:
- Nunjucks syntax with auto-escaping
- Custom filters (`json`, `jsoninline`, `jsonparse`)
- Custom extensions (`{% AIPrompt %}`, `{% template %}`)
- Automatic parameter validation via `TemplateParam` records
- Default value merging from parameter definitions

### 7.2 Available Template Variables

The following variables will be populated in the template data context when rendering a search query template:

**System Placeholders** (auto-populated by `SystemPlaceholderManager`):
| Variable | Description |
|----------|-------------|
| `_CURRENT_DATE` | Current date |
| `_CURRENT_DATE_AND_TIME` | Current date and time |
| `_CURRENT_TIME` | Current time |
| `_CURRENT_DAY_OF_WEEK` | Day of week |
| `_USER_NAME` | Name of the user the agent is acting for |
| `_ORGANIZATION_NAME` | Organization name |

**Conversation Context** (populated by AgentPreExecutionRAG):
| Variable | Description |
|----------|-------------|
| `lastUserMessage` | The most recent user message text — the primary input for query generation |
| `recentMessages` | Array of the last N conversation messages (configurable, default 5). Each has `role` and `content`. |
| `conversationSummary` | If available, a summary of the full conversation so far |

**Agent State** (populated from agent execution context):
| Variable | Description |
|----------|-------------|
| `agentName` | Name of the executing agent |
| `agentDescription` | Description of the executing agent |
| `payload` | The agent's current payload state (JSON object) |

**Scope Metadata** (populated from the SearchScope being queried):
| Variable | Description |
|----------|-------------|
| `scopeName` | Name of the search scope |
| `scopeDescription` | Description of the search scope |

### 7.3 Template Examples

**Simple passthrough (no template needed — NULL QueryTemplateID):**
Uses `lastUserMessage` as-is.

**Contextual query expansion:**
```nunjucks
{{ lastUserMessage }}{% if payload and payload.topic %} {{ payload.topic }}{% endif %}{% if payload and payload.customerName %} {{ payload.customerName }}{% endif %}
```

**Multi-turn context-aware query:**
```nunjucks
{% if recentMessages and recentMessages.length > 1 %}
Based on this conversation:
{% for msg in recentMessages %}
{{ msg.role }}: {{ msg.content }}
{% endfor %}
Generate a search query that captures the key topics discussed.
{% else %}
{{ lastUserMessage }}
{% endif %}
```

**AI-powered query optimization (uses the `{% AIPrompt %}` extension):**
```nunjucks
{% AIPrompt AIModel="claude-haiku" %}
You are a search query optimizer. Given the user's message and conversation context, generate a concise, effective search query that will find the most relevant documents.

User message: {{ lastUserMessage }}
{% if recentMessages and recentMessages.length > 1 %}
Recent conversation:
{% for msg in recentMessages | slice(0, 3) %}
{{ msg.role }}: {{ msg.content }}
{% endfor %}
{% endif %}
{% if scopeDescription %}
Search scope: {{ scopeDescription }}
{% endif %}

Output ONLY the optimized search query text, nothing else.
{% endAIPrompt %}
```

### 7.4 Template Parameter Definitions

Create TemplateParam records for each query template:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| lastUserMessage | Scalar | YES | | The most recent user message |
| recentMessages | Array | NO | [] | Recent conversation messages |
| conversationSummary | Scalar | NO | | Conversation summary if available |
| payload | Object | NO | {} | Agent's current payload state |
| agentName | Scalar | NO | | Name of the executing agent |
| scopeName | Scalar | NO | | Name of the search scope being queried |
| scopeDescription | Scalar | NO | | Description of the search scope |

These will be auto-extracted by MJ's template parameter extraction pipeline when the template content is saved.

---

## 8. Multi-Scope RRF Fusion

### 8.1 How It Works

When multiple scopes are searched (either via UI multi-select or multiple pre-execution scopes):

1. Each scope produces its own ranked result list (already internally fused via the existing per-provider RRF)
2. These per-scope lists become inputs to a second layer of RRF fusion
3. Use the existing `ComputeRRF()` utility from `@memberjunction/core` — it's already broken out as a reusable function

```
Scope A results (internally RRF'd across its providers):
  [Result1: 0.89, Result2: 0.76, Result3: 0.65]

Scope B results (internally RRF'd across its providers):
  [Result4: 0.91, Result2: 0.70, Result5: 0.58]

Cross-scope RRF:
  → Result2 appears in both → boosted score
  → Results ranked by cross-scope RRF
  → Deduplicated (Result2 merged, max score retained)
```

### 8.2 Implementation

Add a `CrossScopeFusion` method to `SearchFusion` or create a helper:

```typescript
// Reuses existing RRF infrastructure
CrossScopeFusion(
    scopeResults: Map<string, SearchResultItem[]>,  // scopeId → results
    topK: number
): SearchResultItem[]
```

This calls `ComputeRRF()` with each scope's results as a separate ranked list, then deduplicates.

---

## 9. Search Scope Permissions (Phase 2)

> **This section is designed but NOT implemented in Phase 1.** Phase 1 allows all users to see and use all scopes. Phase 2 adds permission control.

### 9.1 SearchScopePermission (Future Entity)

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier | Primary key |
| SearchScopeID | uniqueidentifier | FK to SearchScope |
| RoleID | uniqueidentifier | FK to Role. Which role has access. |
| CanSearch | bit | Can use this scope for searching |
| CanManage | bit | Can edit this scope's configuration |

### 9.2 Enforcement Points (Future)

- **GraphQL resolver**: Filter available scopes by user's roles
- **SearchEngine**: Validate user has `CanSearch` before executing scoped search
- **Search UI**: Only show scopes the user has access to
- **Agent action**: Validate the agent's contextUser has access to the requested scope

### 9.3 UX Considerations (Future)

- Users see only scopes they have permission to use
- Search results within a scope are STILL filtered by entity/row-level permissions (this already exists)
- Scope permissions add a coarser layer: "can this user even search this corpus?"
- Admin UI for managing scope permissions (role assignment)

---

## 10. Existing System Touchpoints

### 10.1 Files That Need Modification

| File | Change |
|------|--------|
| `packages/SearchEngine/src/generic/search.types.ts` | Add `ScopeIDs` to `SearchParams`, add `ScopeConstraints` type |
| `packages/SearchEngine/src/generic/SearchEngine.ts` | Add scope resolution logic to `Search()`, pass constraints to providers |
| `packages/SearchEngine/src/generic/ISearchProvider.ts` | Add optional `scopeConstraints` param to `search()` method |
| `packages/SearchEngine/src/generic/VectorSearchProvider.ts` | Filter vector indexes by scope constraints |
| `packages/SearchEngine/src/generic/EntitySearchProvider.ts` | Filter entities by scope constraints, apply ExtraFilter and UserSearchString |
| `packages/SearchEngine/src/generic/FullTextSearchProvider.ts` | Filter entities by scope constraints |
| `packages/SearchEngine/src/generic/StorageSearchProvider.ts` | Filter storage accounts by scope constraints |
| `packages/SearchEngine/src/generic/SearchFusion.ts` | Add cross-scope fusion method |
| `packages/MJCoreEntities/src/engines/SearchEngineBase.ts` | Add scope metadata caching |
| `packages/AI/Agents/src/base-agent.ts` | Add `InjectPreExecutionRAG()` to Phase 2 |
| `packages/AI/Agents/src/agent-pre-execution-rag.ts` | NEW — pre-execution RAG module |
| `packages/Actions/CoreActions/src/custom/search/scoped-search.action.ts` | NEW — scoped search action |
| `packages/Angular/Generic/search/src/lib/` | Add scope selector component, update search service |
| `packages/MJServer/src/resolvers/` | Update search resolver to accept `scopeIDs` |

### 10.2 Database Migration

Single migration file creates all new tables and adds the `SearchScopeAccess` column to `AIAgent`.

### 10.3 Metadata Sync

Seed data for:
- The "Global" SearchScope record
- The `__Scoped_Search` Action and its parameters
- Template for default search query generation (optional)

### 10.4 CodeGen

After migration runs, CodeGen will generate:
- Entity subclasses for all new entities
- GraphQL resolvers for CRUD operations
- Angular form components

---

## 11. Documentation Requirements

### 11.1 Architecture Guide

Create a guide at `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` covering:

1. **The Three Context Subsystems** — Clear explanation of when to use each:
   - Notes & Examples (brain) vs. Data Sources (briefing) vs. Search Scopes (research library)
   - Decision tree for choosing the right subsystem
   - Examples of correct and incorrect usage

2. **Search Scope Configuration** — How to create and configure scopes:
   - Creating scopes (org-wide vs personal)
   - Adding providers, indexes, entities, storage accounts
   - Time-windowed activation
   - Advanced ScopeConfig options

3. **Agent Integration** — How to connect scopes to agents:
   - Pre-execution RAG setup
   - Agent-invoked search setup
   - Template creation for query generation
   - SearchScopeAccess settings

4. **Multi-Scope Fusion** — How results from multiple scopes are combined

5. **Permissions** (Phase 2 preview) — What's coming for scope-level access control

### 11.2 Inline Code Documentation

All new classes, methods, and interfaces must have TSDoc comments explaining:
- Purpose and behavior
- Parameters and return values
- Integration points with existing systems
- Examples where helpful

---

## 12. Task Breakdown

### Phase 1A: Entity Model & Database (Foundation)

- [ ] **1A.1** Write SQL migration creating `SearchScope` table with all columns, constraints, and extended properties
- [ ] **1A.2** Write SQL migration creating `SearchScopeProvider` table with FK constraints and unique constraint
- [ ] **1A.3** Write SQL migration creating `SearchScopeVectorIndex` table with FK constraints and unique constraint
- [ ] **1A.4** Write SQL migration creating `SearchScopeEntity` table with FK constraints and unique constraint (includes `ExtraFilter` and `UserSearchString` columns)
- [ ] **1A.5** Write SQL migration creating `SearchScopeStorageAccount` table with FK constraints and unique constraint
- [ ] **1A.6** Write SQL migration creating `AIAgentSearchScope` table with all columns, FK constraints, CHECK constraints
- [ ] **1A.7** Write SQL migration adding `SearchScopeAccess` column (nvarchar(20), NOT NULL, DEFAULT 'None', CHECK constraint) to `AIAgent` table
- [ ] **1A.8** Consolidate migrations 1A.1–1A.7 into a single migration file following MJ naming convention: `VYYYYMMDDHHMM__v[VERSION].x_Add_Search_Scopes_And_Agent_Integration.sql`. Remember: do NOT include `__mj_CreatedAt`/`__mj_UpdatedAt` columns or FK indexes — CodeGen handles those.
- [ ] **1A.9** Run migration and CodeGen to generate entity subclasses, GraphQL resolvers, and Angular form components
- [ ] **1A.10** Create metadata sync seed data for the "Global" SearchScope record (`IsGlobal=1`, `IsDefault=1`, `Status='Active'`)
- [ ] **1A.11** Verify generated entity classes in `entity_subclasses.ts` have correct types and relationships

### Phase 1B: SearchEngine Scope Resolution (Core Engine)

- [ ] **1B.1** Add `ScopeIDs?: string[]` to `SearchParams` interface in `search.types.ts`
- [ ] **1B.2** Add `ScopeConstraints` interface and sub-interfaces (`ScopeEntityConstraint`, `ScopeStorageConstraint`) to `search.types.ts`
- [ ] **1B.3** Add optional `scopeConstraints?: ScopeConstraints` parameter to `BaseSearchProvider.search()` in `ISearchProvider.ts`
- [ ] **1B.4** Add scope metadata loading and caching to `SearchEngineBase.ts` — load `SearchScope` + child tables, cache like provider metadata
- [ ] **1B.5** Implement scope resolution in `SearchEngine.Search()` — when `ScopeIDs` provided, load scope configs and build `ScopeConstraints` for each provider
- [ ] **1B.6** Handle Global scope behavior — when scope `IsGlobal=true` or `ScopeIDs` is empty/undefined, run with no constraints (backward compatible)
- [ ] **1B.7** Modify `VectorSearchProvider.search()` to accept `scopeConstraints` and filter vector indexes by `VectorIndexIDs` when provided
- [ ] **1B.8** Modify `EntitySearchProvider.search()` to accept `scopeConstraints` and filter entities by `ScopeEntityConstraint` list. Apply `ExtraFilter` and `UserSearchString` overrides per entity.
- [ ] **1B.9** Modify `FullTextSearchProvider.search()` to accept `scopeConstraints` and filter entities by scope
- [ ] **1B.10** Modify `StorageSearchProvider.search()` to accept `scopeConstraints` and filter by storage account IDs and folder paths
- [ ] **1B.11** Add `CrossScopeFusion()` method to `SearchFusion.ts` — takes `Map<string, SearchResultItem[]>` (scopeId → results), applies RRF using existing `ComputeRRF()` utility, deduplicates
- [ ] **1B.12** Integrate cross-scope fusion into `SearchEngine.Search()` flow — when multiple scopes, fuse per-scope results before proceeding to dedup/permissions/enrich
- [ ] **1B.13** Write unit tests for scope resolution logic — test: single scope, multiple scopes, global scope, empty scope, inactive scope, time-windowed scope
- [ ] **1B.14** Write unit tests for cross-scope RRF fusion — test: non-overlapping results, overlapping results, single scope (no cross-fusion needed)
- [ ] **1B.15** Write unit tests for each provider's scope constraint handling — test: VectorSearchProvider with/without index filter, EntitySearchProvider with ExtraFilter and UserSearchString, etc.
- [ ] **1B.16** Build the `SearchEngine` package (`cd packages/SearchEngine && npm run build`) and verify no compilation errors

### Phase 1C: Agent Pre-Execution RAG

- [ ] **1C.1** Create `packages/AI/Agents/src/agent-pre-execution-rag.ts` — `AgentPreExecutionRAG` class with `Execute()` method
- [ ] **1C.2** Implement scope loading: load `AIAgentSearchScope` rows for agent where `Phase IN ('PreExecution', 'Both')`, filter by Status/StartAt/EndAt, sort by Priority
- [ ] **1C.3** Implement query generation: for each scope, render `QueryTemplateID` using MJ TemplateEngine with conversation context variables (lastUserMessage, recentMessages, payload, scope metadata). If no template, use lastUserMessage.
- [ ] **1C.4** Implement search execution: call `SearchEngine.Search()` with `ScopeIDs: [scopeId]` for each scope, respecting MaxResults and MinScore overrides
- [ ] **1C.5** Implement cross-scope fusion for pre-execution: if multiple scopes produced results, use `SearchFusion.CrossScopeFusion()` to merge
- [ ] **1C.6** Implement result formatting: format search results into a `<retrieved_context>` system message block. Include scope name, result count, score range. Each result shows title, snippet, score, source type, entity, tags.
- [ ] **1C.7** In `base-agent.ts`, add `InjectPreExecutionRAG()` method that calls `AgentPreExecutionRAG.Execute()` and injects the formatted system message via `conversationMessages.unshift()`
- [ ] **1C.8** In `base-agent.ts`, add `InjectPreExecutionRAG()` call to Phase 2 `Promise.all()` block (alongside config load, data preload, context injection)
- [ ] **1C.9** Store RAG context in a `_ragContext` property on BaseAgent (similar to `_memoryContext`) for inclusion in agent run results/observability
- [ ] **1C.10** Write unit tests for `AgentPreExecutionRAG` — test: no scopes configured (no-op), single scope, multiple scopes, time-windowed scope filtering, template rendering, template fallback (null template → lastUserMessage)
- [ ] **1C.11** Write unit tests for integration with BaseAgent Phase 2 — test: RAG injection happens in parallel, results appear in conversation messages
- [ ] **1C.12** Build the Agents package (`cd packages/AI/Agents && npm run build`) and verify no compilation errors

### Phase 1D: Scoped Search Action

- [ ] **1D.1** Create `packages/Actions/CoreActions/src/custom/search/scoped-search.action.ts` — `ScopedSearchAction` class registered as `__Scoped_Search`
- [ ] **1D.2** Implement parameter extraction: `query` (required), `scopeid` (optional), `maxresults` (optional, default 25), `minscore` (optional, default 0)
- [ ] **1D.3** Implement agent identification: extract the calling agent's ID from the action params context (study how existing actions get agent context)
- [ ] **1D.4** Implement scope access enforcement:
  - Load agent's `SearchScopeAccess` field
  - `'None'` → reject with error message
  - `'Assigned'` → load `AIAgentSearchScope` rows where `Phase IN ('AgentInvoked', 'Both')` AND active AND within time window. Validate requested scopeid is in allowed list. If no scopeid, use IsDefault or first by Priority.
  - `'All'` → allow any scope. If no scopeid, use Global.
- [ ] **1D.5** Call `SearchEngine.Search()` with resolved `ScopeIDs` and return results in same format as existing `SearchAction`
- [ ] **1D.6** Create metadata sync records for the `__Scoped_Search` Action entity and its Action Params (query, scopeid, maxresults, minscore)
- [ ] **1D.7** Implement agent scope awareness injection: create a helper that generates a text description of the agent's available scopes (name, ID, description) for inclusion in the agent's system prompt or tool description
- [ ] **1D.8** Write unit tests for `ScopedSearchAction` — test: missing query, SearchScopeAccess='None' rejection, 'Assigned' with valid scope, 'Assigned' with disallowed scope, 'All' pass-through, time-windowed scope filtering, default scope selection
- [ ] **1D.9** Build the CoreActions package (`cd packages/Actions/CoreActions && npm run build`) and verify no compilation errors

### Phase 1E: GraphQL & Angular UI

- [ ] **1E.1** Update the search GraphQL resolver to accept `scopeIDs` parameter and pass to `SearchEngine.Search()`
- [ ] **1E.2** Add `searchScopes` GraphQL query that returns available scopes for the current user (all scopes in Phase 1; permission-filtered in Phase 2)
- [ ] **1E.3** Update `SearchService` in `packages/Angular/Generic/search/src/lib/search.service.ts` to accept and pass `scopeIDs` in search requests
- [ ] **1E.4** Create `SearchScopeSelectorComponent` in `packages/Angular/Generic/search/` — dropdown/chip selector for choosing scopes. Loads scopes from `searchScopes` query. Emits selected scope IDs. Uses MJ UI components (`mj-dropdown` or `mj-combobox`). Uses design tokens (no hardcoded colors).
- [ ] **1E.5** Integrate scope selector into `SearchCompositeComponent` (or equivalent top-level search UI) — scope selector appears next to search input
- [ ] **1E.6** Update `SearchInputComponent` to show active scope name/chip when a non-Global scope is selected
- [ ] **1E.7** Test the full UI flow: load scopes → select scope → search → verify scoped results
- [ ] **1E.8** Build the Angular search package and verify no compilation errors

### Phase 1F: Documentation & Testing

- [ ] **1F.1** Create `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` — comprehensive guide covering: the three context subsystems (brain vs briefing vs research library), search scope configuration, agent integration, template creation, multi-scope fusion
- [ ] **1F.2** Add inline TSDoc comments to all new classes, methods, and interfaces
- [ ] **1F.3** Update `plans/search/search-plan.md` or create a cross-reference noting that Search Scopes extend the universal search architecture
- [ ] **1F.4** End-to-end integration test: create a test scope with specific entities and vector indexes, run a search through the scope, verify only scoped results are returned
- [ ] **1F.5** End-to-end agent test: configure an agent with a pre-execution RAG scope, run the agent, verify RAG context appears in conversation messages and agent run step records
- [ ] **1F.6** End-to-end scoped action test: configure an agent with `SearchScopeAccess='Assigned'` and specific scopes, invoke the scoped search action, verify scope enforcement works
- [ ] **1F.7** Performance test: verify pre-execution RAG does not add latency beyond what's already consumed by Phase 2 parallel tasks (it should be "free" since it runs in parallel)

### Phase 2 (Future): Permissions

- [ ] **2.1** Create `SearchScopePermission` entity with migration
- [ ] **2.2** Implement permission checking in SearchEngine and GraphQL resolver
- [ ] **2.3** Update Angular scope selector to filter by user permissions
- [ ] **2.4** Add admin UI for managing scope permissions
- [ ] **2.5** Update scoped search action to validate contextUser has scope access

---

## Appendix A: Entity Relationship Diagram

```
┌──────────────────┐     ┌────────────────────────┐
│   SearchScope    │     │   MJ: Search Providers  │
│──────────────────│     │────────────────────────│
│ ID               │     │ ID                      │
│ Name             │     │ Name                    │
│ Description      │     │ DriverClass             │
│ Icon             │     │ Priority                │
│ IsGlobal         │     │ SupportsPreview         │
│ IsDefault        │     └────────────┬─────────────┘
│ OwnerUserID ──FK─┼──→ User                │
│ Status           │                        │
│ StartAt          │     ┌──────────────────┤
│ EndAt            │     │                  │
│ ScopeConfig      │     │  SearchScopeProvider
└──────┬───────────┘     │  ├ SearchScopeID ──FK──→ SearchScope
       │                 │  ├ SearchProviderID ─FK─→ Search Providers
       │                 │  ├ Enabled
       │                 │  ├ MaxResultsOverride
       │                 │  └ ProviderConfigOverride
       │
       ├─── SearchScopeVectorIndex
       │    ├ SearchScopeID ──FK──→ SearchScope
       │    └ VectorIndexID ──FK──→ MJ: Vector Indexes
       │
       ├─── SearchScopeEntity
       │    ├ SearchScopeID ──FK──→ SearchScope
       │    ├ EntityID ──FK──→ Entity
       │    ├ ExtraFilter
       │    └ UserSearchString
       │
       ├─── SearchScopeStorageAccount
       │    ├ SearchScopeID ──FK──→ SearchScope
       │    ├ FileStorageAccountID ──FK──→ File Storage Accounts
       │    └ FolderPath
       │
       └─── AIAgentSearchScope
            ├ AgentID ──FK──→ AI Agents
            ├ SearchScopeID ──FK──→ SearchScope
            ├ Phase ('PreExecution'|'AgentInvoked'|'Both')
            ├ Status, StartAt, EndAt
            ├ Priority, MaxResults, MinScore
            ├ QueryTemplateID ──FK──→ Templates
            └ IsDefault


AI Agents (modified)
├ ... existing fields ...
└ SearchScopeAccess ('All'|'Assigned'|'None')  ← NEW
```

## Appendix B: Key File Reference

| System | File | Purpose |
|--------|------|---------|
| Search Engine | `packages/SearchEngine/src/generic/SearchEngine.ts` | Orchestrates all search providers, RRF fusion |
| Search Types | `packages/SearchEngine/src/generic/search.types.ts` | SearchParams, SearchFilters, SearchResult interfaces |
| Provider Base | `packages/SearchEngine/src/generic/ISearchProvider.ts` | BaseSearchProvider abstract class |
| Vector Provider | `packages/SearchEngine/src/generic/VectorSearchProvider.ts` | Semantic/vector search via embeddings |
| Entity Provider | `packages/SearchEngine/src/generic/EntitySearchProvider.ts` | LIKE-based entity field search via RunView + UserSearchString |
| FT Provider | `packages/SearchEngine/src/generic/FullTextSearchProvider.ts` | Database FTS (FREETEXT/tsvector) |
| Storage Provider | `packages/SearchEngine/src/generic/StorageSearchProvider.ts` | File storage search |
| Search Fusion | `packages/SearchEngine/src/generic/SearchFusion.ts` | RRF fusion and deduplication |
| Engine Base | `packages/MJCoreEntities/src/engines/SearchEngineBase.ts` | Metadata caching for search providers |
| RRF Utility | `@memberjunction/core` → `ComputeRRF()` | Reusable RRF function |
| Search Action | `packages/Actions/CoreActions/src/custom/search/search.action.ts` | Existing search action for agents |
| Base Agent | `packages/AI/Agents/src/base-agent.ts` | Agent execution lifecycle, Phase 2 parallel init |
| Context Injector | `packages/AI/Agents/src/agent-context-injector.ts` | Notes/examples injection (pattern to follow for RAG) |
| Data Preloader | `packages/AI/Agents/src/AgentDataPreloader.ts` | Static data loading for agents |
| Template Engine | `packages/Templates/engine/src/TemplateEngine.ts` | Nunjucks-based template rendering |
| AI Prompt Runner | `packages/AI/Prompts/src/AIPromptRunner.ts` | Template-backed prompt execution |
| Search Service (Angular) | `packages/Angular/Generic/search/src/lib/search.service.ts` | Angular search client |
| Entity Subclasses | `packages/MJCoreEntities/src/generated/entity_subclasses.ts` | Generated entity classes (for entity name lookup) |
| DB Provider | `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` | `createViewUserSearchSQL()` — how UserSearchString becomes SQL |
