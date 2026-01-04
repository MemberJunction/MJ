# Script Actions

## Technical Architecture Document

**Version**: 1.0
**Date**: January 2026
**Status**: Proposal

---

## Executive Summary

This document describes the architecture for enabling MemberJunction agents to dynamically generate, test, and persist new actions at runtime. Building on the proven bridge pattern from Skip's React runtime and the existing JavaScript sandbox infrastructure, **Script Actions** (a new `Type='Script'` in the existing Actions entity) allow agents to create composite capabilities that combine existing actions with custom logic—enabling a self-improving agent ecosystem.

The key innovation is the **Script Action Bridge**—a utilities object injected into sandboxed JavaScript that provides async access to MemberJunction's full capabilities: entity metadata, views, queries, actions, and agents. This mirrors the successful pattern used in the React runtime for interactive components.

**Key Design Decision**: Rather than creating new entities, Script Actions extend the existing Actions infrastructure with a new Type value and a few additional columns. This maximizes reuse of existing discovery, logging, agent linking, and approval workflows.

---

## Vision & Business Case

### The Problem: Capability Gaps Halt Agents

Today's MemberJunction agents operate within a fixed set of capabilities defined at development time. When an agent encounters a task that requires combining existing actions in novel ways, or needs a capability that doesn't exist yet, it must either:

1. **Fail gracefully** - Report that it cannot complete the task
2. **Request human intervention** - Ask a developer to create the missing capability
3. **Improvise poorly** - Attempt workarounds that may not be reliable

This creates a bottleneck where the value of agents is limited by the imagination and availability of developers who define their capabilities upfront.

### The Vision: Agents That Build Their Own Tools

Script Actions transform agents from consumers of fixed capabilities into **creators of new ones**. When Agent Manager (or any agent with appropriate permissions) identifies a capability gap, it can:

1. **Design** a new action that composes existing actions with custom logic
2. **Generate** the code using Codesmith's proven code generation patterns
3. **Test** the action in a sandboxed environment
4. **Submit** for human approval with full transparency on permissions and code
5. **Persist** as a first-class action available to all agents

The result is an agent ecosystem that **improves itself over time**—each new capability becomes a building block for even more sophisticated capabilities.

### The Scaffolding Effect

This is the key insight that makes Script Actions transformative:

```
Week 1: Agent creates "Daily Customer Digest" action
Week 2: Agent creates "Sales Pipeline Alert" using Customer Digest as a component
Week 3: Agent creates "Executive Dashboard Generator" using both prior actions
Week 4: Agent creates "Quarterly Business Review" composing all of the above
```

Each new action **scaffolds** upon previous ones, creating compound value:

- **Linear development** → **Exponential capability growth**
- Actions that took agents hours to create → now take minutes to compose
- Cross-functional capabilities emerge organically from business needs
- Domain knowledge encoded by agents becomes permanent organizational assets

### Business Value

| Traditional Approach | With Script Actions |
|---------------------|---------------------|
| Developers must anticipate every capability | Agents identify gaps in real-time |
| Weeks to design, implement, test, deploy | Hours from conception to approval |
| Capabilities siloed by development cycles | Continuous capability improvement |
| Knowledge locked in developer heads | Knowledge encoded in executable actions |
| Limited by developer availability | Limited only by approval bandwidth |

### Real-World Use Cases

**1. Operations Automation**
> "Send me a weekly digest of new customers, sorted by estimated value, and alert me immediately if any enterprise-tier customer churns."

Agent creates "Customer Digest with Churn Alert" action combining entity queries, value calculations, and notification triggers—all approved by a human before execution.

**2. Data Quality Enforcement**
> "Before any record is saved, validate that all required relationships exist and data formats are correct."

Agent creates validation actions that compose existing validators with custom business rules, running in the pre-save hook.

**3. Cross-System Orchestration**
> "When a deal closes in CRM, create the project in PM tool, notify the delivery team, and schedule the kickoff meeting."

Agent creates an orchestration action that invokes multiple existing integration actions in sequence with error handling.

**4. Adaptive Reporting**
> "Create a report that shows me the metrics most likely to indicate problems with this quarter's forecast."

Agent creates a dynamic reporting action that uses AI to select relevant metrics and presentation formats based on context.

### Why Now?

MemberJunction already has all the prerequisites:

1. **Proven Sandbox** - 5-layer security with isolated-vm, battle-tested
2. **Bridge Pattern** - React runtime demonstrates utilities injection works
3. **Codesmith Agent** - Iterative code generation with testing loop
4. **Approval Workflow** - CodeApprovalStatus for human oversight
5. **Actions Framework** - Extensible type system and execution engine

Script Actions is the natural evolution that connects these pieces into a coherent capability-generation system.

---

## Architectural Foundation

### Existing Infrastructure Leverage

| Component | Current State | Script Actions Usage |
|-----------|--------------|----------------------|
| **JavaScript Sandbox** | Production-grade `isolated-vm` with 5-layer security | Execution environment for Script action code |
| **React Runtime Bridge** | `utilities` object with `md`, `rv`, `rq`, `ai` | Pattern template for action bridge |
| **Codesmith Agent** | Iterative code generation and testing | ActionSmith delegates code generation to Codesmith |
| **Actions Entity** | Existing with `Type='Custom'`, `'Generated'`, `'EntityAction'` | Add `Type='Script'` + permission columns |
| **Action Framework** | `ActionEngineServer` with full lifecycle | Add `case 'Script'` to route to sandbox |
| **Agent Manager** | Meta-agent creating agents and prompts | Primary consumer for Script action generation |

### Design Principles

1. **Existing Infrastructure**: Use Actions entity with new Type, not new tables
2. **Bridge Pattern**: Expose MJ capabilities through a clean utilities interface (like React runtime)
3. **Async-First**: All bridge operations are Promise-based for natural async/await usage
4. **Serializable Data**: All data crossing the bridge is JSON-serializable (no class instances)
5. **Security by Approval**: Uses existing CodeApprovalStatus workflow
6. **Codesmith Composition**: ActionSmith orchestrates, Codesmith writes code—don't reinvent the wheel
7. **Scaffolding Effect**: Each Script action becomes a building block for more complex actions

---

## Script Action Bridge

### The `utilities` Object

Script actions receive a `utilities` object identical in spirit to the React runtime, but tailored for action execution context:

