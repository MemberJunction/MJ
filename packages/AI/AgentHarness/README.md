# @memberjunction/ai-agent-harness

Run an **external agent harness** — Claude Code, Codex CLI, OpenCode, Gemini CLI, Pi — as the
reasoning substrate for a MemberJunction agent, while MJ keeps identity, permissions, governed data
access, payload contracts, HITL, cost control and run-level audit.

> **Design principle: the harness is a substrate, not a peer.** MJ owns the run record, the
> credentials, the tool surface and the approval flow. The harness owns the reasoning inside a turn.

Design plan: [`plans/external-agent-harness.md`](../../../plans/external-agent-harness.md)

---

## The core idea: a harness turn *is* a Loop iteration

`BaseAgent` already runs an iterate → decide → execute-steps → iterate loop where the "decide" input
is a prompt execution. This package substitutes a **harness turn** for that prompt call and changes
nothing else.

```
   ┌─ BaseAgent loop (unchanged) ──────────────────────────────────┐
   │                                                               │
   │   executePrompt() ──► [ HarnessAgentBase override ]           │
   │        │                      │                               │
   │        │                      ├─ adapter.RunTurn(input)       │
   │        │                      ├─ accumulate usage             │
   │        │                      └─ write AIPromptRun            │
   │        ▼                                                      │
   │   DetermineNextStep  (inherited from LoopAgentType)           │
   │        ▼                                                      │
   │   validate ─► execute actions / sub-agents / skills           │
   │        ▼                                                      │
   │   checkExecutionGuardrails ─► next turn                       │
   └───────────────────────────────────────────────────────────────┘
```

The harness ends each turn by emitting the **Loop next-step JSON envelope**. MJ then executes any
actions, sub-agents or skills through its own validated machinery and resumes the session with the
results.

**Why this matters:** every guardrail, payload ACL, HITL gate and accounting path already written for
Loop agents applies to harness agents with no new enforcement code — and there is exactly **one**
authority channel to audit, not two.

---

## Two registrations, one metadata column

ClassFactory registrations are namespaced per base class, so `'HarnessAgentType'` is registered
twice against different roots:

| Registered under | Class | Resolved by | Gives you |
|---|---|---|---|
| `BaseAgentType` | `HarnessAgentType` | `BaseAgentType.GetAgentTypeInstance` | the turn protocol (inherits Loop) |
| `BaseAgent` | `HarnessAgentBase` | `AgentRunner` (`AgentRunner.ts:101`) | the execution driver |

Both read `AIAgentType.DriverClass`, so **one metadata value selects both halves**. This is the
mechanism working as designed — `AgentRunner` already treats the type's `DriverClass` as a
`BaseAgent` key and falls back to plain `BaseAgent` when unregistered, which is why every Loop agent
gets the base execution class today.

---

## Adapters

| Harness | DriverClass | Mechanism | Notes |
|---|---|---|---|
| Claude Code | `ClaudeCodeCliAdapter` | CLI, `stream-json` | Session resume; permission hook pending |
| Codex | `CodexAdapter` | `codex exec --json` | Session resume |
| OpenCode | `OpenCodeAdapter` | `opencode run` JSON | Session resume |
| Gemini CLI | `GeminiCliAdapter` | `gemini --output-format json` | **No** resume — context replayed |
| Pi | `PiAdapter` | stdio-JSON contract | Requires `ExecutablePath` |
| *anything* | `StdioJsonAdapter` | documented JSON contract | Escape hatch — zero MJ code |

Register your own with `@RegisterClass(BaseHarnessAdapter, 'MyAdapter')` and point a harness row's
`DriverClass` at it. No core changes required.

### Capability honesty

`AIAgentHarness.CapabilitySettings` (typed as `IHarnessCapabilitySettings`) declares what an adapter
**actually implements**, because the runtime *emulates what is missing*. Gemini CLI reports
`SessionResume: false`, so context is replayed each turn and those extra tokens are budgeted against
the run's guardrails rather than quietly absorbed.

Claiming a capability that is not wired up produces a silent behavioural gap, not an error. Report
`false` and let the runtime compensate.

---

## Sandboxes: the provider owns process placement

Adapters never call `spawn`. They run everything through `SandboxExecutor`, obtained from the
handle the provider returns.

| Provider | Execution | Isolation |
|---|---|---|
| `LocalDirectorySandboxProvider` | direct spawn | **None** — dev only |
| `DockerSandboxProvider` | `docker exec`, container per run | Real FS boundary; `networkPolicy: 'none'` enforced |

