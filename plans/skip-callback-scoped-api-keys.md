# Proposal: Replace System User Pattern with Scoped API Keys for Skip Callbacks

**Date:** June 8, 2026  
**Author:** Jordan Fanapour  
**Status:** Approved — Phase 1 & 2 complete, Phase 3 revised

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

Replace the `x-mj-api-key` system user authentication for Skip callbacks with **scoped API keys** generated through MJ's core `APIKeyEngine` infrastructure. Skip callbacks switch from calling `@RequireSystemUser` resolvers to calling the **regular (non-system) resolvers** that already have scope checking via `CheckAPIKeyScopeAuthorization()`. Since every client MJAPI runs MJ core, the APIKeyEngine, scope tables, and scope evaluation are all available on the client side — no BCSaaS dependency required.

### 3.1 Overview

```
CURRENT:
  Client MJAPI (SkipSDK) sends x-mj-api-key to Skip API
  Skip API calls back with x-mj-api-key → client context.ts sets isSystemUser: true
  → Full access to all @RequireSystemUser resolvers

PROPOSED:
  Client MJAPI (SkipSDK) auto-provisions a scoped API key for Skip callbacks
  SkipSDK sends this scoped key to Skip API in the request
  Skip API calls back with X-API-Key: skip_cb_<key>
  → client context.ts validates via APIKeyEngine → Skip service account user
  → Skip calls regular (non-system) resolvers → scope checks enforced
```

### 3.2 Key Provisioning (Auto-Provisioning via SkipSDK + Credential Storage on Skip)

> **Decision (June 9, 2026):** Auto-provisioning on first request. No manual env var or admin step needed for the callback key. A dedicated Skip service account user is created via MJ metadata and deployed to all client MJAPIs via metadata sync.
>
> **Revised (June 10, 2026):** API keys are stored as SHA-256 hashes in the DB — the raw key is only available at creation time and cannot be recovered after server restart. To solve this, SkipSDK sends the raw key to Skip on **first request only**. Skip persists it in BCSaaS's encrypted credential store (`BC: Organization Credentials`) keyed by organization. Future requests omit the key — Skip looks it up by org ID.

#### MJ Client Side (SkipSDK Provisioner)

When SkipSDK on a client MJAPI processes a request to a Skip host:

1. SkipSDK checks if a Skip callback key already exists by querying `MJ: API Keys` for a record labeled `"Skip Callback: {skipHostUrl}"` owned by the Skip service account
2. **If no key exists** (first time connecting to this Skip host):
   - SkipSDK calls `APIKeyEngine.CreateAPIKey()` to generate a scoped key
   - The key is assigned to the **Skip service account user** (deployed via MJ metadata)
   - Required scopes are assigned via `APIKeyScope` records (see Section 4)
   - SkipSDK includes the raw key in `callingServerAPIKey` — this is the **only time** the raw key is transmitted
   - Skip receives and persists it in its encrypted credential store (see Section 6.6)
3. **If a key already exists** (any subsequent request, including after MJ restart):
   - SkipSDK sends the request **without** `callingServerAPIKey`
   - Skip looks up the stored credential by organization ID
   - No caching of the raw key is needed — it's only used once at creation time

The label convention `"Skip Callback: {skipHostUrl}"` (e.g., `"Skip Callback: https://skip.example.com"`) supports multiple Skip hosts per MJ instance. The URL comes from `ASK_SKIP_CHAT_URL` env var.

This eliminates the `MJ_API_KEY` environment variable from client onboarding. The only env var needed is `ASK_SKIP_API_KEY` (which authenticates the client *to* Skip — a separate concern).

The key's owning user (the Skip service account on the client) determines the baseline entity permissions and RLS rules. The service account's roles define the ceiling, and scopes further narrow it.

#### Skip SaaS Side (Credential Storage)

When Skip's API receives a request:

1. **If `callingServerAPIKey` is present** in the request:
   - Store or update it as a `BC: Organization Credential` linked to the "MJAPI Callback" credential use
   - Encrypted at rest via MJ's credential encryption system
2. **If `callingServerAPIKey` is absent**:
   - Look up the stored credential for this organization's "MJAPI Callback" use
   - If found → decrypt and inject into the request for downstream use
   - If not found → halt execution with an authentication error