```typescript
interface ScriptActionUtilities {
  /**
   * Entity metadata access
   * Read-only access to entity definitions, fields, relationships
   */
  md: {
    /** All available entities */
    Entities: EntityInfo[];

    /** Get entity metadata by name */
    GetEntity(entityName: string): EntityInfo | undefined;

    /** Get entity fields */
    GetEntityFields(entityName: string): EntityFieldInfo[];

    /** Get related entities */
    GetRelatedEntities(entityName: string): RelatedEntityInfo[];
  };

  /**
   * View execution - query entity data
   * Returns plain JSON objects (not BaseEntity instances)
   */
  rv: {
    /** Execute a single view */
    RunView(options: {
      EntityName: string;
      ExtraFilter?: string;
      OrderBy?: string;
      Fields?: string[];
      MaxRows?: number;
    }): Promise<{
      Success: boolean;
      Results: Record<string, any>[];
      TotalRowCount: number;
      ErrorMessage?: string;
    }>;

    /** Execute multiple views in parallel (optimized) */
    RunViews(options: Array<{
      EntityName: string;
      ExtraFilter?: string;
      OrderBy?: string;
      Fields?: string[];
      MaxRows?: number;
    }>): Promise<Array<{
      Success: boolean;
      Results: Record<string, any>[];
      TotalRowCount: number;
      ErrorMessage?: string;
    }>>;
  };

  /**
   * Query execution - run named queries
   */
  rq: {
    RunQuery(options: {
      QueryName: string;
      Parameters?: Record<string, any>;
    }): Promise<{
      Success: boolean;
      Results: Record<string, any>[];
      ErrorMessage?: string;
    }>;
  };

  /**
   * Entity CRUD operations
   * Works with plain JSON objects, not BaseEntity instances
   */
  entity: {
    /** Create a new record */
    Create(entityName: string, data: Record<string, any>): Promise<{
      Success: boolean;
      ID: string;
      Record: Record<string, any>;
      ErrorMessage?: string;
    }>;

    /** Load a record by ID */
    Load(entityName: string, id: string): Promise<{
      Success: boolean;
      Record: Record<string, any>;
      ErrorMessage?: string;
    }>;

    /** Update an existing record */
    Update(entityName: string, id: string, data: Record<string, any>): Promise<{
      Success: boolean;
      Record: Record<string, any>;
      ErrorMessage?: string;
    }>;

    /** Delete a record */
    Delete(entityName: string, id: string): Promise<{
      Success: boolean;
      ErrorMessage?: string;
    }>;

    /** Save (create or update based on ID presence) */
    Save(entityName: string, data: Record<string, any>): Promise<{
      Success: boolean;
      ID: string;
      Record: Record<string, any>;
      ErrorMessage?: string;
    }>;
  };

  /**
   * Action invocation - call other actions
   * The core composition mechanism
   */
  actions: {
    /** Get available actions (filtered by permissions) */
    GetAvailableActions(): ActionInfo[];

    /** Invoke an action by name */
    Invoke(actionName: string, params: Record<string, any>): Promise<{
      Success: boolean;
      ResultCode: string;
      OutputParams: Record<string, any>;
      Message?: string;
    }>;

    /** Invoke multiple actions in parallel */
    InvokeAll(calls: Array<{
      ActionName: string;
      Params: Record<string, any>;
    }>): Promise<Array<{
      Success: boolean;
      ResultCode: string;
      OutputParams: Record<string, any>;
      Message?: string;
    }>>;
  };

  /**
   * Agent invocation - delegate to other agents
   */
  agents: {
    /** Get available agents (filtered by permissions) */
    GetAvailableAgents(): AgentInfo[];

    /** Run an agent */
    Run(agentName: string, options: {
      Input: Record<string, any>;
      ConversationID?: string;
    }): Promise<{
      Success: boolean;
      Output: Record<string, any>;
      Messages: Array<{ Role: string; Content: string }>;
      ErrorMessage?: string;
    }>;
  };

  /**
   * AI/LLM capabilities - direct model access
   */
  ai: {
    /** Execute a prompt */
    ExecutePrompt(options: {
      SystemPrompt: string;
      UserMessage: string;
      ModelPower?: 'lowest' | 'medium' | 'highest';
    }): Promise<{
      Success: boolean;
      Response: string;
      ModelUsed: string;
      TokensUsed: number;
    }>;

    /** Generate embeddings */
    GetEmbedding(text: string): Promise<{
      Success: boolean;
      Embedding: number[];
    }>;
  };

  /**
   * Logging and debugging
   */
  log: {
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, data?: any): void;
    debug(message: string, data?: any): void;
  };

  /**
   * Allowed utility libraries (pre-loaded)
   */
  libs: {
    lodash: typeof import('lodash');
    dateFns: typeof import('date-fns');
    mathjs: typeof import('mathjs');
    uuid: { v4: () => string };
    validator: typeof import('validator');
  };
}
```

### Bridge Implementation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Runtime Action Execution                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Sandbox (isolated-vm)                   │   │
│  │                                                           │   │
│  │   // User's runtime action code                          │   │
│  │   async function execute(input, utilities) {             │   │
│  │     const sales = await utilities.rv.RunView({           │   │
│  │       EntityName: 'Sales',                               │   │
│  │       ExtraFilter: `Region = '${input.region}'`          │   │
│  │     });                                                   │   │
│  │                                                           │   │
│  │     const summary = await utilities.ai.ExecutePrompt({   │   │
│  │       SystemPrompt: 'Summarize sales data',              │   │
│  │       UserMessage: JSON.stringify(sales.Results)         │   │
│  │     });                                                   │   │
│  │                                                           │   │
│  │     await utilities.actions.Invoke('Send Email', {       │   │
│  │       To: input.recipientEmail,                          │   │
│  │       Subject: 'Sales Summary',                          │   │
│  │       Body: summary.Response                             │   │
│  │     });                                                   │   │
│  │                                                           │   │
│  │     return { success: true, summary: summary.Response }; │   │
│  │   }                                                       │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              │ Bridge Calls (IPC)                │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Bridge Handler (Main Process)                │   │
│  │                                                           │   │
│  │   • Receives serialized requests from sandbox            │   │
│  │   • Validates permissions for requested operation        │   │
│  │   • Executes actual MJ API calls with contextUser        │   │
│  │   • Serializes results back to sandbox                   │   │
│  │   • Enforces rate limits and resource constraints        │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           MemberJunction Core Services                    │   │
│  │                                                           │   │
│  │   Metadata │ RunView │ RunQuery │ ActionEngine │ Agents  │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Async Bridge Protocol

The sandbox uses a request-response IPC pattern for async operations:

```typescript
// Inside sandbox: utilities.rv.RunView() implementation
async function RunView(options) {
  // 1. Serialize request
  const request = {
    id: generateRequestId(),
    type: 'rv.RunView',
    payload: options
  };

  // 2. Send to main process via IPC
  sendToHost(JSON.stringify(request));

  // 3. Wait for response (Promise resolves when response arrives)
  const response = await waitForResponse(request.id);

  // 4. Return deserialized result
  return JSON.parse(response);
}
```

```typescript
// Main process: Bridge handler
class ScriptActionBridge {
  async handleRequest(request: BridgeRequest, context: ExecutionContext): Promise<BridgeResponse> {
    // Validate permissions
    if (!this.isOperationAllowed(request.type, context.permissions)) {
      return { error: 'Operation not permitted', code: 'PERMISSION_DENIED' };
    }

    // Route to appropriate handler
    switch (request.type) {
      case 'rv.RunView':
        return this.handleRunView(request.payload, context.contextUser);
      case 'actions.Invoke':
        return this.handleActionInvoke(request.payload, context);
      case 'agents.Run':
        return this.handleAgentRun(request.payload, context);
      // ... other handlers
    }
  }

  private async handleRunView(payload: RunViewPayload, contextUser: UserInfo) {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: payload.EntityName,
      ExtraFilter: payload.ExtraFilter,
      OrderBy: payload.OrderBy,
      MaxRows: payload.MaxRows,
      Fields: payload.Fields,
      ResultType: 'simple'  // Always return plain objects, not entities
    }, contextUser);

    return {
      Success: result.Success,
      Results: result.Results,
      TotalRowCount: result.TotalRowCount,
      ErrorMessage: result.ErrorMessage
    };
  }
}
```

---

## Using Existing Actions Infrastructure

### No New Tables Required

Instead of creating a new `RuntimeAction` entity, we extend the existing `Actions` infrastructure with a new type. The Actions table already has:

- `Type` field → Add new value: `'Script'`
- `Code` field → Already stores code for Generated actions
- `CodeApprovalStatus` → Already handles approval workflow
- `ActionParams` → Already defines inputs/outputs
- `ActionResultCodes` → Already defines outcomes
- `ActionExecutionLog` → Already logs all executions
- `AIAgentAction` → Already links actions to agents

### Schema Extension

```sql
-- Add to existing Actions table
ALTER TABLE [${flyway:defaultSchema}].[Action] ADD
    -- Script-specific configuration (JSON blob - evolvable)
    [ScriptActionConfiguration] NVARCHAR(MAX) NULL,

    -- Universal execution timeout (applies to ALL action types)
    [MaxExecutionTimeMS] INT NULL,

    -- Creation tracking (which agent created this, if any)
    [CreatedByAgentID] UNIQUEIDENTIFIER NULL;
```

### ScriptActionConfiguration Interface

Defined in `@memberjunction/actions-base` for universal access:

```typescript
/**
 * Reference to an entity/action/agent with both ID (stable) and Name (readable)
 * ID is the source of truth; Name is for display and debugging
 */
export interface ScriptActionReference {
  /** UUID of the referenced item - used for lookups */
  id: string;
  /** Human-readable name - for display, logging, and approval review */
  name: string;
}

/**
 * Reference to an approved sandbox library
 */
export interface ScriptLibraryReference {
  /** Library name as used in require() */
  name: string;
  /** Optional: specific version constraint */
  version?: string;
}

/**
 * Configuration for Script actions (Type='Script')
 * Stored as JSON in Action.ScriptActionConfiguration
 * Evolvable - add new properties as needed without schema changes
 */
export interface ScriptActionConfiguration {
  // Permission boundaries - what this script can access via bridge
  permissions: {
    /** Actions this script can invoke via bridge */
    allowedActions: ScriptActionReference[];
    /** Agents this script can run via bridge */
    allowedAgents: ScriptActionReference[];
    /** Entities this script can access via bridge (RunView, CRUD) */
    allowedEntities: ScriptActionReference[];
  };

  // Resource limits (override defaults)
  limits?: {
    /** Memory limit in MB (default: 128) */
    maxMemoryMB?: number;
    /** Max bridge calls per execution (default: 100) */
    maxBridgeCalls?: number;
  };

  // Sandbox configuration
  sandbox?: {
    /**
     * Additional libraries beyond the default set.
     * Default set: lodash, date-fns, uuid, validator
     * Additional approved libraries (opt-in):
     *   - mathjs: Heavy math library, not needed by most scripts
     *   - papaparse: CSV parsing, only if script handles CSV
     *   - cheerio: HTML parsing, only if script processes HTML
     *   - marked: Markdown parsing
     * Must be in the approved library registry - arbitrary npm packages not allowed
     */
    additionalLibraries?: ScriptLibraryReference[];
    /** Enable debug logging in sandbox (verbose console output) */
    debugMode?: boolean;
  };

  // Versioning metadata
  version?: string;
  previousVersionId?: string;
}

// Helper in ActionEntityExtended or ActionEngineBase
export function parseScriptActionConfiguration(
  action: ActionEntity
): ScriptActionConfiguration | null {
  if (action.Type !== 'Script' || !action.ScriptActionConfiguration) {
    return null;
  }
  try {
    return JSON.parse(action.ScriptActionConfiguration) as ScriptActionConfiguration;
  } catch {
    return null;
  }
}
```

### Example Configuration (Readable)

```json
{
  "permissions": {
    "allowedEntities": [
      { "id": "A1B2C3D4-...", "name": "Customers" },
      { "id": "E5F6G7H8-...", "name": "Orders" }
    ],
    "allowedActions": [
      { "id": "I9J0K1L2-...", "name": "Send Email" }
    ],
    "allowedAgents": []
  },
  "limits": {
    "maxMemoryMB": 128,
    "maxBridgeCalls": 50
  },
  "sandbox": {
    "additionalLibraries": [
      { "name": "papaparse" }
    ],
    "debugMode": false
  }
}
```

### Universal Execution Timeout with Abort Signal

`MaxExecutionTimeMS` applies to **all** action types. ActionEngine enforces with abort signal:

```typescript
// In ActionEngineServer - applies to ALL action types
async RunAction(params: RunActionParams): Promise<ActionResult> {
  const action = params.Action;
  const timeoutMs = action.MaxExecutionTimeMS || this.config.defaultActionTimeoutMS;

  // Create abort controller for cancellation
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    // Pass abort signal through params
    params.AbortSignal = abortController.signal;
    return await this.executeAction(action, params);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Actions can check for abort in long-running operations
protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
  // Check periodically in loops
  if (params.AbortSignal?.aborted) {
    return { Success: false, ResultCode: 'TIMEOUT', Message: 'Execution aborted due to timeout' };
  }
  // ... action logic
}
```

### Action Type Comparison

| Field | Custom | Generated | Script (NEW) |
|-------|--------|-----------|--------------|
| **Code Storage** | N/A (compiled) | AI-generated TypeScript | JavaScript in sandbox |
| **Execution** | Native TypeScript | Native TypeScript | Sandbox + Bridge |
| **Compilation** | Build-time | Build-time | Runtime (no build) |
| **Approval** | N/A | CodeApprovalStatus | CodeApprovalStatus |
| **Permissions** | Implicit (code) | Implicit (code) | Explicit (ScriptActionConfiguration) |
| **Timeout** | MaxExecutionTimeMS | MaxExecutionTimeMS | MaxExecutionTimeMS |
| **Can call Actions** | Yes (direct) | Yes (direct) | Yes (via bridge, scoped) |

### How Script Actions Work

```typescript
// ActionEngineServer detects Type='Script' and routes accordingly
private async executeAction(action: ActionEntity, params: RunActionParams): Promise<ActionResult> {
  switch (action.Type) {
    case 'Custom':
    case 'Generated':
      return this.runNativeAction(action, params);

    case 'Script':
      return this.runScriptAction(action, params);

    case 'EntityAction':
      return this.runEntityAction(action, params);
  }
}

private async runScriptAction(action: ActionEntity, params: RunActionParams): Promise<ActionResult> {
  // 1. Parse configuration
  const config = parseScriptActionConfiguration(action);
  if (!config) {
    return { Success: false, Message: 'Invalid ScriptActionConfiguration' };
  }

  // 2. Create bridge with scoped permissions
  const bridge = new ScriptActionBridge(
    params.ContextUser,
    config.permissions,
    params.AbortSignal  // Pass abort signal to bridge
  );

  // 3. Execute in sandbox
  const executor = new ScriptActionExecutor();
  const result = await executor.execute(
    action.Code,
    this.paramsToInput(params),
    bridge,
    {
      memoryLimit: config.limits?.maxMemoryMB || 128,
      maxBridgeCalls: config.limits?.maxBridgeCalls || 100,
      abortSignal: params.AbortSignal
    }
  );

  // 4. Standard logging (uses existing ActionExecutionLog)
  return this.wrapResult(result, params);
}
```

### Benefits of Using Existing Infrastructure

1. **No migration complexity** - Just add columns and a new Type value
2. **Unified discovery** - Script actions appear alongside other actions
3. **Existing logging** - ActionExecutionLog already captures everything
4. **Existing agent linking** - AIAgentAction already works
5. **Existing UI** - Action management UI works with minor updates
6. **Existing CodeGen patterns** - Same approval workflow as Generated actions
7. **Evolvable Configuration** - JSON blob can grow without schema changes
8. **Universal Timeout** - All action types benefit from timeout enforcement

### Example: Creating a Script Action

```json
{
  "fields": {
    "Name": "Daily Customer Digest",
    "Description": "Fetches new customers, generates AI summary, sends email",
    "Type": "Script",
    "Status": "Pending",
    "CategoryID": "@lookup:Action Categories.Name=Communication",

    "Code": "const customers = await utilities.rv.RunView({ EntityName: 'Customers', ExtraFilter: \"CreatedAt >= DATEADD(day, -1, GETDATE())\" });\n\nif (customers.Results.length === 0) {\n  return { success: true, message: 'No new customers' };\n}\n\nconst summary = await utilities.ai.ExecutePrompt({ SystemPrompt: 'Summarize new customers', UserMessage: JSON.stringify(customers.Results) });\n\nawait utilities.actions.Invoke('Send Email', { To: input.recipientEmail, Subject: 'Daily Customer Digest', Body: summary.Response });\n\nreturn { success: true, customerCount: customers.Results.length };",

    "CodeApprovalStatus": "Pending",
    "ScriptActionConfiguration": "{\"permissions\":{\"allowedEntities\":[\"Customers\"],\"allowedActions\":[\"Send Email\"],\"allowedAgents\":[]},\"limits\":{\"maxMemoryMB\":128}}",
    "MaxExecutionTimeMS": 30000,
    "CreatedByAgentID": "@lookup:AI Agents.Name=ActionSmith Agent"
  },
  "relatedEntities": {
    "Action Params": [
      {
        "fields": {
          "Name": "recipientEmail",
          "Type": "Input",
          "ValueType": "Scalar",
          "IsRequired": true,
          "Description": "Email address to send the digest to"
        }
      },
      {
        "fields": {
          "Name": "customerCount",
          "Type": "Output",
          "ValueType": "Scalar",
          "Description": "Number of new customers included in digest"
        }
      }
    ],
    "Action Result Codes": [
      { "fields": { "ResultCode": "SUCCESS", "IsSuccess": true } },
      { "fields": { "ResultCode": "NO_CUSTOMERS", "IsSuccess": true, "Description": "No new customers to report" } },
      { "fields": { "ResultCode": "EMAIL_FAILED", "IsSuccess": false } }
    ]
  }
}
```

