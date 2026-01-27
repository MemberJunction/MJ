# API Scopes Comprehensive Implementation Plan

## Document Status
- **Version**: 1.0
- **Date**: January 27, 2026
- **Status**: Draft - Pending Review

---

## Executive Summary

This plan covers the complete implementation of API scope authorization across MemberJunction. It includes:

1. **Metadata Updates**: New scopes and application ceilings
2. **MCP Server Fixes**: Scope validation for 16 unprotected tools
3. **A2A Server Fixes**: Scope validation for 5 unprotected operations
4. **MJAPI Generic Authorization**: Base class integration for all resolvers
5. **Report Deprecation**: Stub implementations throwing deprecated errors

---

## Part 1: Scope Hierarchy Definition

### Current Scopes (Already Defined)
```
entity, entity:create, entity:read, entity:update, entity:delete
view, view:run
query, query:run
agent, agent:execute
action, action:execute
prompt, prompt:execute
```

### New Scopes to Add

#### Full Access Scope (God Power)

| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `full_access` | Admin | - | **DANGER**: Grants unrestricted access to all operations. Use with extreme caution. |

**WARNING**: The `full_access` scope bypasses all other scope checks. When assigned to an API key:
- The key can perform ANY operation the associated user has permission to do
- This is equivalent to having all scopes with `*` pattern
- Should only be used for trusted system integrations
- Must display prominent warning when adding to an API key

**Implementation Note**: When `full_access` scope is detected, skip all other scope checks and allow the operation (subject to normal user permissions).

#### Agent Monitoring & Control
| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `agent:monitor` | Agents | Agent | Read agent run status, history, and step details |
| `agent:cancel` | Agents | Agent | Cancel running agent executions |

#### Entity Extended Operations
| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `entity:merge` | Entities | Entity | Merge duplicate records |

#### Task Operations
| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `task` | Tasks | - | Parent scope for task operations |
| `task:read` | Tasks | Task | Read task status and history |
| `task:execute` | Tasks | Task | Execute task graphs |
| `task:cancel` | Tasks | Task | Cancel running tasks |

#### Template Operations
| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `template` | Templates | - | Parent scope for template operations |
| `template:execute` | Templates | Template | Render/execute templates |

#### Data Context Operations
| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `datacontext` | DataContexts | - | Parent scope for data context operations |
| `datacontext:read` | DataContexts | DataContext | Load data context items |

#### Dataset Operations
| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `dataset` | Datasets | - | Parent scope for dataset operations |
| `dataset:read` | Datasets | Dataset | Load datasets |

#### Communication Operations
| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `communication` | Communication | - | Parent scope for communication operations |
| `communication:send` | Communication | Communication | Send emails/messages |

#### Embedding Operations
| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `embedding` | Embeddings | - | Parent scope for embedding operations |
| `embedding:generate` | Embeddings | Embedding | Generate text embeddings |

#### API Key Management
| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `apikey` | APIKeys | - | Parent scope for API key operations |
| `apikey:create` | APIKeys | APIKey | Create new API keys |
| `apikey:revoke` | APIKeys | APIKey | Revoke API keys |

#### User Operations
| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `user` | Users | - | Parent scope for user operations |
| `user:read` | Users | User | Read user information |

#### Metadata Discovery (Strongly Typed)
| Scope Path | Category | Resource Type | Description |
|------------|----------|---------------|-------------|
| `metadata` | Metadata | - | Parent scope for metadata operations |
| `metadata:entities` | Metadata | - | Parent for entity metadata |
| `metadata:entities:read` | Metadata | Entity | Read entity schema/metadata |
| `metadata:actions` | Metadata | - | Parent for action metadata |
| `metadata:actions:read` | Metadata | Action | Discover/read action definitions |
| `metadata:agents` | Metadata | - | Parent for agent metadata |
| `metadata:agents:read` | Metadata | Agent | Discover/read agent definitions |
| `metadata:prompts` | Metadata | - | Parent for prompt metadata |
| `metadata:prompts:read` | Metadata | Prompt | Discover/read prompt definitions |
| `metadata:queries` | Metadata | - | Parent for query metadata |
| `metadata:queries:read` | Metadata | Query | Discover/read query definitions |
| `metadata:communication` | Metadata | - | Parent for communication metadata |
| `metadata:communication:read` | Metadata | Communication | Read communication provider info |

