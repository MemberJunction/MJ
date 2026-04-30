# Multi-Provider Threading Plan

**Status: COMPLETE.** Phase 1 merged (PR `fix-cache-write-allowcaching`); Phases 2–6 done in PR `multi-provider-threading`.
**Target:** Eliminate all uncontrolled reads of the global default `IMetadataProvider` in code paths that should be **per-provider** (multi-tenant servers, parallel client connections, transaction-isolated request handlers).
**Result:** Zero non-allowlisted violations across all 92 packages. Compliance scanner flipped to **strict mode** — any new `new Metadata()` / `Metadata.Provider` reference fails CI unless allowlisted with `// global-provider-ok: <reason>`.

---

## 1. Background and Motivation

### 1.1 The bug class

`new Metadata()` (and the static `Metadata.Provider` accessor it ultimately resolves to) returns the **process-global default provider**. In any environment where the active provider is _not_ that global, this silently returns the wrong metadata, the wrong CurrentUser, and the wrong cached state. The bug is invisible until a second provider exists in the process.

Two scenarios make this real today:

1. **Parallel client connections.** A browser app or Node client can hold multiple `IMetadataProvider` instances at once (e.g. a tenant-portal connecting to `client-a.api`, `client-b.api`, etc.). Each provider has its own metadata, roles, AllowCaching flags, CurrentUser, and cache fingerprint namespace.
2. **Server-side transaction isolation.** Each MJ server request gets its own `ProviderInfo[]` on `AppContext.providers` — distinct `DatabaseProviderBase` instances bound to per-request connection pools (Read-Only / Read-Write / Admin). Reaching for `Metadata.Provider` inside a resolver returns whichever provider was set globally at process start, **not** the one bound to the current request's transaction. This causes cross-request data leakage and breaks transaction-scoped caching/RLS.

### 1.2 What's already done — Phase 1 (this PR)

- **MJCore foundation:** `LocalCacheManager.SetRunViewResult`, `ApplyDifferentialUpdate`, `HandleRemoteInvalidateEvent`, `BaseEntityEvent.provider`, `AuthorizationEvaluator`, `ProviderBase.FullTextSearch`, `BaseEntity.ResolveLeafEntity`, `BaseEngine.applyRemoteRecordData` — all now thread provider correctly.
- **`BaseEntity.RaiseEvent` populates `event.provider`** for every save/delete/load/etc. event (both local subject and global broadcast), so all listeners receive consistent provider context.
- **Synthetic event raisers** (e.g. `scheduled-geocoding.action.ts`) updated to match the contract.
- **GraphQLDataProvider:** Cache-invalidation publisher attaches `this` provider to remote-invalidate events.
- **GenericDatabaseProvider:** Cache writes pass `this`.
- **CLAUDE.md guidance:** Root + Angular CLAUDE.md updated with the rule and patterns.
- **Compliance ratchet test** ([packages/MJGlobal/src/__tests__/MultiProviderCompliance.test.ts](../packages/MJGlobal/src/__tests__/MultiProviderCompliance.test.ts) + [multi-provider-baseline.json](../packages/MJGlobal/src/__tests__/multi-provider-baseline.json)) — scans the repo for `new Metadata()` and `Metadata.Provider` references, fails if any package's count exceeds its baseline. Inline `// global-provider-ok: <reason>` comment suppresses individual lines.

### 1.3 What this plan covers — Phases 2–6

Everything else flagged in the codebase-wide audit. Counts below are call-site counts of `new Metadata()` / `Metadata.Provider` per file (excluding tests/dist/generated). The interface and call-graph changes are the actual work; raw call-site counts are an under-count of effort.

---

## 2. Phasing and Sequencing Rationale

The phases are sequenced so each one can ship independently if needed, but the recommendation is to ship **2–6 together** because:

- The same interface changes (e.g. adding `provider?: IMetadataProvider` to permission-provider methods) ripple through multiple consumers.
- Server resolvers, AI agents, and engine classes all share the same provider plumbing pattern; doing them in lockstep keeps the diff coherent.
- A single integration-test pass at the end covers all of them.

| Phase | Package(s) | Risk | LOC pressure | Why this order |
|---|---|---|---|---|
| 2 | MJServer | High | ~100 sites | Biggest blast radius; ResolverBase changes cascade everywhere. Do first to set the pattern. |
| 3 | AI Agents + MCP | High | ~63 sites | Heavily used in server context; depends on phase 2 patterns. |
| 4 | Integration + Actions + ContentAutotagging + VersionHistory | Medium | ~73 sites | Longer-running operations; transactions matter. |
| 5 | MJCoreEntities (engines, custom extended classes, permission providers) | Medium | ~47 sites | Foundation for many callers; saved for later because callers need to be ready to pass providers. |
| 6 | Angular components | Low–medium | hundreds | Mechanical; pattern is already established (`BaseAngularComponent`). |

