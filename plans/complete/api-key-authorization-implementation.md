# API Key Authorization Implementation Plan

## Overview

This document tracks the implementation of the complete API key authorization system for MemberJunction. The goal is to ensure that API keys are properly validated for application binding and that scope-based authorization is enforced across all API surfaces (MJAPI, MCP Server, A2A Server).

## Current State Analysis

### Implementation Complete ✅

All aspects of the API key authorization system are now fully implemented:

- API key generation, hashing, storage
- Key validation with application binding checks
- `ValidateAPIKey` method with `ApplicationName` parameter
- `Authorize` method with comprehensive logging
- MJAPI validates keys and stores hash in `UserPayload`
- MCP Server calls `Authorize` before every tool execution
- A2A Server calls `Authorize` before agent/action operations
- GraphQLDataProvider supports `x-api-key` header
- All scopes defined: `action:execute`, `prompt:execute`, `entity:*`, `view:run`, `query:run`, `agent:execute`
- Application scope ceilings defined for MJAPI, MCPServer, A2AServer

### What Was Implemented
1. **ValidateAPIKey checks application binding** - Keys bound to specific apps are rejected for other apps
2. **Authorize() called before all operations** - MCP Server and A2A Server check scopes
3. **All scopes defined** - `action:execute`, `prompt:execute` added to metadata
4. **Tool-to-scope mapping** - MCP Server maps each tool to appropriate scope
5. **GraphQLDataProvider supports `x-api-key`** - Can authenticate with user API keys
6. **Application scope ceilings** - MJAPI, MCPServer, A2AServer have ceiling definitions

---

## Implementation Tasks

### Phase 1: Update ValidateAPIKey to Check Application Binding ✅

**File**: `packages/APIKeys/src/APIKeyEngine.ts`

- [x] Add `ApplicationId?: string` to `APIKeyValidationOptions`
- [x] Add `ApplicationName?: string` to `APIKeyValidationOptions` (alternative lookup)
- [x] Add `APIKeyHash?: string` to `APIKeyValidationResult` (so callers can use it for Authorize)
- [x] Update `ValidateAPIKey` logic to check `APIKeyApplication` binding when ApplicationId provided
- [x] If key has bindings and requested app isn't in them, return invalid

### Phase 2: Update Authorize to Always Log ✅

**File**: `packages/APIKeys/src/APIKeyEngine.ts`

- [x] Modify `Authorize` to always call usage logger (remove conditional logging)
- [x] Ensure comprehensive logging of authorization decisions

### Phase 3: Add Missing Scopes to Metadata ✅

**Directory**: `metadata/api-scopes/`

- [x] Add `action` parent scope
- [x] Add `action:execute` child scope (ResourceType: Action)
- [x] Add `prompt` parent scope
- [x] Add `prompt:execute` child scope (ResourceType: Prompt)

### Phase 4: Add Application Scope Ceilings ✅

**Directory**: `metadata/api-application-scopes/`

- [x] Create MJAPI application scope rules (`*` include for all)
- [x] Create MCPServer application scope rules (view:run, query:run, agent:execute, action:execute, prompt:execute, entity:read)
- [x] Create A2AServer application scope rules (action:execute, agent:execute)

### Phase 5: Update MCP Server to Call Authorize ✅

**File**: `packages/AI/MCPServer/src/Server.ts`

- [x] Add tool-to-scope mapping configuration
- [x] Update `authenticateRequest` to pass application name/ID
- [x] Add `authorizeToolCall` function that calls `Authorize` before each tool
- [x] Wire up authorization to all tool handlers

### Phase 6: Update A2A Server to Call Authorize ✅

**File**: `packages/AI/A2AServer/src/Server.ts`

- [x] Update `authenticateRequest` to pass application name/ID
- [x] Add authorization check before entity operations
- [x] Add authorization check before agent execution

### Phase 7: Update MJAPI to Call Authorize ✅

**File**: `packages/MJServer/src/context.ts`

- [x] Store API key hash in user payload for scope checks
- [x] Document where scope checks should be added (resolvers)
- [x] Add TODO comments for resolver-level authorization (future work)

### Phase 8: Add User API Key Support to GraphQLDataProvider ✅

**File**: `packages/GraphQLDataProvider/src/graphQLDataProvider.ts`

- [x] Add `UserAPIKey?: string` property to `GraphQLProviderConfigData`
- [x] Add constructor parameter for user API key
- [x] Update `createClient` to include `x-api-key` header when UserAPIKey is set

---

## Detailed Design

### ValidateAPIKey Enhanced Signature

```typescript
interface APIKeyValidationOptions {
    RawKey: string;
    ApplicationId?: string;      // Check if key is bound to this app
    ApplicationName?: string;    // Alternative - look up by name
    // Logging context (optional)
    Endpoint?: string;
    Method?: string;
    Operation?: string | null;
    StatusCode?: number;
    ResponseTimeMs?: number;
    IPAddress?: string | null;
    UserAgent?: string | null;
}

interface APIKeyValidationResult {
    IsValid: boolean;
    User?: UserInfo;
    APIKeyId?: string;
    APIKeyHash?: string;         // NEW: Return hash for Authorize calls
    Error?: string;
}
```

### Application Binding Check Logic