**Readable ScriptActionConfiguration:**
```json
{
  "permissions": {
    "allowedEntities": [
      { "id": "D7E8F9A0-1234-5678-9ABC-DEF012345678", "name": "Customers" }
    ],
    "allowedActions": [
      { "id": "A1B2C3D4-5678-9ABC-DEF0-123456789ABC", "name": "Send Email" }
    ],
    "allowedAgents": []
  },
  "limits": {
    "maxMemoryMB": 128
  }
}
```

---

## Execution Flow

### Complete Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                 RUNTIME ACTION LIFECYCLE                         │
└─────────────────────────────────────────────────────────────────┘

1. GENERATION (Agent Manager or User)
   ┌─────────────────────────────────────────────────────────────┐
   │ Agent identifies capability gap                              │
   │     ↓                                                        │
   │ Agent designs runtime action:                                │
   │   • Determines which existing actions to compose             │
   │   • Defines input/output schema                              │
   │   • Writes JavaScript code using bridge utilities            │
   │     ↓                                                        │
   │ Agent generates RuntimeAction record with Status='Pending'   │
   └─────────────────────────────────────────────────────────────┘
                              ↓
2. TESTING (Sandbox Execution)
   ┌─────────────────────────────────────────────────────────────┐
   │ Agent provides test inputs                                   │
   │     ↓                                                        │
   │ RuntimeActionExecutor runs in sandbox with test permissions  │
   │     ↓                                                        │
   │ Results validated against OutputSchema                       │
   │     ↓                                                        │
   │ If errors: Agent refines code (Codesmith pattern)           │
   │ If success: Proceed to approval                              │
   └─────────────────────────────────────────────────────────────┘
                              ↓
3. APPROVAL (User Gate)
   ┌─────────────────────────────────────────────────────────────┐
   │ User presented with:                                         │
   │   • Action name and description                              │
   │   • What it does (plain English from agent)                  │
   │   • The code (syntax highlighted)                            │
   │   • Permissions requested (entities, actions, agents)        │
   │   • Test results                                             │
   │     ↓                                                        │
   │ User reviews and either:                                     │
   │   [Approve] → Status='Approved', ApprovedAt=now              │
   │   [Reject]  → Status='Rejected', RejectionReason=feedback    │
   │   [Edit]    → User can modify code before approval           │
   └─────────────────────────────────────────────────────────────┘
                              ↓
4. REGISTRATION (Available for Use)
   ┌─────────────────────────────────────────────────────────────┐
   │ RuntimeAction indexed in semantic search                     │
   │     ↓                                                        │
   │ Action appears in agent action discovery                     │
   │     ↓                                                        │
   │ Can be linked to agents via AIAgentRuntimeAction             │
   │     ↓                                                        │
   │ Available for composition in other runtime actions           │
   └─────────────────────────────────────────────────────────────┘
                              ↓
5. EXECUTION (Runtime)
   ┌─────────────────────────────────────────────────────────────┐
   │ Agent/workflow invokes runtime action                        │
   │     ↓                                                        │
   │ ActionEngineServer detects RuntimeAction type                │
   │     ↓                                                        │
   │ RuntimeActionExecutor:                                       │
   │   1. Creates sandbox with bridge utilities                   │
   │   2. Injects permissions based on AllowedActions/Entities    │
   │   3. Executes code with timeout/memory limits                │
   │   4. Returns result                                          │
   │     ↓                                                        │
   │ Execution logged to RuntimeActionExecutionLog                │
   └─────────────────────────────────────────────────────────────┘
                              ↓
6. SCAFFOLDING (Compound Growth)
   ┌─────────────────────────────────────────────────────────────┐
   │ New runtime action can invoke this action via bridge         │
   │     ↓                                                        │
   │ Capabilities compound over time                              │
   │     ↓                                                        │
   │ Agent ecosystem becomes increasingly capable                 │
   └─────────────────────────────────────────────────────────────┘
```

### ScriptActionExecutor Implementation

```typescript
export class ScriptActionExecutor {

  async execute(
    action: ActionEntity,  // Uses existing Actions entity with Type='Script'
    inputParams: Record<string, any>,
    contextUser: UserInfo
  ): Promise<ScriptActionResult> {

    // 1. Build permission context from action metadata
    const permissions: ExecutionPermissions = {
      allowedActions: JSON.parse(action.AllowedActions || '[]'),
      allowedAgents: JSON.parse(action.AllowedAgents || '[]'),
      allowedEntities: JSON.parse(action.AllowedEntities || '[]')
    };

    // 2. Create bridge with scoped permissions
    const bridge = new ScriptActionBridge(contextUser, permissions);

    // 3. Build utilities object for sandbox
    const utilities = this.buildUtilities(bridge);

    // 4. Execute in sandbox
    const codeExecution = new CodeExecutionService();
    await codeExecution.initialize();

    const result = await codeExecution.execute({
      code: this.wrapCode(action.Code),
      language: 'javascript',
      inputData: { input: inputParams, utilities },
      timeoutSeconds: action.MaxExecutionTimeSeconds || 30,
      memoryLimitMB: action.MaxMemoryMB || 128
    });

    return {
      Success: result.success,
      Output: result.output,
      Logs: result.logs,
      ErrorMessage: result.error,
      ExecutionTimeMs: result.executionTimeMs
    };
  }

  private wrapCode(userCode: string): string {
    return `
      async function __executeScriptAction(input, utilities) {
        ${userCode}
      }

      output = await __executeScriptAction(input, utilities);
    `;
  }

  private buildUtilities(bridge: ScriptActionBridge): ScriptActionUtilities {
    return {
      md: {
        Entities: bridge.getEntities(),
        GetEntity: (name) => bridge.getEntity(name),
        GetEntityFields: (name) => bridge.getEntityFields(name),
        GetRelatedEntities: (name) => bridge.getRelatedEntities(name)
      },
      rv: {
        RunView: (options) => bridge.runView(options),
        RunViews: (options) => bridge.runViews(options)
      },
      rq: {
        RunQuery: (options) => bridge.runQuery(options)
      },
      entity: {
        Create: (entityName, data) => bridge.createEntity(entityName, data),
        Load: (entityName, id) => bridge.loadEntity(entityName, id),
        Update: (entityName, id, data) => bridge.updateEntity(entityName, id, data),
        Delete: (entityName, id) => bridge.deleteEntity(entityName, id),
        Save: (entityName, data) => bridge.saveEntity(entityName, data)
      },
      actions: {
        GetAvailableActions: () => bridge.getAvailableActions(),
        Invoke: (name, params) => bridge.invokeAction(name, params),
        InvokeAll: (calls) => bridge.invokeActions(calls)
      },
      agents: {
        GetAvailableAgents: () => bridge.getAvailableAgents(),
        Run: (name, options) => bridge.runAgent(name, options)
      },
      ai: {
        ExecutePrompt: (options) => bridge.executePrompt(options),
        GetEmbedding: (text) => bridge.getEmbedding(text)
      },
      log: {
        info: (msg, data) => bridge.log('info', msg, data),
        warn: (msg, data) => bridge.log('warn', msg, data),
        error: (msg, data) => bridge.log('error', msg, data),
        debug: (msg, data) => bridge.log('debug', msg, data)
      },
      libs: bridge.getLibraries()
    };
  }
}
```

---

## Security Model

### Multi-Layer Security

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: USER APPROVAL GATE                                     │
│ • User must explicitly approve runtime action before use        │
│ • User sees: code, permissions, test results                    │
│ • User can edit code before approval                            │
│ • Rejection requires reason (feedback to agent)                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: DECLARATIVE PERMISSIONS                                 │
│ • AllowedActions: Only these actions can be invoked             │
│ • AllowedAgents: Only these agents can be run                   │
│ • AllowedEntities: Only these entities can be accessed          │
│ • Permissions are part of approval review                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: BRIDGE ENFORCEMENT                                      │
│ • Bridge validates every operation against permissions          │
│ • contextUser flows through all operations                       │
│ • MJ's entity-level security still applies                       │
│ • Rate limiting per execution                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4: SANDBOX ISOLATION                                       │
│ • V8 isolate with memory limits                                  │
│ • Execution timeout                                              │
│ • No filesystem/network access                                   │
│ • No eval() or dynamic code execution                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 5: AUDIT TRAIL                                             │
│ • All executions logged with full context                        │
│ • Bridge operations counted and recorded                         │
│ • Errors captured with stack traces                              │
│ • Usage analytics for anomaly detection                          │
└─────────────────────────────────────────────────────────────────┘
```

