# Client Tools Guide

Client tools let agents invoke browser-side operations — navigating to records, switching dashboard tabs, displaying search results — without leaving the agent execution loop. The server publishes a request, the browser executes it, and the agent continues with the result.

This guide covers the full system: types, server infrastructure, client SDK integration, prompt design, timeout configuration, runtime decoration, and security.

---

## Table of Contents

1. [Client Tools vs Actions vs Chat](#client-tools-vs-actions-vs-chat)
2. [Architecture Overview](#architecture-overview)
3. [ClientToolMetadata Reference](#clienttoolmetadata-reference)
4. [Defining Tools in Agent Metadata](#defining-tools-in-agent-metadata)
5. [Runtime Decoration](#runtime-decoration)
6. [Registering Tool Handlers (Client SDK)](#registering-tool-handlers-client-sdk)
7. [Adding and Removing Tools at Runtime](#adding-and-removing-tools-at-runtime)
8. [Timeout Configuration](#timeout-configuration)
9. [Loop Agent Type Integration](#loop-agent-type-integration)
10. [Prompt Design](#prompt-design)
11. [ClientToolChange (Runtime Enable/Disable)](#clienttoolchange-runtime-enabledisable)
12. [Security Considerations](#security-considerations)
13. [Code Examples](#code-examples)
14. [Troubleshooting](#troubleshooting)

---

## Client Tools vs Actions vs Chat

MemberJunction agents have three mechanisms for interacting with the world beyond the LLM. Each serves a distinct purpose:

| Mechanism | Runs Where | Purpose | Step Type |
|-----------|-----------|---------|-----------|
| **Actions** | Server | Data operations, API calls, CRUD, computations. Direct DB/API access, fast (no network round-trip to browser). | `"Actions"` |
| **Client Tools** | Browser | Programmatic UI interaction: navigate to a record, open a dashboard tab, show search results. Requires a round-trip to the browser. | `"ClientTools"` |
| **Chat** | User | Conversation: ask questions, collect text input, show forms. Returns control to the user and suspends execution. | `"Chat"` |

**Key distinctions:**

- **Actions** are for anything the server can do autonomously — query data, send emails, run AI prompts.
- **Client Tools** are for things that only the browser can do — navigate the user somewhere, display a UI component, switch tabs.
- **Chat** is for human interaction — asking the user a question, collecting structured input via forms.

Client Tools are NOT for user confirmation or form input (that is Chat's job). Client Tools are for **programmatic UI interaction** — the agent decides where the user should look, and the browser makes it happen automatically.

---

## Architecture Overview

```
                        Server                              Client (Browser)
                    ┌──────────────┐                    ┌──────────────────┐
                    │              │                    │                  │
  LLM decides   ───▶  BaseAgent   │                    │  AgentClient     │
  "ClientTools"     │     │        │                    │  Session         │
                    │     ▼        │                    │     │            │
                    │ executeClient│                    │     │            │
                    │ ToolsStep() │                    │     │            │
                    │     │        │                    │     │            │
                    │     ▼        │   PubSub topic     │     ▼            │
                    │ ClientTool   │──────────────────▶ │  Subscription    │
                    │ RequestMgr   │  CLIENT_TOOL_      │  receives req    │
                    │ .Request()   │  REQUEST            │     │            │
                    │     │        │                    │     ▼            │
                    │   await      │                    │  ClientTool      │
                    │   Promise    │                    │  Registry        │
                    │     │        │                    │  .Execute()      │
                    │     │        │                    │     │            │
                    │     │        │   GraphQL mutation  │     ▼            │
                    │     ◀────────│◀─────────────────  │  RespondTo       │
                    │   resolve    │  RespondToClient    │  ClientTool      │
                    │   Promise    │  ToolRequest        │  Request()       │
                    │     │        │                    │                  │
                    │     ▼        │                    └──────────────────┘
                    │ Add result   │
                    │ to convo     │
                    │ messages     │
                    │     │        │
                    │     ▼        │
                    │ Continue     │
                    │ agent loop   │
                    └──────────────┘
```

**Step by step:**

1. The LLM produces a response with `nextStep.type = "ClientTools"` and a list of tool invocations.
2. `LoopAgentType.DetermineNextStep()` parses this and returns a `BaseAgentNextStep` with `step: 'ClientTools'`.
3. `BaseAgent.executeNextStep()` routes to `executeClientToolsStep()`.
4. For each tool, `ClientToolRequestManager` publishes a request to the `CLIENT_TOOL_REQUEST` PubSub topic with the tool name, params, and a unique request ID.
5. The client (subscribed via `GraphQLDataProvider.ClientToolRequests()`) receives the request.
6. `ClientToolRegistry.Execute()` runs the registered handler with timeout protection.
7. The client sends the result back via the `RespondToClientToolRequest` GraphQL mutation.
8. `ClientToolRequestManager.ReceiveResponse()` resolves the pending Promise.
9. `executeClientToolsStep()` collects all results, adds them to the conversation as a user message, and calls `executePromptStep()` to continue the agent loop.

---

## ClientToolMetadata Reference

Every client tool is defined by a `ClientToolMetadata` object. This is the contract between the server (which shows it to the LLM) and the client (which executes it).

```typescript
interface ClientToolMetadata {
    /** Unique identifier — must match exactly between server definition and client handler */
    Name: string;

    /** Human-readable description — the LLM reads this to decide when to use the tool */
    Description: string;

    /** JSON Schema describing the input parameters. The LLM generates params matching this. */
    InputSchema: Record<string, unknown>;

    /** JSON Schema for what the tool returns. Optional — helps the LLM understand results. */
    OutputSchema?: Record<string, unknown>;

    /** Category for grouping in prompts (e.g., 'navigation', 'display', 'data') */
    Category?: string;

    /** Default timeout in ms for this specific tool. Overrides the agent-level default. */
    DefaultTimeoutMs?: number;
}
```

**Package:** `@memberjunction/ai-core-plus`

### Built-in Default Tools

Three tools ship out of the box in `DefaultClientTools` (from `@memberjunction/ai-core-plus`):

| Tool | Category | Description |
|------|----------|-------------|
| `NavigateToRecord` | navigation | Open an entity record in a new tab |
| `SwitchDashboardTab` | navigation | Switch the active tab in the current app |
| `ShowSearchResults` | display | Navigate to Knowledge Hub search and execute a query |

---

## Defining Tools in Agent Metadata

Tools are defined as part of the agent's configuration. The `AgentClientToolConfig` type controls what tools are available:

```typescript
interface AgentClientToolConfig {
    Enabled: boolean;              // Master toggle
    DefaultTimeoutMs: number;      // Default timeout for all tools
    Tools: ClientToolMetadata[];   // Available tool definitions
}
```

This configuration can be stored in the agent's JSON configuration column or in a dedicated entity. The `Tools` array contains the **base metadata** — the client may enrich these at runtime through decoration (see next section).

---

## Runtime Decoration

### The Problem

Some tools need **dynamic context** that only the browser knows at runtime. For example, the `ShowEntityForm` tool needs to know which entities the current user has access to. That list changes per user, per app, per session.

### The Solution: Client-Side Decorators

When an agent session starts, the server sends the base `ClientToolMetadata[]` to the client. The client SDK runs registered **decorators** that enrich each tool with runtime context, then sends the enriched definitions back. The server uses the enriched versions in the LLM prompt.

```typescript
// Types
type ClientToolDecorator = (
    baseTool: ClientToolMetadata,
    context: ClientToolDecoratorContext
) => ClientToolMetadata;

interface ClientToolDecoratorContext {
    AvailableEntities: string[];     // Current user's accessible entities
    CurrentAppName: string;          // Current application name
    CurrentTabName?: string;         // Active tab/dashboard
    CustomContext: Record<string, unknown>;  // App-specific data
}
```

### Registration

```typescript
// Register a decorator that injects available entities into the tool description
session.RegisterToolDecorator('ShowEntityForm', (baseTool, context) => ({
    ...baseTool,
    Description: `Open an entity form. Available: ${context.AvailableEntities.join(', ')}`,
    InputSchema: {
        ...baseTool.InputSchema,
        properties: {
            EntityName: {
                type: 'string',
                enum: context.AvailableEntities,
                description: 'Entity to display'
            },
            RecordID: { type: 'string' }
        }
    }
}));

// Set the context
session.SetDecoratorContext({
    AvailableEntities: ['Members', 'Organizations', 'MJ: Actions'],
    CurrentAppName: 'Knowledge Hub',
    CustomContext: { availableTabs: ['Search', 'Vectors', 'Duplicates'] }
});

// Decorate and send to server
await session.DecorateAndSendTools(baseTools);
```

### Flow

1. Server sends base `ClientToolMetadata[]` to the client (session init or via data parameter)
2. Client SDK runs registered decorators: `enrichedTool = decorator(baseTool, runtimeContext)`
3. Client sends enriched definitions back via `UpdateClientToolDefinitions` mutation
4. Server stores enriched definitions per session (`ClientToolRequestManager.SetSessionTools()`)
5. Server includes enriched descriptions in LLM prompt on next turn

---

## Registering Tool Handlers (Client SDK)

Tool handlers are registered in the `ClientToolRegistry` and are invoked when the server sends a `ClientToolRequest`.

```typescript
import { ClientToolRegistry, ClientToolHandler } from '@memberjunction/ai-agent-client';

const registry = new ClientToolRegistry();

// Register a handler for NavigateToRecord
registry.Register({
    Name: 'NavigateToRecord',
    Description: 'Open an entity record',
    ParameterSchema: {
        type: 'object',
        properties: {
            EntityName: { type: 'string' },
            RecordID: { type: 'string' }
        },
        required: ['EntityName', 'RecordID']
    },
    Handler: async (params) => {
        const entityName = params['EntityName'] as string;
        const recordId = params['RecordID'] as string;

        // Use your app's navigation service
        navigationService.OpenEntityRecord(entityName, recordId);

        return { Success: true, Data: { navigated: true } };
    }
});
```

The registry handles:
- **Lookup by name**: `registry.GetTool('NavigateToRecord')`
- **Timeout protection**: `registry.Execute('name', params, timeoutMs)` wraps the handler in a `Promise.race` with a timer
- **Error handling**: Handler exceptions are caught and returned as `{ Success: false, ErrorMessage: '...' }`

---

## Adding and Removing Tools at Runtime

Tools can be added or removed dynamically as the user navigates. For example, when the user opens the Knowledge Hub, you might add a `ShowDuplicateDetail` tool. When they leave, you remove it.

```typescript
// Add a tool dynamically (registers handler locally + notifies server)
await session.AddClientTool({
    Name: 'ShowDuplicateDetail',
    Description: 'Show details of a specific duplicate group',
    InputSchema: {
        type: 'object',
        properties: {
            GroupID: { type: 'string', description: 'The duplicate group ID' }
        },
        required: ['GroupID']
    },
    Category: 'display',
    Handler: async (params) => {
        duplicatePanel.OpenGroup(params['GroupID'] as string);
        return { Success: true, Data: { opened: true } };
    }
});

// Remove it when the user leaves
await session.RemoveClientTool('ShowDuplicateDetail');
```

Both methods call `notifyToolsChanged()` internally, which sends the updated tool list to the server via the `UpdateClientToolDefinitions` mutation. The LLM sees the updated tools on its next turn.

---

## Timeout Configuration

Timeouts prevent the agent from hanging if the browser is unresponsive. There are three levels, resolved in order of precedence:

```
Level 1 (highest): Per-tool invocation
    tool.TimeoutMs = 10000

Level 2: Per-run override (ExecuteAgentParams)
    params.clientToolTimeoutMs = 60000

Level 3 (lowest): System default
    30_000 ms (30 seconds)
```

In code (`executeClientToolsStep`):
```typescript
const timeoutMs = tool.TimeoutMs        // Per-tool override
    ?? params.clientToolTimeoutMs        // Per-run override
    ?? 30_000;                           // System default
```

When a timeout fires:
1. The pending Promise resolves with `{ Success: false, ErrorMessage: 'timed out...' }`
2. The request is removed from the pending map
3. The agent receives the timeout as a tool failure and can decide how to proceed

### Choosing Timeout Values

| Scenario | Recommended Timeout |
|----------|-------------------|
| Simple navigation (open a tab) | 5-10 seconds |
| Search execution | 15-30 seconds |
| Complex UI operations | 30-60 seconds |
| Default (most tools) | 30 seconds |

---

## Loop Agent Type Integration

The `LoopAgentType` handles `ClientTools` as a first-class step type. When the LLM's JSON response contains:

```json
{
    "taskComplete": false,
    "nextStep": {
        "type": "ClientTools",
        "clientTools": [
            {
                "name": "NavigateToRecord",
                "params": { "EntityName": "Members", "RecordID": "abc-123" }
            }
        ]
    }
}
```

The agent type:
1. Validates that `clientTools` is a non-empty array
2. Maps each tool to an `AgentClientToolInvocation` (accepts both PascalCase and camelCase keys)
3. Returns a `BaseAgentNextStep` with `step: 'ClientTools'` and `clientTools: [...]`

If `clientTools` is missing or empty, the agent type returns a `Retry` step with an error message.

---

## Prompt Design

The system prompt differentiates server actions from client tools so the LLM can choose appropriately. The `buildClientToolPromptSection()` method in `BaseAgent` generates this section:

```markdown
### Client Tools (execute in the user's browser)
Client tools run in the user's browser and interact with the UI. Use these when you need
to navigate the user somewhere, display a specific view, switch dashboard tabs, or show
records. When you choose client tools, set nextStep.type to "ClientTools".

NOTE: Do NOT use client tools for asking the user questions or collecting input.
Use the "Chat" step for that. Client tools are for programmatic UI interaction only.

- **NavigateToRecord** [navigation]: Open a specific entity record in a new tab
  Inputs: `EntityName`\* -- The entity name, `RecordID`\* -- The primary key value
- **SwitchDashboardTab** [navigation]: Switch the active tab in the current application
  Inputs: `TabName`\* -- The tab to switch to
- **ShowSearchResults** [display]: Navigate to Knowledge Hub search and execute a query
  Inputs: `Query`\* -- The search query to execute
```

The tool definitions come from session-enriched definitions (decorated by the client) or from the agent's configuration. Enriched descriptions include runtime context like available entities and tab names.

### When to Use What (LLM Guide)

| Need | Use | Step |
|------|-----|------|
| Query data, run AI, CRUD operations | Server Action | `"Actions"` |
| Navigate to a record, open a tab, show a dashboard | Client Tool | `"ClientTools"` |
| Ask the user a question, collect text input | Chat | `"Chat"` |
| Delegate to another agent | Sub-Agent | `"Sub-Agent"` |

---

## ClientToolChange (Runtime Enable/Disable)

`ClientToolChange` mirrors the `ActionChange` pattern for dynamically modifying which tools are available:

```typescript
interface ClientToolChange {
    Scope: 'global' | 'root' | 'all-subagents' | 'specific';
    Mode: 'add' | 'remove';
    Tools: ClientToolMetadata[] | string[];  // Definitions to add, or names to remove
    AgentIds?: string[];                     // When Scope is 'specific'
}
```

Pass via `ExecuteAgentParams.clientToolChanges`:

```typescript
const result = await runner.ExecuteAgent({
    agentId: 'my-agent-id',
    conversationMessages: messages,
    contextUser: currentUser,
    sessionID: 'session-abc',
    clientToolChanges: [
        {
            Scope: 'global',
            Mode: 'add',
            Tools: [{
                Name: 'ShowDuplicateDetail',
                Description: 'Show duplicate group details',
                InputSchema: { type: 'object', properties: { GroupID: { type: 'string' } } },
                Category: 'display'
            }]
        },
        {
            Scope: 'all-subagents',
            Mode: 'remove',
            Tools: ['NavigateToRecord']  // Remove by name
        }
    ]
});
```

---

## Security Considerations

### Tool Whitelisting

Client tools execute in the user's browser with the user's permissions. The server defines which tools are available per agent — the client cannot invoke tools that are not in the agent's configuration or session tools.

### Timeout Protection

Every tool request has a timeout. If the client doesn't respond, the server resolves with a failure and continues. This prevents the agent from hanging indefinitely.

### Input Validation

Tool parameters are defined by a JSON Schema (`InputSchema`). While the LLM generates the parameters, the client handler should validate inputs before executing.

### Session Isolation

Tool definitions are stored per session (`ClientToolRequestManager.SetSessionTools()`). One user's enriched tools cannot leak to another user's session. Sessions are cleaned up via `ClearSession()`.

### No Arbitrary Code Execution

Client tools run registered handlers — they do not execute arbitrary code. The handler is a TypeScript function registered at app startup or during navigation. The server cannot make the browser run anything that isn't explicitly registered.

---

## Code Examples

### Example 1: Registering a NavigateToRecord Handler

```typescript
import { ClientToolRegistry } from '@memberjunction/ai-agent-client';
import { NavigationService } from '@memberjunction/ng-shared';

export function RegisterDefaultClientTools(
    registry: ClientToolRegistry,
    navigationService: NavigationService
): void {
    registry.Register({
        Name: 'NavigateToRecord',
        Description: 'Open an entity record in a new tab',
        ParameterSchema: {
            type: 'object',
            properties: {
                EntityName: { type: 'string' },
                RecordID: { type: 'string' }
            },
            required: ['EntityName', 'RecordID']
        },
        Handler: async (params) => {
            const entityName = params['EntityName'] as string;
            const recordId = params['RecordID'] as string;

            const md = new Metadata();
            const entityInfo = md.Entities.find(e => e.Name === entityName);
            if (!entityInfo) {
                return { Success: false, ErrorMessage: `Entity "${entityName}" not found` };
            }

            const pkey = new CompositeKey();
            pkey.LoadFromURLSegment(entityInfo, recordId);
            navigationService.OpenEntityRecord(entityName, pkey);

            return { Success: true, Data: { navigated: true, entity: entityName } };
        }
    });
}
```

### Example 2: Decorating ShowEntityForm with Dynamic Entities

```typescript
import { AgentClientSession } from '@memberjunction/ai-agent-client';
import { Metadata } from '@memberjunction/core';

export function SetupEntityFormDecorator(session: AgentClientSession): void {
    session.RegisterToolDecorator('ShowEntityForm', (baseTool, context) => {
        const entities = context.AvailableEntities;
        return {
            ...baseTool,
            Description: `Open an entity form for viewing/editing. Available entities: ${entities.slice(0, 20).join(', ')}${entities.length > 20 ? ` (+${entities.length - 20} more)` : ''}`,
            InputSchema: {
                type: 'object',
                properties: {
                    EntityName: {
                        type: 'string',
                        enum: entities,
                        description: 'The entity to display'
                    },
                    RecordID: {
                        type: 'string',
                        description: 'Primary key of the record'
                    }
                },
                required: ['EntityName', 'RecordID']
            }
        };
    });

    // Update context with current user's entities
    const md = new Metadata();
    const entityNames = md.Entities
        .filter(e => e.UserCanRead)
        .map(e => e.Name)
        .sort();

    session.SetDecoratorContext({
        AvailableEntities: entityNames,
        CurrentAppName: 'MemberJunction Explorer',
        CustomContext: {}
    });
}
```

### Example 3: Adding a Tool When User Enters a Dashboard

```typescript
import { AgentClientSession } from '@memberjunction/ai-agent-client';

export class KnowledgeHubDashboard {
    constructor(private session: AgentClientSession) {}

    async OnDashboardEnter(): Promise<void> {
        // Add Knowledge Hub-specific tools
        await this.session.AddClientTool({
            Name: 'ShowDuplicateDetail',
            Description: 'Open the detail panel for a duplicate detection group in the Kanban board',
            InputSchema: {
                type: 'object',
                properties: {
                    GroupID: { type: 'string', description: 'The duplicate group ID to display' }
                },
                required: ['GroupID']
            },
            Category: 'display',
            Handler: async (params) => {
                const groupId = params['GroupID'] as string;
                this.openDuplicatePanel(groupId);
                return { Success: true, Data: { opened: true } };
            }
        });

        await this.session.AddClientTool({
            Name: 'RunAutotagPipeline',
            Description: 'Trigger the content autotagging pipeline from the Autotagging tab',
            InputSchema: { type: 'object', properties: {} },
            Category: 'data',
            Handler: async () => {
                this.triggerPipeline();
                return { Success: true, Data: { triggered: true } };
            }
        });
    }

    async OnDashboardLeave(): Promise<void> {
        // Remove Knowledge Hub-specific tools
        await this.session.RemoveClientTool('ShowDuplicateDetail');
        await this.session.RemoveClientTool('RunAutotagPipeline');
    }

    private openDuplicatePanel(groupId: string): void { /* ... */ }
    private triggerPipeline(): void { /* ... */ }
}
```

---

## Troubleshooting

### Tool request never reaches the client

**Symptoms:** Agent hangs for the timeout duration, then continues with a timeout error.

**Causes:**
1. **No sessionID**: `ExecuteAgentParams.sessionID` must be set. Without it, `executeClientToolsStep` skips tool execution entirely.
2. **PubSub not configured**: `ClientToolRequestManager.SetPublishFunction()` must be called at server startup (this is wired automatically in `MJServer.serve()`).
3. **Client not subscribed**: The client must subscribe to `ClientToolRequest(sessionID)` before the agent runs. Use `GraphQLDataProvider.ClientToolRequests(sessionId)`.

### Client receives request but response is not received by server

**Symptoms:** Client handler executes successfully but the agent still times out.

**Causes:**
1. **Mutation not called**: Ensure the client calls the `RespondToClientToolRequest` GraphQL mutation after handling the request.
2. **Wrong requestID**: The `requestID` in the response must exactly match the request's `RequestID`.
3. **Response sent after timeout**: If the client takes longer than the timeout, the Promise has already resolved. Check timeout values.

### LLM never chooses client tools

**Symptoms:** The agent uses Actions or Chat but never ClientTools, even when appropriate.

**Causes:**
1. **Tools not in prompt**: Verify that `clientToolDetails` is populated in the prompt template data. Check that either session tools are set or tools are passed via `extraData.clientTools`.
2. **Empty description**: Tools with empty or vague descriptions won't be chosen. Descriptions should clearly explain when and why to use the tool.
3. **No `ClientTools` in schema**: The `LoopAgentResponse.nextStep.type` must include `'ClientTools'` in the union. This was added in the latest version.

### "PubSub not configured" error

**Cause:** `ClientToolRequestManager.Instance.SetPublishFunction()` was not called during server startup.

**Fix:** This is wired automatically in `MJServer.serve()` after `PubSubManager.Instance.SetPubSubEngine()`. If you're using a custom server setup, add:

```typescript
import { ClientToolRequestManager } from '@memberjunction/ai-agents';
import { PubSubManager } from '@memberjunction/server';

ClientToolRequestManager.Instance.SetPublishFunction(
    (topic, payload) => PubSubManager.Instance.Publish(topic, payload)
);
```

### StepType shows "Actions" in run history instead of "ClientTools"

**This is expected.** The `MJ: AI Agent Run Steps` entity's `StepType` value list does not yet include `'ClientTools'`. A future database migration will add it. Until then, client tool steps are recorded as `'Actions'` but the step name (`"Client Tool: {toolName}"`) distinguishes them.
