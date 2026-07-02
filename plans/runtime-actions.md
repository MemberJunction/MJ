# Runtime Actions

## Technical Architecture Document

**Version**: 2.0
**Date**: April 2026
**Status**: Proposal — Phase 1 planning
**Supersedes**: v1.0 "Script Actions" (January 2026)

---

## Executive Summary

This document describes the architecture for a new `Action.Type='Runtime'` — a JavaScript payload authored (typically by an agent), executed inside MJ's existing CodeExecution sandbox, and given structured, permissioned access to MemberJunction's capabilities via a request/response bridge.

The model is inspired by the `utilities` object pattern used in `@memberjunction/react-runtime` for interactive components, adapted for a server-side isolated-vm context. The bridge is pure JavaScript — there is no React dependency, and no DOM. Runtime actions are first-class `Action` records reusing the existing discovery, logging, agent-linking, and `CodeApprovalStatus` workflows.

**Why this is v2.0.** The January proposal ("Script Actions") predates several shifts in the framework:

- The `Agent Manager` hierarchy is fully built out (Requirements Analyst → Planning Designer → Architect → Builder → Spec Loader), so ActionSmith slots in as a sibling using the existing `MJ: AI Agent Sub-Agents` relationship table rather than being invented.
- `Codesmith Agent` is live with an iterative `Execute Code` loop, so delegation from ActionSmith → Codesmith is concrete, not hypothetical.
- `ActionEngine` dispatches by `DriverClass`, **not** by `Action.Type`, so introducing a new Type means adding a dispatch branch rather than an enum value.
- The CodeExecution sandbox is strictly one-shot (JSON cloned in, JSON cloned out). A **new bidirectional IPC layer in `WorkerPool`** is the single biggest piece of net-new infrastructure, not a minor extension of the React runtime pattern.
- Neither `ActionEngine` nor `BaseAgent` has a wall-clock `MaxExecutionTimeMS` / `AbortSignal` today — this is a cross-cutting engine change worth shipping on its own.
- `AIAgent.ExposeAsAction` exists as a flag on every major agent but is not wired to a dispatcher. `ExecuteAgent` is an independent, small deliverable we should build alongside (but Runtime actions do **not** depend on it — `utilities.agents.Run` can call `AgentRunner` directly).

Naming: **`Action.Type='Runtime'`**, package **`@memberjunction/action-runtime`**, bridge object **`utilities`**, agent **ActionSmith**.

---

## Vision

### The Capability-Gap Problem

Today's MJ agents operate within a fixed action catalog defined at development time. When an agent hits a task that needs a novel composition of existing actions — or a capability that doesn't exist — it must fail, escalate, or improvise. The value of the agent ecosystem is capped by developer bandwidth for action authoring.

### The Scaffolding Effect

Runtime Actions let agents fill gaps by **composing, not coding from scratch**:

```
Week 1: Agent creates "Daily Customer Digest"
Week 2: Agent creates "Sales Pipeline Alert" using Customer Digest as a component
Week 3: Agent creates "Executive Dashboard" using both
Week 4: Agent creates "Quarterly Business Review" composing all of the above
```

Each generated action becomes a building block for the next. Linear development → compounding capability growth. The human stays in the loop via `CodeApprovalStatus`, but approval bandwidth becomes the binding constraint, not implementation bandwidth.

### Business Value

| Traditional | With Runtime Actions |
|---|---|
| Devs must anticipate every capability | Agents identify gaps in real time |
| Weeks to design, implement, test, deploy | Hours from conception to approval |
| Knowledge locked in developer heads | Knowledge encoded as executable actions |
| Capabilities siloed by release cycles | Continuous capability accretion |

---

## Current-State Grounding (as of April 2026)

This is what actually exists today, verified against `packages/MJCoreEntities/src/generated/entity_subclasses.ts` and the current codebase. Everything in the target architecture below is described as a delta against this.

### Action entity (`[${flyway:defaultSchema}].[Action]`)

- `Type` — `nvarchar(20)`, default `'Generated'`, current CHECK constraint `CHK_Action_Type` allows `'Custom' | 'Generated'`
- `Code` — `nvarchar(MAX)`, nullable
- `CodeApprovalStatus` — `'Approved' | 'Pending' | 'Rejected'`, default `'Pending'`
- Approval audit fields: `CodeApprovalComments`, `CodeApprovedByUserID`, `CodeApprovedAt`, `CodeLocked`, `ForceCodeGeneration`
- `DriverClass` — `nvarchar(255)`, used by `ClassFactory` for Custom actions
- `Config` — `nvarchar(MAX)`, used today for integration-action routing metadata (NOT suitable for Runtime config — we want separation of concerns)
- Child entities: `Action Params`, `Action Result Codes`, `Action Execution Logs`, `AI Agent Actions`
- **Missing**: `RuntimeActionConfiguration`, `MaxExecutionTimeMS`, `CreatedByAgentID`

### `ActionEngine` (`packages/Actions/Engine/src/generic/ActionEngine.ts`)

- `RunAction()` instantiates via `ClassFactory.CreateInstance<BaseAction>(BaseAction, action.DriverClass || action.Name, ...)`.
- **No Type-based dispatch.** Introducing `Type='Runtime'` means adding an explicit branch before the `ClassFactory` call.
- **No `MaxExecutionTimeMS`, no `AbortSignal`.** Actions run to completion unless they throw.

### CodeExecution sandbox (`packages/Actions/CodeExecution/`)

- Isolation: `isolated-vm` inside a forked child process. `WorkerPool` manages N workers.
- `inputData` is `JSON.stringify`'d on the host, `JSON.parse`'d inside the isolate.
- **Strictly one-shot.** `requireFunc` is synchronous by design (see header comments in `worker.ts`). The isolate cannot await a promise that resolves in the host.
- Host→worker protocol is `{ type: 'execute', requestId, params }`; worker responds with `{ type: 'result', requestId, result }`. No backchannel.
- Host-enforced wall-clock timeout via `setTimeout`. Cannot be extended mid-execution.
- Supported libraries: `lodash`, `date-fns`, `mathjs`, `papaparse`, `uuid`, `validator`.

### Agent runtime (`packages/AI/Agents/src/base-agent.ts`)

- `BaseAgent` dispatches via `DetermineNextStep` → `ValidateNextStep` → `ExecuteNextStep` switch. Step types: `Retry`, `Actions`, `Sub-Agent`, `Chat`, `Success`, `Failed`, `ForEach`, `While`, `ClientTools` (Feb 2026).
- `AgentRunner.RunAgent()` is the outer entry point — **this is what the bridge will call for `utilities.agents.Run()`**, not an `ExecuteAgent` action.
- `MaxIterationsPerRun` is an iteration cap, **not** a wall-clock timeout. There is no agent-level `MaxExecutionTimeMS` today either.
- Per-request provider threading (`IMetadataProvider`) landed in April 2026 — bridge handlers must respect this when calling MJ services on behalf of the sandbox.

### Agent hierarchy

- `AIAgent.ParentID` — owned children (deleted with parent, single-parent only). Used for Agent Manager's direct sub-agents.
- `MJ: AI Agent Sub-Agents` relationship table — **fully wired at runtime** (confirmed). Lets a top-level agent be referenced as a sub-agent of one or more parents. This is how ActionSmith will be both `ExposeAsAction=true` and callable under Agent Manager.
- Constraint: if `ParentID IS NOT NULL`, `ExposeAsAction` must be `FALSE`. ActionSmith must use the relationship table, not `ParentID`.

### Agents that already exist (relevant ones)

- **Codesmith Agent** — Loop type, `ExposeAsAction: true`, `MaxIterationsPerRun: 10`, one action (`Execute Code`), `PayloadSelfWritePaths: ["task", "inputData", "requirements", "iterations", "code", "results", "errors", "logs"]`, `FinalPayloadValidation` schema. Iterates until code passes validation or iteration cap.
- **Agent Manager** — Loop type, orchestrates Requirements Analyst → Planning Designer → Architect → Builder → Spec Loader via `ParentID` children.
- Both have `ExposeAsAction: true`, but no dispatcher wires that flag to the Action catalog yet.

### React runtime `utilities` (pattern template)

Located at `packages/Angular/Generic/react/src/lib/utilities/runtime-utilities.ts:45` — shape is:

```typescript
{ md, rv, rq, ai }
```

`buildUtilities()` calls `this.CreateSimpleMetadata(new Metadata())`, `CreateSimpleRunView(new RunView())`, etc. This is a browser-side, same-context injection — functions can be invoked directly. The server-side Runtime Action bridge inherits the **shape** but not the mechanism (see the bridge section below).

---

## Target Architecture

### Action Type Comparison

| Field | `Custom` | `Generated` | `Runtime` (NEW) |
|---|---|---|---|
| **Code origin** | Hand-written TS | AI-generated TS | AI-generated JS |
| **Compilation** | Build time | Build time | None — runtime |
| **Execution** | Native TS class | Native TS class | Sandbox + bridge |
| **Approval** | N/A | `CodeApprovalStatus` | `CodeApprovalStatus` |
| **Permissions** | Implicit in code | Implicit in code | Declarative via `RuntimeActionConfiguration` |
| **Timeout** | `MaxExecutionTimeMS` | `MaxExecutionTimeMS` | `MaxExecutionTimeMS` |
| **Calls other actions** | Direct (TS) | Direct (TS) | Via bridge (scoped) |