**Test gates between phases:** after each phase, run `npm test` for affected packages and at minimum the full MJCore test suite.

---

## 3. Phase 2 — MJServer (Resolvers, REST handlers, services)

### 3.1 Scope

| File | Sites | Notes |
|---|---|---|
| [packages/MJServer/src/resolvers/IntegrationDiscoveryResolver.ts](../packages/MJServer/src/resolvers/IntegrationDiscoveryResolver.ts) | 25 | Reads/writes integration definitions; long-running, multi-step. |
| [packages/MJServer/src/services/TaskOrchestrator.ts](../packages/MJServer/src/services/TaskOrchestrator.ts) | 11 | Background-task orchestration; spans transactions. |
| [packages/MJServer/src/rest/RESTEndpointHandler.ts](../packages/MJServer/src/rest/RESTEndpointHandler.ts) | 9 | Dynamic REST surface; per-request. |
| [packages/MJServer/src/index.ts](../packages/MJServer/src/index.ts) | 8 | Mostly bootstrap (🟢 keep), but verify each. |
| [packages/MJServer/src/generic/ResolverBase.ts](../packages/MJServer/src/generic/ResolverBase.ts) | 7 | Base class — fix this first; subclasses inherit the pattern. |
| [packages/MJServer/src/resolvers/SyncRolesUsersResolver.ts](../packages/MJServer/src/resolvers/SyncRolesUsersResolver.ts) | 6 | |
| [packages/MJServer/src/rest/ViewOperationsHandler.ts](../packages/MJServer/src/rest/ViewOperationsHandler.ts) | 4 | |
| [packages/MJServer/src/rest/EntityCRUDHandler.ts](../packages/MJServer/src/rest/EntityCRUDHandler.ts) | 4 | |
| [packages/MJServer/src/agents/skip-sdk.ts](../packages/MJServer/src/agents/skip-sdk.ts) | 4 | |
| [packages/MJServer/src/resolvers/SyncDataResolver.ts](../packages/MJServer/src/resolvers/SyncDataResolver.ts) | 3 | |
| [packages/MJServer/src/resolvers/AutotagPipelineResolver.ts](../packages/MJServer/src/resolvers/AutotagPipelineResolver.ts) | 3 | |
| [packages/MJServer/src/context.ts](../packages/MJServer/src/context.ts) | 3 | Likely 🟢 — bootstrap path. Verify. |
| Other resolvers (~10 files) | 1–2 each | Mechanical once ResolverBase pattern is set. |

**Total:** ~100 sites across ~25 files.

### 3.2 Design — the MJServer pattern

`AppContext.providers: Array<ProviderInfo>` already exists on every resolver context. Helpers exist:

- [`GetReadOnlyProvider(providers, opts)`](../packages/MJServer/src/util.ts#L175)
- [`GetReadWriteProvider(providers, opts)`](../packages/MJServer/src/util.ts#L196)

**The rule:** every resolver method that reads metadata or runs queries gets the right provider from `ctx.providers` and uses it explicitly. Add a small helper on `ResolverBase` to make this terse:

```typescript
// Add to ResolverBase
protected GetProvider(ctx: AppContext, mode: 'read' | 'write' = 'read'): IMetadataProvider {
    const p = mode === 'write'
        ? GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: false })
        : GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true });
    if (!p) throw new Error(`No ${mode} provider available on AppContext`);
    return p;
}
```

Then convert each `new Metadata()` site:

```typescript
// ❌ Before
const md = new Metadata();
const entityInfo = md.Entities.find(e => e.Name === entityName);

// ✅ After
const md = this.GetProvider(ctx);
const entityInfo = md.EntityByName(entityName);  // also fixes the lookup pattern
```

For RunView calls, use `RunView.FromMetadataProvider(md)` instead of `new RunView()`.

### 3.3 Step-by-step

1. **Add `ResolverBase.GetProvider(ctx, mode)`** helper. Migrate the 7 calls inside ResolverBase to use it. Don't change subclasses yet.
2. **Update GraphQL @Mutation handlers first** (write path matters most for transaction isolation). For each mutation resolver, find the `new Metadata()` calls, replace with `this.GetProvider(ctx, 'write')`.
3. **Update @Query handlers** with `this.GetProvider(ctx, 'read')`.
4. **REST handlers** ([`RESTEndpointHandler.ts`](../packages/MJServer/src/rest/RESTEndpointHandler.ts), [`ViewOperationsHandler.ts`](../packages/MJServer/src/rest/ViewOperationsHandler.ts), [`EntityCRUDHandler.ts`](../packages/MJServer/src/rest/EntityCRUDHandler.ts)) — they already get a provider via `req` middleware; thread it through.
5. **TaskOrchestrator and skip-sdk** — these are services invoked by resolvers. Add `provider: IMetadataProvider` to their public method signatures; resolvers pass `this.GetProvider(ctx)`.
6. **IntegrationDiscoveryResolver (25 sites)** — biggest single file. Audit each method individually; many are admin-mode and may want `'admin'` provider type rather than read/write.
7. **Per file: confirm `index.ts` bootstrap calls remain on the global** (legitimate — they run before any request context exists).

### 3.4 Edge cases to flag

- **`Metadata.Provider.ConfigData.MJCoreSchemaName`** ([ResolverBase.ts:1001](../packages/MJServer/src/generic/ResolverBase.ts#L1001)) — used to read the configured schema name. This is process-wide config, not per-provider state, so this *might* be 🟢 legitimate. But verify: in a multi-server deployment, each provider has its own ConfigData. Safer to read from the request's provider.
- **Encryption engine config** ([ResolverBase.ts:108](../packages/MJServer/src/generic/ResolverBase.ts#L108)) — `EncryptionEngine.Instance.Config(false, contextUser)`. Engine singletons need their own per-provider story (see Phase 5).

### 3.5 Tests

- Run MJServer's own test suite after migration.
- Add at least one **integration test that asserts cross-provider isolation**: spin up two `DatabaseProviderBase` instances, make a save through one, run a view through the other, assert the cache and metadata don't leak.

---

## 4. Phase 3 — AI Agents and MCP

### 4.1 Scope

| File | Sites | Notes |
|---|---|---|
| [packages/AI/MCPServer/src/Server.ts](../packages/AI/MCPServer/src/Server.ts) | 12 | MCP server; multi-client. |
| [packages/AI/MCPClient/src/MCPClientManager.ts](../packages/AI/MCPClient/src/MCPClientManager.ts) | 10 | MCP client manager. |
| [packages/AI/Agents/src/memory-manager-agent.ts](../packages/AI/Agents/src/memory-manager-agent.ts) | 9 | |
| [packages/AI/AgentManager/core/src/agent-spec-sync.ts](../packages/AI/AgentManager/core/src/agent-spec-sync.ts) | 9 | |
| [packages/AI/Agents/src/base-agent.ts](../packages/AI/Agents/src/base-agent.ts) | 4 | Base class — fix first. |
| [packages/AI/MCPClient/src/ExecutionLogger.ts](../packages/AI/MCPClient/src/ExecutionLogger.ts) | 4 | |
| [packages/AI/MCPClient/src/oauth/OAuthManager.ts](../packages/AI/MCPClient/src/oauth/OAuthManager.ts) | 3 | |
| [packages/AI/MCPClient/src/oauth/ClientRegistration.ts](../packages/AI/MCPClient/src/oauth/ClientRegistration.ts) | 3 | |
| [packages/AI/Knowledge/TagEngine/src/TagGovernanceEngine.ts](../packages/AI/Knowledge/TagEngine/src/TagGovernanceEngine.ts) | 3 | |
| [packages/AI/Knowledge/TagEngine/src/TagCoOccurrenceEngine.ts](../packages/AI/Knowledge/TagEngine/src/TagCoOccurrenceEngine.ts) | 3 | |
| [packages/AI/AgentsClient/src/generic/AgentClientSession.ts](../packages/AI/AgentsClient/src/generic/AgentClientSession.ts) | 3 | |
| [packages/AI/Recommendations/Engine/src/Engine.ts](../packages/AI/Recommendations/Engine/src/Engine.ts) | 4 | |
| Other AI files (≤2 sites each) | ~remaining | |

**Total:** ~63 sites.

### 4.2 Design

`BaseAgent` and `MCPClientManager` are stateful objects that orchestrate execution. They should:

1. Accept a provider in construction or in their `RunAction`/`Execute` entry methods.
2. Pass it down to all internal RunView / GetEntityObject calls.
3. Hand it to `AIPromptRunner` (which probably has its own per-call params object — add a `provider` field there).

**Key signature changes:**

```typescript
// BaseAgent
public async RunAgent(params: RunAgentParams, provider?: IMetadataProvider): Promise<AgentResult> { ... }

// AIPromptParams
public class AIPromptParams {
    // ... existing fields
    public provider?: IMetadataProvider;
}

// MCPClientManager.Instance methods
public async ListServers(provider?: IMetadataProvider): Promise<MCPServer[]> { ... }
```

### 4.3 Step-by-step

1. Update `BaseAgent.RunAgent` signature first — agents are leaves in the call tree.
2. Migrate `memory-manager-agent.ts` and other concrete agents.
3. Update `AIPromptRunner.ExecutePrompt` to read provider from `AIPromptParams.provider`.
4. Migrate `MCPClientManager` and OAuth helpers — these are singletons whose methods accept a provider.
5. MCPServer: update tool handlers to receive the provider from the MCP request context.

### 4.4 Tests

- AI agents have unit tests in their packages — re-run them.
- Add an integration test: run the same agent twice, once under provider A and once under provider B, with different mocked entities; assert outputs reflect each provider correctly.

---

## 5. Phase 4 — Integration + Actions + ContentAutotagging + VersionHistory

### 5.1 Scope

| File | Sites | Notes |
|---|---|---|
| [packages/Integration/engine/src/IntegrationEngine.ts](../packages/Integration/engine/src/IntegrationEngine.ts) | 10 | |
| [packages/Integration/engine/src/MatchEngine.ts](../packages/Integration/engine/src/MatchEngine.ts) | 2 | |
| [packages/Integration/engine/src/IntegrationSchemaSync.ts](../packages/Integration/engine/src/IntegrationSchemaSync.ts) | 2 | |
| [packages/Actions/RuntimeHost/src/RuntimeActionBridge.ts](../packages/Actions/RuntimeHost/src/RuntimeActionBridge.ts) | 9 | Runtime action bridge handlers. |
| Actions/CoreActions/src/custom/** (~10 sites) | scattered | Per-action sites. |
| [packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts](../packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts) | 9 | |
| [packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts](../packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts) | 3 | |
| ContentAutotagging cloud-storage providers (~6 sites) | scattered | |
| [packages/VersionHistory/src/RestoreEngine.ts](../packages/VersionHistory/src/RestoreEngine.ts) | 7 | |
| [packages/VersionHistory/src/SnapshotBuilder.ts](../packages/VersionHistory/src/SnapshotBuilder.ts) | 5 | |
| [packages/VersionHistory/src/DependencyGraphWalker.ts](../packages/VersionHistory/src/DependencyGraphWalker.ts) | 3 | |
| [packages/VersionHistory/src/DiffEngine.ts](../packages/VersionHistory/src/DiffEngine.ts) | 2 | |
| Other VersionHistory (~3 sites) | scattered | |

**Total:** ~73 sites.

### 5.2 Design

#### Actions — `RunActionParams` and `BridgeContext`

Both need a `Provider` field. Then `ActionEngine.RunAction` plumbs it from `RunActionParams.Provider` into `BridgeContext.provider`:

```typescript
// ActionEngine-Base.ts
export class RunActionParams<TContext = any> {
    // ... existing fields
    /** The metadata provider this action should run against. Required for transaction
     *  isolation and multi-provider correctness. Falls back to Metadata.Provider when absent. */
    public Provider?: IMetadataProvider;
}

// RuntimeActionBridgeBuilder.ts
export interface BridgeContext {
    action: MJActionEntity;
    config: MJActionEntity_IRuntimeActionConfiguration;
    contextUser: UserInfo;
    abortSignal?: AbortSignal;
    /** The provider the action runs under — defaults to Metadata.Provider if undefined. */
    provider?: IMetadataProvider;
}

// ActionEngine.RunAction call site
bridgeHandlers = builder.BuildHandlers({
    action: params.Action,
    config,
    contextUser: params.ContextUser,
    abortSignal: params.AbortSignal,
    provider: params.Provider                          // NEW
});
```

Each `handle*` function in [`RuntimeActionBridge.ts`](../packages/Actions/RuntimeHost/src/RuntimeActionBridge.ts) replaces `new Metadata()` with `ctx.provider ?? new Metadata()`.

**Caller updates:** every server-side resolver that invokes an action must pass `Provider: ctx.GetProvider(ctx)` in `RunActionParams`. Phase 2 should land first so resolvers have the helper.

#### Engines (Integration, ContentAutotagging, VersionHistory)

These are stateful service classes. The pattern from MJ's existing `BaseEngine`:

- A `_provider: IMetadataProvider` field set by `Config(forceRefresh, contextUser, provider?)`.
- A `ProviderToUse` accessor: `this._provider ?? Metadata.Provider`.
- All internal calls use `this.ProviderToUse`.

Migrate each engine to that pattern. The constructor stays parameterless (singletons), but `Config` accepts and stores a provider, and all subsequent methods use the stored value.

For multi-provider scenarios where the same engine class needs to run against multiple providers in parallel: use the existing `BaseEngine.GetProviderInstance(provider, EngineClass)` factory pattern (see [`BaseEngine.SetProvider`](../packages/MJCore/src/generic/baseEngine.ts) and the `ProviderInstances` registry).

### 5.3 Step-by-step

1. Add `Provider?: IMetadataProvider` to `RunActionParams` and `BridgeContext`. Plumb through `ActionEngine.RunAction`.
2. Migrate `RuntimeActionBridge` handlers (9 sites — mechanical).
3. Migrate Custom actions in `packages/Actions/CoreActions/src/custom/**` to read `params.Provider` instead of `new Metadata()`.
4. Migrate Integration engines — `IntegrationEngine` first (others depend on it).
5. Migrate ContentAutotagging — `AutotagBaseEngine` first.
6. Migrate VersionHistory — `SnapshotBuilder` and `RestoreEngine` are top-level entry points; do them first.

### 5.4 Tests

Each affected package has its own test suite. Add focused tests for:

- An action that runs under a non-default provider successfully uses that provider.
- VersionHistory snapshot of provider A doesn't leak data from provider B.

---

## 6. Phase 5 — MJCoreEntities (engines, custom extended classes, permission providers)

### 6.1 Scope

| File | Sites | Notes |
|---|---|---|
| [packages/MJCoreEntities/src/engines/conversations.ts](../packages/MJCoreEntities/src/engines/conversations.ts) | 10 | |
| [packages/MJCoreEntities/src/engines/UserInfoEngine.ts](../packages/MJCoreEntities/src/engines/UserInfoEngine.ts) | 9 | |
| [packages/MJCoreEntities/src/custom/MJUserViewEntityExtended.ts](../packages/MJCoreEntities/src/custom/MJUserViewEntityExtended.ts) | 8 | |
| [packages/MJCoreEntities/src/engines/UserViewEngine.ts](../packages/MJCoreEntities/src/engines/UserViewEngine.ts) | 2 | |
| [packages/MJCoreEntities/src/engines/GeoDataEngine.ts](../packages/MJCoreEntities/src/engines/GeoDataEngine.ts) | 1 | |
| [packages/MJCoreEntities/src/custom/PermissionProviders/EntityPermissionProvider.ts](../packages/MJCoreEntities/src/custom/PermissionProviders/EntityPermissionProvider.ts) | 5 | |
| [packages/MJCoreEntities/src/custom/PermissionProviders/AccessControlRuleProvider.ts](../packages/MJCoreEntities/src/custom/PermissionProviders/AccessControlRuleProvider.ts) | 3 | |
| [packages/MJCoreEntities/src/custom/PermissionProviders/ApplicationRolePermissionProvider.ts](../packages/MJCoreEntities/src/custom/PermissionProviders/ApplicationRolePermissionProvider.ts) | 3 | |
| [packages/MJCoreEntities/src/custom/PermissionProviders/ResourcePermissionProvider.ts](../packages/MJCoreEntities/src/custom/PermissionProviders/ResourcePermissionProvider.ts) | 1 | |
| [packages/MJCoreEntities/src/custom/PermissionProviders/QueryPermissionProvider.ts](../packages/MJCoreEntities/src/custom/PermissionProviders/QueryPermissionProvider.ts) | 1 | |
| [packages/MJCoreEntities/src/custom/MJDashboardEntityExtended.ts](../packages/MJCoreEntities/src/custom/MJDashboardEntityExtended.ts) | 1 | |
| [packages/MJCoreEntities/src/custom/MJListDetailEntityExtended.ts](../packages/MJCoreEntities/src/custom/MJListDetailEntityExtended.ts) | 1 | |
| [packages/MJCoreEntities/src/custom/Permissions/MJAccessControlRuleEntityExtended.ts](../packages/MJCoreEntities/src/custom/Permissions/MJAccessControlRuleEntityExtended.ts) | 1 | |
| [packages/MJCoreEntities/src/custom/ResourcePermissions/ResourcePermissionEngine.ts](../packages/MJCoreEntities/src/custom/ResourcePermissions/ResourcePermissionEngine.ts) | 1 | |
| MJCoreEntitiesServer (~13 sites) | scattered | Server-side counterparts. |

**Total:** ~47+ sites in MJCoreEntities and ~13 in MJCoreEntitiesServer.

### 6.2 Design

#### Engines

`UserInfoEngine`, `ConversationEngine`, `GeoDataEngine`, `UserViewEngine` — all are `BaseEngine` subclasses. They already inherit `_provider`/`ProviderToUse` from `BaseEngine` (see [`baseEngine.ts:317`](../packages/MJCore/src/generic/baseEngine.ts#L317)). Their bug is that they call `new Metadata()` instead of `this.ProviderToUse`. Mechanical fix once the engine pattern is established.

#### Custom extended entity classes (`MJUserViewEntityExtended`, etc.)

These are `BaseEntity` subclasses. They already inherit `ProviderToUse` from `BaseEntity` ([`baseEntity.ts:1216`](../packages/MJCore/src/generic/baseEntity.ts#L1216)). Same mechanical fix: replace `new Metadata()` with `this.ProviderToUse as unknown as IMetadataProvider`.

#### Permission providers

This is the only sub-area that needs **interface changes**. The current `IPermissionProvider`:

```typescript
CheckPermission(user, resourceType, resourceId, action): Promise<...>;
GetEffectivePermissions(user, resourceType, resourceId): Promise<...>;
GetUserResources(user, resourceType?): Promise<...>;
GetResourcePermissions(resourceType, resourceId): Promise<...>;
GetPermissionsGrantedByUser(grantor): Promise<...>;
GetPermissionsSharedWithUser(grantee): Promise<...>;
```

needs to become:

```typescript
CheckPermission(user, resourceType, resourceId, action, provider?): Promise<...>;
// ... etc — every method accepts an optional `provider?: IMetadataProvider` as final param.
```

**Migration order:**

1. Update [`IPermissionProvider`](../packages/MJCore/src/generic/permissionInterfaces.ts#L91) and [`PermissionProviderBase`](../packages/MJCore/src/generic/permissionInterfaces.ts#L172) signatures (optional param — backward compatible).
2. Update each concrete provider: `EntityPermissionProvider`, `AccessControlRuleProvider`, etc., to read provider as `provider ?? new Metadata()`. Internal helpers like `ResourcePermissionEngine.Instance` need provider-aware variants — use `Engine.GetProviderInstance(provider, EngineClass)`.
3. Update **all 97 callers** identified by audit to pass the provider. Most are server resolvers (caught by Phase 2) and Sharing Center components. Coordinate with Phase 2.

### 6.3 Step-by-step

1. **Engines first** (10 + 9 + 2 + 1 = 22 sites) — pure mechanical, no signature changes.
2. **Custom extended entity classes** (~12 sites) — same.
3. **Permission provider interface** + base class signatures.
4. **Each concrete permission provider** (~13 sites).
5. **Permission provider callers** in MJCoreEntitiesServer and Sharing Center components — coordinate with Phase 2 timing.

### 6.4 Tests

- Run MJCoreEntities and MJCoreEntitiesServer test suites.
- Add a test that two BaseEngine subclass instances bound to different providers (via `BaseEngine.GetProviderInstance`) maintain separate state.

---

## 7. Phase 6 — Angular components

### 7.1 Scope

The audit counted ~486 `new Metadata()` calls across 10 Angular sub-packages. Most are in client-side components that should accept `@Input() Provider`. The pattern is already documented in [packages/Angular/CLAUDE.md](../packages/Angular/CLAUDE.md) and exemplified by [`BaseAngularComponent`](../packages/Angular/Generic/base-types/src/base-angular-component.ts).

**High-volume targets:**

- [packages/Angular/Explorer/explorer-settings/](../packages/Angular/Explorer/explorer-settings/) — `EntityPermissionsComponent`, `UserProfileSettingsComponent`, `PermissionDialogComponent`. ~30 sites identified.
- [packages/Angular/Explorer/dashboards/](../packages/Angular/Explorer/dashboards/) — many dashboards still use `new Metadata()` directly.
- [packages/Angular/Generic/](../packages/Angular/Generic/) — generic components in mixed states (some correct, many not).

### 7.2 Design — already established

```typescript
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

@Component({ ... })
export class MyComponent extends BaseAngularComponent {
    // Inherits @Input() Provider, ProviderToUse, RunViewToUse, etc.

    async loadData() {
        const p = this.ProviderToUse;
        const rv = RunView.FromMetadataProvider(p);
        const result = await rv.RunView({ EntityName: '...' });
        const md = p;
        const entity = await md.GetEntityObject<MyEntity>('My Entity', md.CurrentUser);
    }
}
```

Templates pass the provider down to children:

```html
<mj-data-context [Provider]="Provider"></mj-data-context>
```

### 7.3 Step-by-step

1. **Per-package sweep**, starting with most-used Generic components:
   - `data-context` (already correct — reference)
   - `resource-permissions` (already correct — reference)
   - `user-view-grid`, `record-list`, `entity-form-dialog`
2. **Explorer-specific dashboards.** These are leaf consumers; once their inputs are wired, the chain is complete.
3. **Skip Chat / AskSkip** components — these are the original multi-provider consumers; verify they're still correct.

### 7.4 Tests

Angular components have minimal test coverage today. The verification path is:

- Build all Angular packages: `npm run build` in each.
- Smoke-test MJExplorer in the browser under a configured provider.
- For multi-provider validation: extend an existing demo app or create a small one that loads two `GraphQLDataProvider` instances pointing at different MJ servers and switches between them.

---

## 8. Cross-Cutting Concerns

### 8.1 Engine singletons

Several singletons (`AIEngine`, `EntityPermissionEngine`, `ResourcePermissionEngine`, `ConversationEngine`, etc.) cache per-provider state. They use the `BaseEngine.GetProviderInstance(provider, EngineClass)` pattern, which already maintains a separate instance per provider. **The bug is when callers use `Engine.Instance` (the global default) instead of `Engine.GetProviderInstance(providerToUse, EngineClass)`.**

For each engine touched in Phases 2–5, audit `.Instance` usages and convert to `GetProviderInstance(p, ...)` where the caller has a provider in scope.

### 8.2 `ProviderBase.LocalMetadata` clone

[providerBase.ts:2622](../packages/MJCore/src/generic/providerBase.ts#L2622): `this._localMetadata = this.CloneAllMetadata(Metadata.Provider.AllMetadata);`

This clone-from-default pattern is questionable in a multi-provider world. When a non-default provider initializes for the first time, it shouldn't seed itself from the default's metadata. Audit: when is this cloning desirable vs. harmful? Likely 🟡 — keep for backward compat, document the constraint, and add an opt-out flag.

### 8.3 Tests for the global rule

The compliance ratchet test added in Phase 1 ([packages/MJGlobal/src/__tests__/MultiProviderCompliance.test.ts](../packages/MJGlobal/src/__tests__/MultiProviderCompliance.test.ts)) prevents regressions during the migration. It scans every `*.ts` file under `packages/` for `new Metadata()` and `Metadata.Provider` references and fails if any package's count exceeds its persisted baseline. Inline `// global-provider-ok: <reason>` allowlists individual lines.

**During Phases 2–5** (each phase's PR):
1. Migrate the call sites in scope.
2. Re-run the test — it will print "fewer violations than baseline" reductions.
3. Update [multi-provider-baseline.json](../packages/MJGlobal/src/__tests__/multi-provider-baseline.json) to lock in the lower numbers.
4. Confirm the test is green against the new baseline.

**At the end of Phase 6** (the PR that completes the migration), the test must be **flipped to strict mode**:
- Delete `multi-provider-baseline.json`.
- Replace the ratchet logic in `MultiProviderCompliance.test.ts` with a strict assertion: any non-allowlisted violation fails the test, no per-package allowance.
- The only way past the test is then either (a) fix the call site, or (b) add a `// global-provider-ok: <reason>` comment with a reviewable justification (bootstrap, CLI, codegen).
- This is mandatory; ratchet mode is a migration-only crutch and must not survive past Phase 6.

### 8.4 Documentation deltas

- ✅ Root [CLAUDE.md](../CLAUDE.md): "Don't reach for the global Metadata provider in per-provider code paths" — added in Phase 1.
- ✅ [packages/Angular/CLAUDE.md](../packages/Angular/CLAUDE.md): Multi-provider `@Input() Provider` pattern — added in Phase 1.
- 🔲 Add `packages/MJServer/CLAUDE.md` section: "Always use `this.GetProvider(ctx, 'read'|'write')` in resolvers."
- 🔲 Add `packages/AI/CLAUDE.md` section: "Agents and prompt runners must accept and thread a provider."
- 🔲 Add `packages/Actions/CLAUDE.md` section: "`RunActionParams.Provider` is required for server-invoked actions."

---

## 9. Estimated Effort

| Phase | Files | Sites | Engineering days (rough) |
|---|---|---|---|
| 2 — MJServer | ~25 | ~100 | 4–5 |
| 3 — AI Agents + MCP | ~30 | ~63 | 3–4 |
| 4 — Integration / Actions / Autotagging / VersionHistory | ~25 | ~73 | 3–4 |
| 5 — MJCoreEntities | ~14 + ~13 | ~60 | 2–3 |
| 6 — Angular | ~80+ | ~486 | 5–7 (mechanical but high volume) |
| **Total** | **~170** | **~780** | **17–23** |

These are pessimistic estimates that include integration testing, code review iteration, and the inevitable subtle bugs. Optimistic case is roughly half.

---

## 10. Acceptance Criteria for "Done"

1. **Compliance test flipped to strict mode** ([§8.3](#83-tests-for-the-global-rule)). Baseline file deleted. Every remaining `new Metadata()` / `Metadata.Provider` reference is annotated with `// global-provider-ok: <reason>` (bootstrap, CLI, codegen, or other reviewable justification). This is the hard gate for "phases 2–6 are done" — the test must be strict and green before merge.
2. `LocalCacheManager` cache decisions are correct under a 2-provider integration test (one provider has `AllowCaching=true` for entity X, the other has `AllowCaching=false`; cache writes/reads/invalidations only affect each provider's namespace).
3. MJServer integration test: two requests in flight, each with a different `AppContext.providers` set, run a save through one and a view through the other; no metadata, cache, or RLS leakage observed.
4. Angular smoke-test app demonstrates two `GraphQLDataProvider` instances against different servers, with components correctly scoping queries and saves.
5. The strict compliance test runs in CI and fails any PR that introduces a non-annotated violation.

---

## 11. Risks and Mitigations

- **Risk: interface changes break downstream consumers.** Mitigation: every new `provider` param is *optional* with fallback to global. Existing callers continue to work. Migration is opt-in per call site.
- **Risk: silent regressions where the wrong provider is silently chosen.** Mitigation: add the integration tests in §10 before any phase ships.
- **Risk: phase 6 (Angular) is too large for one PR.** Mitigation: split per package within phase 6 — `Generic/` first, then `Explorer/dashboards`, then leaf components. Each is independently reviewable.
- **Risk: code-review fatigue.** Mitigation: each phase is its own PR (or mergeable commit set within the bigger PR). Reviewers see one coherent slice at a time.

---

## 12. Deferred Work — REST and A2A Per-Request Provider Plumbing

Phases 2–6 are complete and the strict compliance test is green. Two structural gaps remain, intentionally deferred because both surfaces are uncommon in current deployments:

### 12.1 REST endpoint handlers (~13 sites)

**Files:**
- [packages/MJServer/src/rest/RESTEndpointHandler.ts](../packages/MJServer/src/rest/RESTEndpointHandler.ts)
- [packages/MJServer/src/rest/EntityCRUDHandler.ts](../packages/MJServer/src/rest/EntityCRUDHandler.ts)
- [packages/MJServer/src/rest/ViewOperationsHandler.ts](../packages/MJServer/src/rest/ViewOperationsHandler.ts)

All currently allowlisted with `// global-provider-ok: REST endpoint — no per-request provider injection in REST middleware yet`.

**Problem:** GraphQL resolvers receive `AppContext.providers` (built per-request via `resolveProviderForRequest`), but REST middleware has no equivalent. Every REST handler reaches for `new Metadata()` and silently uses the global default — fine for single-server deployments, broken for multi-tenant ones.

**Fix:** Build the same per-request provider materialization that GraphQL uses, expose it as an Express middleware that attaches `req.mjProvider`, and update each handler to read from `req.mjProvider` instead of `new Metadata()`. The handler bodies are mechanical to migrate once the middleware exists.

### 12.2 A2A server request boundary (1 centralized site)

**File:** [packages/AI/A2AServer/src/Server.ts:387](../packages/AI/A2AServer/src/Server.ts#L387)

Already centralized into a single `resolveProviderForRequest()` boundary that returns `Metadata.Provider`. The constructors of `AgentOperations` and `EntityOperations` already accept an `IMetadataProvider`, so the rest of the A2A code is provider-correct — only this one entry point needs to materialize a per-request provider.

**Fix:** Mirror MJServer's `resolveProviderForRequest` once A2A grows per-request authentication / tenant resolution. One-line change at the boundary; downstream code is already wired.

### 12.3 Why deferred

Neither REST endpoints nor A2A are commonly used in current MJ deployments. Both are single-line migrations at a clear boundary once the per-request provider plumbing is built. Tracking them here so the next person picking up multi-tenant work has a clean starting point.

---

## 13. Open Questions for Reviewer

1. **MJServer mode helper:** `ResolverBase.GetProvider(ctx, mode)` — should `mode` default to `'read'` or `'write'`? Current draft says `'read'`. Mutations explicitly ask for `'write'`.
2. **Engine global `.Instance`:** Should we deprecate `Engine.Instance` entirely, or leave it as the "global default" path with a warning? Strict deprecation is cleaner; leaving it is gentler on third-party consumers.
3. **Cloning local metadata** (§8.2) — is the existing clone-from-default behavior at provider init load-bearing for any deployment, or is it safe to drop?
4. **Angular `BaseAngularComponent` adoption:** is it acceptable to mass-rebase existing components onto `BaseAngularComponent` (a one-line `extends` change), or should we keep the current "use it for new code only" policy?