**Concerns with auto-provisioning:**

1. **SkipSDK needs API key creation permissions.** The provisioner uses the system user context for key creation, so no special permissions are needed on the calling user.
2. **Race condition on first request.** The provisioning logic uses a promise-based mutex to prevent duplicate keys from concurrent requests.
3. **Key visibility.** Admins cannot see or manage the auto-provisioned key without querying the API Keys table directly. A future Skip admin dashboard should surface this for key rotation, scope management, and revocation (see Section 10).
4. **Key rotation.** If an admin deletes the API key record on the MJ side, the provisioner creates a new one on the next request and sends the raw key to Skip, which updates its stored credential. This is the rotation mechanism — delete the old key, let auto-provisioning handle the rest.

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
   - userPayload populated with apiKeyId + Skip service account user
   - Skip calls REGULAR resolvers (not SystemUser variants)

4. Regular resolver calls CheckAPIKeyScopeAuthorization(scopePath, resource, userPayload)

5. APIKeyEngine.Authorize() evaluates scopes + logs the operation on the client's system

6. If authorized → execute. If not → 403 with specific denial reason.
```

## 4. Scope Definitions

> **Decision (June 9, 2026):** Use MJ's existing scope hierarchy, not a separate `skip:*` namespace. Skip callbacks use the regular (non-system) resolvers, so they need the same scopes as any other API key user. Missing scopes have been added to the existing hierarchy.

Scopes are defined in MJ core's `APIScope` table (available on every MJ deployment) via metadata: `MJ/metadata/api-scopes/.api-scopes.json`.

### 4.1 Scopes Required by Skip Callbacks

| Scope Path | Description | Target Resolver |
|------------|-------------|-----------------|
| `view:run` | Execute views (by name, ID, or dynamic) | `RunViewByName`, `RunViewByID`, `RunDynamicView` |
| `view:batch` | Batch view execution | `RunViews` |
| `query:run` | Execute queries (by name or ID) | `GetQueryData`, `GetQueryDataByName` |
| `query:create` | Create new queries | `CreateQueryExtended` (converted from SystemUser) |
| `query:update` | Update existing queries | `UpdateQueryExtended` (converted from SystemUser) |
| `query:delete` | Delete queries | `DeleteQueryExtended` (converted from SystemUser) |
| `query:test` | Test transient SQL with composition/Nunjucks | `TestQuerySQL` (converted from SystemUser) |
| `search:execute` | Knowledge search and preview | `SearchKnowledge`, `PreviewSearch` |
| `prompt:execute` | Execute AI prompts | `RunAIPrompt`, `ExecuteSimplePrompt` |
| `agent:execute` | Execute AI agents | `RunAIAgent` |
| `embedding:generate` | Generate text embeddings | `EmbedText` |

**New scopes added to existing hierarchy** (Phase 1):
- `view:batch` — under existing `view` parent
- `query:create`, `query:update`, `query:delete`, `query:test` — under existing `query` parent
- `search` (parent) + `search:execute` — new top-level category

**Not included:** `GetData` (raw SQL execution). This is the highest-risk operation and is being superseded by `TestQuerySQL`. If needed in the future, it can be added as `query:raw` with additional safeguards.

### 4.2 Default Key Scope Assignment

A standard Skip callback key would receive all scopes above. Customers who want to restrict Skip's capabilities (e.g., no AI agent execution, no query creation) can remove specific scopes from their key.

### 4.3 Resource-Level Restrictions (Future)

The `APIKeyScope` table supports `ResourcePattern` with glob/regex/literal matching. In a future phase, customers could restrict Skip to specific entities:

```
Scope: view:run
ResourcePattern: Contacts*    (glob)
Effect: Skip can only run views on Contacts, ContactType, etc.
```

This is not required for the initial implementation but the infrastructure supports it.

## 5. Resolver Changes

> **Decision (June 9, 2026):** Skip callbacks use the regular (non-system) resolvers instead of overloading `@RequireSystemUser`. The `@RequireSystemUser` directive remains unchanged — it stays pure as system-user-only. Long-term, the SystemUser resolvers and `GraphQLSystemUserClient` are decommissioned entirely.

### 5.1 Complete Resolver Mapping

#### Already ready — have non-system variant with scope checks (6 resolvers)

| SystemUser Resolver | Non-System Resolver | File | Existing Scope |
|---|---|---|---|
| `GetQueryDataSystemUser` | `GetQueryData` | `QueryResolver.ts:186` | `query:run` |
| `GetQueryDataByNameSystemUser` | `GetQueryDataByName` | `QueryResolver.ts:251` | `query:run` |
| `RunAIPromptSystemUser` | `RunAIPrompt` | `RunAIPromptResolver.ts:284` | `prompt:execute` |
| `ExecuteSimplePromptSystemUser` | `ExecuteSimplePrompt` | `RunAIPromptResolver.ts:587` | `prompt:execute` |
| `EmbedTextSystemUser` | `EmbedText` | `RunAIPromptResolver.ts:703` | `embedding:generate` |
| `RunAIAgentSystemUser` | `RunAIAgent` | `RunAIAgentResolver.ts:608` | `agent:execute` |

**Action:** Skip switches to calling these directly. No MJ-side changes needed.

#### Need scope checks added to existing non-system variant (6 resolvers)

| SystemUser Resolver | Non-System Resolver | File | Scope to Add |
|---|---|---|---|
| `RunViewByNameSystemUser` | `RunViewByName` | `RunViewResolver.ts:712` | `view:run` |
| `RunViewByIDSystemUser` | `RunViewByID` | `RunViewResolver.ts:743` | `view:run` |
| `RunDynamicViewSystemUser` | `RunDynamicView` | `RunViewResolver.ts:774` | `view:run` |
| `RunViewsSystemUser` | `RunViews` | `RunViewResolver.ts:803` | `view:batch` |
| `SearchKnowledgeAsSystemUser` | `SearchKnowledge` | `SearchKnowledgeResolver.ts:204` | `search:execute` |
| `PreviewSearchAsSystemUser` | `PreviewSearch` | `SearchKnowledgeResolver.ts:396` | `search:execute` |

**Action:** Add `CheckAPIKeyScopeAuthorization()` calls to these resolvers.

#### No non-system variant — convert SystemUser resolvers in-place (4 resolvers)

| Current Name | New Name | File | Scope | Codegen? |
|---|---|---|---|---|
| `CreateQuerySystemUser` | `CreateQueryExtended` | `QuerySystemUserResolver.ts:239` | `query:create` | No (hand-written, extends codegen `MJQueryResolver`) |
| `UpdateQuerySystemUser` | `UpdateQueryExtended` | `QuerySystemUserResolver.ts:453` | `query:update` | No (hand-written) |
| `DeleteQuerySystemResolver` | `DeleteQueryExtended` | `QuerySystemUserResolver.ts:558` | `query:delete` | No (hand-written) |
| `TestQuerySQL` | `TestQuerySQL` (no rename needed) | `TestQuerySQLResolver.ts:100` | `query:test` | No (hand-written) |

**Action:** Remove `@RequireSystemUser` decorator, add `CheckAPIKeyScopeAuthorization()` + entity permission checks, rename to "Extended" suffix (except TestQuerySQL which has no naming collision).

**Naming collision analysis:** CodeGen generates `CreateMJQuery`, `UpdateMJQuery`, `DeleteMJQuery` (simple CRUD wrappers in `generated.ts:59877-59901`). These are thin `CreateRecord`/`UpdateRecord`/`DeleteRecord` calls with no business logic. The SystemUser variants have substantial additional logic (category path resolution, collision detection, AI processing via `MJQueryEntityServer`, permission management). The "Extended" naming convention avoids collisions and accurately describes the enhanced behavior.

**No codegen blockers:** All 4 resolvers are fully hand-written. The `QuerySystemUserResolver` extends codegen `MJQueryResolver` for read operations only — the CRUD mutations are entirely custom.

### 5.2 Conversion Pattern

For the 4 SystemUser resolvers being converted:

```typescript
// BEFORE
@RequireSystemUser()
@Mutation(() => QueryMutationResultType)
async CreateQuerySystemUser(...) { ... }

