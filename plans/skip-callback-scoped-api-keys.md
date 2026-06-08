# Proposal: Replace System User Pattern with Scoped API Keys for Skip Callbacks

**Date:** June 8, 2026  
**Author:** Jordan Fanapour  
**Status:** Draft — pending team review

---

## 1. Parties and Architecture

Understanding the parties involved is critical to this proposal:

- **Client MJAPI** — a customer's vanilla MemberJunction environment. It has MJ core infrastructure (APIKeyEngine, scopes, resolvers) but **does not** have BCSaaS. This is where the user is authenticated and where their data lives.
- **Skip API** — the Skip-Brain server, which sits on top of MJ + BCSaaS. It receives requests from client MJAPIs and calls back to them for data operations.
- **SkipSDK** — code running inside the client MJAPI that packages a request (including callback credentials) and sends it to the Skip API server.

**Current flow:**
```
1. User authenticates with their MJAPI (JWT via Auth0/MSAL/etc.)
2. User invokes the Skip proxy agent in their MJAPI
3. SkipSDK on the client MJAPI packages a request to Skip API, including:
   - x-mj-api-key (the client MJAPI's system API key)
   - callingServerAccessToken (short-lived token, 10-min TTL)
   - callingServerURL (the client MJAPI's GraphQL endpoint)
   - userEmail (the authenticated user's email)
4. Skip API processes the request using its own agents
5. When Skip needs data, it calls BACK to the client MJAPI using the provided credentials
6. The client MJAPI authenticates the callback via x-mj-api-key → system user access
```

**The problem is in step 6.** The `x-mj-api-key` grants full system user access to the client's MJAPI with no scoping, no audit trail, and no expiration.

## 2. Problem Statement

When Skip calls back to a customer's MJAPI to execute views, queries, search, and AI operations, it authenticates using the client's `x-mj-api-key` shared secret. This grants full system user access to all 17 `@RequireSystemUser` resolvers on that client's MJAPI.

**Issues with the current approach:**

| Concern | Detail |
|---------|--------|
| **No granular permissions** | System user has access to all `@RequireSystemUser` resolvers. Skip can run AI agents, sync data, execute raw SQL — far more than it needs for any single callback. |
| **No audit trail** | The `x-mj-api-key` path does not log individual operations. There is no record of which Skip callback did what on the client's system. |
| **No expiration or revocation** | The key is a static environment variable on the client's MJAPI. Rotating it requires redeploying the client's server. |
| **Single point of failure** | If the key leaks, the attacker has persistent, unrestricted system-level access to the client's MJAPI with no way to revoke it short of redeployment. |

## 3. Proposed Solution

Replace the `x-mj-api-key` system user authentication for Skip callbacks with **scoped API keys** generated through MJ's core `APIKeyEngine` infrastructure. Since every client MJAPI runs MJ core, the APIKeyEngine, scope tables, and scope evaluation are all available on the client side — no BCSaaS dependency required.

### 3.1 Overview

```
CURRENT:
  Client MJAPI (SkipSDK) sends x-mj-api-key to Skip API
  Skip API calls back with x-mj-api-key → client context.ts sets isSystemUser: true
  → Full access to all @RequireSystemUser resolvers

PROPOSED:
  Client MJAPI (SkipSDK) provisions a scoped API key for Skip callbacks
  SkipSDK sends this scoped key to Skip API in the request
  Skip API calls back with X-API-Key: skip_cb_<key>
  → client context.ts validates via APIKeyEngine → scoped resolver access
```

### 3.2 Key Provisioning (on the Client MJAPI)

When a customer configures Skip on their MJAPI:

1. `APIKeyEngine.CreateAPIKey()` generates a key with prefix `skip_cb_` (callback)
2. The key is assigned to a **Skip service account user** on the client MJAPI (not the system user) with appropriate MJ roles
3. Scopes are assigned to the key via `APIKeyScope` records (see Section 4)
4. The SkipSDK on the client MJAPI includes this key in the `callingServerAPIKey` field of the request to Skip API — replacing the current `x-mj-api-key` value

The key's owning user (the Skip service account on the client) determines the baseline entity permissions and RLS rules. This is how Skip's data access on the client's system can be constrained — the service account's roles define the ceiling, and scopes further narrow it.

### 3.3 Authentication Flow