> ⚠️ The local provider scopes a *directory*; it does **not** contain the *process*. `networkPolicy`
> is advisory there. Anyone who believes `'none'` is enforced locally has a false sense of
> containment, which is worse than knowing the boundary is soft.

`HarnessProcess` is deliberately **stream-based**, not `ChildProcess`-based — a Kubernetes exec is
streams over a websocket and a remote runner is HTTP, and neither could honestly implement a
`ChildProcess` contract. It also makes adapters unit-testable with a fake executor: no binary, no
container, no network.

### `WorkspacePath` means "as the harness sees it"

A host path under the local provider; a **container-internal** path under Docker. Pass it to harness
processes — do **not** open it with `fs` unless you know you are on the local provider.

---

## Configuration

Per-agent, in `AIAgent.TypeConfiguration`, validated against `AIAgentType.ConfigSchema`:

```jsonc
{
  "harnessName": "Claude Code",          // lookup into MJ: AI Agent Harnesses
  "sandbox": {
    "provider": "local",                 // local | docker
    "image": "ghcr.io/memberjunction/harness-sandbox:latest",
    "workspaceScope": "agent-user",      // run | agent | agent-user
    "networkPolicy": "mcp-only"
  }
}
```

**Workspace scope** decides how long files live: `run` is discarded, `agent` is shared across every
run of that agent, `agent-user` (default) is per agent per user — continuity without one user's
working files leaking into another's session.

---

## Accounting — why every turn writes an `AIPromptRun`

Run totals are **derived**: `calculateTokenStats` sums `AIAgentRunStep.PromptRun` rollups. A turn
that records no prompt run contributes nothing, so the run reports zero tokens and zero cost
*forever* — and its cost ceiling has nothing to compare against.

`AIPromptRun.PromptID`, `.ModelID` and `.VendorID` are all **NOT NULL**, and each resolves to a
**real** catalog row rather than a placeholder:

| Column | Resolves to | Why it is not a fiction |
|---|---|---|
| `PromptID` | the agent type's system prompt | that template really did produce the turn |
| `VendorID` | `AIAgentHarness.AIVendorID` | Claude Code really does call Anthropic |
| `ModelID` | `AIAgentHarness.AIModelID` | the harness really does run that model |

If none resolves, the runtime **fails loudly** rather than skipping the row. A silent skip is exactly
how a cost ceiling stops protecting anything.

---

## Credentials

`MJ: AI Agent Credentials` records the **grant edge** — which credentials an agent carries into its
sandbox. Custody stays in `MJ: Credentials` / `CredentialEngine`.

Environment injection is the **only** channel by which a secret reaches the harness, and it carries
exactly what was granted — never the MJAPI process environment, never DB credentials, never a user
token.

Distinct from `MJ: AI Credential Bindings`, which is inference-selection plumbing for
`AIPromptRunner` failover when *MJ itself* executes a prompt.

---

## The audit boundary

MJ records what **crosses the boundary**: MCP loopback reads and the turn-end step. Activity *inside*
the sandbox — file edits, shell commands — streams to `onProgress` for live view but is **not**
persisted as run steps.

This "opaque super-step" granularity is **intentional**. In-sandbox behaviour is governed by posture
policy, not by run steps. Widening it is a design change, not a bug fix.

---

## Deployment

| Environment | Provider | Notes |
|---|---|---|
| Local dev | `local` | Fast; uses the dev's own installed CLI and auth |
| Local parity | `docker` | Same path as production |
| AWS / Azure | `docker` → ECS/Fargate or ACI | Sandbox image versioned **separately** from MJAPI |

Do **not** bake harness binaries into the MJAPI image. A harness running inside the API container
inherits that container's network reach and IAM role — the wrong blast radius for a process
executing an autonomous agent's shell commands.

---

## Known gaps

- **`PermissionHooks: false` on every adapter.** The `strict` posture needs an MCP permission-prompt
  tool that does not exist yet. Reported honestly so the runtime cannot assume interception it lacks.
- **`networkPolicy` `mcp-only` / `allowlist` are not enforced at the packet level** under Docker —
  documented as such rather than aliased to `open`.
- **MCP loopback is not yet wired.** `HarnessSessionConfig` carries the fields; the server and
  per-run scoped credential are still to come.
- **`ModelID` uses the declared model**, not the model the harness reported for the turn. The
  refinement belongs in `resolveAccountingIds` once adapters surface it.

## License

ISC