---

## Part 2: Application Scope Ceilings Update

### MJAPI Application Ceiling
MJAPI gets all scopes with `*` pattern (full access ceiling):
- `full_access` (the god power scope)
- All existing scopes
- All new scopes listed above

### MCPServer Application Ceiling

**Add these new scope ceilings for MCPServer:**

| Scope | Pattern | Notes |
|-------|---------|-------|
| `agent:monitor` | `*` | For diagnostic tools |
| `agent:cancel` | `*` | For Cancel_Agent_Run |
| `entity:create` | `*` | For Create_Record tools |
| `entity:update` | `*` | For Update_Record tools |
| `entity:delete` | `*` | For Delete_Record tools |
| `metadata:entities:read` | `*` | For entity discovery |
| `metadata:actions:read` | `*` | For action discovery |
| `metadata:agents:read` | `*` | For agent discovery |
| `metadata:prompts:read` | `*` | For prompt discovery |
| `metadata:queries:read` | `*` | For query discovery |
| `metadata:communication:read` | `*` | For provider discovery |
| `communication:send` | `*` | For Send_Email (future) |

### A2AServer Application Ceiling

**Add these new scope ceilings for A2AServer:**

| Scope | Pattern | Notes |
|-------|---------|-------|
| `entity:read` | `*` | For GET operations |
| `entity:create` | `*` | For CREATE operations |
| `entity:update` | `*` | For UPDATE operations |
| `entity:delete` | `*` | For DELETE operations |
| `view:run` | `*` | For QUERY operations |
| `agent:monitor` | `*` | For getAgentRunStatus |
| `agent:cancel` | `*` | For cancelAgentRun |
| `metadata:agents:read` | `*` | For discoverAgents |
| `task:read` | `*` | For GET /tasks/:taskId |
| `task:cancel` | `*` | For POST /tasks/:taskId/cancel |

---

## Part 3: MCP Server Implementation

### Tools Requiring Scope Validation

#### Discovery/Metadata Tools (9 tools)

| Tool | Location | Scope | Resource |
|------|----------|-------|----------|
| `Get_Entity_List` | Server.ts:547-557 | `metadata:entities:read` | `*` (static) |
| `Get_Single_Entity` | Server.ts:560-580 | `metadata:entities:read` | Entity name (dynamic) |
| `Get_Database_Schema` | Server.ts:1869-1909 | `metadata:entities:read` | `*` (static) |
| `Discover_Actions` | Server.ts:970-991 | `metadata:actions:read` | `*` (static) |
| `Get_Action_Params` | Server.ts:1073-1110 | `metadata:actions:read` | Action name (dynamic) |
| `Discover_Agents` | Server.ts:1286-1303 | `metadata:agents:read` | `*` (static) |
| `Discover_Prompts` | Server.ts:1962-2006 | `metadata:prompts:read` | `*` (static) |
| `Discover_Queries` | Server.ts:1756-1810 | `metadata:queries:read` | `*` (static) |
| `Get_Communication_Providers` | Server.ts:2131-2150 | `metadata:communication:read` | `*` (static) |

#### Diagnostic/Monitoring Tools (6 tools)

| Tool | Location | Scope | Resource |
|------|----------|-------|----------|
| `List_Recent_Agent_Runs` | Server.ts:1498-1536 | `agent:monitor` | Agent name or `*` (dynamic) |
| `Get_Agent_Run_Summary` | Server.ts:1539-1607 | `agent:monitor` | Run ID (dynamic) |
| `Get_Agent_Run_Step_Detail` | Server.ts:1610-1672 | `agent:monitor` | Run ID (dynamic) |
| `Get_Agent_Run_Step_Full_Data` | Server.ts:1671-1733 | `agent:monitor` | Run ID (dynamic) |
| `Get_Agent_Run_Status` | Server.ts:1419-1445 | `agent:monitor` | Run ID (dynamic) |
| `Cancel_Agent_Run` | Server.ts:1451-1489 | `agent:cancel` | Run ID (dynamic) |

#### Communication Tools (1 tool)

| Tool | Location | Scope | Resource |
|------|----------|-------|----------|
| `Send_Email` | Server.ts:2103-2128 | `communication:send` | Provider name (dynamic) |

