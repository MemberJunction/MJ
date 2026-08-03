# External Agent Harness Integration — Design Spec

**Status**: Draft for review (targeted at 6.0)
**Audience**: MJ core contributors
**Companion reading**: [AGENT_FRAMEWORK_COMPARISON.md](AGENT_FRAMEWORK_COMPARISON.md), [UNIFIED_PERMISSIONS_GUIDE.md](UNIFIED_PERMISSIONS_GUIDE.md), `packages/AI/Agents/README.md`, `packages/AI/MCPServer/README.md`

---

## 1. Motivation

MJ agents today are executed by MJ's own loop (`BaseAgent` + `LoopAgentType` / `FlowAgentType` / `RealtimeAgentType`). That gives us declarative agents-as-metadata, payload path ACLs, permissioned actions, model failover, and relational observability — but the *reasoning loop* is always ours.

A parallel ecosystem of **agent harnesses** has matured around coding agents: Claude Code (and the Claude Agent SDK), OpenAI Codex CLI, OpenCode, Pi, and Cline. These harnesses bring capabilities MJ's loop does not have natively: durable filesystem workspaces, shell/tool execution, long autonomous multi-hour runs, repo-scale code manipulation, and vendor-tuned agentic scaffolding. Platforms like qm (`yc-software/qm`) have demonstrated that harnesses are swappable substrates: one core can drive Pi, OpenCode, Codex, or Claude Code behind a single interface.

This spec defines how MJ launches **any external harness as the execution engine for an MJ agent**, while MJ keeps what it is uniquely good at: identity, permissions, governed data access, payload contracts, HITL, cost controls, and run-level audit. The agent row stays declarative; only the loop is outsourced.

**Design principle**: *the harness is a substrate, not a peer.* MJ owns the run record, the credentials, the tool surface, and the approval flow. The harness owns the reasoning loop inside the sandbox we hand it.

## 2. Goals and non-goals

**Goals**

1. Run an MJ agent whose "brain" is an external harness, selected per-agent via metadata — no code deploy to switch harnesses.
2. Give harness runs access to MJ data and actions **only** through MJ's own MCP server, with a per-run, scope-limited credential.
3. Map harness lifecycle events onto the existing observability model (`MJ: AI Agent Runs` / `MJ: AI Agent Run Steps`), including token and cost accounting.
4. Route harness permission requests through the existing HITL machinery (`MJ: AI Agent Requests` + `RespondToAgentRequest`).
5. Honor the existing payload contract: `StartingPayloadValidation` on the way in, `FinalPayloadValidation` on the way out.
6. Support at least: Claude Code (Agent SDK and headless CLI), Codex CLI, OpenCode, Pi, Cline. Adding a harness must not require core changes.

**Non-goals (this iteration)**

- Sub-agent delegation *from* a harness run to MJ agents beyond what MCP tools already allow (`Run_Agent` is available to the harness like any other tool).
- Multi-tenant sandbox orchestration at fleet scale (a sandbox provider interface is specified; a k8s implementation is future work).
- Replacing `LoopAgentType` for any existing agent. This is additive.