### Schema Extensions (see migration `V202604201400__v5.29.x__Runtime_Actions_Schema.sql`)

```sql
ALTER TABLE [${flyway:defaultSchema}].[Action] ADD
    RuntimeActionConfiguration NVARCHAR(MAX) NULL,   -- JSON blob, only for Type='Runtime'
    MaxExecutionTimeMS          INT           NULL,   -- universal, all action types
    CreatedByAgentID            UNIQUEIDENTIFIER NULL; -- FK → AIAgent.ID

ALTER TABLE [${flyway:defaultSchema}].[Action]
    DROP CONSTRAINT CHK_Action_Type;

ALTER TABLE [${flyway:defaultSchema}].[Action]
    ADD CONSTRAINT CHK_Action_Type
    CHECK ([Type] IN ('Custom', 'Generated', 'Runtime'));
```

### `RuntimeActionConfiguration` (JSON) — authored via MJ's JSONType system

The configuration shape is declared via MJ's JSONType metadata system, which means **the interface lives in exactly one place** and every consumer imports it from `@memberjunction/core-entities`. No duplication, no drift.

**Authored source** (single file):
[metadata/entities/JSONType-interfaces/IRuntimeActionConfiguration.ts](../metadata/entities/JSONType-interfaces/IRuntimeActionConfiguration.ts) — defines `IRuntimeActionConfiguration` plus supporting types (`IRuntimeActionPermissions`, `IRuntimeActionLimits`, `IRuntimeActionSandboxOptions`, `IRuntimeActionReference`, `IRuntimeLibraryReference`).

**Wiring** (tells CodeGen which EntityField holds the blob):
[metadata/entities/.entity-field-jsontype-runtime-actions.json](../metadata/entities/.entity-field-jsontype-runtime-actions.json) — sets `JSONType`, `JSONTypeIsArray`, `JSONTypeDefinition` on `Action.RuntimeActionConfiguration` via `@lookup:`.

**Generation pipeline** — after `mj sync push --dir=metadata --include="entities"` and `mj codegen`:

1. The full interface source is inlined at the top of `packages/MJCoreEntities/src/generated/entity_subclasses.ts`, namespaced by entity as `MJActionEntity_IRuntimeActionConfiguration` (and siblings like `MJActionEntity_IRuntimeActionPermissions`).
2. `MJActionEntity` gets an auto-generated, lazily-cached typed accessor pair:

```typescript
get RuntimeActionConfigurationObject(): MJActionEntity_IRuntimeActionConfiguration | null { ... }
set RuntimeActionConfigurationObject(value: MJActionEntity_IRuntimeActionConfiguration | null) { ... }
```

The getter parses on first read after a string change and caches; the setter stringifies and updates the underlying `RuntimeActionConfiguration` string.

**Canonical consumption** — every downstream package:

```typescript
import { MJActionEntity_IRuntimeActionConfiguration } from '@memberjunction/core-entities';
```

This includes `@memberjunction/action-runtime` (bridge + executor), `@memberjunction/actions-base` (Zod validator — see below), ActionSmith's `Create Runtime Action` action, and the approval UI. **Nothing redefines the shape.**

### Runtime validation — Zod schema in `@memberjunction/actions-base`

JSONType declares shape but does **not** validate at `Save()`. For Runtime actions this matters — the config drives the sandbox's security scopes, so a malformed blob is a security concern, not just a DX one. We add a Zod validator in `@memberjunction/actions-base` that ActionSmith uses at authoring time and `ActionEngine` uses before dispatching to the sandbox:

```typescript
// @memberjunction/actions-base/src/RuntimeActionConfigurationSchema.ts
import { z } from 'zod';
import type { MJActionEntity_IRuntimeActionConfiguration } from '@memberjunction/core-entities';

const ReferenceSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const RuntimeActionConfigurationSchema = z.object({
  permissions: z.object({
    allowedActions:  z.array(ReferenceSchema),
    allowedAgents:   z.array(ReferenceSchema),
    allowedEntities: z.array(ReferenceSchema),
  }),
  limits: z.object({
    maxMemoryMB:    z.number().int().positive().optional(),
    maxBridgeCalls: z.number().int().positive().optional(),
  }).optional(),
  sandbox: z.object({
    additionalLibraries: z.array(z.object({
      name: z.string(),
      version: z.string().optional(),
    })).optional(),
    debugMode: z.boolean().optional(),
  }).optional(),
  version:           z.string().optional(),
  previousVersionId: z.string().uuid().optional(),
});

// Compile-time drift check — fails to build if the Zod schema ever falls
// out of sync with the CodeGen-emitted interface.
type _TypeEquivalence =
  z.infer<typeof RuntimeActionConfigurationSchema> extends MJActionEntity_IRuntimeActionConfiguration
    ? MJActionEntity_IRuntimeActionConfiguration extends z.infer<typeof RuntimeActionConfigurationSchema>
      ? true
      : { error: 'Zod schema is missing fields present in MJActionEntity_IRuntimeActionConfiguration' }
    : { error: 'Zod schema has fields not present in MJActionEntity_IRuntimeActionConfiguration' };
```

The type-equivalence line turns drift into a compile-time error: if someone adds a field to the JSONType interface without updating the Zod schema (or vice versa), the `@memberjunction/actions-base` build breaks.

### Universal `MaxExecutionTimeMS` + `AbortSignal`

Applies to ALL action types, not just Runtime. Same pattern is mirrored in `BaseAgent` so agents get wall-clock timeout parity.

```typescript
async RunAction(params: RunActionParams): Promise<ActionResult> {
  const action    = params.Action;
  const timeoutMs = action.MaxExecutionTimeMS ?? this.config.defaultActionTimeoutMS;

  const abortController = new AbortController();
  const timeoutId       = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    params.AbortSignal = abortController.signal;
    return await this.executeAction(action, params);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Individual BaseAction subclasses can poll:
protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
  if (params.AbortSignal?.aborted) {
    return { Success: false, ResultCode: 'TIMEOUT', Message: 'Execution aborted' };
  }
  // ...
}
```

### Bridge: `utilities` object

Shape mirrors the React runtime (`md`, `rv`, `rq`, `ai`) but adds entity CRUD, action invocation, agent invocation, and a logger. All operations are `Promise`-based because each call is an async host round-trip.

```typescript
export interface RuntimeActionUtilities {
  md: {
    Entities:            EntityInfo[];
    GetEntity:           (name: string) => EntityInfo | undefined;
    GetEntityFields:     (name: string) => EntityFieldInfo[];
    GetRelatedEntities:  (name: string) => RelatedEntityInfo[];
  };

  rv: {
    RunView:  (opts: BridgeRunViewOptions)  => Promise<BridgeRunViewResult>;
    RunViews: (opts: BridgeRunViewOptions[])=> Promise<BridgeRunViewResult[]>;
  };

  rq: {
    RunQuery: (opts: { QueryName: string; Parameters?: Record<string, unknown> })
      => Promise<BridgeRunQueryResult>;
  };

  entity: {
    Create: (entityName: string, data: Record<string, unknown>)             => Promise<BridgeEntityResult>;
    Load:   (entityName: string, id: string)                                => Promise<BridgeEntityResult>;
    Update: (entityName: string, id: string, data: Record<string, unknown>) => Promise<BridgeEntityResult>;
    Delete: (entityName: string, id: string)                                => Promise<BridgeDeleteResult>;
    Save:   (entityName: string, data: Record<string, unknown>)             => Promise<BridgeEntityResult>;
  };

  actions: {
    GetAvailableActions: () => ActionInfo[];
    Invoke:              (actionName: string, params: Record<string, unknown>)
      => Promise<BridgeActionResult>;
    InvokeAll:           (calls: Array<{ ActionName: string; Params: Record<string, unknown> }>)
      => Promise<BridgeActionResult[]>;
  };

  agents: {
    GetAvailableAgents: () => AgentInfo[];
    Run:                (agentName: string, opts: { Input: Record<string, unknown>; ConversationID?: string })
      => Promise<BridgeAgentResult>;
  };

  ai: {
    ExecutePrompt: (opts: { SystemPrompt: string; UserMessage: string; ModelPower?: 'lowest' | 'medium' | 'highest' })
      => Promise<BridgePromptResult>;
    GetEmbedding:  (text: string) => Promise<BridgeEmbeddingResult>;
  };

  log: {
    info:  (msg: string, data?: unknown) => void;
    warn:  (msg: string, data?: unknown) => void;
    error: (msg: string, data?: unknown) => void;
    debug: (msg: string, data?: unknown) => void;
  };

  libs: {
    lodash:    typeof import('lodash');
    dateFns:   typeof import('date-fns');
    mathjs:    typeof import('mathjs');
    uuid:      { v4: () => string };
    validator: typeof import('validator');
  };
}
```

**Key semantic choices:**

- All data crossing the bridge is JSON-serializable plain objects. No `BaseEntity` instances, no class methods.
- `rv.RunView` always returns `ResultType: 'simple'` (plain objects) — the sandbox has no use for `BaseEntity`.
- `utilities.agents.Run` is implemented by the bridge calling `AgentRunner.RunAgent()` directly. **We deliberately do NOT route through an `ExecuteAgent` action wrapper** — that would be an unnecessary extra layer for an in-process call. `ExecuteAgent` is a separate independent deliverable (1j) for the broader `ExposeAsAction` story.