```
1. Client MJAPI's SkipSDK sends request to Skip API, including:
   - callingServerAPIKey: skip_cb_<scoped key>  (replaces x-mj-api-key)
   - callingServerURL: client's GraphQL endpoint
   - userEmail: authenticated user's email

2. Skip API processes the request with its agents

3. When Skip calls back to the client MJAPI:
   - Sends X-API-Key: skip_cb_<key> header
   - Client's context.ts validates via APIKeyEngine (User API Key path, line 85)
   - userPayload populated with apiKeyHash + Skip service account user

4. Client resolver calls CheckAPIKeyScopeAuthorization(scopePath, resource, userPayload)

5. APIKeyEngine.Authorize() evaluates scopes + logs the operation on the client's system

6. If authorized → execute. If not → 403 with specific denial reason.
```

## 4. Scope Definitions

Define the following scopes in MJ core's `APIScope` table (available on every MJ deployment):

| Scope Path | Description | Current SystemUser Resolver |
|------------|-------------|----------------------------|
| `skip:view:run` | Execute views (by name, ID, or dynamic) | RunViewByName/ID/DynamicSystemUser |
| `skip:view:batch` | Batch view execution | RunViewsSystemUser |
| `skip:query:run` | Execute queries (by name or ID) | GetQueryData/ByNameSystemUser |
| `skip:query:create` | Create new queries | CreateQuerySystemUser |
| `skip:query:update` | Update existing queries | UpdateQuerySystemUser |
| `skip:query:delete` | Delete queries | DeleteQuerySystemResolver |
| `skip:sql:test` | Test SQL with composition/Nunjucks | TestQuerySQL |
| `skip:search` | Knowledge search and preview | SearchKnowledge/PreviewSearchAsSystemUser |
| `skip:ai:prompt` | Execute AI prompts | RunAIPrompt/ExecuteSimplePromptSystemUser |
| `skip:ai:agent` | Execute AI agents | RunAIAgentSystemUser |
| `skip:ai:embed` | Generate text embeddings | EmbedTextSystemUser |

**Not included:** `GetData` (raw SQL execution). This is the highest-risk operation and is being superseded by `TestQuerySQL`. If needed in the future, it can be added as `skip:sql:raw` with additional safeguards.

### 4.1 Default Key Scope Assignment

A standard Skip callback key would receive all scopes above. Customers who want to restrict Skip's capabilities (e.g., no AI agent execution, no query creation) can remove specific scopes from their key.

### 4.2 Resource-Level Restrictions (Future)

The `APIKeyScope` table supports `ResourcePattern` with glob/regex/literal matching. In a future phase, customers could restrict Skip to specific entities:

```
Scope: skip:view:run
ResourcePattern: Contacts*    (glob)
Effect: Skip can only run views on Contacts, ContactType, etc.
```

This is not required for the initial implementation but the infrastructure supports it.

## 5. Resolver Changes

### 5.1 Current Pattern

Each operation has two resolver variants:

```typescript
// Regular user version — checks API key scopes
@Query(() => QueryResultType)
async GetQueryData(...) {
    await this.CheckAPIKeyScopeAuthorization('query:run', QueryID, context.userPayload);
    // ... execute
}

// System user version — only checks isSystemUser flag
@RequireSystemUser()
@Query(() => QueryResultType)
async GetQueryDataSystemUser(...) {
    // ... same execute logic, no scope check
}
```

### 5.2 Proposed Change

**Option A (Recommended): Modify the `@RequireSystemUser` directive to accept either auth method**

Update the directive to accept either:
- `isSystemUser: true` (legacy, for backward compatibility during migration)
- A valid API key with the required scope

```typescript
// Pseudocode for the updated directive
if (context.userPayload.isSystemUser) {
    return resolve();  // Legacy system user — allow
}
if (context.userPayload.apiKeyHash) {
    await CheckAPIKeyScopeAuthorization(requiredScope, resource, context.userPayload);
    return resolve();  // Scoped API key — allow if scope matches
}
throw new AuthorizationError('Requires system user or scoped API key');
```

The scope parameter can be passed via the directive argument:

```typescript
@RequireSystemUser({ scope: 'skip:query:run' })
@Query(() => QueryResultType)
async GetQueryDataSystemUser(@Arg('QueryID') QueryID: string, @Ctx() context) {
    // Directive handles auth (system user OR scoped API key)
    // ... execute
}
```

