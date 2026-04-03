# Plan: Extend Client Tools with Dynamic App Context

**Status:** Phase 1-2 Complete, Phase 3-4 Partial  
**Date:** 2026-04-03  
**Branch:** `claude/knowledge-hub-phase2`

---

## Problem Statement

Today, client tools are statically defined in `AgentTypePromptParams.clientTools` as a JSON blob inside the Loop agent type config. This has several limitations:

1. **Agent-type-specific** — only Loop agents can declare client tools
2. **Static** — tools don't change as the user navigates the app
3. **No app context** — the agent doesn't know what the user is currently looking at (which app, which form, which record)
4. **No reuse** — the same tool definition (e.g., `NavigateToApp`) is duplicated as JSON across every agent that needs it
5. **No governance** — no admin UI, no queryability, no audit trail for tool definitions

## Goals

- Agents know what the user is looking at and can act on it
- Tools appear/disappear dynamically as the user navigates the app
- Tool definitions are reusable, admin-manageable metadata — not buried JSON
- Any client app (MJExplorer, mobile, custom) can register its own tools
- The system prompt always has a fresh context snapshot so the LLM doesn't waste a round-trip just to "look around"

---

## Design

### Two-Layer Architecture

#### Layer 1: Metadata (Normalized Tables)

The **catalog** of well-known, reusable tools and which agents can use them.

**New entity: `MJ: AI Client Tool Definitions`**

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | PK |
| Name | nvarchar(200) | Unique identifier (e.g., `NavigateToApp`) |
| Description | nvarchar(max) | What the LLM reads to decide when to use the tool |
| Category | nvarchar(50) | `navigation`, `form`, `display`, `data` |
| InputSchemaJSON | nvarchar(max) | JSON Schema for parameters |
| OutputSchemaJSON | nvarchar(max) | JSON Schema for return value (nullable) |
| DefaultTimeoutMs | int | Per-tool timeout override (nullable, default 30000) |
| RequiresContextType | nvarchar(100) | Nullable — `entity-form`, `dashboard`, `search`, etc. When set, client only sends this tool to the server when the user is in that context |

**New entity: `MJ: AI Agent Client Tools` (junction)**

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | PK |
| AgentID | uniqueidentifier | FK → AI Agents |
| ClientToolDefinitionID | uniqueidentifier | FK → Client Tool Definitions |
| IsRequired | bit | If true, agent expects this tool to always be available |
| Priority | int | Sort order / precedence |

**Modified entity: `MJ: AI Agents`**

| Field | Type | Description |
|-------|------|-------------|
| AllowEphemeralClientTools | bit | Default 1. When true, agent accepts runtime-registered tools that aren't in metadata |

This replaces the `clientTools` array currently in `LoopAgentTypePromptParams`. Any agent type (Loop, Flow, future types) can now declare client tools via the junction table.

**NOTE** we do not need back compat for the changes to LoopAgentTypePromptParams, we will simply remove the client tools prop there as this version was never published, all good! 

#### Layer 2: Runtime (Client Code)

The app registers **handlers** for metadata-defined tools and can also register **ephemeral tools** that don't exist in metadata.

**Tool Providers** — components register/unregister tool providers on mount/unmount:

```typescript
interface ClientToolProvider {
    ProviderId: string;
    Priority: number;           // Higher = more specific context
    GetTools(): ClientToolDefinition[];
    GetContextSnapshot(): AppContextSlice;
}
```

**Ephemeral Tools** — short-lived, component-scoped tools with no metadata entry:

```typescript
// A duplicate detection dashboard component
ngOnInit() {
    this.agentClient.RegisterEphemeralTool({
        Name: 'FilterDuplicatesByThreshold',
        Description: 'Adjust similarity threshold on visible duplicate results',
        InputSchema: { threshold: { type: 'number', min: 0, max: 1 } },
        Handler: async (params) => {
            this.threshold = params.threshold;
            this.refresh();
            return { Success: true };
        }
    });
}

ngOnDestroy() {
    this.agentClient.UnregisterEphemeralTool('FilterDuplicatesByThreshold');
}
```