### Permission Enforcement in Bridge

```typescript
class ScriptActionBridge {
  constructor(
    private contextUser: UserInfo,
    private permissions: ExecutionPermissions
  ) {}

  async invokeAction(actionName: string, params: Record<string, any>) {
    // Check if action is in allowed list
    if (!this.permissions.allowedActions.includes(actionName)) {
      throw new SecurityError(
        `Action '${actionName}' is not in AllowedActions. ` +
        `Permitted actions: ${this.permissions.allowedActions.join(', ')}`
      );
    }

    // Also check if it's a RuntimeAction and whether that's allowed
    const action = ActionEngineServer.Instance.Actions.find(a => a.Name === actionName);
    if (!action) {
      // Check RuntimeActions
      const runtimeAction = await this.getRuntimeAction(actionName);
      if (runtimeAction && runtimeAction.Status !== 'Approved') {
        throw new SecurityError(`RuntimeAction '${actionName}' is not approved`);
      }
    }

    // Execute with contextUser
    const result = await ActionEngineServer.Instance.RunAction({
      Action: action,
      Params: this.convertParams(params),
      ContextUser: this.contextUser,
      SkipActionLog: false
    });

    return this.serializeResult(result);
  }

  async runView(options: RunViewOptions) {
    // Check entity permission
    if (!this.permissions.allowedEntities.includes(options.EntityName)) {
      throw new SecurityError(
        `Entity '${options.EntityName}' is not in AllowedEntities. ` +
        `Permitted entities: ${this.permissions.allowedEntities.join(', ')}`
      );
    }

    const rv = new RunView();
    const result = await rv.RunView({
      ...options,
      ResultType: 'simple'  // Always return plain objects
    }, this.contextUser);

    return {
      Success: result.Success,
      Results: result.Results,
      TotalRowCount: result.TotalRowCount,
      ErrorMessage: result.ErrorMessage
    };
  }
}
```

---

## Integration with Action Framework

### ActionEngineServer Extension

```typescript
// ActionEngineServer already handles this via the Type='Script' detection
// shown in the "How Script Actions Work" section above.
// No separate extension class needed - the logic integrates directly
// into the existing RunAction method.
```

### Discovery Integration

Since Script actions use the existing Actions entity, discovery is automatic:

```typescript
// No special discovery needed - Script actions are just Actions with Type='Script'
// ActionEngineServer.Instance.Actions already includes them

// Filter by type if needed:
const scriptActions = ActionEngineServer.Instance.Actions
  .filter(a => a.Type === 'Script' && a.Status === 'Active' && a.CodeApprovalStatus === 'Approved');

// They appear in semantic search automatically via existing action indexing
// They work with AIAgentAction linking automatically
// They use existing ActionExecutionLog for logging
```

---

## ActionSmith: Composing with Codesmith

### Agent Hierarchy: Agent Manager → ActionSmith → Codesmith

```
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Manager                               │
│              (Meta-Agent for Agent Creation)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  When capability gap identified, delegates to ActionSmith        │
│                                                                  │
│  Sub-Agents:                                                     │
│    • Requirements Analyst                                        │
│    • Designer                                                    │
│    • Prompt Designer                                             │
│    • ActionSmith (NEW) ◄─── For creating Script actions          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ActionSmith                                │
│                (Script Action Orchestrator)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. REQUIREMENTS ANALYSIS                                        │
│     • Understand capability gap                                  │
│     • Define input/output params                                 │
│     • Determine required permissions                             │
│                                                                  │
│  2. DELEGATE TO CODESMITH ◄──────────────────────────────────┐  │
│                         │                                    │  │
│                         ▼                                    │  │
│  ┌─────────────────────────────────────────────────────────┐ │  │
│  │              Codesmith Agent (Sub-Agent)                │ │  │
│  │                                                         │ │  │
│  │  • Receives extended utilities (md, rv, actions, etc.)  │ │  │
│  │  • Writes JavaScript code                               │ │  │
│  │  • Tests in sandbox with bridge                         │ │  │
│  │  • Iterates on errors (up to 10 times)                  │ │  │
│  │  • Returns working code + test results                  │ │  │
│  │                                                         │ │  │
│  └─────────────────────────────────────────────────────────┘ │  │
│                         │                                    │  │
│                         ▼                                    │  │
│  3. VALIDATE & PACKAGE                                       │  │
│     • Verify code meets requirements                         │  │
│     • Create Action with Type='Script'                       │  │
│     • Set ScriptActionConfiguration                          │  │
│                                                              │  │
│  4. REQUEST APPROVAL                                         │  │
│     • Present to user for review                             │  │
│     • User sees: code, permissions, test results             │  │
│     • On approval: CodeApprovalStatus → 'Approved'           │  │
│                                                              │  │
│  5. REGISTER                                                 │  │
│     • Automatic via existing Actions infrastructure          │  │
│     • Available for use ─────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Design Philosophy: Don't Reinvent the Wheel

Codesmith already excels at iterative code generation and testing. ActionSmith is a thin orchestrator that:

1. Handles action-specific concerns (schema, permissions, approval, persistence)
2. Delegates code generation to Codesmith with extended utilities
3. Manages the approval workflow

### Extending Codesmith's Utilities

When ActionSmith calls Codesmith, it provides an extended context that adds the bridge utilities:

```typescript
// Standard Codesmith capabilities
const standardUtilities = {
  libs: { lodash, dateFns, mathjs, uuid, validator }
};

// Extended utilities for RuntimeAction code generation
const extendedUtilities = {
  ...standardUtilities,

  // NEW: MemberJunction bridge capabilities
  md: { /* entity metadata */ },
  rv: { /* RunView, RunViews */ },
  rq: { /* RunQuery */ },
  entity: { /* CRUD operations */ },
  actions: { /* Invoke other actions */ },
  agents: { /* Run other agents */ },
  ai: { /* LLM access */ },
  log: { /* Structured logging */ }
};
```

### ActionSmith Agent Definition

```json
{
  "fields": {
    "Name": "ActionSmith Agent",
    "Description": "Creates runtime actions by composing existing actions with custom logic. Delegates code generation to Codesmith and handles action-specific concerns: schema definition, permission scoping, testing, and approval workflow.",
    "TypeID": "@lookup:MJ: AI Agent Types.Name=Loop",
    "Status": "Active",
    "ExposeAsAction": true,
    "IconClass": "fa-solid fa-wand-magic-sparkles",
    "PayloadSelfWritePaths": "[\"requirements\", \"inputSchema\", \"outputSchema\", \"permissions\", \"code\", \"testCases\", \"testResults\", \"approvalStatus\"]",
    "MaxIterationsPerRun": 5
  },
  "relatedEntities": {
    "MJ: AI Agent Prompts": [
      {
        "fields": {
          "PromptID": "@lookup:AI Prompts.Name=ActionSmith Agent Prompt",
          "ExecutionOrder": 0
        }
      }
    ],
    "AI Agent Actions": [
      { "fields": { "ActionID": "@lookup:Actions.Name=Create Script Action" } },
      { "fields": { "ActionID": "@lookup:Actions.Name=Test Script Action" } }
    ],
    "MJ: AI Agent Sub-Agents": [
      {
        "fields": {
          "ParentAgentID": "@parent:ID",
          "SubAgentID": "@lookup:AI Agents.Name=Codesmith Agent"
        }
      }
    ]
  }
}
```

### ActionSmith Prompt Template

```markdown
# ActionSmith Agent