// AFTER
@Mutation(() => QueryMutationResultType)
async CreateQueryExtended(
    @Arg('input', () => CreateQueryExtendedInput) input: CreateQueryExtendedInput,
    @Ctx() context: AppContext,
    @PubSub() pubSub: PubSubEngine
): Promise<QueryMutationResultType> {
    // Scope check for API key users (no-op for JWT users)
    await this.CheckAPIKeyScopeAuthorization('query:create', '*', context.userPayload);
    // Entity permission check (applies to all users)
    this.CheckUserCreatePermissions('MJ: Queries', context.userPayload);
    // ... existing business logic unchanged
}
```

## 6. Skip-Side Changes

### 6.1 New Skip Callback Client

> **Decision (June 9, 2026):** Skip builds its own `SkipCallbackClient` wrapper around the raw `GraphQLClient` from `graphql-request`, replacing `GraphQLSystemUserClient` from `@memberjunction/graphql-dataprovider`. This gives Skip full control over its client lifecycle without depending on MJ's package for changes.

**What `GraphQLSystemUserClient` provides today:**

1. **Header construction** — Sets `x-mj-api-key`, `Authorization: Bearer <token>`, `x-session-id`. ~5 lines in the constructor.
2. **Typed method wrappers** — Methods like `RunViewByName()`, `CreateQuery()` containing GraphQL query strings. All of these need to change to target non-system resolvers.
3. **TypeScript types** — Input/output types for each operation. The SystemUser-specific types won't match the regular resolver signatures.

**What Skip loses by not using it:** Effectively nothing. `GraphQLSystemUserClient` is a thin stateless wrapper — no caching, no token refresh, no WebSocket support. Everything it does needs to change for the new auth model anyway.

**What Skip gains with its own client:**

- Client lives in Skip-Brain's repo — no coordinating MJ releases for client changes
- Clean `X-API-Key` header from day one, no backwards compatibility shims
- Only the operations Skip actually needs — no `SyncData`, `SyncRolesAndUsers`, `GetAllRemoteEntities`, `GetData` dead weight
- `RemoteMJUtilities` and the new client evolve together
- Skip-specific concerns (per-operation audit logging, retry policies) can be added without polluting MJ

**Location:** `Skip-Brain/packages/shared/src/connection/SkipCallbackClient.ts`

```typescript
// Conceptual structure
class SkipCallbackClient {
    private client: GraphQLClient;  // from graphql-request