## 3. Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│ MJAPI / AgentRunner.RunAgent()                                  │
│   └─ BaseAgent (run record, payload validation, guardrails)     │
│        └─ HarnessAgentType (DriverClass, session-driven)        │
│             └─ IHarnessAdapter  ←── ClassFactory registration   │
│                  ├─ ClaudeCodeAdapter   (Agent SDK / CLI -p)    │
│                  ├─ CodexAdapter        (codex exec --json)     │
│                  ├─ OpenCodeAdapter     (opencode run --json)   │
│                  ├─ PiAdapter                                    │
│                  ├─ ClineAdapter                                 │
│                  └─ StdioJsonAdapter    (generic fallback)      │
│                        │                                        │
│                        ▼                                        │
│             ISandboxProvider (local dir │ docker │ remote)      │
│                        │                                        │
│      harness process ──┼── MCP loopback ──► MJ MCP Server       │
│                        │   (per-run scoped API key)             │
│                        └── workspace files, shell, vendor LLM   │
└─────────────────────────────────────────────────────────────────┘
```

The integration reuses the pattern proven by `RealtimeAgentType`: an agent type whose `IsSessionDriven` nature makes `BaseAgent` branch out of the standard prompt loop into a session executor. A harness run is exactly that — a long-lived external session that emits events until it terminates.

## 4. Metadata model (additive only)

Per the [Publish-Then-No-Breaking-Changes policy](../packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md), everything here is additive.

### 4.1 New agent type row

One new row in `MJ: AI Agent Types`:

| Field | Value |
|---|---|
| Name | `Harness` |
| DriverClass | `HarnessAgentType` |
| ConfigSchema | JSON schema for harness config (below) |
| DefaultConfiguration | sensible defaults (local sandbox, strict posture) |

Existing plumbing (`AIAgentType.ConfigSchema` / `DefaultConfiguration`, plus per-agent `MJ: AI Agent Configurations`) already covers per-agent configuration — no new columns on `MJ: AI Agents` are required for phase 1.

### 4.2 New entity: `MJ: AI Agent Harnesses`

The harness registry — which harnesses this installation can launch.

| Column | Type | Notes |
|---|---|---|
| ID | uniqueidentifier | PK |
| Name | nvarchar(100) | `Claude Code`, `Codex CLI`, `OpenCode`, `Pi`, `Cline` |
| Description | nvarchar(max) | |
| DriverClass | nvarchar(255) | ClassFactory key for the adapter (`ClaudeCodeAdapter`, …) |
| ExecutablePath | nvarchar(500) NULL | CLI binary or entry point; NULL when the adapter embeds an SDK |
| DefaultModel | nvarchar(255) NULL | passed through to the harness where supported |
| CapabilityFlags | nvarchar(max) NULL | JSON: `{ "streaming": true, "mcpClient": true, "structuredOutput": true, "resume": true }` |
| Status | nvarchar(20) | `Active` / `Inactive` (CHECK constraint) |

### 4.3 Agent configuration (stored in existing config JSON)

```jsonc
{
  "harnessName": "Claude Code",          // lookup into MJ: AI Agent Harnesses
  "sandbox": {
    "provider": "local | docker | remote",
    "image": "ghcr.io/memberjunction/harness-sandbox:latest",  // docker/remote only
    "workspaceMode": "ephemeral | durable",  // durable = persisted per agent, qm-style scope
    "mounts": [],
    "networkPolicy": "none | mcp-only | allowlist | open"
  },
  "posture": "strict | auto | dangerous",  // §8
  "mcpLoopback": {
    "toolIncludePatterns": ["Get_*", "RunView_*", "Execute_Send_Email_Action"],
    "toolExcludePatterns": []
  },
  "limits": {                              // defense in depth on top of AIAgent.Max* columns
    "maxTurns": 50,
    "maxWallClockSeconds": 3600
  },
  "promptTemplate": null                   // optional AIPrompt ID rendering payload → harness task prompt
}
```

`ConfigSchema` on the agent type validates this at save time (existing mechanism).

## 5. Runtime components

### 5.1 `HarnessAgentType` (new, in a new package `packages/AI/AgentHarness`)

`@RegisterClass(BaseAgentType, 'HarnessAgentType')`, npm package `@memberjunction/ai-agent-harness`.

Responsibilities:

- `InitializeAgentTypeState` — resolve harness row, adapter, sandbox provider; mint the per-run MCP credential (§7).
- Session execution (mirroring the `RealtimeAgentType` / `executeRealtimeSession` branch in `BaseAgent`): launch the adapter, pump its event stream, translate to run steps and progress callbacks, and produce a terminal `BaseAgentNextStep` of `Success` or `Failed`.
- Teardown — revoke the run credential, finalize the sandbox (destroy if ephemeral, snapshot metadata if durable), even on cancellation (`params.cancellationToken`) or crash.

Cost/token guardrails: usage events from the adapter are written into the same `AIAgentRun` accounting fields the prompt path uses, so `MaxCostPerRun` / `MaxTokensPerRun` / `MaxTimePerRun` enforcement in `BaseAgent.checkExecutionGuardrails` applies to harness runs unchanged.

### 5.2 `IHarnessAdapter`

```typescript
export interface HarnessLaunchContext {
    workspacePath: string;              // sandbox-local path
    taskPrompt: string;                 // rendered from payload + agent prompt template
    mcpServerUrl: string;               // MJ MCP loopback endpoint
    mcpCredential: string;              // per-run scoped API key (or OAuth token)
    model?: string;
    resumeSessionId?: string;           // when AIAgent supports run continuation
    environment: Record<string, string>;
    cancellationToken?: AbortSignal;
}

export type HarnessEvent =
    | { type: 'assistant-text'; text: string }
    | { type: 'tool-call'; toolName: string; input: unknown; harnessCallId: string }
    | { type: 'tool-result'; harnessCallId: string; output: unknown; success: boolean }
    | { type: 'permission-request'; requestId: string; description: string; command?: string }
    | { type: 'usage'; inputTokens: number; outputTokens: number; costUsd?: number }
    | { type: 'session-id'; sessionId: string }
    | { type: 'completed'; result: HarnessResult }
    | { type: 'failed'; error: string };

export interface HarnessResult {
    finalText: string;
    structuredOutput?: unknown;         // candidate final payload
    sessionId?: string;
}