You are **ActionSmith**, an expert at creating reusable runtime actions. You work WITH Codesmith, not instead of it.

## Your Role

1. **Architect**: Define what the action should do, its inputs/outputs, and permissions
2. **Orchestrator**: Delegate code generation to Codesmith with the right context
3. **Quality Gate**: Validate the result meets requirements
4. **Packager**: Bundle everything for user approval

## Your Workflow

### Step 1: Analyze Requirements
When asked to create a new action, first understand:
- What capability gap needs to be filled?
- What existing actions could be composed?
- What entities need to be accessed?
- What inputs are required? What outputs expected?

### Step 2: Define the Contract
Before any code is written, define:

```json
{
  "name": "Weekly Sales Summary Email",
  "description": "Fetches sales data, generates AI summary, sends via email",
  "inputSchema": {
    "type": "object",
    "properties": {
      "region": { "type": "string" },
      "recipientEmail": { "type": "string", "format": "email" }
    },
    "required": ["region", "recipientEmail"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "totalSales": { "type": "number" },
      "emailSent": { "type": "boolean" }
    }
  },
  "permissions": {
    "entities": ["Sales", "Users"],
    "actions": ["Send Email"],
    "agents": []
  }
}
```

### Step 3: Delegate to Codesmith
Call Codesmith as a sub-agent with:
- The task: Write the action implementation
- The contract: Input/output schemas
- The context: Available utilities (md, rv, actions, etc.)
- Test cases: Sample inputs to validate against

Codesmith will iterate until the code works.

### Step 4: Package and Request Approval
Once Codesmith returns working code:
1. Create the RuntimeAction entity
2. Attach test results
3. Request user approval

## What You DON'T Do

❌ Write JavaScript code yourself - Codesmith does that
❌ Test code yourself - Codesmith handles iteration
❌ Skip the approval step - users must approve

## What You DO

✅ Define clear requirements and contracts
✅ Scope permissions minimally (least privilege)
✅ Design good test cases
✅ Orchestrate the workflow
✅ Present clear approval requests
```

### Codesmith Extension: Runtime Action Mode

When Codesmith is called by ActionSmith, it receives additional context:

```typescript
// Extended payload when called for runtime action generation
interface CodesmitheRuntimeActionPayload {
  // Standard Codesmith fields
  task: string;
  inputData: any;
  iterations: number;
  code: string;
  results: any;
  errors: string[];

  // NEW: Runtime Action context
  runtimeActionMode: true;
  contract: {
    inputSchema: JSONSchema;
    outputSchema: JSONSchema;
  };
  permissions: {
    entities: string[];
    actions: string[];
    agents: string[];
  };
  testCases: Array<{
    name: string;
    input: Record<string, any>;
    expectedOutput?: Record<string, any>;
  }>;

  // Extended utilities available
  availableUtilities: [
    'md', 'rv', 'rq', 'entity', 'actions', 'agents', 'ai', 'log', 'libs'
  ];
}
```

The Codesmith prompt can detect `runtimeActionMode: true` and adjust its behavior:
- Use async/await (bridge utilities are async)
- Access the extended utilities
- Validate against the provided schemas
- Run all test cases

### Implementation: ActionSmith Actions

```typescript
// Action: Create Script Action (used by ActionSmith)
// Uses existing Actions entity with Type='Script'
@RegisterClass(BaseAction, 'Create Script Action')
export class CreateScriptActionAction extends BaseAction {

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const name = this.getParamValue(params, 'Name');
    const description = this.getParamValue(params, 'Description');
    const code = this.getParamValue(params, 'Code');
    const categoryId = this.getParamValue(params, 'CategoryID');
    const permissions = this.getParamValue(params, 'Permissions');
    const limits = this.getParamValue(params, 'Limits');
    const inputParams = this.getParamValue(params, 'InputParams');
    const outputParams = this.getParamValue(params, 'OutputParams');
    const createdByAgentId = this.getParamValue(params, 'CreatedByAgentID');

    const md = new Metadata();

    // Build ScriptActionConfiguration
    const config: ScriptActionConfiguration = {
      permissions: {
        allowedEntities: permissions.entities || [],
        allowedActions: permissions.actions || [],
        allowedAgents: permissions.agents || []
      },
      limits: {
        maxMemoryMB: limits?.maxMemoryMB || 128,
        maxBridgeCalls: limits?.maxBridgeCalls || 100
      }
    };

    // Create the Action record (existing entity!)
    const action = await md.GetEntityObject<ActionEntity>('Actions', params.ContextUser);
    action.NewRecord();
    action.Name = name;
    action.Description = description;
    action.Type = 'Script';
    action.Code = code;
    action.CategoryID = categoryId;
    action.Status = 'Active';
    action.CodeApprovalStatus = 'Pending';
    action.ScriptActionConfiguration = JSON.stringify(config);
    action.MaxExecutionTimeMS = limits?.maxExecutionTimeMS || 30000;
    action.CreatedByAgentID = createdByAgentId;

    const saved = await action.Save();
    if (!saved) {
      return { Success: false, ResultCode: 'SAVE_FAILED', Message: 'Failed to save action' };
    }

    // Create ActionParams (existing entity!)
    for (const param of [...inputParams, ...outputParams]) {
      const actionParam = await md.GetEntityObject<ActionParamEntity>(
        'Action Params',
        params.ContextUser
      );
      actionParam.NewRecord();
      actionParam.ActionID = action.ID;
      actionParam.Name = param.name;
      actionParam.Type = param.type;
      actionParam.ValueType = param.valueType || 'Scalar';
      actionParam.IsRequired = param.isRequired || false;
      actionParam.Description = param.description;
      await actionParam.Save();
    }

    this.setParamValue(params, 'ActionID', action.ID);
    return { Success: true, ResultCode: 'SUCCESS', Params: params.Params };
  }
}

// Action: Test Script Action (validates code works in sandbox)
@RegisterClass(BaseAction, 'Test Script Action')
export class TestScriptActionAction extends BaseAction {

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const code = this.getParamValue(params, 'Code');
    const testCases = this.getParamValue(params, 'TestCases');
    const config = this.getParamValue(params, 'ScriptActionConfiguration') as ScriptActionConfiguration;

    const executor = new ScriptActionExecutor();
    const bridge = new ScriptActionBridge(params.ContextUser, config.permissions);
    const results: TestResult[] = [];

    for (const testCase of testCases) {
      const result = await executor.execute(
        code,
        testCase.input,
        bridge,
        { timeout: 30, memoryLimit: 128 }
      );

      results.push({
        name: testCase.name,
        passed: result.Success,
        output: result.Output,
        error: result.ErrorMessage,
        executionTimeMs: result.ExecutionTimeMs
      });
    }

    const allPassed = results.every(r => r.passed);
    this.setParamValue(params, 'TestResults', results);
    this.setParamValue(params, 'AllPassed', allPassed);