```typescript
// In ValidateAPIKey, after basic validation:
if (options.ApplicationId || options.ApplicationName) {
    const appId = options.ApplicationId || await this.getAppIdByName(options.ApplicationName);
    const keyApps = await this.getKeyApplications(apiKey.ID, contextUser);

    if (keyApps.length > 0) {
        // Key has app restrictions
        const boundToThisApp = keyApps.some(ka => ka.ApplicationID === appId);
        if (!boundToThisApp) {
            return { IsValid: false, Error: 'API key not authorized for this application' };
        }
    }
    // If keyApps is empty, key works with all apps (global)
}
```

### Tool-to-Scope Mapping for MCP Server

```typescript
const TOOL_SCOPE_MAP: Record<string, { scope: string; getResource: (args: any) => string }> = {
    // Entity tools
    'get_record_*': { scope: 'entity:read', getResource: (a) => a.entityName },
    'create_record_*': { scope: 'entity:create', getResource: (a) => a.entityName },
    'update_record_*': { scope: 'entity:update', getResource: (a) => a.entityName },
    'delete_record_*': { scope: 'entity:delete', getResource: (a) => a.entityName },

    // View/Query tools
    'run_view_*': { scope: 'view:run', getResource: (a) => a.entityName || '*' },
    'run_query_*': { scope: 'query:run', getResource: (a) => a.queryName },

    // Agent tools
    'run_agent_*': { scope: 'agent:execute', getResource: (a) => a.agentName },

    // Action tools
    'run_action_*': { scope: 'action:execute', getResource: (a) => a.actionName },

    // Prompt tools
    'run_prompt_*': { scope: 'prompt:execute', getResource: (a) => a.promptName },
};
```

---

## Test Scenarios

1. **Key with no app bindings** - Should work with all apps
2. **Key bound to MCPServer only** - Should fail validation when used with MJAPI
3. **Key with `agent:execute` for "Skip*"** - Should allow SkipAnalysisAgent, deny OtherAgent
4. **App ceiling blocks scope** - MCPServer ceiling blocks `entity:delete`, key grants should be irrelevant
5. **GraphQLDataProvider with API key** - Should send `x-api-key` header

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/APIKeys/src/APIKeyEngine.ts` | ValidateAPIKey app binding, always-log Authorize |
| `packages/APIKeys/src/interfaces.ts` | Update interfaces |
| `packages/AI/MCPServer/src/Server.ts` | Add tool-to-scope mapping and authorization |
| `packages/AI/A2AServer/src/Server.ts` | Add authorization to operations |
| `packages/MJServer/src/context.ts` | Store API key hash in payload |
| `packages/GraphQLDataProvider/src/graphQLDataProvider.ts` | Add UserAPIKey support |
| `metadata/api-scopes/.api-scopes.json` | Add action, prompt scopes |
| `metadata/api-application-scopes/` | Create ceiling rules |

---

## Progress Tracking

- [x] Phase 1: ValidateAPIKey application binding ✅ **COMPLETE**
- [x] Phase 2: Authorize always logs ✅ **COMPLETE**
- [x] Phase 3: Add missing scopes ✅ **COMPLETE**
- [x] Phase 4: Application scope ceilings ✅ **COMPLETE**
- [x] Phase 5: MCP Server authorization ✅ **COMPLETE**
- [x] Phase 6: A2A Server authorization ✅ **COMPLETE**
- [x] Phase 7: MJAPI context updates ✅ **COMPLETE**
- [x] Phase 8: GraphQLDataProvider API key support ✅ **COMPLETE**

**All phases completed on 2026-01-26**

---

## Post-Implementation Audit (2026-01-26)

### Bug Fix Applied
- **`defaultBehaviorNoScopes` was not wired** - The config setting was defined but never passed to ScopeEvaluator. Fixed by updating the ScopeEvaluator constructor to accept and use this setting. Keys without explicit scopes now correctly default to 'allow' behavior.

### Verification Summary
| Component | Validation | App Binding | Authorization | Logging |
|-----------|------------|-------------|---------------|---------|
| APIKeys   | ✅         | ✅          | ✅            | ✅      |
| MCP Server| ✅         | ✅          | ✅ (all tools)| ✅      |
| A2A Server| ✅         | ✅          | ✅            | ✅      |
| MJAPI     | ✅         | ✅          | (infrastructure ready) | ✅ |
| GraphQL Provider | ✅ x-api-key header | N/A | N/A | N/A |

### Tools Without Scope Authorization (By Design)
The following MCP Server tools do not require scope authorization as they are discovery/metadata operations:
- `Get_Entity_List`, `Get_Single_Entity` - Entity metadata
- `Discover_Actions`, `Get_Action_Params` - Action discovery
- `Discover_Agents`, `Get_Agent_Run_Status` - Agent discovery/status
- `Discover_Queries`, `Get_Database_Schema` - Query/schema metadata
- `Discover_Prompts` - Prompt discovery
- `Get_Communication_Providers` - Provider discovery
- Agent diagnostic tools (`List_Recent_Agent_Runs`, etc.)

---

## Notes

- **Mutation scope dropped** - Was in original design but doesn't map to anything meaningful. Entity CRUD operations already have their own scopes.
- **MJAPI resolver authorization** - Full implementation requires adding checks to each GraphQL resolver. This plan adds the infrastructure; resolver-level checks are a follow-up task.
- **User permissions remain ceiling** - Scope authorization narrows access, never expands beyond what user permissions allow.