### Implementation Pattern

Each tool needs a `scopeInfo` property added to its config:

```typescript
// Static scope (for discovery tools)
scopeInfo: { scopePath: 'metadata:entities:read', resource: '*' }

// Dynamic scope (for operation tools)
scopeInfo: (params: ToolParams) => ({
    scopePath: 'agent:monitor',
    resource: params.agentName || params.runId || '*'
})
```

---

## Part 4: A2A Server Implementation

### Operations Requiring Scope Validation

#### Endpoint-Level Gaps

| Endpoint | Method | Location | Scope | Resource |
|----------|--------|----------|-------|----------|
| `/a2a/tasks/:taskId` | GET | Server.ts:338-353 | `task:read` | Task ID |
| `/a2a/tasks/:taskId/cancel` | POST | Server.ts:356-374 | `task:cancel` | Task ID |

#### Operation-Level Gaps (in processTask)

| Operation | Location | Scope | Resource |
|-----------|----------|-------|----------|
| `discoverAgents` | AgentOperations.ts:32-77 | `metadata:agents:read` | `*` |
| `getAgentRunStatus` | AgentOperations.ts:144-185 | `agent:monitor` | Run ID |
| `cancelAgentRun` | AgentOperations.ts:192-238 | `agent:cancel` | Run ID |

### Implementation Pattern

Add to `processTask()` scope mapping (Server.ts ~lines 756-763):

```typescript
const operationToScope: Record<string, string> = {
    // Existing
    'get': 'entity:read',
    'create': 'entity:create',
    'update': 'entity:update',
    'delete': 'entity:delete',
    'query': 'view:run',
    'runView': 'view:run',

    // New
    'discoverAgents': 'metadata:agents:read',
    'getAgentRunStatus': 'agent:monitor',
    'cancelAgentRun': 'agent:cancel',
};
```

For endpoints, add authorization check in the route handlers before processing.

---

## Part 5: MJAPI Generic Authorization

### Default Behavior: Auto-Deny for Keys Without Scopes

**IMPORTANT**: API keys with no scopes assigned will be **automatically denied** access to all operations.

This means:
- A newly created API key with no scopes can do **nothing**
- Users must explicitly grant scopes to enable operations
- The `full_access` scope can be used as a "god power" for full access (with warnings)

**Implementation**: Update `APIKeyEngineConfig.defaultBehaviorNoScopes` from `'allow'` to `'deny'`.

**File to Update**: `packages/APIKeys/src/APIKeyEngine.ts` - change the default config value.

### Key Finding: API Key Detection

**UserPayload** (types.ts lines 14-17):
```typescript
type UserPayload = {
  // ... other fields
  apiKeyId?: string;       // ID of the MJ API key
  apiKeyHash?: string;     // SHA-256 hash for scope authorization
};
```

**Detection Logic:**
- `apiKeyHash` is **ONLY** set when API key auth is used (context.ts lines 105-111)
- For OAuth/JWT auth, `apiKeyHash` is `undefined` (context.ts line 191)
- **Conclusion**: `if (userPayload.apiKeyHash)` → API key auth → check scopes

### Implementation Strategy

#### Option A: Add to ResolverBase (Recommended)

Add a new protected method to `ResolverBase`:

```typescript
/**
 * Checks API key scope authorization. Only performs check if request
 * was authenticated via API key (apiKeyHash present in userPayload).
 * For OAuth/JWT auth, this is a no-op.
 *
 * @param scopePath - The scope path (e.g., 'entity:read', 'agent:execute')
 * @param resource - The resource name (e.g., entity name, agent name)
 * @param userPayload - The user payload from context
 * @throws AuthorizationError if API key lacks required scope
 */
protected async CheckAPIKeyScopeAuthorization(
    scopePath: string,
    resource: string,
    userPayload: UserPayload
): Promise<void> {
    // Skip scope check for OAuth/JWT auth (no API key)
    if (!userPayload.apiKeyHash) {
        return;
    }

    // Get system user for authorization call
    // NOTE: We use system user here because Authorize() needs to run internal
    // database queries (loading scope rules, logging decisions). The system user
    // ensures these queries work regardless of what permissions the API key's
    // user has. The API key's associated user (in userPayload.userRecord) is
    // used later when the actual operation executes - their permissions are
    // the ultimate ceiling that scopes can only narrow, never expand.
    const systemUser = UserCache.Instance.Users.find(u => u.Type === 'System');
    if (!systemUser) {
        throw new Error('System user not found');
    }

    const apiKeyEngine = GetAPIKeyEngine();

    // Check for full_access scope first (god power - bypasses all other checks)
    const fullAccessResult = await apiKeyEngine.Authorize(
        userPayload.apiKeyHash,
        'MJAPI',
        'full_access',
        '*',
        systemUser,
        { Endpoint: '/graphql', Method: 'POST' }
    );

    if (fullAccessResult.Allowed) {
        // full_access granted - skip specific scope check
        return;
    }

    // Check specific scope
    const result = await apiKeyEngine.Authorize(
        userPayload.apiKeyHash,
        'MJAPI',
        scopePath,
        resource,
        systemUser,
        {
            Endpoint: '/graphql',
            Method: 'POST'
        }
    );

    if (!result.Allowed) {
        // Provide specific, actionable error message
        throw new AuthorizationError(
            `Access denied. This API key requires the '${scopePath}' scope ` +
            `for resource '${resource}' to perform this operation. ` +
            `Please update the API key's scopes or use an API key with appropriate permissions. ` +
            `Denial reason: ${result.Reason}`
        );
    }
}
```

#### Integration Points in ResolverBase

**1. View Operations (RunViewGenericInternal, ~line 530)**

Add scope check before executing view:
```typescript
// Add after line 551 (after null checks)
await this.CheckAPIKeyScopeAuthorization('view:run', viewInfo.Entity, userPayload);
```

**2. Create Operation (CreateRecord, ~line 910)**

Add scope check at start:
```typescript
// Add after line 911 (after BeforeCreate)
await this.CheckAPIKeyScopeAuthorization('entity:create', entityName, userPayload);
```

**3. Update Operation (UpdateRecord, ~line 942)**

Add scope check at start:
```typescript
// Add after line 943 (after BeforeUpdate)
await this.CheckAPIKeyScopeAuthorization('entity:update', entityName, userPayload);
```

**4. Delete Operation (DeleteRecord, ~line 1197)**

Add scope check at start:
```typescript
// Add after line 1205 (after BeforeDelete)
await this.CheckAPIKeyScopeAuthorization('entity:delete', entityName, userPayload);
```

### Error Message Format

Scope denial errors will be **specific and actionable**:

```
Access denied. This API key requires the '{scopePath}' scope for resource '{resource}'
to perform this operation. Please update the API key's scopes or use an API key with
appropriate permissions. Denial reason: {reason}
```

**Example error messages:**

```
Access denied. This API key requires the 'entity:read' scope for resource 'Users'
to perform this operation. Please update the API key's scopes or use an API key
with appropriate permissions. Denial reason: No matching scope rule found.

Access denied. This API key requires the 'agent:execute' scope for resource 'SkipAnalysisAgent'
to perform this operation. Please update the API key's scopes or use an API key
with appropriate permissions. Denial reason: Resource pattern 'Skip*' does not match.
```

This approach:
- Clearly states what scope is needed
- Identifies the specific resource
- Provides actionable guidance (update scopes or use different key)
- Includes the underlying denial reason for debugging

#### Benefits of This Approach

1. **Zero CodeGen Changes**: All generated resolvers inherit from ResolverBase
2. **Automatic Coverage**: All entity CRUD + RunView operations protected
3. **Backward Compatible**: OAuth/JWT requests continue working unchanged
4. **Single Location**: One place to maintain scope checking logic
5. **Extensible**: Custom resolvers can call the same method

### Custom Resolver Updates

For custom resolvers that need specific scope checks, they call the method explicitly:

```typescript
// In ActionResolver
@Mutation(() => RunActionResultType)
async RunAction(...) {
    await this.CheckAPIKeyScopeAuthorization('action:execute', actionName, userPayload);
    // ... rest of implementation
}