    return {
      Success: true,
      ResultCode: allPassed ? 'ALL_PASSED' : 'SOME_FAILED',
      Params: params.Params
    };
  }
}
```

### Complete Flow: Agent Manager → ActionSmith → Codesmith

```
User: "Create an action that sends a daily digest of new customers"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Manager                               │
│  "I need a new capability. Let me delegate to ActionSmith."     │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ActionSmith                                │
│                                                                  │
│  1. Analyzes: Need to query Customers, use AI for summary,      │
│     call Send Email action                                       │
│                                                                  │
│  2. Defines contract:                                            │
│     • Input: { recipientEmail: string }                          │
│     • Output: { customerCount: number, emailSent: boolean }      │
│     • Permissions: entities=['Customers'], actions=['Send Email']│
│                                                                  │
│  3. Creates test cases:                                          │
│     • Empty customer list → should handle gracefully             │
│     • 5 customers → should summarize and send                    │
│                                                                  │
│  4. Calls Codesmith sub-agent...                                 │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Codesmith                                 │
│                  (runtimeActionMode: true)                       │
│                                                                  │
│  Iteration 1: Writes code using utilities.rv, utilities.ai,     │
│               utilities.actions                                   │
│               → Error: forgot to handle empty results            │
│                                                                  │
│  Iteration 2: Adds empty check                                   │
│               → Error: wrong parameter name for Send Email       │
│                                                                  │
│  Iteration 3: Fixes parameter name                               │
│               → All test cases pass! ✓                           │
│                                                                  │
│  Returns: { code: "...", testResults: [...], iterations: 3 }    │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ActionSmith                                │
│                                                                  │
│  5. Creates Action with Type='Script' (CodeApprovalStatus: 'Pending')
│                                                                  │
│  6. Requests user approval...                                    │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         User                                     │
│                                                                  │
│  Reviews:                                                        │
│  • Action name: "Daily Customer Digest"                          │
│  • Permissions: Can access Customers, can send emails            │
│  • Code: [syntax highlighted, readable]                          │
│  • Test results: 2/2 passed                                      │
│                                                                  │
│  [Approve] [Reject] [Edit]                                       │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼ (User clicks Approve)
┌─────────────────────────────────────────────────────────────────┐
│                    RuntimeAction                                 │
│                  Status: 'Approved'                              │
│                                                                  │
│  Now available for:                                              │
│  • Direct invocation                                             │
│  • Agent action discovery                                        │
│  • Composition in other runtime actions                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Examples

### Example 1: Simple Composite Action

**Scenario**: Agent needs to send a weekly sales summary email

```javascript
// Runtime Action: Weekly Sales Summary Email
// AllowedEntities: ['Sales', 'Users']
// AllowedActions: ['Send Email']

const { recipientEmail, region } = input;

// 1. Get sales data for the week
const weekAgo = new Date();
weekAgo.setDate(weekAgo.getDate() - 7);

const sales = await utilities.rv.RunView({
  EntityName: 'Sales',
  ExtraFilter: `Region = '${region}' AND SaleDate >= '${weekAgo.toISOString()}'`,
  OrderBy: 'SaleDate DESC'
});

if (!sales.Success) {
  return { success: false, error: sales.ErrorMessage };
}

// 2. Calculate summary
const _ = utilities.libs.lodash;
const totalSales = _.sumBy(sales.Results, 'Amount');
const topProducts = _(sales.Results)
  .groupBy('ProductName')
  .map((items, name) => ({ name, total: _.sumBy(items, 'Amount') }))
  .orderBy('total', 'desc')
  .take(5)
  .value();

// 3. Format email body
const body = `
Weekly Sales Summary for ${region}
==================================
Total Sales: $${totalSales.toLocaleString()}
Transaction Count: ${sales.Results.length}

Top 5 Products:
${topProducts.map((p, i) => `${i+1}. ${p.name}: $${p.total.toLocaleString()}`).join('\n')}
`;

// 4. Send email via existing action
const emailResult = await utilities.actions.Invoke('Send Email', {
  To: recipientEmail,
  Subject: `Weekly Sales Summary - ${region}`,
  Body: body
});

return {
  success: emailResult.Success,
  totalSales,
  transactionCount: sales.Results.length,
  topProducts
};
```

### Example 2: AI-Enhanced Data Analysis

**Scenario**: Agent needs to analyze customer feedback with AI

```javascript
// Runtime Action: Analyze Customer Feedback
// AllowedEntities: ['Customer Feedback', 'Customers']
// AllowedActions: []
// RequiresAI: true

const { customerId, timeframeDays } = input;

// 1. Get customer info
const customer = await utilities.entity.Load('Customers', customerId);
if (!customer.Success) {
  return { success: false, error: `Customer not found: ${customerId}` };
}

// 2. Get recent feedback
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - timeframeDays);

const feedback = await utilities.rv.RunView({
  EntityName: 'Customer Feedback',
  ExtraFilter: `CustomerID = '${customerId}' AND CreatedAt >= '${cutoffDate.toISOString()}'`,
  OrderBy: 'CreatedAt DESC'
});

if (feedback.Results.length === 0) {
  return {
    success: true,
    analysis: 'No feedback found in the specified timeframe',
    feedbackCount: 0
  };
}

// 3. Use AI to analyze sentiment and themes
const feedbackText = feedback.Results
  .map(f => f.Comments)
  .join('\n---\n');

const aiAnalysis = await utilities.ai.ExecutePrompt({
  SystemPrompt: `You are a customer feedback analyst. Analyze the following feedback and provide:
1. Overall sentiment (positive/neutral/negative with confidence %)
2. Top 3 themes or topics mentioned
3. Key action items or concerns
4. A brief executive summary (2-3 sentences)

Format as JSON.`,
  UserMessage: feedbackText,
  ModelPower: 'medium'
});

// 4. Parse and return
const analysis = JSON.parse(aiAnalysis.Response);

return {
  success: true,
  customerName: customer.Record.Name,
  feedbackCount: feedback.Results.length,
  timeframeDays,
  analysis,
  modelUsed: aiAnalysis.ModelUsed
};
```

### Example 3: Multi-Agent Orchestration

**Scenario**: Agent needs to coordinate multiple sub-agents

```javascript
// Runtime Action: Comprehensive Account Review
// AllowedEntities: ['Accounts', 'Contacts', 'Opportunities', 'Activities']
// AllowedActions: ['Generate Report']
// AllowedAgents: ['Risk Assessment Agent', 'Opportunity Scorer Agent']

const { accountId } = input;

// 1. Load account data
const [account, contacts, opportunities, activities] = await utilities.rv.RunViews([
  { EntityName: 'Accounts', ExtraFilter: `ID = '${accountId}'` },
  { EntityName: 'Contacts', ExtraFilter: `AccountID = '${accountId}'` },
  { EntityName: 'Opportunities', ExtraFilter: `AccountID = '${accountId}'`, OrderBy: 'CloseDate DESC' },
  { EntityName: 'Activities', ExtraFilter: `AccountID = '${accountId}'`, OrderBy: 'ActivityDate DESC', MaxRows: 50 }
]);

if (!account.Success || account.Results.length === 0) {
  return { success: false, error: 'Account not found' };
}

// 2. Run risk assessment agent
const riskResult = await utilities.agents.Run('Risk Assessment Agent', {
  Input: {
    accountData: account.Results[0],
    opportunities: opportunities.Results,
    activityHistory: activities.Results
  }
});

// 3. Run opportunity scorer agent
const scoringResult = await utilities.agents.Run('Opportunity Scorer Agent', {
  Input: {
    opportunities: opportunities.Results,
    accountProfile: account.Results[0]
  }
});

// 4. Compile comprehensive review
const review = {
  account: account.Results[0],
  contactCount: contacts.Results.length,
  openOpportunities: opportunities.Results.filter(o => o.Status === 'Open').length,
  totalPipelineValue: opportunities.Results
    .filter(o => o.Status === 'Open')
    .reduce((sum, o) => sum + o.Amount, 0),
  riskAssessment: riskResult.Output,
  opportunityScores: scoringResult.Output,
  recentActivityCount: activities.Results.length,
  lastActivityDate: activities.Results[0]?.ActivityDate
};

// 5. Generate formal report
const reportResult = await utilities.actions.Invoke('Generate Report', {
  Template: 'Account Review',
  Data: review
});

return {
  success: true,
  review,
  reportUrl: reportResult.OutputParams.ReportUrl
};
```

---

## Versioning Strategy

### Semantic Versioning for Runtime Actions

```typescript
interface RuntimeActionVersion {
  major: number;  // Breaking changes to input/output schema
  minor: number;  // New optional functionality
  patch: number;  // Bug fixes
}

// Version increment rules:
// MAJOR: InputSchema or OutputSchema changes that break existing callers
// MINOR: New optional input params, enhanced output (backward compatible)
// PATCH: Bug fixes, performance improvements, no API changes
```

