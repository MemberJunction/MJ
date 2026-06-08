# Transport-Layer Architecture Guide

> **When to read this**: Before you build any new server-side capability that the browser (or an AI agent) needs to invoke — clustering, search, classification, an LLM call, a bulk operation, a "run this pipeline" button, etc. This guide is the canonical reference for MemberJunction's **engine → resolver → GraphQL client → thin UI** layering, plus the optional **Action** layer for agentic invocation.
>
> **This is NOT for plain CRUD.** Every entity already gets a generated, secured, typed API (views + spCreate/spUpdate/spDelete + GraphQL types) via CodeGen, consumed in the UI through `RunView` / `GetEntityObject` / `BaseEntity.Save()`. Do **not** hand-write a resolver or a GraphQL client for ordinary record reads/writes — use the generated entity layer. This guide is for **custom operations** that aren't a single-entity CRUD call: cross-entity logic, compute-heavy work, third-party calls, orchestration, anything with real business logic.

---

## 1. The pattern in one picture

```
                          ┌────────────────────────────────────────────┐
                          │  Framework-agnostic ENGINE                   │
   business logic ──────▶ │  (BaseEngine / BaseSingleton subclass)       │  ← the ONE place logic lives
   lives here ONCE        │  @memberjunction/<feature>-engine            │
                          │  e.g. ClusteringEngine, SearchEngine         │
                          └───────────────────┬──────────────────────────┘
                                              │  imported & called by
                          ┌───────────────────▼──────────────────────────┐
                          │  Thin RESOLVER (TypeGraphQL)                   │  ← auth + delegate, no logic
                          │  packages/MJServer/src/resolvers/*.ts         │
                          │  @Mutation/@Query → engine method             │
                          └───────────────────┬──────────────────────────┘
                                              │  exposed over GraphQL
        ┌─────────────────────────────────────┼─────────────────────────────────┐
        │                                     │                                   │
┌───────▼────────────────────┐   ┌────────────▼───────────────┐                  │
│ Typed GraphQL CLIENT helper │   │ ACTION (optional)           │                  │
│ @memberjunction/            │   │ @memberjunction/core-actions│ ← agentic /      │
│ graphql-dataprovider        │   │ wraps the engine for agents │   workflow /     │
│ e.g. GraphQLClusterClient   │   │ & low-code invocation       │   low-code       │
└───────┬─────────────────────┘   └─────────────────────────────┘                  │
        │  called by                                                                │
┌───────▼─────────────────────────────────────────────────────────────────────────┘
│  THINNEST POSSIBLE Angular UI wrapper
│  packages/Angular/**  — component calls the client helper, renders the typed result.
│  NEVER inlines a gql`` string. NEVER reaches the engine directly.
└───────────────────────────────────────────────────────────────────────────────────
```

**The single rule that makes this work:** business logic lives in the **engine, exactly once**. Every other layer is a thin adapter that adds *only* its own concern — the resolver adds auth + transport, the client adds typing + JSON-parsing, the UI adds rendering, the Action adds an agent-discoverable contract. If you find real logic creeping into a resolver, a client, or a component, it belongs in the engine instead.

---

## 2. Why each layer exists (and what it must NOT do)

| Layer | Package | Responsibility | Must NOT |
|-------|---------|----------------|----------|
| **Engine** | `@memberjunction/<feature>-engine` (or `-engine-base` for browser-safe) | All business logic. Framework-agnostic — no Angular, no Express, no TypeGraphQL imports. Extends `BaseEngine`/`BaseSingleton`. | Import any UI or transport framework. Know that GraphQL exists. |
| **Resolver** | `packages/MJServer/src/resolvers/` | Extract the current user from the request context, validate/authorize, **delegate to the engine**, map the engine result to GraphQL `@ObjectType`s. | Contain business logic. Do data crunching. Be more than ~1–2 statements of real work beyond auth + mapping. |
| **GraphQL client** | `@memberjunction/graphql-dataprovider` | A strongly-typed transport: build the `gql` mutation/query, call `ExecuteGQL`, **parse JSON-string fields back into typed objects**, return a typed result interface. | Contain business logic. Be the only copy of a type that the engine also defines (keep it decoupled — mirror the shape, see §5). |
| **Action** (optional) | `@memberjunction/core-actions` (or a feature action pkg) | Expose the same engine capability to **agents / workflows / low-code** via the metadata-driven Action contract. Thin — extract params, call the engine, shape `ActionResultSimple`. | Call the resolver or the GraphQL client. Re-implement logic. (Actions are code→agent boundaries, never code→code — see root `CLAUDE.md` "Actions Design Philosophy".) |
| **Angular UI** | `packages/Angular/**` | The thinnest possible wrapper: instantiate the client helper with the active `GraphQLDataProvider`, call its method, render the typed result, handle loading/error. | Inline `gql` strings. Call `ExecuteGQL` directly. Reach into the engine. Duplicate result-shaping the client already did. |