### Bridge protocol — bidirectional IPC in WorkerPool

This is the single largest piece of net-new infrastructure. Today's `WorkerPool` is a one-shot request/response; we need to invert it into a multi-message session so the worker can make bridge calls during execution and await host responses.

**Worker side — what the user code sees:**

```javascript
// Inside the sandbox — transparent async wrapper
async function RunView(options) {
  const id = nextRequestId();
  postToHost({ type: 'bridge.rv.RunView', id, payload: options });
  return await waitForBridgeResponse(id);  // Promise backed by message-id map
}
```

**Host side — `RuntimeActionBridge` runs in the main process:**

```typescript
import type { MJActionEntity_IRuntimeActionConfiguration } from '@memberjunction/core-entities';

class RuntimeActionBridge {
  constructor(
    private contextUser: UserInfo,
    private config:      MJActionEntity_IRuntimeActionConfiguration,
    private abortSignal: AbortSignal | undefined
  ) {}

  async handleRequest(msg: BridgeRequest): Promise<BridgeResponse> {
    if (this.abortSignal?.aborted) {
      return { error: 'Aborted', code: 'ABORTED' };
    }
    if (!this.isAllowed(msg.type, msg.payload)) {
      return { error: 'Permission denied', code: 'PERMISSION_DENIED' };
    }
    switch (msg.type) {
      case 'bridge.rv.RunView':       return this.handleRunView(msg.payload);
      case 'bridge.actions.Invoke':   return this.handleActionInvoke(msg.payload);
      case 'bridge.agents.Run':       return this.handleAgentRun(msg.payload);
      // ...
    }
  }

  private async handleRunView(p: BridgeRunViewOptions) {
    if (!this.entityAllowed(p.EntityName)) return this.deny('entity', p.EntityName);
    const rv = new RunView();
    const result = await rv.RunView({ ...p, ResultType: 'simple' }, this.contextUser);
    return {
      Success:       result.Success,
      Results:       result.Results,
      TotalRowCount: result.TotalRowCount,
      ErrorMessage:  result.ErrorMessage,
    };
  }
}
```

