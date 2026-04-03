# Client Tools Guide

Client tools let agents invoke browser-side operations — navigating to records, switching apps, copying to clipboard, toggling themes — without leaving the agent execution loop. The server publishes a request via PubSub, the browser executes it, and the agent continues with the result.

---

## Table of Contents

1. [Client Tools vs Actions vs Chat](#client-tools-vs-actions-vs-chat)
2. [Architecture Overview](#architecture-overview)
3. [Tool Definition Sources](#tool-definition-sources)
4. [Metadata-Defined Tools (Database)](#metadata-defined-tools-database)
5. [Ephemeral Tools (Code-Registered)](#ephemeral-tools-code-registered)
6. [App Context Snapshot](#app-context-snapshot)
7. [Timeout Configuration](#timeout-configuration)
8. [Loop Agent Type Integration](#loop-agent-type-integration)
9. [terminateAfterExecution (One-and-Done)](#terminateafterexecution-one-and-done)
10. [Prompt Design](#prompt-design)
11. [Message Types and Compaction](#message-types-and-compaction)
12. [Security Considerations](#security-considerations)
13. [Registering Tool Handlers (MJExplorer)](#registering-tool-handlers-mjexplorer)
14. [Troubleshooting](#troubleshooting)

---

## Client Tools vs Actions vs Chat

| Mechanism | Runs Where | Purpose | Step Type |
|-----------|-----------|---------|-----------|
| **Actions** | Server | Data operations, API calls, CRUD, computations | `"Actions"` |
| **Client Tools** | Browser | Programmatic UI interaction: navigate, copy, notify, theme toggle | `"ClientTools"` |
| **Chat** | User | Conversation: ask questions, collect input, show forms | `"Chat"` |

Client tools are NOT for user confirmation or form input (that is Chat's job). Client tools are for **programmatic UI interaction** — the agent decides what the browser should do, and it happens automatically.

---

## Architecture Overview

```
                    Server                              Client (Browser)
                ┌──────────────┐                    ┌──────────────────┐
                │              │                    │                  │
  LLM decides  ──▶ BaseAgent   │                    │  AgentClient     │
  "ClientTools"   │     │       │                    │  Session         │
                │     ▼        │                    │     │            │
                │ executeClient│                    │     │            │
                │ ToolsStep() │                    │     │            │
                │     │        │   PubSub topic     │     ▼            │
                │ ClientTool   │──────────────────▶ │  Subscription    │
                │ RequestMgr   │  CLIENT_TOOL_      │  receives req    │
                │ .Request()   │  REQUEST            │     │            │
                │     │        │                    │     ▼            │
                │   await      │                    │  ClientTool      │
                │   Promise    │                    │  Registry        │
                │     │        │   GraphQL mutation  │  .Execute()      │
                │     ◀────────│◀─────────────────  │  RespondTo       │
                │   resolve    │  RespondToClient    │  ClientTool      │
                │   Promise    │  ToolRequest        │  Request()       │
                │     │        │                    │                  │
                │     ▼        │                    └──────────────────┘
                │ Continue or  │
                │ Success      │
                └──────────────┘
```

**Step by step:**

1. LLM produces `nextStep.type = "ClientTools"` with tool invocations
2. `executePromptStep()` preserves the LLM's `taskComplete` intent in `terminateAfterExecution`
3. Main loop dispatches to `executeClientToolsStep()`
4. Each tool is published via `ClientToolRequestManager` and awaited
5. Client receives via GraphQL subscription, executes handler, sends result back
6. If `terminateAfterExecution` is true → return Success (no extra LLM call)
7. Otherwise → call `executePromptStep()` to continue the agent loop

---

## Tool Definition Sources

The LLM sees tools from three sources, merged in `buildClientToolPromptSection()`:

| Source | Priority | Origin |
|--------|----------|--------|
| **Metadata tools** | 1 (highest) | `MJ: AI Agent Client Tools` junction table → `AIEngineBase.GetClientToolsForAgent()` |
| **Session tools** | 2 | `ClientToolRequestManager.GetSessionTools()` (pushed by client SDK decoration) |
| **Request tools** | 3 | `ExecuteAgentParams.data.clientTools` (sent with each agent request) |

First registration wins — metadata tools take priority over session/request tools with the same name.

---

## Metadata-Defined Tools (Database)

### Entity: `MJ: AI Client Tool Definitions`

The catalog of reusable, admin-manageable tool definitions:

| Field | Type | Description |
|-------|------|-------------|
| Name | nvarchar(200) | Unique identifier (e.g., `NavigateToApp`) |
| Description | nvarchar(max) | What the LLM reads to decide when to use the tool |
| Category | nvarchar(50) | `navigation`, `utility`, `display` |
| InputSchemaJSON | nvarchar(max) | JSON Schema for parameters |
| OutputSchemaJSON | nvarchar(max) | JSON Schema for return value (nullable) |
| DefaultTimeoutMs | int | Per-tool timeout override (default 30000) |
| RequiresContextType | nvarchar(100) | Context type required (nullable) |

### Entity: `MJ: AI Agent Client Tools` (Junction)

Links agents to their authorized tools:

| Field | Type | Description |
|-------|------|-------------|
| AgentID | uniqueidentifier | FK → AI Agents |
| ClientToolDefinitionID | uniqueidentifier | FK → Client Tool Definitions |
| IsRequired | bit | If true, agent expects this tool to always be available |
| Priority | int | Sort order in prompts |

### Current Tools in Metadata

| Tool | Category | Description |
|------|----------|-------------|
| `NavigateToApp` | navigation | Navigate to an application and optionally a nav item |
| `NavigateToRecord` | navigation | Open an entity record in a new tab |
| `SwitchDashboardTab` | navigation | Switch the active dashboard tab |
| `ShowSearchResults` | display | Navigate to Knowledge Hub search |
| `Sleep` | utility | Wait for a specified number of seconds (1-120) |
| `OpenBrowserTab` | navigation | Open a URL in a new browser tab |

### Sage's Tool Bindings

Sage is linked to: NavigateToApp, NavigateToRecord, Sleep, OpenBrowserTab.

Metadata files: `metadata/client-tool-definitions/` and `metadata/agents/.sage-agent.json`.

---

## Ephemeral Tools (Code-Registered)

Ephemeral tools are registered in client code via `AgentClientService.RegisterTool()` and sent with each agent request in `Data.clientTools`. They don't exist in the database.

### Current Ephemeral Tools (MJExplorer)

| Tool | Description |
|------|-------------|
| `CopyToClipboard` | Copy text to the user's clipboard |
| `ShowNotification` | Show a toast notification (info/success/warning/error) |
| `SetTheme` | Toggle or set dark/light mode |

### How They Reach the LLM

The `conversation-agent.service.ts` gathers all registered tools from `AgentClientService.GetRegisteredTools()` and includes them in the agent execution request:

```typescript
Data: {
    clientTools: this.agentClientService.GetRegisteredTools().map(t => ({
        Name: t.Name,
        Description: t.Description,
        InputSchema: t.ParameterSchema
    })),
    appContext: { ... }
}
```

`buildClientToolPromptSection()` reads `extraData.clientTools` (source #3) and merges with metadata tools.

### Agent Control: `AllowEphemeralClientTools`

The `AI Agents` entity has an `AllowEphemeralClientTools` bit field (default `true`). When `false`, the agent ignores ephemeral tools from the request — only metadata-linked tools are available.

---

## App Context Snapshot

Beyond tool availability, the agent needs to know **what the user is currently looking at**. An `AppContextSnapshot` is injected into the system prompt via `{{ appContext }}`.

### Structure

```typescript
interface AppContextSnapshot {
    App: { Name: string; Description: string };
    ActiveNavItem: { Name: string; Description?: string; ResourceType?: string };
    OtherNavItems: Array<{ Name: string; Description?: string }>;
    User: { Name: string; Roles: string[] };
}
```

### Flow

1. `MJExplorerAppComponent` subscribes to `ApplicationManager.ActiveApp` and `WorkspaceStateManager.Configuration`
2. On every app/tab transition, `updateAppContext()` builds a fresh `AppContextSnapshot`
3. Passed to overlay via `[AppContext]` input → chat area → message input → agent service
4. Included in `Data.appContext` on each agent request
5. `BaseAgent.buildAppContextSection()` formats as markdown
6. Injected into system prompt via `{{ appContext }}` template variable

### Example Prompt Output

```markdown
### Current Application Context
The user is currently in the **Data Explorer** application — Browse and manage entity data.

**Active view:** Queries — Run and manage saved queries (Custom)

**Other views available in this app:**
- Dashboards — View data dashboards
- Data — Browse entity records

**User:** Amith Nagarajan (Roles: Admin, Developer)
```

---

## Timeout Configuration

Three levels, resolved in order of precedence:

```
Level 1 (highest): Per-tool invocation — tool.TimeoutMs
Level 2: Per-run override — ExecuteAgentParams.clientToolTimeoutMs
Level 3 (lowest): System default — 30,000 ms
```

When a timeout fires, the Promise resolves with `{ Success: false, ErrorMessage: 'timed out...' }` and the agent continues.

---

## Loop Agent Type Integration

When the LLM returns `nextStep.type = "ClientTools"`:

1. `LoopAgentType.DetermineNextStep()` validates `clientTools` is non-empty
2. Maps each tool (accepts both PascalCase and camelCase keys)
3. Returns `BaseAgentNextStep` with `step: 'ClientTools'`
4. `'clienttools'` is in the `validStepTypes` array (case-insensitive)
5. Lenient type inference: if `type` is missing but `clientTools` array is present, defaults to `'ClientTools'`

---

## terminateAfterExecution (One-and-Done)

When the LLM says `taskComplete: true` alongside `clientTools`, it means "run these tools, then I'm done."

### The Problem

The main execution loop exits on `terminate: true` before dispatching to `executeClientToolsStep()`.

### The Solution

`executePromptStep()` has special handling for `ClientTools`:
- Returns `terminate: false` (so the main loop continues to dispatch)
- Sets `terminateAfterExecution: true` (preserves the LLM's intent)

After tool execution, `executeClientToolsStep()` checks `terminateAfterExecution`:
- `true` → return Success directly (saves an LLM round-trip)
- `false` → call `executePromptStep()` to continue

---

## Prompt Design

The system prompt includes a `Client Tools` section when tools are available:

```markdown
### Client Tools (execute in the user's browser)
Client tools run in the user's browser and interact with the UI...

- **NavigateToApp** [navigation]: Navigate the user to a specific application...
  Inputs: `AppName`\*, `NavItemName`
- **Sleep** [utility]: Wait for a specified number of seconds...
  Inputs: `Seconds`\*
```

The template conditionally includes `'ClientTools'` in the `nextStep.type` union and the `clientTools` property based on `{% if clientToolDetails %}`.

---

## Message Types and Compaction

Client tool results are stored in conversation messages with `messageType: 'client-tool-result'`, distinct from `'action-result'`. This allows:

- **Filtering**: Different handling for action vs client tool results
- **Compaction**: The `IsToolResultMessage()` helper checks for both types in recovery strategies
- **Extensibility**: Future `'artifact-tool-result'` follows the same pattern

---

## Security Considerations

- **Metadata tools** are governed by the `AI Agent Client Tools` junction — agents can only use tools they're linked to
- **Ephemeral tools** are governed by `AllowEphemeralClientTools` flag per agent
- **Timeout protection** prevents hanging if the browser is unresponsive
- **Input validation**: Handlers should validate params before executing
- **Session isolation**: PubSub requests are filtered by sessionID
- **No arbitrary code**: Only registered handlers execute — the server can't run arbitrary browser code
- **URL validation**: `OpenBrowserTab` enforces `http://` or `https://` protocol

---

## Registering Tool Handlers (MJExplorer)

All tool handlers are registered in `MJExplorerAppComponent.registerClientTools()`:

```typescript
// Metadata-linked tools (handlers for DB-defined tools)
this.agentClient.RegisterTool({
    Name: 'NavigateToApp',
    Handler: async (params) => {
        const app = md.Applications.find(a => a.Name.toLowerCase() === appName.toLowerCase());
        if (navItemName) {
            await this.navigationService.OpenNavItemByName(navItemName, undefined, app.ID);
        } else {
            await this.navigationService.SwitchToApp(app.ID);
        }
        return { Success: true, Data: { Navigated: true } };
    }
});

// Ephemeral tools (no DB entry, always available)
this.agentClient.RegisterTool({
    Name: 'CopyToClipboard',
    Handler: async (params) => {
        await navigator.clipboard.writeText(String(params['Text']));
        return { Success: true, Data: { CopiedLength: text.length } };
    }
});
```

The session is started in `handleLogin()` after workspace initialization:
```typescript
const provider = Metadata.Provider as { sessionId?: string };
if (provider.sessionId) {
    this.agentClient.StartSession(provider.sessionId);
}
```

---

## Troubleshooting

### Tool request never reaches the client

- **No sessionID**: `RunAIAgentResolver` must pass `sessionID` to `ExecuteAgentParams`. Verify in `RunAIAgentResolver.ts`.
- **Session not started**: `agentClient.StartSession(sessionId)` must be called after login.
- **PubSub not configured**: `ClientToolRequestManager` needs a publish function (auto-wired by `MJServer.serve()`).

### Client receives request but agent times out

- **Response mutation not called**: Verify `RespondToClientToolRequest` GraphQL mutation fires.
- **Wrong requestID**: The response `requestID` must match the request's `RequestID` exactly.
- **Handler too slow**: Increase `DefaultTimeoutMs` on the tool definition.

### LLM never chooses client tools

- **Tools not in prompt**: Check that `clientToolDetails` is populated in template data.
- **No tools linked**: Verify the agent has `AI Agent Client Tools` junction records.
- **Vague descriptions**: Tool descriptions should clearly explain when to use them.

### Agent hangs after tools with taskComplete=true

- **`terminateAfterExecution` not set**: Verify `executePromptStep()` has the `ClientTools` branch that sets `terminateAfterExecution`.
- **`validateNextStep` missing ClientTools**: Ensure `case 'ClientTools'` exists in the validation switch.

### Toast notification shows when viewing conversation

- **Bridge not synced**: Verify `ChatConversationsResource` calls `bridge.SetActiveFromWorkspace(id)` on conversation selection and creation.
- **Workspace active flag stale**: `updateAppContext()` in explorer-app should set `bridge.NotifyWorkspaceActive()` based on whether Chat/Conversations is the active view.