---

## 3. Step-by-step: adding a new capability

Suppose you're adding a "Summarize Source" capability.

### Step 1 — Build the engine (logic lives here)

Create or extend a framework-agnostic engine. If the engine must also run **in the browser**, keep it in a `-engine-base` package that has no server-only dependencies (no `aiengine`, no storage/vector SDKs, no `templates`) — see the Bootstrap CLAUDE.md guardrails. Server-only engines can pull whatever they need.

```typescript
// packages/.../summarize-engine/src/SummarizeEngine.ts
import { BaseEngine, BaseEnginePropertyConfig, UserInfo } from '@memberjunction/core';

export interface SummarizeResult {
    Success: boolean;
    Summary: string;
    TokensUsed: number;
    ErrorMessage?: string;
}

export class SummarizeEngine extends BaseEngine<SummarizeEngine> {
    public static get Instance(): SummarizeEngine {
        return super.getInstance<SummarizeEngine>();
    }

    public async SummarizeSource(sourceID: string, contextUser: UserInfo): Promise<SummarizeResult> {
        // ALL the real work — load content, call the LLM via AIPromptRunner, tally tokens.
        // This is the only place this logic exists.
    }
}
```

### Step 2 — Wrap it in a thin resolver

```typescript
// packages/MJServer/src/resolvers/SummarizeResolver.ts
import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, ID } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { SummarizeEngine } from '@memberjunction/summarize-engine';

@ObjectType()
export class SummarizeSourceResult {
    @Field() Success: boolean;
    @Field() Summary: string;
    @Field() TokensUsed: number;
    @Field({ nullable: true }) ErrorMessage?: string;
}

@Resolver()
export class SummarizeResolver extends ResolverBase {
    @Mutation(() => SummarizeSourceResult)
    async SummarizeSource(
        @Arg('sourceID', () => ID) sourceID: string,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<SummarizeSourceResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);   // auth
            if (!currentUser) return { Success: false, Summary: '', TokensUsed: 0, ErrorMessage: 'No user' };
            return await SummarizeEngine.Instance.SummarizeSource(sourceID, currentUser);  // delegate
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`SummarizeSource failed: ${msg}`);
            return { Success: false, Summary: '', TokensUsed: 0, ErrorMessage: msg };
        }
    }
}
```

Notes:
- Extend `ResolverBase` and use `this.GetUserFromPayload(userPayload)` to get the per-request `UserInfo`. **The current user comes from the request context, not from a global.**
- The resolver body is auth → delegate → return. No logic.
- For values that don't map cleanly to GraphQL scalars (arrays of objects, maps), return them as **JSON strings** (`MetricsJSON`, `PointsJSON`, …) and let the client parse them — see `SearchKnowledgeResolver`/`RunClusterAnalysisResolver` for both styles (typed `@ObjectType` arrays vs. JSON-string fields). JSON-string fields are the simplest path when the shape is large or fluid.
- Resolvers are auto-discovered by MJServer — no central registration needed.

### Step 3 — Add a typed GraphQL client helper