    constructor(url: string, apiKey: string, sessionId: string) {
        this.client = new GraphQLClient(url, {
            headers: {
                'X-API-Key': apiKey,       // skip_cb_* scoped key
                'x-session-id': sessionId,
            }
        });
    }

    // Only the operations Skip actually uses:
    async RunDynamicView(...): Promise<RunViewResult> { ... }
    async RunViews(...): Promise<RunViewResult[]> { ... }
    async GetQueryData(...): Promise<RunQueryResult> { ... }
    async GetQueryDataByName(...): Promise<RunQueryResult> { ... }
    async CreateQueryExtended(...): Promise<QueryMutationResult> { ... }
    async UpdateQueryExtended(...): Promise<QueryMutationResult> { ... }
    async DeleteQueryExtended(...): Promise<DeleteQueryResult> { ... }
    async TestQuerySQL(...): Promise<TestQuerySQLResult> { ... }
    async SearchKnowledge(...): Promise<SearchKnowledgeResult> { ... }
    async PreviewSearch(...): Promise<SearchKnowledgeResult> { ... }
    async RunAIPrompt(...): Promise<RunAIPromptResult> { ... }
    async ExecuteSimplePrompt(...): Promise<SimplePromptResult> { ... }
    async EmbedText(...): Promise<EmbedTextResult> { ... }
    async RunAIAgent(...): Promise<ExecuteAgentResult> { ... }
}
```

### 6.2 ConnectionManager Update

`ConnectionManager.ts` switches from constructing `GraphQLSystemUserClient` to `SkipCallbackClient`:

```typescript
// CURRENT
const client = new GraphQLSystemUserClient(url, token, sessionId, mjAPIKey);