### Tool Resolution at Runtime

When an agent run starts, the client merges both layers:

```
Tools sent to server =
    Metadata tools (agent's declared tools that have a registered handler on the client)
  + Ephemeral tools (if agent.AllowEphemeralClientTools)
  - Metadata tools with no handler (declared but app doesn't support them)
```

The server/LLM only sees tools that are **both authorized AND currently available**.

### Layered Tool Availability

Tools stack in layers based on scope. Each layer activates/deactivates with the UI lifecycle:

```
Layer 0 (Global):      NavigateToApp, NavigateToRecord, ShowSearchResults
Layer 1 (App):         SwitchDashboardTab (only in apps with dashboards)
Layer 2 (Component):   FillFormField, GetFormState (only when a form is open)
Layer 3 (Ephemeral):   FilterDuplicatesByThreshold (only while dupe dashboard is mounted)
```

When a form closes, Layer 2 tools disappear. The agent's next LLM call won't see them.

### Context Snapshot (System Prompt Injection)

Beyond tool availability, the agent needs to know **what the user is currently looking at**. This goes into the system prompt so the LLM has it without burning a tool call.

Each active `ClientToolProvider` contributes a context slice. These get merged into a single snapshot:

```typescript
interface AppContextSnapshot {
    CurrentApp: string;
    CurrentView: string;           // "entity-form", "dashboard", "search-results", "home"

    // Form-specific (only present when on a form)
    Form?: {
        EntityName: string;
        RecordID: string;
        IsNewRecord: boolean;
        Fields: FormFieldSnapshot[];    // name, type, isDirty
        DirtyFieldValues: Record<string, unknown>;  // only dirty fields' current values
    };

    // Dashboard-specific
    Dashboard?: {
        ActiveTab: string;
        AvailableTabs: string[];
    };

    // Always present
    User: {
        Name: string;
        Roles: string[];
    };
}

interface FormFieldSnapshot {
    Name: string;
    Type: string;           // "string", "number", "boolean", "date", "lookup"
    IsDirty: boolean;
    IsRequired: boolean;
    HasValidationError: boolean;
}
```

**Granularity rationale:**
- Field names + types + dirty state are cheap and always included — tells the LLM "what's on screen"
- Only dirty field values are included by default — avoids token bloat from 50+ field values
- Full field values, validation details, related records are available via tools (`GetFormFieldValue`, `GetFieldValidation`) if the agent needs them
- This keeps the system prompt lean while giving the LLM enough to act intelligently

### Context Update Lifecycle

**Hybrid approach:**

| Trigger | Action |
|---------|--------|
| Major transition (app switch, form open/close, tab change) | Push updated tools + context to server immediately via `UpdateClientToolDefinitions` |
| Agent run starts | Fresh snapshot collected from all active providers, injected into system prompt |
| Mid-conversation (user navigates while agent is running) | Debounced push (500ms) so in-flight agent sees updated context on next LLM call |

### Security Model

- **Metadata tools** are governed by the `AI Agent Client Tools` junction — agents can only use tools they're linked to
- **Ephemeral tools** are governed by `AllowEphemeralClientTools` flag on the agent
- The agent permission system (`AIAgentPermissionHelper`) controls who can *run* which agents — this is the primary access control boundary
- Tools themselves don't have independent permissions; access is controlled through the agent that invokes them
- If a client hasn't registered a handler for a declared tool, the tool is silently excluded (not an error)

---

## Migration Path

### Phase 1: Schema & Metadata

1. **Migration**: Create `ClientToolDefinition` and `AIAgentClientTool` tables
2. **Migration**: Add `AllowEphemeralClientTools` column to `AI Agents`
3. **Run CodeGen** to generate entity classes
4. **Seed metadata**: Create `Client Tool Definition` records for existing tools (`NavigateToApp`, `NavigateToRecord`, `ShowSearchResults`, `SwitchDashboardTab`)
5. **Seed junction**: Link Sage agent to its tools via `AI Agent Client Tools`
6. **Remove** `clientTools` from `LoopAgentTypePromptParams` (or deprecate with fallback)

