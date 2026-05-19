# Architecture: Client Tool Invocation from BaseAgent

## Overview

Agents need to invoke tools that run on the client (browser) — not just server-side Actions.
Examples: navigate to a record, open a dashboard, show an entity form, switch tabs, highlight
search results, open a specific Knowledge Hub view.

The client-side SDK (`@memberjunction/ai-agent-client`) already has `ClientToolRegistry`,
`ClientToolRequest/Response` types, and `AgentClientSession` with WebSocket transport.
What's missing is the **server-side mechanism** in `BaseAgent` to emit client tool requests,
yield execution, and resume when the response arrives — plus proper metadata-driven tool
definitions with runtime decoration.

## Terminology

- **Actions** = server-side tools (run via `ActionEngineServer.RunAction()`, direct DB/API access)
- **Client Tools** = browser-side tools (run in the user's browser, interact with the UI)
- **Chat** = agent-to-user conversation (asking questions, getting text input, showing forms)
- Client Tools are NOT for user confirmation or form input — that's Chat's job.
  Client Tools are for **programmatic UI interaction**: navigate, display, switch views.

## Current Step Types in BaseAgent

```typescript
step: 'Success' | 'Failed' | 'Retry' | 'Sub-Agent' | 'Actions' | 'Chat'
     | 'ForEach' | 'While'
```

## New Step Type: 'ClientTools'

```typescript
step: 'Success' | 'Failed' | 'Retry' | 'Sub-Agent' | 'Actions'
     | 'ClientTools' | 'Chat' | 'ForEach' | 'While'
```

---

## 1. Client Tool Metadata (Strongly Typed, Not String Arrays)

### ClientToolMetadata (Database-Driven)

Client tools are defined as metadata, NOT string arrays. Each tool has a proper definition
that the LLM sees in its prompt and the client uses for registration.

```typescript
/**
 * Metadata definition for a client tool. Stored in agent configuration
 * or a dedicated entity. The LLM sees Name + Description + InputSchema
 * in its system prompt to know how to invoke the tool.
 */
export interface ClientToolMetadata {
    /** Unique identifier for this tool */
    Name: string;
    /** Human-readable description — this is what the LLM reads to decide when to use it */
    Description: string;
    /** JSON Schema describing the input parameters */
    InputSchema: Record<string, unknown>;
    /** JSON Schema describing what the tool returns (optional, for LLM context) */
    OutputSchema?: Record<string, unknown>;
    /** Category for grouping in prompts (e.g., 'navigation', 'display', 'data') */
    Category?: string;
    /** Default timeout in ms for this specific tool (overrides agent default) */
    DefaultTimeoutMs?: number;
}
```

### Examples of Metadata-Driven Tools

```typescript
// Defined in agent metadata (DB), NOT hardcoded
{
    Name: 'NavigateToRecord',
    Description: 'Open a specific entity record in a new tab for the user to view or edit',
    InputSchema: {
        type: 'object',
        properties: {
            EntityName: { type: 'string', description: 'The entity name (e.g., "Members", "MJ: Actions")' },
            RecordID: { type: 'string', description: 'The primary key value of the record' }
        },
        required: ['EntityName', 'RecordID']
    },
    OutputSchema: {
        type: 'object',
        properties: {
            navigated: { type: 'boolean' }
        }
    },
    Category: 'navigation'
}

{
    Name: 'ShowEntityForm',
    Description: 'Open an entity form for the user to view. Available entities: {{dynamicEntityList}}',
    InputSchema: {
        type: 'object',
        properties: {
            EntityName: { type: 'string', enum: [] },  // Populated at runtime by decorator
            RecordID: { type: 'string' }
        },
        required: ['EntityName', 'RecordID']
    },
    Category: 'display'
}

{
    Name: 'SwitchDashboardTab',
    Description: 'Switch the active tab in the current application dashboard',
    InputSchema: {
        type: 'object',
        properties: {
            TabName: { type: 'string', description: 'The tab to switch to' }
        },
        required: ['TabName']
    },
    Category: 'navigation'
}

{
    Name: 'ShowSearchResults',
    Description: 'Navigate to the Knowledge Hub search tab and execute a search query',
    InputSchema: {
        type: 'object',
        properties: {
            Query: { type: 'string', description: 'The search query to execute' }
        },
        required: ['Query']
    },
    Category: 'display'
}
```

---

## 2. Runtime Tool Decoration (Client-Side Enrichment)

### Problem
Metadata-driven tools have static definitions in the DB, but some tools need **dynamic context**
that only the client knows at runtime. Example: "ShowEntityForm" — the list of available entities
depends on the user's permissions, the current app, and what's loaded in the browser.

### Solution: Decorator Pattern in Client SDK

When an agent session starts, the server sends the base `ClientToolMetadata[]` to the client.
The client SDK runs registered **decorators** that enrich each tool with runtime context,
then sends the enriched definitions back. The server uses the enriched versions in the LLM prompt.

```typescript
/**
 * A decorator function that enriches a tool definition with runtime context.
 * Called by the SDK when the agent session initializes or when tools are refreshed.
 */
export type ClientToolDecorator = (
    baseTool: ClientToolMetadata,
    context: ClientToolDecoratorContext
) => ClientToolMetadata;

/**
 * Context provided to decorators — includes app state, user info, etc.
 */
export interface ClientToolDecoratorContext {
    /** Current user's accessible entities */
    AvailableEntities: string[];
    /** Current application name */
    CurrentAppName: string;
    /** Current active tab/dashboard */
    CurrentTabName?: string;
    /** Any additional context the app provides */
    CustomContext: Record<string, unknown>;
}
```

### Registration in Client SDK

```typescript
// App registers decorators at startup
agentSession.RegisterToolDecorator('ShowEntityForm', (baseTool, context) => ({
    ...baseTool,
    Description: `Open an entity form. Available entities: ${context.AvailableEntities.join(', ')}`,
    InputSchema: {
        ...baseTool.InputSchema,
        properties: {
            ...baseTool.InputSchema.properties,
            EntityName: {
                type: 'string',
                enum: context.AvailableEntities,
                description: 'Entity to display'
            }
        }
    }
}));

agentSession.RegisterToolDecorator('SwitchDashboardTab', (baseTool, context) => ({
    ...baseTool,
    Description: `Switch dashboard tab. Current app: ${context.CurrentAppName}. ` +
                 `Available tabs: ${context.CustomContext['availableTabs']}`,
    InputSchema: {
        ...baseTool.InputSchema,
        properties: {
            TabName: {
                type: 'string',
                enum: context.CustomContext['availableTabs'] as string[]
            }
        }
    }
}));
```

### Flow: Session Initialization with Tool Enrichment

```
1. Client opens agent session (WebSocket connect or subscription start)
2. Server sends: { type: 'session_init', clientTools: ClientToolMetadata[] }
   (base definitions from agent metadata)
3. Client SDK runs decorators for each tool:
   enrichedTools = baseTool.map(t => decorator(t, runtimeContext))
4. Client sends: { type: 'tools_enriched', clientTools: enrichedTools }
5. Server stores enriched definitions for this session
6. Server includes enriched descriptions in LLM prompt
```

### Runtime Tool List Modification

The client SDK can also add/remove tools at runtime (not just decorate):

```typescript
// Client adds a tool dynamically (e.g., when user opens a new dashboard)
agentSession.AddClientTool({
    Name: 'ShowDuplicateDetail',
    Description: 'Show details of a specific duplicate group in the Kanban board',
    InputSchema: { GroupID: { type: 'string' } },
    Category: 'display',
    Handler: async (params) => { /* ... */ }
});

// Client removes a tool (e.g., when user leaves the Knowledge Hub)
agentSession.RemoveClientTool('ShowDuplicateDetail');

// Server is notified and updates the LLM's available tools on next turn
```

---

## 3. Timeout Configuration (Three Levels)

```
Level 1: Agent Metadata (database)
    AgentConfig.DefaultClientToolTimeoutMs = 30000

Level 2: ExecuteAgentParams (runtime, per-run override)
    params.clientToolTimeoutMs = 60000   // Override for this specific run

Level 3: Per-Tool Request (per-invocation override)
    tool.timeoutMs = 10000               // This specific tool call

Resolution: Per-tool > ExecuteAgentParams > Agent Metadata > System Default (30s)
```

In `BaseAgent.executeClientToolsStep()`:
```typescript
const timeoutMs = tool.timeoutMs
    ?? params.clientToolTimeoutMs
    ?? agentConfig.DefaultClientToolTimeoutMs
    ?? 30_000;
```

---

## 4. Transport: PubSub (GraphQL Subscription)

### Why PubSub First
- Works with existing GraphQL infrastructure
- No new WebSocket server needed
- Client SDK wraps the subscription+mutation into a simple API
- `GraphQLDataProvider` gets a thin helper (like `PushStatusUpdates()`)

### GraphQL Schema

```graphql
type ClientToolRequestNotification {
    AgentRunID: String!
    SessionID: String!
    RequestID: String!
    ToolName: String!
    Params: String!          # JSON-encoded
    TimeoutMs: Float!
    Description: String
}

type Subscription {
    ClientToolRequest(sessionID: String!): ClientToolRequestNotification
}

type Mutation {
    RespondToClientToolRequest(
        requestID: String!
        success: Boolean!
        result: String
        errorMessage: String
    ): Boolean

    # Client sends enriched tool definitions after decoration
    UpdateClientToolDefinitions(
        sessionID: String!
        tools: String!           # JSON-encoded ClientToolMetadata[]
    ): Boolean
}
```

### Client SDK Wrapping

The `AgentClientSession` wraps all PubSub plumbing:

```typescript
class AgentClientSession {
    // App just registers handlers — SDK handles subscription/mutation
    OnToolRequest(handler: (request: ClientToolRequest) => Promise<ClientToolResult>): void;

    // SDK auto-subscribes to ClientToolRequest(sessionID)
    // SDK auto-sends RespondToClientToolRequest mutation after handler returns
    // SDK auto-sends UpdateClientToolDefinitions after decoration

    // App registers tools with handlers
    RegisterClientTool(tool: ClientToolDefinition): void;
    UnregisterClientTool(toolName: string): void;

    // App registers decorators for metadata-driven tools
    RegisterToolDecorator(toolName: string, decorator: ClientToolDecorator): void;

    // App can add/remove tools at runtime
    AddClientTool(tool: ClientToolMetadata & { Handler: ClientToolHandler }): void;
    RemoveClientTool(toolName: string): void;
}
```

The `GraphQLDataProvider` gets a helper:

```typescript
class GraphQLDataProvider {
    // New method — thin wrapper like PushStatusUpdates()
    ClientToolRequests(sessionId: string): Observable<ClientToolRequestNotification>;
}
```

---

## 5. Server-Side: ClientToolRequestManager

```typescript
/**
 * Singleton that manages pending client tool requests.
 * BaseAgent publishes a request and awaits the Promise.
 * The GraphQL resolver receives the response and resolves the Promise.
 */
export class ClientToolRequestManager extends BaseSingleton<ClientToolRequestManager> {
    private pendingRequests = new Map<string, {
        resolve: (response: ClientToolResponse) => void;
        timer: NodeJS.Timeout;
    }>();

    /** Enriched tool definitions per session (from client decoration) */
    private sessionTools = new Map<string, ClientToolMetadata[]>();

    protected constructor() { super(); }

    public static get Instance(): ClientToolRequestManager {
        return super.getInstance<ClientToolRequestManager>();
    }

    /**
     * Called by BaseAgent to send a request and await the response.
     * Publishes via PubSub and returns a Promise that resolves when
     * the client responds or times out.
     */
    public async RequestClientTool(
        request: ClientToolRequest,
        sessionID: string,
        agentRunID: string,
        timeoutMs: number
    ): Promise<ClientToolResponse> {
        return new Promise<ClientToolResponse>((resolve) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(request.RequestID);
                resolve({
                    RequestID: request.RequestID,
                    Success: false,
                    ErrorMessage: `Client tool "${request.ToolName}" timed out after ${timeoutMs}ms`
                });
            }, timeoutMs);

            this.pendingRequests.set(request.RequestID, { resolve, timer });

            PubSubManager.Instance.Publish('CLIENT_TOOL_REQUEST', {
                AgentRunID: agentRunID,
                SessionID: sessionID,
                RequestID: request.RequestID,
                ToolName: request.ToolName,
                Params: JSON.stringify(request.Params),
                TimeoutMs: timeoutMs,
                Description: request.Description ?? ''
            });
        });
    }

    /**
     * Called by the RespondToClientToolRequest GraphQL mutation.
     * Resolves the pending Promise so the agent loop continues.
     */
    public ReceiveResponse(response: ClientToolResponse): boolean {
        const pending = this.pendingRequests.get(response.RequestID);
        if (!pending) return false;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(response.RequestID);
        pending.resolve(response);
        return true;
    }

    /** Store enriched tool definitions for a session */
    public SetSessionTools(sessionID: string, tools: ClientToolMetadata[]): void {
        this.sessionTools.set(sessionID, tools);
    }

    /** Get enriched tool definitions for prompt injection */
    public GetSessionTools(sessionID: string): ClientToolMetadata[] {
        return this.sessionTools.get(sessionID) ?? [];
    }

    /** Clean up when session ends */
    public ClearSession(sessionID: string): void {
        this.sessionTools.delete(sessionID);
    }
}
```

---

## 6. BaseAgent Changes

### Step Router Addition

```typescript
// In executeNextStep() switch statement
case 'ClientTools':
    return await this.executeClientToolsStep(params, config, previousDecision);
```

### New Method: executeClientToolsStep()

```typescript
protected async executeClientToolsStep(
    params: ExecuteAgentParams,
    config: AgentConfig,
    previousDecision: BaseAgentNextStep
): Promise<BaseAgentNextStep> {
    const clientTools = previousDecision.clientTools ?? [];
    const results: ClientToolResultSummary[] = [];

    // Resolve timeout: per-tool > params > agent config > default
    const defaultTimeout = params.clientToolTimeoutMs
        ?? config.DefaultClientToolTimeoutMs
        ?? 30_000;

    for (const tool of clientTools) {
        const stepEntity = await this.createStepEntity({
            stepType: 'ClientTools',
            stepName: `Client Tool: ${tool.Name}`,
            inputData: { toolName: tool.Name, params: tool.Params },
            contextUser: params.contextUser,
            payloadAtStart: this.getCurrentPayload(),
            payloadAtEnd: this.getCurrentPayload(),
        });

        const timeoutMs = tool.TimeoutMs ?? defaultTimeout;

        const response = await ClientToolRequestManager.Instance.RequestClientTool(
            {
                RequestID: uuidv4(),
                ToolName: tool.Name,
                Params: tool.Params,
                TimeoutMs: timeoutMs,
                Description: tool.Description,
            },
            params.sessionID,
            this._agentRun.ID,
            timeoutMs
        );

        await this.finalizeStepEntity(stepEntity, response.Success,
            response.ErrorMessage, { result: response.Result });

        results.push({
            toolName: tool.Name,
            success: response.Success,
            result: response.Result,
            errorMessage: response.ErrorMessage,
        });
    }

    // Format results as user message (same pattern as action results)
    const resultsMarkdown = this.formatClientToolResultsAsMarkdown(results);
    this.addUserMessage(resultsMarkdown, { messageType: 'client-tool-result' });

    return await this.executePromptStep(params, config);
}
```

### BaseAgentNextStep Extension

```typescript
export type BaseAgentNextStep<P = any, TContext = any> = {
    // ... all existing fields ...

    /** Client-side tools to execute when step is 'ClientTools' */
    clientTools?: AgentClientToolInvocation[];
};

/**
 * A single client tool invocation request from the LLM.
 * Uses the tool's Name to look up the full metadata (description, schema).
 */
export type AgentClientToolInvocation = {
    /** Name of the client tool (must match a registered ClientToolMetadata.Name) */
    Name: string;
    /** Parameters to pass to the tool (validated against InputSchema) */
    Params: Record<string, unknown>;
    /** Override timeout for this specific invocation */
    TimeoutMs?: number;
    /** Human-readable description of why the agent is invoking this tool */
    Description?: string;
};
```

---

## 7. Agent Configuration: Per-Agent and Runtime

### Per-Agent Metadata

```typescript
export interface AgentClientToolConfig {
    /** Master toggle — if false, agent cannot use any client tools */
    Enabled: boolean;
    /** Default timeout for client tool requests (ms) */
    DefaultTimeoutMs: number;
    /** Available client tools — full metadata definitions */
    Tools: ClientToolMetadata[];
}
```

This is stored in the agent's configuration (JSON column or related entity).
The `Tools` array contains the base metadata — the client decorates these at runtime.

### Runtime Override (ClientToolChange)

Mirrors the existing `ActionChange` pattern:

```typescript
export interface ClientToolChange {
    scope: 'global' | 'root' | 'all-subagents' | 'specific';
    mode: 'add' | 'remove';
    /** Tool definitions to add, or names to remove */
    tools: ClientToolMetadata[] | string[];
    agentIds?: string[];
}
```

### Loop Agent Type Options

```typescript
// Added to LoopAgentType configuration
{
    // Existing loop options
    InjectLoopResultsAsMessage: boolean;

    // Client tool options
    ClientToolsEnabled: boolean;
    /** Override available tools for this agent type (empty = use agent config) */
    AvailableClientTools: ClientToolMetadata[];
    /** Max client tool invocations per loop iteration (0 = unlimited) */
    ClientToolsPerIterationLimit: number;
}
```

---

## 8. Prompt Design: Actions vs Client Tools

The system prompt clearly distinguishes the two — Actions are server tools, Client Tools
are browser UI tools. No overlap with Chat (which is for conversation/forms).

```
## Available Tools

You have two categories of tools: Server Actions and Client Tools.

### Server Actions (execute on the server)
Server actions run server-side with direct access to the database, APIs, and backend
services. Use these for data operations, computations, and integrations. They are fast
(no network round-trip to the browser). When you choose server actions, set step to "Actions".

{{#each serverActions}}
- **{{name}}**: {{description}}
  Parameters: {{parameterList}}
{{/each}}

### Client Tools (execute in the user's browser)
Client tools run in the user's browser and interact with the UI. Use these when you need
to navigate the user somewhere, display a specific view, switch dashboard tabs, or show
records. They require a round-trip to the browser so they are slower than actions.
When you choose client tools, set step to "ClientTools".

NOTE: Do NOT use client tools for asking the user questions or collecting input.
Use the "Chat" step for that. Client tools are for programmatic UI interaction only.

{{#each clientTools}}
- **{{name}}** [{{category}}]: {{description}}
  Inputs: {{inputSchemaDescription}}
{{/each}}

### When to Use What
| Need | Use | Step |
|------|-----|------|
| Query data, run AI, CRUD operations | Server Action | "Actions" |
| Navigate to a record, open a tab, show a dashboard | Client Tool | "ClientTools" |
| Ask the user a question, collect text input | Chat | "Chat" |
| Delegate to another agent | Sub-Agent | "Sub-Agent" |
```

---

## 9. Client SDK Changes

### AgentClientSession Enhancements

```typescript
export class AgentClientSession {
    private toolRegistry: ClientToolRegistry;
    private toolDecorators = new Map<string, ClientToolDecorator>();
    private decoratorContext: ClientToolDecoratorContext;

    /**
     * Register a client tool with its handler.
     * The handler is called when the server invokes this tool.
     */
    public RegisterClientTool(tool: ClientToolDefinition): void {
        this.toolRegistry.Register(tool);
    }

    /** Unregister a tool */
    public UnregisterClientTool(toolName: string): void {
        this.toolRegistry.Unregister(toolName);
    }

    /**
     * Register a decorator that enriches a metadata-driven tool with runtime context.
     * Called during session init to inject dynamic data (entity lists, tab names, etc.)
     */
    public RegisterToolDecorator(toolName: string, decorator: ClientToolDecorator): void {
        this.toolDecorators.set(toolName, decorator);
    }

    /**
     * Set the runtime context that decorators receive.
     * Call this whenever the context changes (user navigates, new data loads, etc.)
     */
    public SetDecoratorContext(context: ClientToolDecoratorContext): void {
        this.decoratorContext = context;
    }

    /**
     * Add a client tool dynamically at runtime.
     * Notifies the server so the LLM sees it on the next turn.
     */
    public async AddClientTool(tool: ClientToolMetadata & { Handler: ClientToolHandler }): Promise<void> {
        this.toolRegistry.Register({
            Name: tool.Name,
            Description: tool.Description,
            ParameterSchema: tool.InputSchema,
            Handler: tool.Handler
        });
        await this.notifyToolsChanged();
    }

    /**
     * Remove a client tool at runtime.
     * Notifies the server so the LLM no longer sees it.
     */
    public async RemoveClientTool(toolName: string): Promise<void> {
        this.toolRegistry.Unregister(toolName);
        await this.notifyToolsChanged();
    }

    /**
     * Called when agent session starts — decorates base tools and sends to server.
     */
    private async decorateAndSendTools(baseTools: ClientToolMetadata[]): Promise<void> {
        const enriched = baseTools.map(tool => {
            const decorator = this.toolDecorators.get(tool.Name);
            return decorator ? decorator(tool, this.decoratorContext) : tool;
        });

        // Send enriched definitions to server via mutation
        await this.sendToolDefinitions(enriched);
    }

    /** Notify server that client tools changed (add/remove at runtime) */
    private async notifyToolsChanged(): Promise<void> {
        const allTools = this.toolRegistry.GetAllTools().map(t => ({
            Name: t.Name,
            Description: t.Description,
            InputSchema: t.ParameterSchema,
        }));
        await this.sendToolDefinitions(allTools);
    }
}
```

### GraphQLDataProvider Helper

```typescript
// New method on GraphQLDataProvider
public ClientToolRequests(sessionId: string): Observable<ClientToolRequestNotification> {
    const query = `
        subscription ClientToolRequest($sessionID: String!) {
            ClientToolRequest(sessionID: $sessionID) {
                AgentRunID
                SessionID
                RequestID
                ToolName
                Params
                TimeoutMs
                Description
            }
        }
    `;
    return this.subscribe(query, { sessionID: sessionId });
}
```

---

## 10. Implementation Order

### Phase 1: Core Infrastructure (Server)
1. `ClientToolMetadata` type in `@memberjunction/ai-core-plus` (agent-types.ts)
2. `AgentClientToolInvocation` type on `BaseAgentNextStep`
3. `ClientToolRequestManager` singleton in `@memberjunction/ai-agents`
4. `ClientToolRequestResolver` in MJServer (subscription + response mutation)
5. `BaseAgent.executeClientToolsStep()` — new step handler
6. Register resolver in MJServer index.ts

### Phase 2: Agent Configuration
7. `AgentClientToolConfig` type and wiring into agent metadata loading
8. `ClientToolChange` type (mirrors ActionChange)
9. Loop agent type client tool options
10. Timeout resolution chain (per-tool > params > config > default)

### Phase 3: Prompt Integration
11. Update DetermineNextStep parsing to handle 'ClientTools' step type
12. Build prompt section with decorated tool definitions
13. Inject client tool descriptions into system prompt

### Phase 4: Client SDK
14. `ClientToolDecorator` type and `RegisterToolDecorator()` method
15. `ClientToolDecoratorContext` type
16. Session init flow: receive base tools -> decorate -> send enriched back
17. `AddClientTool()` / `RemoveClientTool()` runtime methods
18. `GraphQLDataProvider.ClientToolRequests()` helper
19. Auto-subscribe and auto-respond in `AgentClientSession`

### Phase 5: Default Tools + Testing
20. Register default tools: NavigateToRecord, SwitchDashboardTab, ShowSearchResults
21. Unit tests: request/response flow, timeout, decoration, runtime add/remove
22. Integration test: agent decides to use client tool -> client executes -> agent continues

---

## 11. Files to Create

| File | Package | Purpose |
|------|---------|---------|
| `ClientToolRequestManager.ts` | `@memberjunction/ai-agents` | Server singleton: publish, await, receive |
| `ClientToolRequestResolver.ts` | `@memberjunction/server` | GraphQL subscription + response mutation |

## 12. Files to Modify

| File | Package | Changes |
|------|---------|---------|
| `agent-types.ts` | `@memberjunction/ai-core-plus` | Add ClientToolMetadata, AgentClientToolInvocation, ClientToolChange, AgentClientToolConfig |
| `base-agent.ts` | `@memberjunction/ai-agents` | Add executeClientToolsStep(), route in step switch, timeout resolution |
| `loop-agent-type.ts` | `@memberjunction/ai-agents` | ClientToolsEnabled, AvailableClientTools, PerIterationLimit |
| `index.ts` | `@memberjunction/server` | Register ClientToolRequestResolver |
| `AgentClientSession.ts` | `@memberjunction/ai-agent-client` | RegisterToolDecorator, AddClientTool, RemoveClientTool, session init flow |
| `AgentClientTypes.ts` | `@memberjunction/ai-agent-client` | Add ClientToolDecorator, ClientToolDecoratorContext types |
| `ClientToolRegistry.ts` | `@memberjunction/ai-agent-client` | No changes needed (already complete) |
| `GraphQLDataProvider.ts` | `@memberjunction/graphql-dataprovider` | Add ClientToolRequests() helper |

## 13. Files That Need No Changes

| File | Reason |
|------|--------|
| `ClientToolRegistry.ts` | Already handles registration + execution + timeout |
| `WebSocketTransport.ts` | Already supports tool_request/tool_response messages |
| `PubSubManager.ts` | Already supports arbitrary topic publishing |
