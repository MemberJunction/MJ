# Agent Context & Client Tools Guide

How resource components report their state to the AI agent and register tools the agent can invoke at runtime.

---

## Overview

MemberJunction's AI agent needs to understand what the user is currently looking at in the UI and, in some cases, take action on behalf of the user within the active dashboard. Two complementary mechanisms make this possible:

1. **Agent Context** -- key-value state that describes the current view (e.g., active query, result count, selected filters). This is injected into the agent's system prompt so the LLM can make informed decisions without burning a tool call.

2. **Agent Client Tools** -- functions the agent can invoke in the browser (e.g., "run a search", "toggle filters"). These are registered dynamically and scoped to whichever dashboard is currently active.

Both mechanisms ultimately flow to `AgentClientService` (which manages the PubSub session with the server) and into `AppContextSnapshot.AdditionalContext` (which is injected into the agent's system prompt).

**How context and tools reach the agent is application-specific.** Each host application (MJ Explorer, a custom Angular app, a React app, etc.) implements its own plumbing to collect context from active views and pass it to `AgentClientService`. The core agent infrastructure (`AppContextSnapshot`, `BaseAgent.buildAppContextSection()`, `AgentClientService`) is framework-agnostic.

---

## Core Architecture (Framework-Agnostic)

These pieces are shared across all applications:

- **`AppContextSnapshot`** (`@memberjunction/ai-core-plus`) — the data shape that describes what the user sees. Includes `AdditionalContext` for per-view state.
- **`AgentClientService`** (`@memberjunction/ng-agent-client`) — Angular service wrapping `AgentClientSession`. Manages tool registration, PubSub subscriptions, and tool execution.
- **`BaseAgent.buildAppContextSection()`** (`@memberjunction/ai-agents`) — server-side method that renders `AppContextSnapshot` (including `AdditionalContext`) into the agent's system prompt.

```
  AppContextSnapshot.AdditionalContext  ──▶  Chat Overlay  ──▶  Agent system prompt
  AgentClientService.RegisterTool()     ──▶  Agent sees tools ──▶  Agent invokes tool ──▶  Handler runs in browser
```

---

## MJ Explorer Implementation

MJ Explorer uses `NavigationService` as its application-specific bridge between resource components and the agent infrastructure. **This pattern is specific to MJ Explorer** — other applications would implement their own mechanism to collect view state and register tools with `AgentClientService`.

### Architecture

```
 Resource Component                NavigationService               explorer-app
 (e.g., Search Dashboard)          (@memberjunction/ng-shared)     (MJExplorerAppComponent)
 ─────────────────────             ─────────────────────           ─────────────────────
  SetAgentContext(this, {...})  ──▶ AgentContextUpdated$.next() ──▶ handleAgentContextUpdate()
  SetAgentClientTools(this, [...])                                    │
                                                                      ├─ Updates AppContextSnapshot.AdditionalContext
                                                                      └─ Registers/unregisters tools with AgentClientService
```

### Data flow step by step

1. A resource component calls `NavigationService.SetAgentContext(this, context)` with a key-value object describing its state.
2. NavigationService publishes an `AgentContextUpdate` on `AgentContextUpdated$`.
3. `MJExplorerAppComponent` subscribes to `AgentContextUpdated$` and:
   - Sets `AppContextSnapshot.AdditionalContext` to the new context object.
   - Unregisters any previously active dashboard tools, then registers the new ones with `AgentClientService`.
4. The `AppContextSnapshot` is passed to the chat overlay component, which forwards it as `extraData.appContext` when invoking an agent.
5. On the server, `BaseAgent.buildAppContextSection()` renders `AdditionalContext` as a "Dashboard state" section in the system prompt.

### Tab switch restoration

When the user switches tabs, MJ Explorer's `ComponentCacheManager` stores the outgoing component's `AgentContext` and `AgentClientTools` in `CachedComponentInfo`. When the component becomes active again, `explorer-app` replays the cached values -- restoring context and re-registering tools -- so the agent always reflects the active tab.

### For other applications

If you are building a custom application (not MJ Explorer), you would:
1. Populate an `AppContextSnapshot` object with your app's state
2. Pass it to your chat/conversation component via its `AppContext` input
3. Call `AgentClientService.RegisterTool()` / `UnregisterTool()` directly to manage tools
4. The core agent infrastructure handles the rest (prompt injection, tool execution, PubSub)

---

## How to Add Context to a New Dashboard (MJ Explorer)

The following pattern applies to resource components within MJ Explorer. Other applications would use `AgentClientService` directly.

### 1. Import and inject NavigationService

```typescript
import { NavigationService } from '@memberjunction/ng-shared';

@Component({ ... })
export class MyDashboardComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private navigationService = inject(NavigationService);
}
```

### 2. Emit context on init and state changes

Call `SetAgentContext` in `ngAfterViewInit` and again whenever the dashboard's meaningful state changes (tab switch, filter change, data load, etc.).

```typescript
async ngAfterViewInit(): Promise<void> {
    await this.loadData();
    this.emitAgentContext();
    this.registerAgentTools();
    this.NotifyLoadComplete();
}

private emitAgentContext(): void {
    this.navigationService.SetAgentContext(this, {
        ActiveTab: this.SelectedTab,
        RecordCount: this.Records.length,
        IsProcessing: this.IsProcessing,
        // Only include what helps the agent act -- not full component state
    });
}
```

Call `emitAgentContext()` again after any user action that changes the dashboard state the agent should know about.

### 3. Register client tools

Call `SetAgentClientTools` in `ngAfterViewInit` with an array of tool definitions. Each tool needs:

| Property | Type | Description |
|----------|------|-------------|
| `Name` | `string` | Unique tool name (PascalCase, e.g. `RunKnowledgeSearch`) |
| `Description` | `string` | What the tool does (used by the LLM to decide when to call it) |
| `ParameterSchema` | `Record<string, unknown>` | JSON Schema object describing the tool's input parameters |
| `Handler` | `(params: Record<string, unknown>) => Promise<unknown>` | Async function that executes the tool and returns a result |

```typescript
private registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
        {
            Name: 'RefreshDashboard',
            Description: 'Reload all data in the current dashboard',
            ParameterSchema: { type: 'object', properties: {} },
            Handler: async () => {
                await this.loadData();
                return { Success: true, Data: { RecordCount: this.Records.length } };
            },
        },
    ]);
}
```

---

## Example: Knowledge Search Dashboard

The Search dashboard (`KnowledgeSearchResourceComponent`) demonstrates both context and tools.

### emitAgentContext()

Reports the current search state so the agent knows what the user is looking at:

```typescript
private emitAgentContext(): void {
    this.navigationService.SetAgentContext(this, {
        CurrentQuery: this.Query || null,
        ResultCount: this.TotalCount,
        ElapsedMs: this.ElapsedMs,
        HasSearched: this.HasSearched,
        ShowFilters: this.ShowFilters,
        MinScoreThreshold: this.MinScoreThreshold,
        ActiveFilterCount: this.GetActiveFilterCount(),
        TopResults: this.AllResults.slice(0, 5).map(r => ({
            Title: r.Title,
            EntityName: r.EntityName,
            Score: Math.round(r.Score * 100),
        })),
    });
}
```

This method is called after initialization, after every search, and after every filter change.

### registerAgentTools()

Registers three tools the agent can invoke:

```typescript
private registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
        {
            Name: 'RunKnowledgeSearch',
            Description: 'Execute a knowledge search query across all indexed content',
            ParameterSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query text' },
                    minScore: { type: 'number', description: 'Minimum relevance score 0-1 (default 0.35)' },
                },
                required: ['query'],
            },
            Handler: async (params: Record<string, unknown>) => {
                this.Query = String(params['query'] ?? '');
                if (params['minScore'] != null) this.MinScoreThreshold = Number(params['minScore']);
                await this.RunSearch();
                return { Success: true, Data: { ResultCount: this.TotalCount, ElapsedMs: this.ElapsedMs } };
            },
        },
        {
            Name: 'ClearKnowledgeSearch',
            Description: 'Clear the current search query and results',
            ParameterSchema: { type: 'object', properties: {} },
            Handler: async () => {
                this.ClearSearch();
                return { Success: true };
            },
        },
        {
            Name: 'ToggleSearchFilters',
            Description: 'Show or hide the search filter panel',
            ParameterSchema: { type: 'object', properties: {} },
            Handler: async () => {
                this.ToggleFilters();
                return { Success: true, Data: { ShowFilters: this.ShowFilters } };
            },
        },
    ]);
}
```

---

## How Tools Work at Runtime

1. **Registration**: Component calls `NavigationService.SetAgentClientTools(this, tools)`.
2. **Publish**: NavigationService emits an `AgentContextUpdate` on `AgentContextUpdated$`.
3. **Subscribe**: `MJExplorerAppComponent` receives the update and registers each tool with `AgentClientService.RegisterTool()`.
4. **Agent sees tools**: When the agent's step type is `"ClientTools"`, the LLM sees all registered tools in its available tools list. Dashboard tools appear alongside global tools (NavigateToRecord, NavigateToApp, etc.).
5. **Invocation**: The agent calls a tool. The server publishes a `ClientToolRequest` via PubSub to the browser session.
6. **Execution**: `AgentClientSession` matches the tool name, runs the `Handler` function, and sends the result back to the server.
7. **Tab switch cleanup**: When the user switches tabs, `MJExplorerAppComponent` unregisters the outgoing dashboard's tools and re-registers the incoming dashboard's tools from the `CachedComponentInfo` cache.

---

## AppContextSnapshot Type

Defined in `@memberjunction/ai-core-plus` (`packages/AI/CorePlus/src/app-context.ts`):

```typescript
interface AppContextSnapshot {
    App: {
        Name: string;        // e.g., "Knowledge Hub"
        Description: string;
    };
    ActiveNavItem: {
        Name: string;        // e.g., "Search"
        Description?: string;
        ResourceType?: string;
    };
    OtherNavItems: Array<{
        Name: string;
        Description?: string;
    }>;
    User: {
        Name: string;
        Roles: string[];
    };
    AdditionalContext?: Record<string, unknown>;  // <-- per-component state goes here
}
```

`App`, `ActiveNavItem`, `OtherNavItems`, and `User` are updated automatically by `MJExplorerAppComponent` on every app/tab change. `AdditionalContext` is set exclusively by resource components via `SetAgentContext`.

On the server, `BaseAgent.buildAppContextSection()` renders `AdditionalContext` under a **"Dashboard state"** heading in the system prompt:

```
**Dashboard state:**
- CurrentQuery: vector embeddings
- ResultCount: 23
- HasSearched: true
- TopResults: [{"Title":"...","EntityName":"...","Score":87}, ...]
```

---

## Design Principles

1. **Use `AdditionalContext`, not `DashboardContext`**. The field is named generically because the system is not specific to Explorer -- any view type (dashboard, form, report) can report context.

2. **In MJ Explorer, components use `NavigationService`, not `AgentClientService` directly**. NavigationService is the Explorer-level abstraction that handles component caching, tab switch restoration, and tool lifecycle. Other applications may use `AgentClientService` directly — the core infrastructure supports both patterns.

3. **Handler signature**: `(params: Record<string, unknown>) => Promise<unknown>`. Return an object with `{ Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string }` for consistency with global tools.

4. **Context should be lean**. Include only what helps the agent act -- not the full component state. A few key metrics and the top N results are enough. The agent can always invoke a tool to get more detail.

5. **Tools should map to user-facing actions**. Register tools for actions the agent could plausibly want to invoke on the user's behalf: running a search, toggling a panel, refreshing data. Do not register internal helper methods or low-level state mutations.

6. **Emit context after every meaningful state change**. The agent's view of the dashboard is only as current as the last `SetAgentContext` call. Call `emitAgentContext()` after searches, filter changes, data loads, and tab switches within the dashboard.

---

## Key Source Files

| File | Purpose |
|------|---------|
| `packages/Angular/Explorer/shared/src/lib/navigation.service.ts` | `SetAgentContext`, `SetAgentClientTools`, `AgentContextUpdated$` |
| `packages/Angular/Explorer/explorer-app/src/lib/explorer-app.component.ts` | Subscribes to updates, manages `AppContextSnapshot`, registers tools |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/component-cache-manager.ts` | `CachedComponentInfo` with `AgentContext` and `AgentClientTools` fields |
| `packages/AI/CorePlus/src/app-context.ts` | `AppContextSnapshot` type definition |
| `packages/AI/Agents/src/base-agent.ts` | `buildAppContextSection()` renders context into system prompt |
| `packages/Angular/Generic/agent-client/src/lib/agent-client.service.ts` | `AgentClientService` (RegisterTool/UnregisterTool) |
| `packages/AI/Agents/docs/CLIENT_TOOLS_GUIDE.md` | Broader client tools architecture (server-side perspective) |