### Phase 2: Server-Side Tool Resolution

1. **BaseAgent**: Load tool definitions from `AI Agent Client Tools` junction instead of `AgentTypePromptParams.clientTools`
2. **BaseAgent**: Merge metadata tools with ephemeral tools from the client session
3. **BaseAgent**: Inject context snapshot into system prompt via a new `buildContextSection()` method
4. **ClientToolRequestManager**: Accept both metadata-defined and ephemeral tool invocations

### Phase 3: Client SDK — ToolProvider System

1. **AgentClientSession**: Add `RegisterToolProvider` / `UnregisterToolProvider` API
2. **AgentClientSession**: Add `RegisterEphemeralTool` / `UnregisterEphemeralTool` convenience methods
3. **AgentClientSession**: Implement tool merging logic (metadata + ephemeral - no handler)
4. **AgentClientSession**: Implement context snapshot collection from all providers
5. **AgentClientSession**: Push updates on major transitions (debounced)
6. **AgentClientService** (Angular): Thin wrapper exposing provider registration

### Phase 4: MJExplorer Integration

1. **ExplorerAppComponent**: Register global tool handlers (`NavigateToApp`, `NavigateToRecord`)
2. **Entity Form Components**: Register as ToolProvider on init, expose `FillFormField`, `GetFormState`, `SubmitForm`
3. **Dashboard Components**: Register as ToolProvider, expose `SwitchTab`, plus ephemeral tools for dashboard-specific actions
4. **Chat Components**: Pass context snapshot when invoking agents

### Phase 5: Refinement

1. Admin UI for managing `Client Tool Definitions` (free from CodeGen)
2. Admin UI for linking tools to agents via `AI Agent Client Tools`
3. Telemetry — track tool usage, success rates, timeouts
4. Documentation updates to CLIENT_TOOLS_GUIDE.md

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tool definitions storage | Normalized tables, not JSON blob | Reusable, queryable, admin-manageable, consistent with MJ patterns |
| Agent-to-tool relationship | Junction table | Many-to-many, agents share tool definitions |
| Ephemeral tools | Allowed by default, opt-out per agent | Maximizes flexibility for app developers; agents that need strict control can disable |
| Context snapshot delivery | System prompt injection | Always available to LLM without burning a tool call; lean format keeps token cost low |
| Form field values in context | Dirty fields only by default | Balances awareness vs token cost; full values available via tool call |
| Context update timing | Hybrid (push on transitions + snapshot on run start) | Responsive without being chatty |
| Tool handler absence | Silent exclusion | App doesn't support a tool = tool isn't available. Not an error. Graceful degradation across different client apps |

---

## Open Questions

1. **Tool versioning** — Do we need to version tool schemas, or is "latest wins" sufficient? For now, latest wins seems fine since tools are tightly coupled to app code.

AN: I Think latest wins is fine

2. **Tool result persistence** — Should tool invocations and results be stored as conversation details (like action results are today)? Probably yes for auditability.

AN: Tool results should definitely be part of the conversation history just like action results and over time they can be compacted but made available if the LLM asks for it - study how we do this with Actions and do same with Client Tool results. We will have other such similar things for example we are wroking (separate from this branch) on a concept called Artifact Tools where agents will know about artifacts/attachments in their agent run and have various tools to interrogate those artifacts like grep/sed/regex/json looping tools/etc. All of these tool results, action results, etc can be compacted down and reexpaned later by request of LLM. We should make this work extensibly so we can use this for Artifact Tools after this PR is merged that will be next.

3. **Cross-agent tool sharing** — If Agent A is running and invokes a sub-agent B, should B inherit A's client tools? Probably yes with an opt-out, similar to how `ClientToolChange` scoping works today.

AN: **NO** I think tools should be specific to an agent. Automatically bleeding over is a security risk IMO

How does ClientToolChange work today?


4. **Context snapshot size limits** — For entities with 100+ fields, the form context could get large. May need a configurable field inclusion/exclusion list per entity or a max-fields cap.

AN: I don't like this arbitrary trunctaion concept, very bad, instead we can do what I note above in #2 open question