```typescript
// packages/GraphQLDataProvider/src/graphQLSummarizeClient.ts
import { LogError } from '@memberjunction/core';
import { GraphQLDataProvider } from './graphQLDataProvider';
import { gql } from 'graphql-request';

export interface SummarizeSourceResult {
    Success: boolean;
    Summary: string;
    TokensUsed: number;
    ErrorMessage?: string;
}

/**
 * Thin, strongly-typed transport for the `SummarizeSource` mutation.
 * Follows the same convention as GraphQLClusterClient / GraphQLAIClient.
 */
export class GraphQLSummarizeClient {
    private _dataProvider: GraphQLDataProvider;
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    public async SummarizeSource(sourceID: string): Promise<SummarizeSourceResult> {
        try {
            const mutation = gql`
                mutation SummarizeSource($sourceID: ID!) {
                    SummarizeSource(sourceID: $sourceID) {
                        Success Summary TokensUsed ErrorMessage
                    }
                }
            `;
            const result = await this._dataProvider.ExecuteGQL(mutation, { sourceID });
            const raw = result?.SummarizeSource;
            if (!raw) throw new Error('Invalid response from server');
            return raw;   // parse JSON-string fields here if the resolver returned any
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLSummarizeClient.SummarizeSource failed', undefined, e);
            return { Success: false, Summary: '', TokensUsed: 0, ErrorMessage: e.message || 'Unknown error' };
        }
    }
}
```

Then export it from `packages/GraphQLDataProvider/src/index.ts` (export the class **and** its public interfaces).

### Step 4 — Consume it from a thin Angular wrapper

```typescript
// In an Angular component (extends BaseAngularComponent for multi-provider support)
import { GraphQLSummarizeClient } from '@memberjunction/graphql-dataprovider';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

public async OnSummarizeClicked(): Promise<void> {
    this.IsRunning = true;
    try {
        const client = new GraphQLSummarizeClient(this.ProviderToUse as GraphQLDataProvider);
        const res = await client.SummarizeSource(this.SourceID);
        if (res.Success) {
            this.Summary = res.Summary;          // render the typed result
        } else {
            this.notifications.error(res.ErrorMessage ?? 'Summarize failed');
        }
    } finally {
        this.IsRunning = false;
    }
}
```

The component never sees a `gql` string. It depends only on the client's typed surface. (`ProviderToUse` comes from `BaseAngularComponent` — see Angular CLAUDE.md "Multi-Provider Support".)

### Step 5 (optional) — Add an Action for agentic invocation

If an **AI agent, workflow engine, or low-code builder** should be able to discover and invoke this capability, add an Action that **calls the engine directly** (never the resolver/client):

```typescript
// packages/Actions/.../SummarizeSourceAction.ts
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SummarizeEngine } from '@memberjunction/summarize-engine';

@RegisterClass(BaseAction, 'Summarize Source')
export class SummarizeSourceAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const sourceID = this.getParamValue(params, 'SourceID');
        const result = await SummarizeEngine.Instance.SummarizeSource(sourceID, params.ContextUser);
        return result.Success
            ? { Success: true, ResultCode: 'SUCCESS', Message: result.Summary }
            : { Success: false, ResultCode: 'FAILED', Message: result.ErrorMessage };
    }
}
```

**Why the Action calls the engine, not the resolver:** Actions are a code→agent boundary, not a code→code transport. Going engine-direct preserves type safety, avoids a network hop, and keeps a single source of truth. See the "Actions Design Philosophy" section in the root `CLAUDE.md`.

---

## 4. Decision guide — which layers do I actually need?

| Your capability… | Engine | Resolver | GraphQL client | Action | UI |
|---|:--:|:--:|:--:|:--:|:--:|
| Plain single-entity CRUD | — use generated entity layer (`RunView`/`BaseEntity`) — | | | | |
| Custom server logic the **UI** invokes | ✅ | ✅ | ✅ | ▫️ | ✅ |
| Custom server logic **agents** invoke too | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom logic only **agents/workflows** invoke (no UI) | ✅ | ▫️ | ▫️ | ✅ | — |
| Browser-side compute with no server round-trip | ✅ (`-engine-base`) | — | — | ▫️ | ✅ |

✅ = required · ▫️ = optional / when applicable · — = not needed

The engine is **always** present — it's the home of the logic. Everything else is an adapter you add when that adapter's audience exists.

---

## 5. Conventions & gotchas