// In RunAIAgentResolver
@Mutation(() => RunAIAgentResult)
async RunAIAgent(...) {
    await this.CheckAPIKeyScopeAuthorization('agent:execute', agentName, userPayload);
    // ... rest of implementation
}
```

### Custom Resolvers Requiring Updates

| Resolver | Operations | Scope |
|----------|------------|-------|
| `ActionResolver` | RunAction, RunEntityAction | `action:execute` |
| `RunAIAgentResolver` | RunAIAgent, RunAIAgentFromConversation | `agent:execute` |
| `RunAIPromptResolver` | RunAIPrompt, ExecuteSimplePrompt | `prompt:execute` |
| `RunAIPromptResolver` | EmbedText | `embedding:generate` |
| `QueryResolver` | GetQueryData, RunQueries | `query:run` |
| `GetDataContextDataResolver` | GetDataContextItemData, GetDataContextData | `datacontext:read` |
| `RunTemplateResolver` | RunTemplate | `template:execute` |
| `TaskResolver` | ExecuteTaskGraph | `task:execute` |
| `DatasetResolver` | GetDatasetByName | `dataset:read` |
| `MergeRecordsResolver` | MergeRecords | `entity:merge` |
| `APIKeyResolver` | CreateAPIKey | `apikey:create` |
| `APIKeyResolver` | RevokeAPIKey | `apikey:revoke` |
| `EntityCommunicationsResolver` | RunEntityCommunication | `communication:send` |
| `UserResolver` | UserByID, UserByEmployeeID, UserByEmail | `user:read` |

**Note on UserResolver**: Currently has **NO scope checks at all**. The `CurrentUser` query should NOT require scope (returns authenticated user's own info), but `UserByID`, `UserByEmployeeID`, and `UserByEmail` should require `user:read` scope when accessed via API key.

---

## Part 6: Angular UI - API Key Dashboard Warnings

### Location
`packages/Angular/Generic/dashboards/src/lib/api-keys/`

### Required UX Enhancements

#### 1. Empty Scopes Warning (On Create/Save)
When a user creates or saves an API key with **NO scopes assigned**:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️  Warning: No Scopes Assigned                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  This API key has no scopes assigned and will NOT be able to   │
│  perform any operations. API keys require explicit scopes to    │
│  access MemberJunction resources.                               │
│                                                                 │
│  Would you like to:                                             │
│                                                                 │
│  [ Add Scopes Now ]     [ Save Anyway (Key Will Be Inactive) ] │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 2. Full Access Scope Danger Warning
When a user attempts to add the `full_access` scope:

```
┌─────────────────────────────────────────────────────────────────┐
│  🚨 DANGER: Full Access Scope                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  You are about to grant UNRESTRICTED ACCESS to this API key.   │
│                                                                 │
│  The full_access scope allows this key to perform ANY           │
│  operation the associated user can perform, including:          │
│                                                                 │
│  • Read, create, update, and delete ALL entities                │
│  • Execute ALL agents, actions, and prompts                     │
│  • Access ALL queries and views                                 │
│  • Manage API keys and user data                                │
│                                                                 │
│  ⚠️  Only use this for trusted system integrations.             │
│                                                                 │
│  Type "CONFIRM" to proceed:  [____________]                     │
│                                                                 │
│  [ Cancel ]                            [ Grant Full Access ]    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation Notes:**
- The confirm button should be disabled until user types "CONFIRM"
- Log this action prominently in the audit trail
- Consider requiring admin role to add full_access scope

#### 3. Visual Indicators in Scope List
- Show `full_access` scope with red/danger styling
- Show warning icon next to keys with no scopes
- Show "god mode" badge on keys with full_access

### Files to Update
- `packages/Angular/Generic/dashboards/src/lib/api-keys/` - Main API keys dashboard component
- Add confirmation dialogs and warning components

---

## Part 7: Report Deprecation

### Files to Update

1. **ReportResolver.ts** (`packages/MJServer/src/resolvers/ReportResolver.ts`)

Replace implementations with deprecated stubs:

```typescript
@Query(() => ReportDataType)
async GetReportData(...): Promise<ReportDataType> {
    throw new Error(
        'DEPRECATED: GetReportData is deprecated. ' +
        'Reports have been replaced by Artifacts. ' +
        'Use the Artifacts API instead.'
    );
}

@Mutation(() => ReportEntity)
async CreateReportFromConversationDetailID(...): Promise<ReportEntity> {
    throw new Error(
        'DEPRECATED: CreateReportFromConversationDetailID is deprecated. ' +
        'Reports have been replaced by Artifacts. ' +
        'Use CreateArtifact instead.'
    );
}
```