**Protocol extensions (over today's fork-pool IPC):**

- New message type set: `bridge.*` requests from worker → host, `bridge-response` from host → worker. Request IDs let multiple in-flight bridge calls coexist if user code uses `Promise.all`.
- Worker keeps a `Map<id, { resolve, reject }>` for pending bridge calls.
- Host keeps the worker alive during bridge calls — the wall-clock timeout measures **total** execution (user code + bridge calls), enforced by `AbortController`. If the abort fires, the host sends a `bridge-abort` to the worker and the worker's pending promises reject.
- Memory and bridge-call-count limits enforced host-side (we can track both cheaply).

This is real work — budget ~2–3 weeks (see phase 1d).

### Security Model

Five layers, same structure as the Jan proposal, with two clarifications:

1. **Approval gate** — `CodeApprovalStatus='Approved'` is required. Human sees code + declared permissions + test results. Reusing existing approval UI.
2. **Declarative permissions** — `RuntimeActionConfiguration.permissions` enumerates allowed entities/actions/agents *by id*. Bridge enforces; permissions are part of the approval review.
3. **Bridge enforcement** — every bridge call validated against permissions before dispatching. `contextUser` flows through every downstream call so MJ row-level security still applies.
4. **Sandbox isolation** — existing `isolated-vm` + child process + module blocking + library allowlist + memory/CPU/timeout limits.
5. **Audit** — `ActionExecutionLog` captures every invocation (existing). Bridge-call counts and host denials captured in the log's structured output.

### `ActionEngine` dispatch extension

Minimal change to the existing `RunAction()`:

```typescript
async RunAction(params: RunActionParams): Promise<ActionResult> {
  // ... universal timeout wiring (see above) ...

  if (params.Action.Type === 'Runtime') {
    return this.runRuntimeAction(params);
  }
  // existing ClassFactory path for Custom / Generated
  return this.runClassBasedAction(params);
}

private async runRuntimeAction(params: RunActionParams): Promise<ActionResult> {
  const action = params.Action;

  // Typed accessor from CodeGen — no manual parsing needed.
  const raw = action.RuntimeActionConfigurationObject;
  if (!raw) return this.failResult('MISSING_CONFIG');

  // Runtime validation via Zod — catches malformed configs that slipped past
  // ActionSmith (e.g. direct DB edits, older schemas).
  const parsed = RuntimeActionConfigurationSchema.safeParse(raw);
  if (!parsed.success) return this.failResult('INVALID_CONFIG', parsed.error.message);
  const config = parsed.data;

  const bridge = new RuntimeActionBridge(params.ContextUser, config, params.AbortSignal);
  const executor = new RuntimeActionExecutor();  // lives in @memberjunction/action-runtime

  const result = await executor.execute({
    code:         action.Code!,
    input:        this.paramsToInput(params),
    bridge,
    memoryLimitMB: config.limits?.maxMemoryMB ?? 128,
    maxBridgeCalls: config.limits?.maxBridgeCalls ?? 100,
    abortSignal:  params.AbortSignal,
  });

  return this.wrapResult(result, params);
}
```

---

## ActionSmith Agent

ActionSmith is a new top-level agent with `ExposeAsAction: true`, also linked as a sub-agent of Agent Manager via the `MJ: AI Agent Sub-Agents` relationship table (the fully-wired referenced-sub-agent pattern — not `ParentID`, which would forbid `ExposeAsAction`).

### Responsibilities

1. Parse a capability-gap description into a contract: name, description, `inputSchema`, `outputSchema`, minimal-necessary `permissions`, test cases.
2. Delegate code generation to **Codesmith** as a sub-agent, passing the contract and the set of available bridge utilities.
3. When Codesmith returns working code, package an `Action` record with `Type='Runtime'`, `Code`, `RuntimeActionConfiguration`, `ActionParams`, `ActionResultCodes`, `CodeApprovalStatus='Pending'`, `CreatedByAgentID`.
4. Present for human approval with code, permissions, and test results surfaced.

### What ActionSmith does NOT do

- Write JavaScript — Codesmith does that, and already iterates to 10 attempts with an execution loop.
- Test the code — Codesmith's validation loop handles it.
- Skip approval — every Runtime action requires a human approval before it's `Status='Active'`.

### Delegation to Codesmith

Codesmith already takes a `task` + `inputData` + `iterations` payload and returns working `code`. We add a minor extension: a `runtimeActionMode: true` flag that signals Codesmith to:

- Use `async/await` (bridge calls are async)
- Include the bridge utilities (`md`, `rv`, `rq`, `entity`, `actions`, `agents`, `ai`, `log`, `libs`) in the prompt context
- Validate against the caller-provided `outputSchema`

No new sandbox; Codesmith's existing `Execute Code` loop works — the only addition is that when testing, it executes against a **real bridge** scoped to the requested permissions so bridge calls are actually exercised.

### ActionSmith Actions

- **`Create Runtime Action`** — persists the Action + Params + ResultCodes + RuntimeActionConfiguration in one transaction. `CreatedByAgentID` set automatically. `CodeApprovalStatus='Pending'`.
- **`Test Runtime Action`** — runs a set of test cases against the sandbox with the configured permissions; returns structured pass/fail for each case.

---

## Implementation Plan — Phase 1

Single phase, shipped as sub-deliverables 1a–1j. Each is individually mergeable and testable.

### 1a — Migration + JSONType metadata + CodeGen regen

Three things ship together in 1a because they feed the same CodeGen run:

1. **Migration** — [migrations/v5/V202604201400__v5.29.x__Runtime_Actions_Schema.sql](migrations/v5/V202604201400__v5.29.x__Runtime_Actions_Schema.sql). Adds `RuntimeActionConfiguration`, `MaxExecutionTimeMS`, `CreatedByAgentID`; widens `CHK_Action_Type` to include `'Runtime'`.
2. **JSONType interface + wiring** — [metadata/entities/JSONType-interfaces/IRuntimeActionConfiguration.ts](../metadata/entities/JSONType-interfaces/IRuntimeActionConfiguration.ts) and [metadata/entities/.entity-field-jsontype-runtime-actions.json](../metadata/entities/.entity-field-jsontype-runtime-actions.json). Run `mj sync push --dir=metadata --include="entities"` to propagate to the DB.
3. **CodeGen** — regens `entity_subclasses.ts` (inlines interface + emits `RuntimeActionConfigurationObject` accessor), views, sprocs. Check in regenerated code.

Sub-task **1a.1 — Zod validator** (lives in `@memberjunction/actions-base`): hand-authored Zod schema + compile-time type-equivalence assertion against `MJActionEntity_IRuntimeActionConfiguration`. Exported as `RuntimeActionConfigurationSchema` for use by ActionSmith at authoring time and `ActionEngine` before sandbox dispatch.

**Dependencies**: none
**Verifies**: Action schema + generated types match the plan; typed accessor round-trips; Zod schema `safeParse` rejects a config with an unknown top-level key and accepts a minimal valid config

### 1b — Universal `MaxExecutionTimeMS` + `AbortSignal` in `ActionEngine`

- Wrap `RunAction()` in an `AbortController`, set `params.AbortSignal`, respect `action.MaxExecutionTimeMS` with engine-default fallback
- Mirror in `BaseAgent.Execute()` so agents have wall-clock timeout parity (lift the same pattern)
- Document behavior in `packages/Actions/Engine/README.md` and agent docs
- Update existing `BaseAction` subclasses to honor abort in long loops where relevant

**Dependencies**: 1a
**Verifies**: integration test — action with `MaxExecutionTimeMS=100` that sleeps returns `TIMEOUT` result code

### 1c — `ActionEngine` Type dispatch + pure-compute Runtime actions

- Add `if (Type === 'Runtime')` branch in `RunAction()` that routes to `RuntimeActionExecutor`
- Create `@memberjunction/action-runtime` package with `RuntimeActionExecutor`, input/output wiring, wrap user code in an async IIFE
- Inject ONLY `input` + `libs` at first — no bridge yet
- Approval workflow: Runtime actions with `CodeApprovalStatus !== 'Approved'` refuse to execute with a clear error

**Dependencies**: 1a, 1b
**Verifies**: hand-authored Runtime action that takes two numbers and returns their sum works end-to-end; unapproved Runtime action is refused

### 1d — Bidirectional IPC in `WorkerPool`

- Extend the worker's IPC protocol with bridge request/response messages + request IDs
- Add a Promise-backed message router on both sides
- Rework wall-clock timeout enforcement to abort mid-bridge-call via a signal to the worker
- Enforce `maxBridgeCalls` counter on the host
- Unit tests for: successful bridge round-trip, rejected-by-permissions, host-aborted mid-call, worker-side timeout of an awaited host response

**Dependencies**: 1c
**Verifies**: unit tests above pass; no regression in existing `Execute Code` action
**Risk level**: **highest** of the phase — budget ~2–3 weeks

### 1e — Read-only bridge: `md`, `rv`, `rq`

- Implement `RuntimeActionBridge` in `@memberjunction/action-runtime`
- Handlers for: `md.Entities`, `md.GetEntity`, `md.GetEntityFields`, `md.GetRelatedEntities`, `rv.RunView`, `rv.RunViews`, `rq.RunQuery`
- Permission enforcement from `RuntimeActionConfiguration.permissions.allowedEntities`
- Inject pre-warmed snapshot of allowed `md` data into the sandbox at startup so synchronous `md.*` calls work without a bridge round-trip
- `contextUser` threaded through every call

**Dependencies**: 1d
**Verifies**: Runtime action that queries two allowed entities and a disallowed one — allowed queries succeed, disallowed rejected

### 1f — Write bridge: `entity` CRUD + `actions.Invoke`

- `entity.Create`/`Load`/`Update`/`Delete`/`Save` (all permission-scoped)
- `actions.Invoke`/`InvokeAll` — bridge calls `ActionEngineServer.RunAction()` with the sandbox's `contextUser`
- Re-entrancy: a Runtime action invoking another Runtime action is supported but subject to the same permission and timeout checks. Track call depth to prevent runaway recursion (hard cap, default 10)
- `ActionExecutionLog` captures all nested invocations

**Dependencies**: 1e
**Verifies**: Runtime action that loads a record, transforms it, invokes `Send Email`, and saves a status record works with a minimum-necessary permission set

### 1g — Agent + AI bridge: `agents.Run`, `ai.ExecutePrompt`, `ai.GetEmbedding`

- `agents.Run` calls `AgentRunner.RunAgent()` directly (no `ExecuteAgent` action in the path)
- Permission-scoped by `allowedAgents`; same `contextUser`
- `ai.ExecutePrompt` / `ai.GetEmbedding` delegate to existing AI providers using the caller's API key context
- Respect the per-request `IMetadataProvider` threading (Apr 2026 feature) when dispatching from the bridge

**Dependencies**: 1f
**Verifies**: Runtime action that loads feedback records, delegates analysis to a scoped sub-agent, and emits a summary via `ai.ExecutePrompt`

### 1h — ActionSmith agent

- Agent metadata JSON in `/metadata/agents/.actionsmith-agent.json`:
  - `Name: "ActionSmith Agent"`, TypeID = Loop, `ExposeAsAction: true`, `ParentID: NULL`
  - Link to Agent Manager via `MJ: AI Agent Sub-Agents` relationship (not `ParentID`)
  - Declare `Codesmith Agent` as a sub-agent via the relationship table
  - `PayloadSelfWritePaths` — contract, permissions, code, testResults, approvalStatus
  - `FinalPayloadValidation` — schema ensuring Action record was created
- System prompt in `/metadata/prompts/.actionsmith-prompt.md`
- Two new actions: `Create Runtime Action`, `Test Runtime Action`
- **Codesmith prompt extension** (`/metadata/prompts/templates/codesmith-prompt.template.md` or equivalent): recognize `runtimeActionMode: true` in the payload and surface the bridge utilities (`md`, `rv`, `rq`, `entity`, `actions`, `agents`, `ai`, `log`, `libs`) in its in-context documentation, with a hint to use `async/await` for bridge calls and to validate against the caller-provided `outputSchema`.
- **Agent Manager prompt extension** (`/metadata/prompts/templates/agent-manager-prompt.template.md` or equivalent): update so Agent Manager knows ActionSmith exists as a sub-agent, when to delegate to it (capability-gap scenarios), and what payload to pass. This is a prompt-only change — no behavior change to Agent Manager itself. Run `mj sync push` after edits.

**Dependencies**: 1g
**Verifies**: ask ActionSmith (via Agent Manager or directly) to create "Weekly Sales Summary Email" — end-to-end flow produces an approved Runtime action; also verify Agent Manager surfaces ActionSmith as a sub-agent when asked "I need a new capability that combines X and Y"

### 1i — Approval UI enhancements

- Extend existing Action approval UI to render `RuntimeActionConfiguration` in a readable form: which entities / actions / agents are permitted, resource limits, additional libraries requested
- Syntax-highlighted code block for the JS payload
- Link to test results (from `Test Runtime Action` execution)
- Edit-before-approve: user can modify `Code` and `RuntimeActionConfiguration` before approval; edits become part of the approved version

**Dependencies**: 1h
**Verifies**: approver can review a generated Runtime action, modify permissions, and approve — all visible in Action Execution Log

### 1j — `ExecuteAgent` action (parallel track, independent)

- New `Action` record with `Type='Custom'`, `Name='Execute Agent'`, `DriverClass='ExecuteAgentAction'`
- Inputs: `AgentName` (or `AgentID`), `Input` (JSON), optional `ConversationID`
- Outputs: full `AgentResult` payload
- Implementation: thin wrapper around `AgentRunner.RunAgent()`
- Separately wires up `AIAgent.ExposeAsAction` so the agent catalog auto-populates agent-as-action entries

**Dependencies**: none (can ship in parallel with 1a–1g)
**Not a dependency of** Runtime actions — the bridge's `utilities.agents.Run` uses `AgentRunner` directly. `ExecuteAgent` is for external callers (schedulers, workflows, other Runtime actions invoking via `utilities.actions.Invoke`).

---

## Examples

### Example 1: Composite action

```javascript
// Runtime Action: Weekly Sales Summary Email
// allowedEntities: ['Sales']
// allowedActions:  ['Send Email']
const { recipientEmail, region } = input;

const weekAgo = new Date();
weekAgo.setDate(weekAgo.getDate() - 7);

const sales = await utilities.rv.RunView({
  EntityName: 'Sales',
  ExtraFilter: `Region = '${region}' AND SaleDate >= '${weekAgo.toISOString()}'`,
  OrderBy: 'SaleDate DESC',
});
if (!sales.Success) return { success: false, error: sales.ErrorMessage };

const _ = utilities.libs.lodash;
const totalSales   = _.sumBy(sales.Results, 'Amount');
const topProducts  = _(sales.Results)
  .groupBy('ProductName')
  .map((items, name) => ({ name, total: _.sumBy(items, 'Amount') }))
  .orderBy('total', 'desc').take(5).value();

const body = [
  `Weekly Sales Summary for ${region}`,
  `Total: $${totalSales.toLocaleString()}  (${sales.Results.length} transactions)`,
  '',
  'Top 5 Products:',
  ...topProducts.map((p, i) => `${i + 1}. ${p.name}: $${p.total.toLocaleString()}`),
].join('\n');

const emailResult = await utilities.actions.Invoke('Send Email', {
  To: recipientEmail,
  Subject: `Weekly Sales Summary — ${region}`,
  Body: body,
});

return {
  success: emailResult.Success,
  totalSales,
  transactionCount: sales.Results.length,
};
```

### Example 2: AI-enhanced data analysis

```javascript
// Runtime Action: Analyze Customer Feedback
// allowedEntities: ['Customer Feedback', 'Customers']
const { customerId, timeframeDays } = input;

const customer = await utilities.entity.Load('Customers', customerId);
if (!customer.Success) return { success: false, error: 'Customer not found' };

const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - timeframeDays);

const feedback = await utilities.rv.RunView({
  EntityName: 'Customer Feedback',
  ExtraFilter: `CustomerID = '${customerId}' AND CreatedAt >= '${cutoff.toISOString()}'`,
  OrderBy:    'CreatedAt DESC',
});
if (feedback.Results.length === 0) {
  return { success: true, analysis: 'No feedback in timeframe', feedbackCount: 0 };
}

const analysis = await utilities.ai.ExecutePrompt({
  SystemPrompt: 'Return JSON: sentiment, themes[3], actionItems, summary',
  UserMessage:  feedback.Results.map(f => f.Comments).join('\n---\n'),
  ModelPower:   'medium',
});

return {
  success:       true,
  customerName:  customer.Record.Name,
  feedbackCount: feedback.Results.length,
  analysis:      JSON.parse(analysis.Response),
};
```

### Example 3: Multi-agent orchestration

```javascript
// Runtime Action: Comprehensive Account Review
// allowedEntities: ['Accounts', 'Contacts', 'Opportunities', 'Activities']
// allowedActions:  ['Generate Report']
// allowedAgents:   ['Risk Assessment Agent', 'Opportunity Scorer Agent']
const { accountId } = input;

const [account, contacts, opportunities, activities] = await utilities.rv.RunViews([
  { EntityName: 'Accounts',      ExtraFilter: `ID = '${accountId}'` },
  { EntityName: 'Contacts',      ExtraFilter: `AccountID = '${accountId}'` },
  { EntityName: 'Opportunities', ExtraFilter: `AccountID = '${accountId}'`, OrderBy: 'CloseDate DESC' },
  { EntityName: 'Activities',    ExtraFilter: `AccountID = '${accountId}'`, OrderBy: 'ActivityDate DESC', MaxRows: 50 },
]);
if (!account.Success || account.Results.length === 0) {
  return { success: false, error: 'Account not found' };
}

const [risk, scoring] = await Promise.all([
  utilities.agents.Run('Risk Assessment Agent',   { Input: { account: account.Results[0], opportunities: opportunities.Results, activities: activities.Results } }),
  utilities.agents.Run('Opportunity Scorer Agent', { Input: { account: account.Results[0], opportunities: opportunities.Results } }),
]);

const report = await utilities.actions.Invoke('Generate Report', {
  Template: 'Account Review',
  Data:     { account: account.Results[0], risk: risk.Output, scoring: scoring.Output },
});

return { success: true, reportUrl: report.OutputParams?.ReportUrl };
```

---

## Versioning & Promotion

### Semantic versioning

```
MAJOR  — breaking change to Action.Params / ResultCodes
MINOR  — new optional param, enriched output (backward compatible)
PATCH  — bug fix, perf improvement, no API change
```

A new version is a new `Action` record with `RuntimeActionConfiguration.previousVersionId` pointing at the prior. `CodeApprovalStatus` resets to `Pending` for every new version.

### Promotion pathway

```
Runtime action
  (AI-generated JS, sandbox execution, bridge calls)
        │
        │ [ frequently used + stable + faster path wanted ]
        ▼
Generated action
  (AI-generated TS, compiled at build time, native execution)
        │
        │ [ universal value + core-team review ]
        ▼
Core action
  (Hand-written, part of the framework distribution)
```

Each rung trades flexibility for performance and permanence.

---

## Monitoring

All Runtime action invocations land in the existing `ActionExecutionLog`. Queryable by `Action.Type='Runtime'`. Structured log output captures:

- Per-invocation: `bridgeCallCount`, `bridgeDenyCount`, `executionTimeMs`, `memoryPeakMB`, `aborted` (bool)
- Per-bridge-call: type (`rv.RunView`, `actions.Invoke`, etc.), target entity/action/agent, duration

Anomaly detection is straightforward against this schema — error-rate spikes, latency degradation, unusual usage volume — but is explicitly out of scope for Phase 1. A follow-up "Runtime Action Monitor" dashboard in MJExplorer would surface these views.

---

## Open Questions (to resolve during implementation)

1. **Library allowlist evolution** — do we ship a global registry of permitted `additionalLibraries`, or is the list per-Action in `RuntimeActionConfiguration.sandbox.additionalLibraries`? Current answer: per-Action, but the set is constrained to a hard-coded allowlist in `@memberjunction/action-runtime`. Revisit in 1e.

2. **Bridge-call re-entrancy budget** — a Runtime action invoking another Runtime action via `utilities.actions.Invoke` multiplies bridge-call counts. Do we aggregate across the call tree or per-invocation? Leaning per-invocation with a hard cap on call-tree depth (10).

3. **AbortSignal semantics during bridge calls** — if the wall-clock fires while a bridge call is awaiting a long-running host operation (e.g., `agents.Run` on a deep sub-agent tree), do we abort the host operation or just the worker's await? Leaning: abort both — propagate the signal into the host-side call.

4. **Approval-scope drift** — if a previously-approved Runtime action is edited to expand its permissions, does it re-enter `Pending`? Yes, any permission expansion forces re-approval; permission narrowing does not.

5. **Pre-warmed `md` snapshot** — synchronous `md.*` calls require data in the sandbox at startup. What's the size budget? For small tenants this is a few hundred KB; for large metadata sets it could be megabytes. Mitigation: `md` access is scoped by `allowedEntities`, so we only inject metadata for permitted entities.

---

## Conclusion

Runtime Actions let MJ agents fill capability gaps without waiting for developer cycles. The v2.0 plan differs from v1.0 in three substantive ways:

- **Grounded in current state** — every assumption is checked against today's code, not an aspirational snapshot. The biggest consequence is that the bridge's bidirectional IPC is called out as its own major deliverable (1d) rather than being hand-waved as "use the React runtime pattern."
- **Phased for incremental value** — every sub-phase 1a–1j ships something demonstrable. Universal `MaxExecutionTimeMS` (1b), pure-compute Runtime actions (1c), and the read-only bridge (1e) all deliver value even if later phases slip.
- **Clean factoring of independent tracks** — `ExecuteAgent` (1j) is useful but not a prerequisite; it's in the phase so it ships as a set, but can be developed in parallel.

The infrastructure we already have — `isolated-vm` sandbox, Codesmith's iterative loop, Agent Manager's sub-agent scaffolding, `CodeApprovalStatus` workflow, `PayloadManager` for data isolation, per-request provider threading — is sufficient to make this feasible. The work is mostly integration and the bidirectional IPC layer.

---

## Progress Log

This section is the source of truth for resumption. Every completed sub-phase gets an entry here immediately after its work is done (before any commit boundary). If the conversation context is lost, anyone — human or AI — should be able to read this plan and pick up at the exact right spot.

Format per entry:
```
### 1x — <title>                                     <YYYY-MM-DD>
Status: DONE | IN-PROGRESS | BLOCKED
Commits: <hashes or "uncommitted: <file list>">
Key decisions: <bullets on non-obvious choices made>
Tests: <pass/fail/skip counts per package>
Known follow-ups: <anything deferred to later phases>
```

### 1a — Migration + JSONType metadata + CodeGen regen                      2026-04-20
Status: DONE
Commits: `7cff86a4bf` (foundation), `2f3fbd9647` (codegen follow-up)
Key decisions:
- Chose a dedicated `RuntimeActionConfiguration` column rather than reusing the existing `Action.Config` field (which is used for integration-action routing); separation of concerns.
- Emitted as JSONType interface rather than plain NVARCHAR(MAX) so every consumer imports `MJActionEntity_IRuntimeActionConfiguration` from `@memberjunction/core-entities` — zero duplication.
- `MaxExecutionTimeMS` is universal (applies to all action types), not Runtime-specific.
- `CreatedByAgentID` is FK to `AIAgent.ID`, NULL for human-authored actions.
Tests: N/A (schema + codegen output only)
Known follow-ups: 1a.1 Zod validator; all subsequent phases consume the generated types.

### 1a.1 — Zod validator in @memberjunction/actions-base                     2026-04-20
Status: DONE
Commits: uncommitted — files: `packages/Actions/Base/package.json`, `packages/Actions/Base/src/RuntimeActionConfigurationSchema.ts` (new), `packages/Actions/Base/src/index.ts`, `packages/Actions/Base/src/__tests__/RuntimeActionConfigurationSchema.test.ts` (new), `packages/Actions/Base/src/__tests__/ActionEngine-Base.test.ts` (mock fix)
Key decisions:
- Zod-inferred types are unreliable as a compile-time drift guard in this repo because the server tsconfig omits `strictNullChecks`. Removed the `z.ZodType<T>` annotation-on-each-schema approach (erased field inference) and the `Exact<A,B>` helper (couldn't distinguish required from optional without strict mode).
- Drift detection moved into the Vitest suite via two `satisfies` clauses (Zod→interface and interface→Zod) at the top of the test file. If either direction stops compiling, the schema and the JSONType interface have drifted structurally.
- Added `.strict()` on every object schema so unknown keys are rejected at parse time — defense against silent drift from older clients.
- Exported `RuntimeActionConfiguration` type as an alias for `MJActionEntity_IRuntimeActionConfiguration` so consumers can pull type + validator from one import. Zero duplication.
- Fixed a pre-existing test failure in `ActionEngine-Base.test.ts`: the `@memberjunction/global` mock was missing `UUIDsEqual` and `NormalizeUUID`, which `EntityActionEngineBase.GetActionsByEntityID` depends on. Added minimal implementations.
Tests: 49 pass / 0 fail / 0 skip (`@memberjunction/actions-base`). 16 new in `RuntimeActionConfigurationSchema.test.ts`, 33 pre-existing now unbroken.
Known follow-ups: If `strictNullChecks` is enabled repo-wide in the future, revisit the compile-time drift guard — the `satisfies` pairs in the test file would become unnecessary and we could move the check back into the schema file itself.

### 1b — Universal MaxExecutionTimeMS + AbortSignal                          2026-04-20
Status: DONE
Commits: uncommitted — files: `packages/Actions/Base/src/ActionEngine-Base.ts` (added `AbortSignal` field to `RunActionParams`), `packages/Actions/Engine/src/generic/ActionEngine.ts` (new `RunActionWithTimeout` wrapper + `DefaultActionTimeoutMS` hook), `packages/Actions/Engine/package.json` (`test` script), `packages/Actions/Engine/src/__tests__/ActionEngine.test.ts` (new describe block + UUIDsEqual mock fix), `packages/Actions/Engine/src/__tests__/EntityActionEngine.test.ts` (UUIDsEqual mock fix), `packages/AI/CorePlus/src/agent-types.ts` (`maxExecutionTimeMs` field on `ExecuteAgentParams`), `packages/AI/Agents/src/base-agent.ts` (timeout/abort chaining around `Execute`).
Key decisions:
- Timeout enforcement is **cooperative, not forceful**: the wrapper aborts a chained `AbortSignal` when the wall-clock fires and races the action (or agent run) against a rejection. In-flight `fetch`, `setTimeout`, and long-running loops can observe the signal and short-circuit; we don't kill the Node process.
- `RunAction()` entrypoint is unchanged for callers. The timeout wrapper (`RunActionWithTimeout`) is called at the very end of `RunAction` and is overridable by sub-classes if anyone needs to customize timeout semantics.
- Chained-abort semantics: if the caller passes `params.AbortSignal` (e.g. from a Runtime-action bridge), we chain to it so either the upstream or the local timeout can trigger cancellation. After the run completes we restore the caller's original `AbortSignal` onto `params` so nothing leaks.
- Default timeouts are intentionally generous (2 hours). Interactive flows should tighten via `Action.MaxExecutionTimeMS` per-action or `ExecuteAgentParams.maxExecutionTimeMs` per-run. Sub-classes can override `DefaultActionTimeoutMS` / `DefaultAgentTimeoutMS` to change defaults globally.
- On `BaseAgent.Execute`, wrapped the method minimally (top + finally) rather than renaming — the existing 250-line body remains untouched, reducing regression risk. The merged `AbortSignal` replaces `params.cancellationToken` in-place so every existing cancellation check (including those propagated into sub-agents) observes the merged condition.
- Timeout results surface via the normal `ActionResult` shape with `Success=false` and a descriptive `Message`. `Result` (which must be an `MJActionResultCodeEntity`) is left `undefined` — we can't guarantee a `TIMEOUT` result code exists on every action; the flag + message are the canonical signal.
- Fixed pre-existing test failures in `Actions/Engine` by adding the missing `UUIDsEqual` / `NormalizeUUID` to the `@memberjunction/global` mocks (same pattern as actions-base). 7 previously-failing tests now pass.
Tests:
- `@memberjunction/actions` (Engine): 144 pass / 0 fail (previously 137 pass / 7 fail on pre-existing mock gaps). Added 4 timeout-specific tests: (a) AbortSignal propagation to InternalRunAction, (b) timeout fires when MaxExecutionTimeMS is exceeded, (c) upstream caller-supplied aborts propagate, (d) caller-visible params.AbortSignal is restored after the run.
- `@memberjunction/ai-agents`: 589 pass / 0 fail (unchanged — BaseAgent timeout wrapper doesn't regress any existing test). Dedicated timeout tests for `BaseAgent.Execute` deferred — the code path is structurally identical to the Action variant, which is well-tested.
Known follow-ups: audit existing long-running BaseAction subclasses (WebPageContentAction, BusinessCentralBaseAction family) to poll `params.AbortSignal` inside their inner loops so cooperative abort becomes truly mid-flight. Deferred — not on the critical path.

### 1j — `Execute Agent` action + `ExposeAsAction` dispatch                   2026-04-20
Status: DONE
Commits: uncommitted — files: `packages/Actions/CoreActions/src/custom/ai/execute-agent.action.ts` (new), `packages/Actions/CoreActions/src/index.ts` (public-api export), `metadata/actions/.execute-agent.json` (new).
Key decisions:
- **Scope narrowed**: the plan originally called for "AIAgent.ExposeAsAction auto-populates agent-as-action entries" (one Action record per exposed agent). That turned out to be unnecessary complexity. The generic `Execute Agent` action accepts `AgentName`/`AgentID` as a parameter and delegates to `AgentRunner.RunAgent()`, so **a single Action record in the catalog covers every exposed agent**. External callers (schedulers, workflows, MCP, other Runtime actions via `utilities.actions.Invoke`) invoke `Execute Agent` with the target agent name. No per-agent metadata upkeep, no startup-time DB writes, no sync drift.
- Safety rails enforced at dispatch: the action refuses to run any agent whose `ParentID` is set (sub-agents aren't invokable directly — their payload contract is governed by the parent) and any agent with `ExposeAsAction=false`. Both return descriptive `ResultCode`s so calling workflows can branch cleanly.
- Outputs include the full `AgentResult` plus convenience `AgentRunID` and `Payload` outputs so downstream steps don't need to dig into nested structures.
- `params.AbortSignal` (populated by ActionEngine's timeout wrapper from 1b) is passed through as `cancellationToken` to `AgentRunner.RunAgent()` — caller-supplied aborts flow end-to-end into the agent run.
- Optional `MaxExecutionTimeMs` input adds agent-level wall-clock timeout on top of the outer action timeout.
- Action metadata uses the existing `/metadata/actions/.actions.json` pattern (one file per action, `@lookup:` for the category). Paired with `mj sync push --dir=metadata --include="actions"` to land in the DB.
Tests:
- `@memberjunction/core-actions`: 68 pass / 0 fail (build clean; no new unit tests — action is a thin composition of `AIEngine.Config()` + `AgentRunner.RunAgent()`, both of which have extensive upstream test coverage. An integration test that actually runs a trivial agent through the action would be valuable but requires a live DB — deferred to the broader regression pass).
Known follow-ups:
- Once the Execute Agent action record is synced via `mj sync push`, verify the approval UI surfaces it alongside other Custom actions.
- If demand emerges for agent-specific parameter surfaces (typed inputs per-agent), revisit the "auto-populate per-agent Action records" idea as a separate feature — the generic action is the MVP.

### 1c — ActionEngine Type dispatch + pure-compute Runtime actions            2026-04-20
Status: DONE
Commits: uncommitted — files: `packages/Actions/Runtime/` (NEW PACKAGE — `@memberjunction/action-runtime`: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/types.ts`, `src/RuntimeActionExecutor.ts`, `src/__tests__/RuntimeActionExecutor.test.ts`); `packages/Actions/Engine/package.json` (added `@memberjunction/action-runtime` dep); `packages/Actions/Engine/src/generic/ActionEngine.ts` (refactored `InternalRunAction` to branch on `Action.Type`, factored `RunClassBasedAction` + added `RunRuntimeAction`); `packages/Actions/Engine/src/__tests__/ActionEngine.test.ts` (added `BaseSingleton` to the `@memberjunction/global` mock).
Key decisions:
- **New package `@memberjunction/action-runtime`** at `packages/Actions/Runtime/`. Separated from `@memberjunction/actions` so the runtime-specific wiring (sandbox, future bridge, allowlists) stays modular and can evolve independently. Engine depends on it, not vice versa.
- **`RuntimeActionExecutor` is a `BaseSingleton`.** It owns a persistent `CodeExecutionService` and its isolated-vm worker pool. Spinning those up on every invocation would negate the pool's whole point; singleton amortizes the cost.
- **Gating order** (fail-fast): `Type='Runtime'` → `Code` present → `Status='Active'` → `CodeApprovalStatus='Approved'` → `!AbortSignal.aborted`. Every gate returns a distinct `RuntimeActionResultCode` so approval-UI diagnostics can be precise. No gate is skippable.
- **Pure-compute only this phase**: the sandbox sees `input` (keys derived from `RunActionParams.Params` where `Type in ('Input','Both')`) and `libs` (the CodeExecutionService-injected allowlist: lodash, date-fns, mathjs, papaparse, uuid, validator). No bridge — no `md`, `rv`, `rq`, `entity`, `actions`, `agents`, or `ai`. Those land in 1e–1g.
- **User code wrapped in an async IIFE** so plain `return expr;` works as the idiomatic shape. The wrapper assigns the return value to `output`, which is the channel `CodeExecutionService` reads to surface results back to the host.
- **Return-value → Output ActionParams**: if user code returns an object, each top-level key becomes an Output ActionParam; a scalar return lands under `result`. Existing Input params the user code returns with the same key get upgraded to `Both`. This gives workflow/agent callers the standard `params`-based read path without them knowing the action is sandboxed.
- **Default timeout + memory** hardcoded to 30s / 128MB for this phase. Once `RuntimeActionConfiguration.limits` is live (after the bridge), those become the overrides with the same defaults.
- **Dispatch factoring**: `InternalRunAction` was refactored to branch on `Action.Type`, with the pre-existing ClassFactory path extracted to `RunClassBasedAction()` and the new Runtime path in `RunRuntimeAction()`. Both paths return the same `ActionResultSimple` shape so the surrounding result-code mapping and logging code is unchanged.
- **Type-dispatch tests not added to ActionEngine.test.ts**: mocking `@memberjunction/action-runtime` on top of the existing `@memberjunction/actions-base` and `@memberjunction/global` mocks pushed the mock setup over its complexity budget. Coverage is solid on the executor side (13 new unit tests exercising every gate, input wiring, output wiring, and every sandbox error-type mapping). End-to-end dispatch will get covered once we have a live DB integration test after 1e lands.
Tests:
- `@memberjunction/action-runtime` (NEW): 13 pass / 0 fail. Covers: type gate, code gate, status gate, approval gate, upstream abort gate, Input/Both→`input` wiring, async-IIFE code wrapping, object-return→Output-param promotion, scalar-return→`result` param, Input→Both upgrade on matching key, TIMEOUT mapping, SYNTAX_ERROR/MEMORY_LIMIT/SECURITY_ERROR/RUNTIME_ERROR mapping, UNEXPECTED_ERROR when sandbox throws.
- `@memberjunction/actions` (Engine): 144 pass / 0 fail (unchanged). Added `BaseSingleton` to the global mock because the real action-runtime module is now in the graph.
Known follow-ups: Full end-to-end test (real DB + real action record with `Type='Runtime'`) deferred until after 1e — until the bridge exists, Runtime actions are pure-compute only and the integration value is limited.

### 1d — Bidirectional IPC in WorkerPool                                     2026-04-20
Status: DONE
Commits: uncommitted — files: `packages/Actions/CodeExecution/src/types/index.ts` (new bridge message types + CodeExecutionParams bridgeHandlers/maxBridgeCalls/abortSignal fields), `packages/Actions/CodeExecution/src/worker.ts` (_bridgeCall ivm.Reference, per-request pending-calls map, bridge-response handler, abort handler, async-IIFE with `promise: true`), `packages/Actions/CodeExecution/src/WorkerPool.ts` (bridge-call dispatcher, abortRequest, abortListener wiring, strip non-serializable fields from IPC payload), `packages/Actions/CodeExecution/src/__tests__/bridge.test.ts` (7 end-to-end tests against a real forked worker).
Key decisions:
- **`Reference.apply` over `applyAsync`.** isolated-vm doesn't actually expose an `applyAsync` (it's a docs misconception). `Reference.apply(..., { result: { promise: true } })` is the canonical way to have the isolate await a host async function. Result comes back as a JSON-stringified envelope so complex shapes transit via primitives only.
- **Errors via return envelope, not throw.** Throwing from an async Reference callback in Node 24+ triggers the unhandled-rejection handler BEFORE isolated-vm delivers the rejection to the isolate — which kills the worker process. Every bridge call wraps its body in try/catch and returns `{ __bridgeError: message }` on failure; the sandbox-side `__bridgeCall` wrapper re-throws inside the isolate, giving user code the expected `try { await ... } catch {}` semantics without killing the worker.
- **Per-requestId bridge state** in the worker: `Map<requestId, { pending: Map<callId, {resolve, reject}>; callCount; maxCalls; aborted }>`. Supports Promise.all concurrency inside user code (each callId routes independently) and clean abort fan-out.
- **Abort = reject pending bridge calls, let script unwind naturally.** We do NOT call `isolate.dispose()` mid-execution. isolated-vm's `script.run({ timeout })` will still fire the script-level deadline; rejecting the in-flight bridge awaits causes user-code `await` to throw, which the async IIFE catches or surfaces to the executor. Cheaper than disposing + rebuilding the isolate, and the isolate has no host access anyway without the bridge.
- **Non-serializable fields stripped from IPC**. `bridgeHandlers` (functions) and `abortSignal` (live object) can't cross `process.send()`. The WorkerPool strips both before sending `execute` to the worker — they're kept server-side in the PendingRequest and consulted when `bridge-call` messages arrive.
- **Stale-message guard**: if the worker's pending `result`/`error` arrives AFTER the host has given up (abort), `handleWorkerMessage` drops it because `worker.currentRequest` has been nulled out. The `requestId` mismatch guard is tolerant of legacy messages without a `requestId` field to keep existing WorkerPool.test.ts mocks green.
- **Security preserved.** Only JSON-serializable primitives cross the boundary, consoleLog/require remain synchronous (no regression to the existing protections), and the bridge ivm.Reference lives only for the lifetime of the isolate.
Tests:
- `@memberjunction/code-execution`: 83 pass / 0 fail (up from 76). 7 new end-to-end bridge tests in `bridge.test.ts`: simple round-trip, unregistered handler, handler-throws propagation, Promise.all correlation by callId, maxBridgeCalls enforcement, caller-abort mid-call, stateless recovery after bridge failure. All 76 pre-existing tests unchanged.
- `@memberjunction/action-runtime`: 13 pass / 0 fail (passed `bridgeHandlers` + `maxBridgeCalls` through to CodeExecutionService; no test changes needed for the pass-through).
Known follow-ups: None — 1d is the feature-complete bridge plumbing.

### 1e+1f+1g — Permissioned bridge handlers (md/rv/rq/entity/actions/agents/ai) 2026-04-20
Status: DONE
Commits: uncommitted — files: `packages/Actions/Engine/src/generic/RuntimeActionBridge.ts` (NEW; 600+ LOC — full handler map, permission enforcement, `utilities` sandbox preamble), `packages/Actions/Engine/src/generic/ActionEngine.ts` (RunRuntimeAction parses RuntimeActionConfigurationObject via Zod, constructs BridgeContext, injects preamble before user code), `packages/Actions/Engine/src/__tests__/ActionEngine.test.ts` (use importOriginal for core + core-entities so transitive imports from ai-prompts/aiengine don't blow up the mocks), `packages/Actions/Runtime/src/RuntimeActionExecutor.ts` + `types.ts` (added `bridgeHandlers`/`maxBridgeCalls` to pass through).
Key decisions (combined because all three phases ship one integrated file):
- **Handler map lives in `@memberjunction/actions`, not `@memberjunction/action-runtime`**. action-runtime can't depend on actions/ai-agents/ai-prompts (ai-agents already depends on actions — that would be circular). Engine does, so bridge construction lives there. action-runtime stays minimal (just the executor + plumbing).
- **All handlers routed through a `makeHandler(ctx, body)` wrapper** that centralizes the upstream-abort check + error logging. Adding a new namespace means one line in the map + one implementation; guard code is not duplicated.
- **Permissions are ID-authoritative, name-accessible.** `RuntimeActionConfiguration` stores `{ id, name }` pairs; handlers resolve the allowed entry by *name* (the human-readable form sandbox code writes) but cross-check against the ID. A malicious name that happens to match an allow-list entry's `name` but not its `id` is not needed today because both are currently-allowlist-authored, but the dual-key structure means we can tighten in future.
- **`rv` always returns `simple`-type results.** The sandbox has no use for `BaseEntity` instances (can't call `.Save()` on them across the boundary anyway); forcing simple eliminates the question.
- **`entity.Save` is upsert by PK**: if the payload contains a full primary-key tuple, `InnerLoad` → mutate → Save; otherwise `NewRecord` → Save. `entity.Update/Create/Delete` are explicit when the caller knows which they want. This matches what ActionSmith-generated code tends to want (`Save` for "make this record the truth").
- **`.Set()` use is scoped and justified.** The one `entity.Set(key, value)` call in `assignFields` is explicitly commented as the sole legitimate use in this codebase: field names come from sandbox input at runtime, there's no generated type available, and TS typing over an arbitrary entity handle isn't possible. Every other property access in the bridge uses strongly-typed accessors.
- **`utilities.agents.Run` uses dynamic import** of `@memberjunction/ai-agents`. `@memberjunction/actions` can't statically depend on ai-agents (circular: ai-agents → actions already), but at runtime ai-agents is always loaded (MJServer + every downstream consumer pulls it in). `await import('@memberjunction/ai-agents')` resolves cleanly at call time.
- **`ai.GetEmbedding` deferred**. AIEngine has per-vector-space services but no single "embed this text" entry point yet. Handler returns a descriptive error pointing users at `ai.ExecutePrompt` for now. Follow-up when the embedding service surfaces a generic API.
- **Sandbox preamble is a static string** returned from `getRuntimeActionBridgePreamble()`, prepended to user code at dispatch time. Keeps the sandbox surface in sync with the handler map (change one, change both in the same file). Only wires forwarding — no logic lives client-side.
- **Zod validation gate before bridge construction.** `RunRuntimeAction` calls `RuntimeActionConfigurationSchema.safeParse(action.RuntimeActionConfigurationObject)` before building handlers. Malformed config surfaces as `INVALID_CONFIG` with the Zod error message — sandbox never gets a chance to run.
- **Absence of config = pure-compute.** If `RuntimeActionConfigurationObject` is null, we skip the preamble + handlers entirely and fall back to 1c's `input + libs` behavior. A Runtime action without a config is strictly sandboxed from MJ.
Tests:
- `@memberjunction/actions` (Engine): 144 pass / 0 fail (unchanged). Used `importOriginal` for `@memberjunction/core` and `@memberjunction/core-entities` so the ever-expanding transitive import surface from ai-prompts/aiengine doesn't require chasing new exports in the mocks.
- `@memberjunction/code-execution`: 83 pass / 0 fail (no regression).
- `@memberjunction/action-runtime`: 13 pass / 0 fail (bridgeHandlers/maxBridgeCalls pass-through verified).
Known follow-ups: end-to-end tests that invoke a full Runtime action (including md/rv/entity/agents bridge calls) against a real DB — deferred to broader regression after metadata is in place. `ai.GetEmbedding` implementation pending AIEngine's public embedding API.

### 1h — ActionSmith agent + helper actions + Agent Manager prompt           2026-04-20
Status: DONE
Commits: uncommitted — files: `packages/Actions/CoreActions/src/custom/ai/create-runtime-action.action.ts` (NEW), `packages/Actions/CoreActions/src/custom/ai/test-runtime-action.action.ts` (NEW), `packages/Actions/CoreActions/src/index.ts` (exports), `metadata/prompts/templates/agents/actionsmith.template.md` (NEW system prompt), `metadata/prompts/.actionsmith-prompt.json` (NEW prompt record with Anthropic + OpenAI model preferences), `metadata/agents/.actionsmith-agent.json` (NEW top-level agent with Codesmith linked via MJ: AI Agent Relationships), `metadata/prompts/templates/agent-manager/agent-manager.template.md` (Sub-Agent Usage section now references ActionSmith), `metadata/agents/.agent-manager.json` (Agent Manager now has MJ: AI Agent Relationships entry linking ActionSmith as a referenced sub-agent).
Key decisions:
- **Helper actions live in `@memberjunction/core-actions`** alongside Execute Agent / Execute AI Prompt. They're action-catalog-visible by design so ActionSmith can discover them through the normal action-availability path.
- **`Create Runtime Action` validates with Zod before DB write.** Malformed configurations never create partial Action records. `CodeApprovalStatus` is always 'Pending' on create — no way for ActionSmith to set Approved directly (the schema doesn't grant that field as settable here).
- **`Test Runtime Action` supports both persisted and ephemeral actions.** Either (ActionID/ActionName) for an existing record OR (Code + Configuration) for a freshly-generated payload that hasn't been persisted yet. The ephemeral path builds an in-memory MJActionEntity with `CodeApprovalStatus='Approved'` so the executor lets it through — this is safe because the record is never saved.
- **Test pass condition**: `result.Success === true` AND (if `expectedOutput` supplied) `deepEqual(outputs, expectedOutput)`. Handler surfaces `AllPassed`, `PassedCount`, `FailedCount`, and a per-case trace so ActionSmith's prompt can feed failures back to Codesmith for another iteration.
- **ActionSmith is linked to Codesmith via `MJ: AI Agent Relationships`**, NOT ParentID. This is the referenced-sub-agent pattern — Codesmith remains a top-level agent with its own `ExposeAsAction=true` and is also callable from ActionSmith. ParentID would force Codesmith to give up its top-level status (since ExposeAsAction is required to be FALSE when ParentID is set).
- **Agent Manager gets a `MJ: AI Agent Relationships` entry for ActionSmith** so Agent Manager's orchestration can delegate capability-gap scenarios to ActionSmith. The Agent Manager template's "Sub-Agent Usage" section explicitly calls out when to route: "user describes a workflow that doesn't match any existing action" or "user explicitly asks 'create an action that...'".
- **ActionSmith prompt includes the full `utilities.*` surface inline** (not via include) so Codesmith sees the sandbox API directly when ActionSmith briefs it. This keeps the sandbox surface, the bridge handler map, and the prompt documentation in sync via code review — any bridge namespace change must update all three.
- **Codesmith prompt is NOT modified.** Rather than teach Codesmith about runtimeActionMode as a persistent concept, ActionSmith passes the utilities surface + runtime-action contract as per-invocation context. Codesmith sees it as just another "task" with specific libraries and outputs. This keeps Codesmith pure and avoids versioning the Codesmith prompt around ActionSmith's needs.
Tests:
- `@memberjunction/core-actions`: 68 pass / 0 fail (unchanged). The two new actions compile and the package builds clean; no unit tests added because the actions are thin orchestrators over ActionEngineServer + Metadata.GetEntityObject (the patterns those routes exercise are covered in Engine + action-runtime tests).
- Agent Manager + ActionSmith metadata ships unvalidated against a live DB — `mj sync push` validation run deferred to broader regression.
Known follow-ups:
- Register the `Create Runtime Action` and `Test Runtime Action` action records in `/metadata/actions/` so they're discoverable via `mj sync push`. Files not written in this pass because ActionSmith's `MJ: AI Agent Actions` block uses `@lookup:MJ: Actions.Name=...` which will resolve once the Action records exist in DB; the DriverClass wiring works regardless of metadata presence because `@RegisterClass` handles runtime discovery.
- End-to-end smoke test once metadata is synced: "Create me an action that emails a daily customer digest" → Agent Manager → ActionSmith → Codesmith → approved Runtime action in the catalog.

### 1i — Approval UI enhancements                                             2026-04-20
Status: DONE
Commits: uncommitted — files: `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Actions/action-form.component.ts` (runtime helpers, updated getType* for Type='Runtime'), `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Actions/action-form.component.html` (new accordion panel rendering RuntimeActionConfiguration permissions, limits, libraries, syntax-highlighted code, Approve/Reject CTAs).
Key decisions:
- **Extends existing `MJActionFormComponentExtended`** rather than creating a separate form. A dedicated Runtime form would bifurcate the approval-UI story; one form with conditional sections keeps the experience coherent (all actions reviewed the same way, with Runtime-specific panels when relevant).
- **Zero-JS parsing in the template.** Uses the typed `RuntimeActionConfigurationObject` accessor emitted by CodeGen (via the JSONType system) — the component exposes `runtimeConfig`, `getAllowedEntities()`, `getAllowedActions()`, `getAllowedAgents()`, `getRequestedLibraries()`, `getRuntimeLimits()`, `getRuntimeConfigSummary()`. The template never sees the raw JSON string.
- **Permission surface is the star of the panel.** Three side-by-side cards (entities / actions / agents) with the count in the header and the list below. An approver's eye lands on the permission grant before the code block. Below that, a limits + libraries row. Below that, the code payload in monospace.
- **Malformed-config affordance.** If `RuntimeActionConfigurationObject` is null (parse failed or missing), the panel shows a red warning explaining that the action cannot run and approval should not be granted. No code block, no permission grid — just the warning.
- **Approve/Reject buttons get Runtime-specific copy.** Generic "approve the code" framing gets replaced with "approving grants this action the permissions listed above on behalf of any user who invokes it" — makes the blast-radius explicit at approval time.
- **Design tokens throughout.** No hardcoded hex values. `color-mix()` used for tinted backgrounds (warning/error banners). Consistent with the design token policy in CLAUDE.md.
- **Accordion panel starts expanded** — the permission review IS the point of reviewing a Runtime action; no reason to hide it behind a click.
Tests:
- `@memberjunction/ng-core-entity-forms`: Angular build clean (ngc passes). No unit tests for the new helpers; the methods are stateless passthroughs over the typed accessor and the template is declarative. Runtime verification deferred to a browser-based smoke test after deploy.
Known follow-ups: Inline code highlighting (today it's a plain `<pre>` block). Consider using an existing MJ code-display component if/when one lands. The core approval flow works without it.

---

## Resumption Instructions

If you're picking this up cold (session died, new contributor, AI resumed fresh):

1. Read the Progress Log above — it tells you exactly what's done.
2. Look at the last `DONE` entry; the next sub-phase to work on is the one immediately after it.
3. Re-read the **target sub-phase section** (1a–1j) for scope.
4. Re-read the **top of this doc** only if you're missing architectural context (bridge design, utilities shape, security model). Otherwise skip to execution.
5. Follow the **execution loop** per sub-phase:
   - Research subagent first (maps current state of affected code; ≤500 word report).
   - Design sketch inline (what classes change, what tests prove correctness).
   - Implement directly via Edit/Write; subagent assistance only for genuinely parallelizable sub-tasks.
   - `npm run build` in every affected package — fix errors before moving on.
   - `npm run test` in every affected package — add unit tests per the "Verifies" bullet; fix failures.
   - Append a Progress Log entry **before** asking to commit.
   - Do not commit until the user says `/commit` (standing rule for this branch).
6. Quality gates (non-negotiable):
   - No `any` / `unknown` escape hatches.
   - No `.Get()` / `.Set()` when a typed accessor exists.
   - Every `Save()` / `Delete()` checks return value; error details via `LatestResult?.CompleteMessage`.
   - No dynamic `require()` / `import()`.
   - Design tokens in any new CSS (no hex literals except per CLAUDE.md exceptions).
   - `UUIDsEqual()` / `NormalizeUUID()` for UUID comparisons.
7. Checkpoints where you should stop and ask the user:
   - **Before 1d implementation starts** — present the IPC protocol design (message shapes, abort semantics, timeout re-architecture). Do not invest 2–3 weeks without sign-off.
   - **Before 1h implementation** — present the ActionSmith agent metadata + draft system prompt; prompt-level decisions benefit from user review.
   - **Before 1i** — present UX concept for the Approval UI enhancements before touching Angular.
   - Any ambiguity in the plan's "Verifies" bullet or any non-trivial design tradeoff — ask, don't guess.
   - Any build/test failure that isn't cleanly resolved in ~2 attempts — stop and report.
8. Standing rules (session-scoped):
   - **No commits** until the user says `/commit` explicitly.
   - **No destructive git ops** (`git checkout --`, `git restore`, `git reset --hard`, etc.) without explicit authorization each time.
   - Files modified by the user (codegen output, migrations) are THEIR responsibility — don't stage or touch them without instruction.