// PROPOSED
const client = new SkipCallbackClient(url, skipCallbackApiKey, sessionId);
```

### 6.3 RemoteMJUtilities Update

Update all GraphQL query/mutation names in `RemoteMJUtilities.ts` to target the non-system resolvers:

| Current Call | New Call |
|---|---|
| `RunViewByNameSystemUser` | `RunViewByName` |
| `RunViewByIDSystemUser` | `RunViewByID` |
| `RunDynamicViewSystemUser` | `RunDynamicView` |
| `RunViewsSystemUser` | `RunViews` |
| `GetQueryDataSystemUser` | `GetQueryData` |
| `GetQueryDataByNameSystemUser` | `GetQueryDataByName` |
| `CreateQuerySystemUser` | `CreateQueryExtended` |
| `UpdateQuerySystemUser` | `UpdateQueryExtended` |
| `DeleteQuerySystemResolver` | `DeleteQueryExtended` |
| `TestQuerySQL` | `TestQuerySQL` (unchanged) |
| `SearchKnowledgeAsSystemUser` | `SearchKnowledge` |
| `PreviewSearchAsSystemUser` | `PreviewSearch` |
| `RunAIPromptSystemUser` | `RunAIPrompt` |
| `ExecuteSimplePromptSystemUser` | `ExecuteSimplePrompt` |
| `EmbedTextSystemUser` | `EmbedText` |
| `RunAIAgentSystemUser` | `RunAIAgent` |

### 6.4 Key Flow

The scoped callback key is auto-provisioned on the client MJAPI by SkipSDK. On the first request to a Skip host, SkipSDK includes the raw key in `callingServerAPIKey`. Skip persists it in `BC: Organization Credentials`. On subsequent requests (including after MJ restart), the key is omitted — Skip retrieves it from its credential store by organization ID.

### 6.5 Access Token Removal

With scoped API keys, the short-lived access token (`callingServerAccessToken`) is no longer needed for most operations. `GetData` is the only resolver that uses it, and `TestQuerySQL` replaces it without requiring a token. The access token can be deprecated in the SkipAPIRequest.

### 6.6 Callback Credential Storage (Skip SaaS)

> **Added June 10, 2026.** Resolves the hashed-key restart problem by persisting the raw key on the Skip side.

Skip uses BCSaaS's `BC: Organization Credentials` system to store callback API keys received from client MJAPIs. This leverages the existing credential infrastructure: encryption at rest, org scoping, audit logging.

**New Credential Use:** An "MJAPI Callback" entry is added to `Skip-Brain/metadata/credential-uses/.credential-uses.json`:
- **Name:** MJAPI Callback
- **Category:** Callback Server
- **Credential Type:** API Key
- **Status:** Active

**Resolution logic** (in `chatController.ts`, runs before workflow execution):

```typescript
// Called after resolveOrgCredentials() and before WorkflowService.execute()
async function resolveCallbackCredential(
    skipRequest: SkipAPIRequest,
    auth: SkipAuth,
    contextUser: UserInfo
): Promise<void> {
    if (skipRequest.callingServerAPIKey) {
        // Key provided — this is a first-time provisioning or key rotation.
        // Store (or replace) in credential store. The MJ client only sends
        // the key once at creation time, so receiving it means "new key."
        await storeCallbackCredential(auth.organizationID, skipRequest.callingServerAPIKey, contextUser);
    } else {
        // Key absent — normal case (MJ already provisioned, Skip has stored key).
        const storedKey = await lookupCallbackCredential(auth.organizationID, contextUser);
        if (storedKey) {
            skipRequest.callingServerAPIKey = storedKey;
        } else {
            // No key available — halt execution
            throw new CallbackCredentialError(
                "Your MJAPI server has not provided a callback API key. " +
                "This usually means the MJAPI needs to be restarted to provision a new scoped key for Skip."
            );
        }
    }
}
```

**Lookup pattern** follows the existing `resolveOrgCredentials()` at `chatController.ts:263-330`:
1. `BCCredentialEngine.Instance.OrganizationCredentials` filtered by org ID + Status='Active'
2. `engine.GetUsesForOrgCredential(orgCred.ID)` → filter for name === 'MJAPI Callback'
3. Decrypt via `CredentialEngine.Instance.getCredential()`

**`callingServerURL` is not stored** — it's always present in the request payload and can change if the MJAPI moves domains. Only the API key needs persistence because its raw value is lost after MJ restart.

## 7. Migration Path

### Phase 1: Infrastructure (no behavior change) ✅
- [x] Add missing scopes to MJ core's `APIScope` metadata: `view:batch`, `query:create`, `query:update`, `query:delete`, `query:test`, `search` + `search:execute`
- [x] Add `CheckAPIKeyScopeAuthorization()` to the 6 non-system resolvers that are missing scope checks (RunView*, SearchKnowledge, PreviewSearch)
- [x] Convert 4 SystemUser-only resolvers to regular resolvers with scope checks (CreateQuery → CreateQueryExtended, etc.)
- [x] Add Skip service account user to MJ metadata (`MJ/metadata/users/`)
- [x] Build and test — existing `x-mj-api-key` flow continues to work for all customers (SystemUser resolvers remain untouched, new/converted resolvers run in parallel)
- **Note:** Scopes and service account are deployed via MJ metadata sync, not SQL migration

### Phase 2: Skip-Side Client ✅
- [x] Create `SkipCallbackClient` in `Skip-Brain/packages/shared/src/connection/` (see Section 6.1)
- [x] Implement typed methods for all 14 operations Skip needs
- [x] Wire `SkipCallbackClient` into `ConnectionManager` (replacing `GraphQLSystemUserClient` construction)
- [x] Update `RemoteMJUtilities` to use the new client methods
- [ ] Unit test the new client against regular resolver operation names

### Phase 3: Key Provisioning + Credential Storage

> **Revised June 10, 2026.** Original design assumed the raw key could be recovered from the DB after restart. Since API keys are stored as SHA-256 hashes, the raw key is lost after server restart. Solution: SkipSDK sends the key once, Skip persists it encrypted in BCSaaS credential store.

#### 3A. MJ Client — Provisioner (`skip-callback-key-provisioner.ts`) ✅
- [x] Auto-provision scoped API key via `APIKeyEngine.CreateAPIKey()` on first request
- [x] Assign all 11 required scopes from Section 4.1
- [x] Promise-based mutex for concurrent first requests
- [x] Label convention: `"Skip Callback: {ASK_SKIP_CHAT_URL}"` (supports multiple Skip hosts)
- [x] Return `string | null` — non-null = key just created (send once), null = key exists (Skip has it)
- [x] No raw key caching — key is only needed at creation time

#### 3B. MJ Client — SkipSDK Integration (`skip-sdk.ts`) ✅
- [x] Wire provisioner into `buildBaseRequest()`
- [x] If provisioner returns raw key → set `callingServerAPIKey` (first request only)
- [x] If provisioner returns null → omit `callingServerAPIKey` (Skip uses stored credential)
- [x] Fall back to `legacyCallbackAPIKey` (`MJ_API_KEY`) during transition period if provisioner fails
- [x] Always send `callingServerURL` when `includeCallbackAuth` is true (independent of key)

#### 3C. Skip SaaS — Credential Use Metadata ✅
- [x] Added "MJAPI Callback" entry to `Skip-Brain/metadata/credential-uses/.credential-uses.json`
  - Category: "Callback Server", Type: "API Key", Status: "Active"

#### 3D. Skip SaaS — Callback Credential Resolution (`chatController.ts`) ✅
- [x] `resolveCallbackCredential()` function (see Section 6.6)
- [x] Called after `resolveOrgCredentials()`, before `WorkflowService.execute()`
- [x] Key present → store/update in `BC: Organization Credentials` via `BCCredentialEngine`
- [x] Key absent → look up from credential store by org ID + "MJAPI Callback" use
- [x] Neither → halt with authentication error
- [x] Per-org mutex to prevent duplicate credential creation from concurrent requests

### Phase 4: Deploy
- Deploy latest MJ to all beta clients (brings in Skip service account + new scopes + converted resolvers + provisioner)
- Deploy updated Skip API (with credential storage + SkipCallbackClient) simultaneously
- First request from each client → SkipSDK provisions key, sends to Skip, Skip stores it
- Subsequent requests (including after MJ restart) → key omitted, Skip uses stored credential
- Verify scoped key flow works end-to-end on each client
- Remove `MJ_API_KEY` env var from client environments once verified

### Phase 5: Cleanup
- Remove `legacyCallbackAPIKey` fallback from `skip-sdk.ts`
- Remove SystemUser resolver variants that Skip was using (they're now dead code)
- Remove `x-mj-api-key` support from Skip callback flow
- Remove `GraphQLSystemUserClient` import from Skip-Brain
- Remove access token creation from SkipSDK
- Evaluate remaining `@RequireSystemUser` resolvers for future scope migration or removal

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

## 9. Decisions

### Resolved June 9, 2026

1. **Skip service account user** — **Dedicated user via MJ metadata.** A standardized "Skip Service" user is defined in MJ's metadata directory and deployed to every client MJAPI via metadata sync. This provides a consistent convention while allowing per-client role customization if needed.

2. **Key provisioning** — **Auto-provisioning via SkipSDK.** On first request, SkipSDK checks for an existing key and creates one if none exists. No manual env var or admin step needed for the callback key. This removes `MJ_API_KEY` from client onboarding — the only env var needed is `ASK_SKIP_API_KEY`. See Section 3.2 for concerns.

3. **Backward compatibility timeline** — **Transition all beta clients ASAP.** Deploy all environments in tandem — MJ (with new scopes + service account + converted resolvers) and Skip (with updated RemoteMJUtilities + ConnectionManager) simultaneously. No gradual migration needed.

4. **Scope granularity** — **Keep granular.** Each operation gets its own scope (e.g., `query:run` and `query:create` remain separate). The scope hierarchy supports wildcard grants via parent scopes (e.g., granting `query` gives all query sub-scopes).

5. **Scope namespace** — **Use existing MJ scope hierarchy, not `skip:*`.** Since Skip callbacks use the regular resolvers (not SystemUser variants), they use the same scopes as any other API key user. This avoids a parallel scope tree and makes the scopes useful for non-Skip API keys too.

6. **Resolver strategy** — **Use regular (non-system) resolvers, not overloaded `@RequireSystemUser`.** The `@RequireSystemUser` directive remains unchanged. Skip switches to calling regular resolvers. SystemUser resolvers that have no non-system equivalent are converted in-place with "Extended" naming convention to avoid codegen collisions.

7. **GraphQL client** — **Skip builds its own `SkipCallbackClient`** wrapper around the raw `GraphQLClient` from `graphql-request`, replacing `GraphQLSystemUserClient` from `@memberjunction/graphql-dataprovider`. This decouples Skip's client lifecycle from MJ's package releases and eliminates dead-weight methods Skip never calls. `GraphQLSystemUserClient` provides only a thin header wrapper (~5 lines of real logic) plus typed method wrappers that all need rewriting anyway — Skip loses nothing by not using it.

### Resolved June 10, 2026

8. **Hashed key persistence** — **Skip stores the raw key, not the MJ client.** API keys are stored as SHA-256 hashes in MJ's database — the raw key is irrecoverable after server restart. Rather than weakening the hash model (accepting hashes as credentials) or adding encrypted storage to MJ, Skip persists the raw key in BCSaaS's `BC: Organization Credentials` system on first receipt. This leverages existing encryption-at-rest, org scoping, and audit logging. The MJ client labels keys by Skip host URL (`"Skip Callback: {url}"`) to support multiple Skip hosts.

9. **Callback credential URL storage** — **Request-only.** `callingServerURL` is NOT stored in the credential — it's always present in the request payload and can change if the MJAPI moves domains. Only the API key is persisted because its raw value is lost after MJ restart.

## 10. Future Enhancements

- **Skip admin dashboard** — A dedicated page in MJ Explorer (or a Skip-specific admin portal) where admin users can view and manage the auto-provisioned Skip callback key. Features would include: key rotation, scope management (add/remove individual scopes), revocation, audit log viewing, and key health/usage statistics. This addresses the visibility concern with auto-provisioning (see Section 3.2, concern #3).
- **SystemUser resolver deprecation** — Once all consumers of SystemUser resolvers are migrated to scoped API keys, evaluate removing the `@RequireSystemUser` directive and all SystemUser resolver variants entirely.