2. **Remove from scope definitions**: Do not add `report:read` or `report:create` scopes

---

## Part 7: Implementation Order

### Phase 1: Configuration & Metadata Updates
- [x] 1.1 Update `packages/APIKeys/src/APIKeyEngine.ts` - change `defaultBehaviorNoScopes` to `'deny'` ✅
- [x] 1.2 Update `/metadata/api-scopes/.api-scopes.json` with new scope hierarchy (including `full_access`) ✅
- [x] 1.3 Update `/metadata/api-application-scopes/.api-application-scopes.json` with application ceilings ✅

### Phase 2: ResolverBase Update
- [x] 2.1 Add `CheckAPIKeyScopeAuthorization` method to ResolverBase ✅
- [x] 2.2 Add imports for `GetAPIKeyEngine` and `AuthorizationError` ✅
- [x] 2.3 Integrate calls into CreateRecord, UpdateRecord, DeleteRecord, RunViewGenericInternal ✅

### Phase 3: Custom Resolver Updates
- [ ] 3.1 ActionResolver - add scope check
- [ ] 3.2 RunAIAgentResolver - add scope check
- [ ] 3.3 RunAIPromptResolver - add scope checks (prompt + embedding)
- [ ] 3.4 QueryResolver - add scope check
- [ ] 3.5 GetDataContextDataResolver - add scope check
- [ ] 3.6 RunTemplateResolver - add scope check
- [ ] 3.7 TaskResolver - add scope check
- [ ] 3.8 DatasetResolver - add scope check
- [ ] 3.9 MergeRecordsResolver - add scope check
- [ ] 3.10 APIKeyResolver - add scope checks
- [ ] 3.11 EntityCommunicationsResolver - add scope check
- [ ] 3.12 UserResolver - add scope check
- [ ] 3.13 ReportResolver - add deprecation stubs

### Phase 4: MCP Server Updates
- [ ] 4.1 Add scopeInfo to discovery/metadata tools (9 tools)
- [ ] 4.2 Add scopeInfo to diagnostic/monitoring tools (6 tools)
- [ ] 4.3 Add scopeInfo to communication tools (1 tool)

### Phase 5: A2A Server Updates
- [ ] 5.1 Add authorization to GET /a2a/tasks/:taskId endpoint
- [ ] 5.2 Add authorization to POST /a2a/tasks/:taskId/cancel endpoint
- [ ] 5.3 Add scope mapping for discoverAgents operation
- [ ] 5.4 Add scope mapping for getAgentRunStatus operation
- [ ] 5.5 Add scope mapping for cancelAgentRun operation

### Phase 6: Angular UI - API Key Dashboard
- [ ] 6.1 Add empty scopes warning dialog
- [ ] 6.2 Add full_access danger confirmation dialog
- [ ] 6.3 Add visual indicators for scope status

### Phase 7: Server Architecture Evaluation
- [ ] 7.1 Evaluate current MCP, A2A, and MJAPI server separation
- [ ] 7.2 Analyze feasibility of unifying into a single deployable API with optional modules
- [ ] 7.3 Document findings, pros/cons, and recommendations

---

## Part 8: Testing Strategy

### Test Cases

1. **OAuth/JWT Auth - No Scope Check**
   - Authenticate with JWT
   - Access any resolver
   - Verify: No scope check, regular permissions apply

2. **API Key Auth - Scope Granted**
   - Create API key with `entity:read` for `Users`
   - RunView on Users entity
   - Verify: Access granted

3. **API Key Auth - Scope Denied**
   - Create API key with `entity:read` for `Users` only
   - RunView on Accounts entity
   - Verify: Access denied with clear error

4. **API Key Auth - No Scopes (Default Deny)**
   - Create API key with no scopes
   - Attempt any operation
   - Verify: Access denied with clear error message about missing scopes

5. **API Key Auth - Full Access Scope**
   - Create API key with `full_access` scope
   - Access various operations across all scope categories
   - Verify: All operations allowed (subject to user permissions)