- **Keep the client decoupled from the engine.** The GraphQL client should *mirror* the engine's result shape with its own local interfaces, not `import` the engine's types. `GraphQLClusterClient` defines its own `ClusterAnalysisPoint` rather than importing `clustering-engine`'s `ClusterPoint`, so the transport package never takes a dependency on the engine. (This also keeps the browser bundle from pulling a server engine.)
- **JSON-string fields for complex payloads.** GraphQL scalars don't carry arbitrary nested objects cleanly. The established pattern is to return large/fluid structures as JSON strings from the resolver (`PointsJSON`, `MetricsJSON`, `ClustersJSON`) and parse them in the client with `SafeJSONParse`, exposing typed objects to callers. Use real `@ObjectType` arrays when the shape is stable and you want field-level GraphQL selection (see `SearchKnowledgeResolver`).
- **Naming:** client classes are `GraphQL<Feature>Client`, one public async method per capability, constructor takes a `GraphQLDataProvider`. Resolvers are `<Feature>Resolver` extending `ResolverBase`.
- **Per-request user, not global.** Resolvers must derive `UserInfo` from `userPayload` via `ResolverBase.GetUserFromPayload`. Pass it into every engine/entity call (`contextUser`). Server-side code serves many users concurrently — never rely on a process-global current user.
- **Multi-provider on the client.** Angular components must construct the client with `this.ProviderToUse` (from `BaseAngularComponent`), not a hard-coded global `GraphQLDataProvider`. See Angular CLAUDE.md.
- **Error contract:** every client method catches, `LogError`s, and returns a `{ Success: false, ErrorMessage }`-shaped result rather than throwing — so the UI can render a friendly message without a try/catch around every call.

---

## 6. Reference implementations (read these)

**GraphQL client helpers** — `packages/GraphQLDataProvider/src/`:
- `graphQLClusterClient.ts` — cleanest end-to-end example with JSON-string parsing (`GraphQLClusterClient`).
- `graphQLClassifyClient.ts` — seed-taxonomy generation (`GraphQLClassifyClient`).
- `graphQLAIClient.ts` — AI prompt / agent execution + embeddings.
- `graphQLSearchClient.ts` — Observable-streaming search results.
- `graphQLActionClient.ts` — running standalone & entity Actions over GraphQL.
- Others: `graphQLEncryptionClient`, `graphQLIntegrationClient`, `graphQLFileStorageClient`, `graphQLListsClient`, `graphQLVersionHistoryClient`, `GraphQLComponentRegistryClient`, `graphQLSystemUserClient`.

**Thin resolvers** — `packages/MJServer/src/resolvers/`:
- `SearchKnowledgeResolver.ts` — typed `@ObjectType` results + auth + scope checks, delegating to `SearchEngine`.
- `AutotagPipelineResolver.ts` — fire-and-forget pipeline kickoff with per-request provider capture.
- `ComponentRegistryResolver.ts` — query delegating to a metadata engine.

**Engines** — `ClusteringEngine` (`@memberjunction/clustering-engine`), `SearchEngine` (`@memberjunction/search-engine`), and the `-engine-base` browser-safe split (`tag-engine-base`, `ai-engine-base`).

---

## 7. Related guides

- Root [`CLAUDE.md`](../CLAUDE.md) — "Actions Design Philosophy" (when code→agent vs code→code), Rule #7 (`BaseSingleton`), Rule #5 (no cross-package re-exports — the client mirrors types, doesn't re-export them).
- [`guides/CACHING_AND_PUBSUB_GUIDE.md`](CACHING_AND_PUBSUB_GUIDE.md) — `GraphQLDataProvider` caching + `BaseEngine` reactive invalidation.
- [`guides/DASHBOARD_BEST_PRACTICES.md`](DASHBOARD_BEST_PRACTICES.md) — Engine classes for UI domain logic + reactive `ObserveProperty`.
- [`packages/Angular/CLAUDE.md`](../packages/Angular/CLAUDE.md) — multi-provider `Provider` threading for the UI layer.
- [`packages/Angular/Bootstrap/CLAUDE.md`](../packages/Angular/Bootstrap/CLAUDE.md) — keeping server-only engine deps out of browser bundles (`-engine-base` rule).