### Version Management

```typescript
class RuntimeActionVersionManager {

  async createNewVersion(
    existingActionId: string,
    changes: RuntimeActionChanges,
    contextUser: UserInfo
  ): Promise<RuntimeActionEntity> {

    const existing = await this.loadAction(existingActionId);
    const currentVersion = this.parseVersion(existing.Version);

    // Determine version bump
    const newVersion = this.calculateNewVersion(currentVersion, changes);

    // Create new version
    const newAction = await this.cloneAction(existing, contextUser);
    newAction.Version = this.formatVersion(newVersion);
    newAction.PreviousVersionID = existing.ID;
    newAction.Status = 'Pending';  // Requires re-approval

    // Apply changes
    Object.assign(newAction, changes);

    await newAction.Save();

    return newAction;
  }

  private calculateNewVersion(
    current: RuntimeActionVersion,
    changes: RuntimeActionChanges
  ): RuntimeActionVersion {

    if (changes.InputSchema || changes.OutputSchema) {
      // Breaking change
      return { major: current.major + 1, minor: 0, patch: 0 };
    }

    if (changes.Code && !changes.InputSchema && !changes.OutputSchema) {
      // New functionality or fix
      const hasFunctionalChange = this.detectFunctionalChange(changes.Code);
      if (hasFunctionalChange) {
        return { major: current.major, minor: current.minor + 1, patch: 0 };
      }
      return { major: current.major, minor: current.minor, patch: current.patch + 1 };
    }

    return current;
  }
}
```

---

## Promotion Pathway

### Runtime Action → Generated Action → Core Action

```
┌─────────────────────────────────────────────────────────────────┐
│ PROMOTION LIFECYCLE                                              │
└─────────────────────────────────────────────────────────────────┘

Stage 1: RUNTIME ACTION (Sandbox Execution)
├── Created by agent or user
├── Executes in JavaScript sandbox
├── Uses bridge for MJ operations
├── Good for: Prototyping, user-specific workflows
└── Performance: Moderate (sandbox overhead)
                    ↓
        [Usage Analytics: Frequent use detected]
        [Stability: No errors in 30 days]
        [User Request: "Make this faster"]
                    ↓
Stage 2: GENERATED ACTION (Compiled TypeScript)
├── Code converted to TypeScript
├── AI generates proper BaseAction subclass
├── Compiled into action_subclasses.ts
├── Executes without sandbox overhead
├── Good for: Stable, frequently-used actions
└── Performance: Fast (native execution)
                    ↓
        [Community Value: Used across organizations]
        [Quality: Well-tested, documented]
        [Review: Core team approval]
                    ↓
Stage 3: CORE ACTION (Framework Distribution)
├── Included in MemberJunction distribution
├── Professional documentation
├── Unit tests and integration tests
├── Versioned with framework
└── Good for: Universal utility
```

---

## Monitoring and Analytics

### Execution Metrics

```typescript
interface RuntimeActionMetrics {
  // Usage
  totalExecutions: number;
  uniqueUsers: number;
  executionsPerDay: number[];

  // Performance
  averageExecutionTimeMs: number;
  p95ExecutionTimeMs: number;
  p99ExecutionTimeMs: number;

  // Reliability
  successRate: number;
  errorsByType: Record<string, number>;

  // Resource Usage
  averageBridgeCalls: number;
  mostUsedBridgeOperations: string[];

  // Composition
  invokedByActions: string[];
  invokesActions: string[];
}
```

### Anomaly Detection

```typescript
class RuntimeActionMonitor {

  async checkForAnomalies(actionId: string): Promise<AnomalyReport> {
    const metrics = await this.getMetrics(actionId);
    const anomalies: Anomaly[] = [];

    // Sudden increase in errors
    if (metrics.recentErrorRate > metrics.historicalErrorRate * 2) {
      anomalies.push({
        type: 'ERROR_SPIKE',
        severity: 'high',
        message: `Error rate increased from ${metrics.historicalErrorRate}% to ${metrics.recentErrorRate}%`
      });
    }

    // Performance degradation
    if (metrics.recentP95 > metrics.historicalP95 * 1.5) {
      anomalies.push({
        type: 'PERFORMANCE_DEGRADATION',
        severity: 'medium',
        message: `P95 latency increased from ${metrics.historicalP95}ms to ${metrics.recentP95}ms`
      });
    }

    // Unusual usage pattern
    if (metrics.recentExecutions > metrics.averageExecutions * 10) {
      anomalies.push({
        type: 'USAGE_SPIKE',
        severity: 'info',
        message: `Execution volume 10x higher than average`
      });
    }

    return { actionId, anomalies, checkedAt: new Date() };
  }
}
```

---

## Implementation Checklist

### Core Infrastructure

- [ ] **Actions Schema Extension**:
  - Add `ScriptActionConfiguration NVARCHAR(MAX) NULL` (JSON blob, evolvable)
  - Add `MaxExecutionTimeMS INT NULL` (universal timeout for ALL action types)
  - Add `CreatedByAgentID UNIQUEIDENTIFIER NULL`
  - Add `Type='Script'` value support
- [ ] **ScriptActionConfiguration Interface**: Define in `@memberjunction/actions-base` with helper function
- [ ] **ScriptActionBridge**: Bridge implementation with all utilities (md, rv, rq, entity, actions, agents, ai, log, libs)
- [ ] **ScriptActionExecutor**: Sandbox integration with bridge injection
- [ ] **ActionEngineServer Update**:
  - Add `case 'Script'` handler in RunAction method
  - Add universal timeout with AbortSignal for ALL action types
  - Pass AbortSignal through RunActionParams

### Security & Approval

- [ ] **Approval UI Enhancement**: Update existing action approval UI to show ScriptActionConfiguration (permissions, limits)
- [ ] **Permission Validator**: Enforce permissions from ScriptActionConfiguration in bridge
- [ ] **Uses existing ActionExecutionLog** - no new logging infrastructure needed

### Agent Integration

- [ ] **ActionSmith Agent**: New agent (sub-agent of Agent Manager) that orchestrates Script action creation
- [ ] **Codesmith Extension**: Support `runtimeActionMode` context with extended utilities
- [ ] **Create Script Action**: Action for persisting Script actions to database
- [ ] **Test Script Action**: Action for testing Script actions in sandbox

### Discovery & Composition

- [ ] **Automatic via existing infrastructure** - Script actions are just Actions with Type='Script'
- [ ] **Dependency Graph**: Track action→action invocations via AllowedActions
- [ ] **Impact Analysis**: Warn when modifying actions referenced in AllowedActions

### Versioning & Lifecycle

- [ ] **Version Manager**: Semantic versioning (leverage existing action patterns)
- [ ] **Promotion Pipeline**: Script → Generated → Core pathway

### Monitoring

- [ ] **Uses existing ActionExecutionLog** - filter by Type='Script'
- [ ] **Usage Analytics**: Identify high-value Script actions for promotion

---

## Conclusion

Script Actions extend MemberJunction's agent capabilities by enabling dynamic action creation with a proven bridge pattern. Key architectural decisions:

1. **Existing Infrastructure**: Uses Actions entity with new Type='Script' - no new tables
2. **Bridge Pattern**: Mirrors the successful React runtime approach with `utilities` object
3. **Async-First**: All bridge operations are Promise-based for natural async/await
4. **Declarative Permissions**: AllowedActions/Entities/Agents defined upfront
5. **User Approval Gate**: Uses existing CodeApprovalStatus workflow
6. **Codesmith Composition**: ActionSmith delegates to Codesmith - don't reinvent the wheel
7. **Scaffolding Effect**: Each action becomes a building block for more complex actions

The system maintains MemberJunction's security posture while dramatically expanding agent capabilities, creating a self-improving ecosystem where agents can fill capability gaps autonomously.

---

*This document expands on the vision outlined in the original "Runtime Action Generator" discussion, translating concepts into concrete architecture while preserving the core insight: agents that can build their own tools become exponentially more valuable over time.*