5. **Application Ceiling Enforcement**
   - Create API key bound to MCPServer
   - Try to use via MJAPI
   - Verify: Key rejected for wrong application

---

## Part 9: Files to Modify Summary

| File | Changes |
|------|---------|
| `packages/APIKeys/src/APIKeyEngine.ts` | Change `defaultBehaviorNoScopes` from `'allow'` to `'deny'` |
| `metadata/api-scopes/.api-scopes.json` | Add ~26 new scope definitions (including `full_access`) |
| `metadata/api-application-scopes/.api-application-scopes.json` | Add ~30 new ceiling rules |
| `packages/MJServer/src/generic/ResolverBase.ts` | Add CheckAPIKeyScopeAuthorization method |
| `packages/MJServer/src/resolvers/ActionResolver.ts` | Add scope check |
| `packages/MJServer/src/resolvers/RunAIAgentResolver.ts` | Add scope check |
| `packages/MJServer/src/resolvers/RunAIPromptResolver.ts` | Add scope checks |
| `packages/MJServer/src/resolvers/QueryResolver.ts` | Add scope check |
| `packages/MJServer/src/resolvers/GetDataContextDataResolver.ts` | Add scope check |
| `packages/MJServer/src/resolvers/RunTemplateResolver.ts` | Add scope check |
| `packages/MJServer/src/resolvers/TaskResolver.ts` | Add scope check |
| `packages/MJServer/src/resolvers/DatasetResolver.ts` | Add scope check |
| `packages/MJServer/src/resolvers/MergeRecordsResolver.ts` | Add scope check |
| `packages/MJServer/src/resolvers/APIKeyResolver.ts` | Add scope checks |
| `packages/MJServer/src/resolvers/EntityCommunicationsResolver.ts` | Add scope check |
| `packages/MJServer/src/resolvers/UserResolver.ts` | Add scope check |
| `packages/MJServer/src/resolvers/ReportResolver.ts` | Add deprecation stubs |
| `packages/AI/MCPServer/src/Server.ts` | Add scopeInfo to 16 tools |
| `packages/AI/A2AServer/src/Server.ts` | Add authorization to 5 operations |

---

## Appendix: Complete Scope Hierarchy

```
Root Scopes
│
├── full_access                         # GOD POWER: Unrestricted access (use with extreme caution!)
│
├── entity                              # Entity CRUD operations
│   ├── create                          # Create records
│   ├── read                            # Read records
│   ├── update                          # Update records
│   ├── delete                          # Delete records
│   └── merge                           # Merge duplicate records
│
├── view                                # View operations
│   └── run                             # Execute views
│
├── query                               # Query operations
│   └── run                             # Execute queries
│
├── agent                               # AI Agent operations
│   ├── execute                         # Execute agents
│   ├── monitor                         # Read run status/history
│   └── cancel                          # Cancel running agents
│
├── action                              # Action operations
│   └── execute                         # Execute actions
│
├── prompt                              # AI Prompt operations
│   └── execute                         # Execute prompts
│
├── embedding                           # Embedding operations
│   └── generate                        # Generate embeddings
│
├── template                            # Template operations
│   └── execute                         # Render templates
│
├── dataset                             # Dataset operations
│   └── read                            # Load datasets
│
├── task                                # Task graph operations
│   ├── read                            # Read task status
│   ├── execute                         # Execute task graphs
│   └── cancel                          # Cancel tasks
│
├── datacontext                         # Data context operations
│   └── read                            # Load data contexts
│
├── communication                       # Communication operations
│   └── send                            # Send emails/messages
│
├── apikey                              # API Key management
│   ├── create                          # Create new keys
│   └── revoke                          # Revoke keys
│
├── user                                # User operations
│   └── read                            # Read user info
│
└── metadata                            # Metadata/discovery operations
    ├── entities                        # Entity metadata
    │   └── read                        # Read entity schema
    ├── actions                         # Action metadata
    │   └── read                        # Discover actions
    ├── agents                          # Agent metadata
    │   └── read                        # Discover agents
    ├── prompts                         # Prompt metadata
    │   └── read                        # Discover prompts
    ├── queries                         # Query metadata
    │   └── read                        # Discover queries
    └── communication                   # Communication metadata
        └── read                        # Read provider info
```