export abstract class BaseHarnessAdapter {
    abstract Launch(context: HarnessLaunchContext): AsyncIterable<HarnessEvent>;
    abstract RespondToPermission(requestId: string, approved: boolean, note?: string): Promise<void>;
    abstract Cancel(): Promise<void>;
}
```

Adapters register via `@RegisterClass(BaseHarnessAdapter, '<DriverClass>')` and resolve through ClassFactory from `AIAgentHarness.DriverClass` — identical to how agents and actions resolve today, so a customer can ship a proprietary adapter without forking core.

### 5.3 Per-vendor adapters (phased)

| Adapter | Mechanism | Notes |
|---|---|---|
| `ClaudeCodeAdapter` | Claude Agent SDK (preferred) or `claude -p --output-format stream-json --mcp-config …` | Richest fit: native MCP client, permission hooks, session resume, structured JSON event stream. Phase 1 reference implementation. |
| `CodexAdapter` | `codex exec --json` | MCP support via config; JSONL event stream. |
| `OpenCodeAdapter` | `opencode run --print-logs --format json` or its server mode | |
| `PiAdapter` | Pi's programmatic/CLI interface | |
| `ClineAdapter` | Cline CLI / headless host | Lands last; interactive-first design makes headless mapping thinner. |
| `StdioJsonAdapter` | Generic: spawn command, speak a documented JSONL event contract | Escape hatch — any harness that can emit the event shapes above works with zero MJ code. |

Vendor SDK dependencies live in per-adapter subpackages (`@memberjunction/ai-agent-harness-claude`, …) so the core harness package stays dependency-light — the same layout as `packages/AI/Providers/*`.

### 5.4 `ISandboxProvider`

```typescript
export interface ISandboxProvider {
    Provision(agentId: string, runId: string, config: SandboxConfig): Promise<SandboxHandle>;
    Finalize(handle: SandboxHandle, outcome: 'success' | 'failure' | 'cancelled'): Promise<void>;
}
```

Phase 1 ships `LocalDirectorySandboxProvider` (a scoped workspace directory + spawned process, `networkPolicy` best-effort) and `DockerSandboxProvider` (containerized, real network policy; builds on the existing `docker/` workbench configurations). `workspaceMode: durable` retains the workspace between runs of the same agent keyed by agent ID — the qm "scope" idea, giving a harness agent persistent working files.

## 6. Execution flow

1. Caller invokes the agent normally — `RunAIAgent` GraphQL mutation, `Run_Agent` MCP tool, `mj ai agents run`, or as a sub-agent step. Nothing about the invocation surface changes.
2. `BaseAgent` creates the `AIAgentRun`, runs `StartingPayloadValidation`, then branches to the harness session path (session-driven agent type).
3. `HarnessAgentType` renders the **task prompt**: agent's prompt template (Nunjucks, existing pipeline) with the starting payload, conversation context, and an appendix documenting the MCP tools available and the required structured-output contract for the final payload.
4. Sandbox is provisioned; adapter launches the harness with the MCP loopback config pointing at MJ's MCP server.
5. Events stream in; each becomes an `AIAgentRunStep` (`tool-call`/`tool-result` pairs collapse into one step record with input/output, matching action-step semantics) and flows to `onProgress`/`onStreaming` → existing PubSub → Explorer's run monitor works unmodified.
6. `permission-request` events follow §8.
7. On `completed`, the adapter's `structuredOutput` becomes the candidate final payload → `FinalPayloadValidation` runs with its existing `Retry`/`Fail`/`Warn` modes. `Retry` re-enters the harness session with validation feedback (using session resume where the harness supports it, otherwise a fresh session with prior context).
8. Teardown: credential revoked, sandbox finalized, run record closed with token/cost totals.

## 7. Security model: MCP loopback with per-run credentials

The harness process never receives DB credentials, MJ API keys, or user tokens. It receives exactly one credential: a **per-run API key** minted at launch and revoked at teardown, created through the existing `@memberjunction/api-keys` engine with:

- **Scopes** derived from the agent's granted surface: `entity:read` / `action:execute` / etc., narrowed by the `mcpLoopback.toolIncludePatterns` config. The MCP server's existing scope evaluation (`agent:*`, `action:*`, `entity:*` hierarchical matching) enforces per-call.
- **Expiry** = `MaxTimePerRun` + grace.
- **Attribution**: calls made with the run key are logged against the run's context user, so row-level security and field permissions apply exactly as if MJ's own loop were calling.

Since external MCP servers can already be folded into MJ as actions via `MCPClientManager.syncActionsForServer`, a harness agent can also be granted third-party MCP tools — but always through MJ's action layer with its permissions, never by handing the harness a second credential.

`networkPolicy: mcp-only` (Docker provider) is the recommended posture for production: the sandbox can reach the MJ MCP endpoint and the harness vendor's LLM API, nothing else.

## 8. Postures and HITL

Three postures, enforced adapter-side where the harness supports permission hooks (Claude Code does) and provider-side as backstop:

| Posture | Behavior |
|---|---|
| `strict` | Every harness tool call that mutates (writes, shell commands, non-read MCP tools) pauses. The adapter surfaces a `permission-request`; `HarnessAgentType` writes an `MJ: AI Agent Requests` row and parks. The existing `RespondToAgentRequest` mutation (and Explorer UI) approves/denies; the answer flows back through `RespondToPermission`. |
| `auto` (default) | Read tools and allowlisted commands proceed; destructive patterns (recursive delete, DDL, credential file access — a predeclared deny/ask list in the harness config) escalate to a request. |
| `dangerous` | No pauses. Requires the invoking user to hold a dedicated permission on the agent (`MJ: AI Agent Permissions`), and is refused when the sandbox `networkPolicy` is `open`. |

This maps qm's Strict/Auto/Dangerous postures onto machinery MJ already has, rather than inventing a parallel approval channel.

## 9. Observability

- `AIAgentRun.Status/StartedAt/CompletedAt/TotalTokensUsed/TotalCost` — populated from `usage` events.
- `AIAgentRunStep` per harness event group, `StepType` reusing existing values where they fit and adding `Harness Tool` (additive CHECK expansion).
- Harness session ID stored on the run (new nullable column `ExternalSessionID` on `MJ: AI Agent Runs` — additive) enabling resume and vendor-side log correlation.
- The existing agent-run diagnostic MCP tools and `mj ai audit agent-run` work on harness runs with zero changes because they read the same tables.

## 10. Package plan

```
packages/AI/AgentHarness/                 @memberjunction/ai-agent-harness
  src/HarnessAgentType.ts                 (BaseAgentType subclass)
  src/BaseHarnessAdapter.ts               (contract + event types)
  src/adapters/StdioJsonAdapter.ts        (generic fallback)
  src/sandbox/{ISandboxProvider,LocalDirectorySandboxProvider,DockerSandboxProvider}.ts
  src/RunCredentialManager.ts             (mint/revoke per-run API keys)
packages/AI/AgentHarness-Claude/          @memberjunction/ai-agent-harness-claude
packages/AI/AgentHarness-Codex/           @memberjunction/ai-agent-harness-codex
... (one thin package per vendor, added as they land)
```

Migration (in `migrations/v5/` or the 6.0 folder current at implementation time): `MJ: AI Agent Harnesses` table, `Harness` agent type row, `ExternalSessionID` column, `Harness Tool` step type — all additive.

## 11. Phasing

| Phase | Scope | Exit criteria |
|---|---|---|
| 1 | `HarnessAgentType`, adapter contract, local sandbox, `ClaudeCodeAdapter`, per-run credentials, strict posture | An MJ agent with Type=Harness completes a task using MJ data via MCP loopback; run fully audited; integration-test bundle green |
| 2 | Docker sandbox + network policy, `auto` posture with deny/ask list, `CodexAdapter`, `StdioJsonAdapter` | Same task passes on both Claude Code and Codex by flipping one metadata field |
| 3 | Durable workspaces, session resume for `FinalPayloadValidation` retries, `OpenCodeAdapter`, `PiAdapter` | |
| 4 | `ClineAdapter`, remote sandbox provider, Explorer authoring UX for harness agents | |

## 12. Open questions

1. **Sub-agent composition** — should a `LoopAgentType` parent be able to delegate to a harness sub-agent? Nothing in the design prevents it (the payload contract is honored), but guardrail budgets need to aggregate across the boundary. Proposal: treat harness cost/tokens as ordinary sub-agent accounting; revisit after phase 1.
2. **Vendor API keys** — harnesses need their own LLM credentials. Proposal: source from `MJ: AI Credential Bindings` and inject as env vars at launch, keeping key custody in MJ. Needs review against the encryption/credentials engine.
3. **Conversation-mode harness agents** — this spec targets task runs (payload in → payload out). Wiring a harness into `RunAgentInConversation` for interactive chat is attractive (Explorer as the front-end for a Claude Code session) but has UX implications; defer to a follow-up spec.
4. **Where does the deny/ask command list live** — per-agent config vs. a shared org-level policy entity. qm's predeclared-command-policy experience suggests org-level with per-agent narrowing.

---

*This spec was informed by an architectural comparison with qm (`yc-software/qm`), whose pluggable-harness core (Pi / OpenCode / Codex / Claude Code behind one interface), per-scope durable sandboxes, and Strict/Auto/Dangerous posture model demonstrated the substrate pattern this design adapts to MJ's metadata-driven, permission-governed architecture.*