This approach:
- Preserves backward compatibility (existing `x-mj-api-key` still works during migration)
- Allows gradual migration (customers can switch to scoped keys at their own pace)
- Requires minimal resolver changes (update directive + add scope annotations, not rewrite every resolver)

**Option B: Create new Skip-specific resolvers**

Create a third set of resolvers for each operation that use `CheckAPIKeyScopeAuthorization` with Skip-specific scopes. More code but zero risk to existing resolvers.

## 6. Skip-Side Changes

### 6.1 ConnectionManager

Replace `GraphQLSystemUserClient` construction in `ConnectionManager.ts` (line 137):

```typescript
// CURRENT: System user client with x-mj-api-key
const client = new GraphQLSystemUserClient(url, token, sessionId, mjAPIKey);

// PROPOSED: Standard client with X-API-Key header
const client = new GraphQLClient(url, {
    headers: {
        'X-API-Key': skipCallbackApiKey,     // skip_cb_* key from the client MJAPI
        'x-session-id': sessionId,
    }
});
```

### 6.2 Key Flow

The scoped callback key is provisioned on the client MJAPI and passed to Skip in the existing `callingServerAPIKey` field of the SkipAPIRequest. No new field is needed — the value just changes from the system API key to a scoped API key. Skip stores and uses it the same way it does today.

### 6.3 Access Token Removal

With scoped API keys, the short-lived access token (`callingServerAccessToken`) is no longer needed for most operations. `GetData` is the only resolver that uses it, and `TestQuerySQL` replaces it without requiring a token. The access token can be deprecated in the SkipAPIRequest.

## 7. Migration Path

### Phase 1: Infrastructure (no behavior change)
- Add Skip callback scopes to MJ core's `APIScope` table via migration
- Update `@RequireSystemUser` directive to accept scoped API keys (Option A)
- Build and test — existing `x-mj-api-key` flow continues to work for all customers

### Phase 2: Key Provisioning (client MJAPI side)
- Add Skip callback API key generation to the SkipSDK configuration flow on the client
- Create a Skip service account user on the client MJAPI with appropriate roles
- Assign Skip callback scopes to the generated key
- SkipSDK sends the scoped key in `callingServerAPIKey` instead of `x-mj-api-key`

### Phase 3: Skip-Side Migration
- Update `ConnectionManager` to use `X-API-Key` header when the callback key has a `skip_cb_` prefix
- Fall back to `x-mj-api-key` header when the key has no prefix (backward compatibility with clients not yet upgraded)
- Deprecate `callingServerAccessToken` in SkipAPIRequest

### Phase 4: Deprecation
- Remove `x-mj-api-key` support from Skip callback flow
- Remove `GraphQLSystemUserClient` usage in Skip
- Remove access token creation from SkipSDK

## 8. Security Improvements

| Property | Current (System User) | Proposed (Scoped API Keys) |
|----------|----------------------|---------------------------|
| **Permissions** | Full system user access (17 resolvers) | Only granted scopes |
| **Audit logging** | None | Every Authorize() call logged with operation, resource, IP, timing |
| **Expiration** | Never | Configurable per key |
| **Revocation** | Redeploy client MJAPI | Revoke key on client, immediate effect, no redeploy |
| **Rotation** | Manual env var change + deploy | Generate new key, revoke old, no deploy needed |
| **Resource restriction** | None | Glob/regex patterns on entities (future) |
| **User context** | System user (broad permissions) | Skip service account (roles define permission ceiling) |

## 9. Open Questions

1. **Skip service account user** — should this be a dedicated user per customer, or a convention where every MJ deployment creates a "Skip Service" user with standardized roles? A convention is simpler but less flexible.

2. **Key provisioning UX** — should the callback key be auto-generated when a customer configures Skip (e.g., via a "Connect to Skip" wizard in MJ Explorer), or manually provisioned by an admin?

3. **Backward compatibility timeline** — how long do we maintain support for the legacy `x-mj-api-key` path before requiring scoped API keys for Skip callbacks?

4. **Scope granularity** — are the proposed scopes the right level of granularity? For example, should `skip:query:run` and `skip:query:create` be separate, or combined as `skip:query:*`?
