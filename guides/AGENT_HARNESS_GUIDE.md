# External Agent Harness Guide

**Read this before implementing, configuring, or reviewing anything that runs an MJ agent on an
external harness.**

An *agent harness* is an external agent runtime with its own reasoning loop and tool sandbox —
Claude Code, Codex CLI, OpenCode, Gemini CLI, Pi. This guide covers how MJ runs one as the reasoning
substrate for an MJ agent, and — more importantly — **which guarantees survive that substitution and
which do not**.

- **Package**: [`@memberjunction/ai-agent-harness`](../packages/AI/AgentHarness/README.md)
- **Design plan**: [`plans/external-agent-harness.md`](../plans/external-agent-harness.md)
- **Related**: [Agent Framework Comparison](AGENT_FRAMEWORK_COMPARISON.md) · [Unified Permissions](UNIFIED_PERMISSIONS_GUIDE.md)

---

## 1. The one idea that makes this work

**A harness turn is protocol-identical to a Loop agent's prompt iteration.**

`BaseAgent` runs iterate → decide → execute-steps → iterate, where the "decide" input is a prompt
execution. The Harness type substitutes a harness turn for that prompt call and changes nothing else.

The harness ends each turn by emitting the **same next-step JSON envelope** a Loop model emits. MJ
then executes any actions, sub-agents or skills through its **own** validated machinery and resumes
the harness with the results.

Why that matters, concretely: `validateActionsNextStep`, `validateSubAgentNextStep`, per-action
`MaxExecutionsPerRun`, skill activation gates, plan-mode blocking, `PayloadManager` path ACLs,
`checkExecutionGuardrails`, run-step recording — **all of it applies to harness agents with no new
enforcement code**, and there is exactly one authority channel to audit rather than two.

The alternative design — letting the harness call MJ through MCP for everything — would have created
a second authority path with its own authorization story and its own accounting. That is why MCP
loopback is **read-only**.

```
   ┌─ BaseAgent loop (unchanged) ──────────────────────────────────┐
   │   executePrompt() ──► [ HarnessAgentBase override ]           │
   │        │                 ├─ adapter.RunTurn(input)            │
   │        │                 ├─ accumulate usage                  │
   │        │                 └─ write AIPromptRun                 │
   │        ▼                                                      │
   │   DetermineNextStep   (inherited from LoopAgentType)          │
   │        ▼                                                      │
   │   validate ─► execute actions / sub-agents / skills           │
   │        ▼                                                      │
   │   checkExecutionGuardrails ─► next turn                       │
   └───────────────────────────────────────────────────────────────┘
```

---

## 2. Setting one up

### Step 1 — make the harness available

Flip a row in `MJ: AI Agent Harnesses` to `Active`. **All rows ship `Inactive`**, because they
depend on external binaries that must be installed and authenticated on whatever host or sandbox
image will run them. A fresh install should not advertise harnesses it cannot launch.

Set `ExecutablePath` if the binary is not on `PATH`. For **Pi this is mandatory** — it publishes no
usable npm package.

### Step 2 — point an agent at it

Set the agent's `TypeID` to `Harness` and its `TypeConfiguration`:

```jsonc
{
  "harnessName": "Claude Code",       // must match a row Name exactly — it is a lookup key
  "sandbox": {
    "provider": "local",              // local | docker
    "workspaceScope": "agent-user",   // run | agent | agent-user
    "networkPolicy": "mcp-only"
  }
}
```

### Step 3 — get a credential to it

See §5. In dev, the vendor-key fallback often means you need to do nothing.

### Step 4 — set cost limits

`MaxCostPerRun`, `MaxIterationsPerRun`, `MaxTimePerRun`. These matter more here than anywhere else in
MJ — a harness is designed for long autonomous runs against a vendor key you injected into a sandbox.
See `Demo Harness Agent` for sane starting values.

---

## 3. Capabilities: the runtime emulates what is missing

`AIAgentHarness.CapabilitySettings` (typed `IHarnessCapabilitySettings`) declares what an **adapter
actually implements** — not what the vendor advertises.

| Flag | If false, the runtime… |
|---|---|
| `SessionResume` | replays accumulated context every turn — token cost grows with turn count |
| `StructuredOutput` | leans on malformed-response retries to coax the envelope out |
| `UsageReporting` | **cannot account for the run** — cost guardrails go blind |
| `PermissionHooks` | cannot enforce `strict` posture adapter-side |
| `McpClient` | cannot read MJ data mid-turn (turn-end actions still work) |
| `ModelSelection` | treats the configured model as advisory |

> 🚨 **Over-claiming a capability produces a silent behavioural gap, not an error.** If an adapter
> reports `PermissionHooks: true` without implementing interception, mutating operations pass through
> unreviewed while the posture believes it is gating them. Report `false` and let the runtime
> compensate.

Gemini CLI is the honest example: it reports `SessionResume: false`, so context is replayed and those
extra tokens are budgeted against the run's guardrails instead of quietly absorbed.

---

## 4. Sandboxes and deployment

**Adapters never call `spawn`.** They run everything through `SandboxExecutor`, obtained from the
handle the provider returns. Process placement is the provider's decision.

| Provider | Execution | Isolation | Use |
|---|---|---|---|
| `LocalDirectorySandboxProvider` | direct spawn | **none** | dev only |
| `DockerSandboxProvider` | `docker exec`, container per run | real FS boundary | shared / prod |

> ⚠️ The local provider scopes a **directory**, not a **process**. `networkPolicy` is advisory there.
> Believing `'none'` is enforced locally is worse than knowing the boundary is soft.

### Cloud

**Do not bake harness binaries into the MJAPI image.** A harness inside the API container inherits
that container's network reach and IAM role — the wrong blast radius for a process running an
autonomous agent's shell commands.

Ladder: dedicated **sandbox image** (versioned separately from MJAPI) → Docker provider, container
per run → ECS/Fargate `RunTask` or Azure Container Instances for multi-tenant scale.

`networkPolicy: 'mcp-only'` only becomes truthful at the container stage.

### `WorkspacePath` means "as the harness sees it"

A host path under the local provider; a **container-internal** path under Docker. Pass it to harness
processes. Do **not** open it with `fs` unless you know you are local.

---

## 5. Credentials

**Secrets travel as process environment, never as prompt text.** Everything resolved becomes the
harness *process's* environment, so a credential never enters the model's context and cannot be
echoed back, logged as conversation, or persisted to a run step. It lives exactly as long as the
process does.

Resolution order — mirroring how MJ's AI layer already resolves vendor keys, so operators do not
learn a second scheme:

1. **`MJ: AI Agent Credentials`** grants for this agent, read from `MJ: Credentials`. Governed:
   auditable, revocable, per-agent.
2. **`process.env[EnvVariableName]`** — the server's own value for the variable the grant names.
3. **`AI_VENDOR_API_KEY__<DRIVERCLASS>`** when the agent has no grants at all — the zero-config path.

Preferring credentials matters: env vars are process-wide, so falling back means the agent gets
whatever the *server* holds rather than only what it was *granted*. Fine for dev and single-tenant.
**Multi-tenant deployments should grant explicitly.** The fallback is logged, not silent.

`MJ: AI Agent Credentials` is the **grant edge** only — custody stays in `MJ: Credentials` /
`CredentialEngine`. It is distinct from `MJ: AI Credential Bindings`, which is inference-selection
plumbing for `AIPromptRunner` failover when *MJ itself* executes a prompt.

---

## 6. Accounting — why every turn writes an `AIPromptRun`

Run totals are **derived**: `calculateTokenStats` sums `AIAgentRunStep.PromptRun` rollups. A turn that
records no prompt run contributes nothing, so the run reports **zero tokens and zero cost forever** —
and its cost ceiling has nothing to compare against.

`AIPromptRun.PromptID`, `.ModelID`, `.VendorID` are all NOT NULL. Each resolves to a **real** catalog
row rather than a placeholder:

| Column | Resolves to | Why it is not a fiction |
|---|---|---|
| `PromptID` | the Harness agent type's system prompt | that template really did produce the turn |
| `VendorID` | `AIAgentHarness.AIVendorID` | Claude Code really does call Anthropic |
| `ModelID` | `AIAgentHarness.AIModelID` | the harness really does run that model |

If none resolves, the runtime **fails loudly** rather than skipping the row. A silent skip is exactly
how a cost ceiling stops protecting anything.

---

## 7. The audit boundary — an intentional limit

MJ records what **crosses the boundary**: MCP loopback reads and the turn-end step. Activity *inside*
the sandbox — file edits, shell commands — streams to `onProgress` for live view but is **not**
persisted as run steps.

This "opaque super-step" granularity is **by design**, not an oversight. In-sandbox behaviour is
governed by posture policy; run steps record decisions that crossed into MJ's authority. Widening it
is a design change to be argued for, not a bug to be fixed.

Practical consequence: `AIAgentRun.ExternalSessionID` exists so you can correlate an MJ run with the
vendor's own session logs when you need to see what happened inside.

---

## 8. Adding a harness

1. Subclass `BaseCliHarnessAdapter` — supply `BuildTurnArgs` and `MapEvent`. Process management,
   line framing and lifecycle are inherited.
2. `@RegisterClass(BaseHarnessAdapter, 'MyAdapter')`.
3. Add a row to `MJ: AI Agent Harnesses` with `DriverClass: 'MyAdapter'`.

No core changes. If the harness already speaks a documented JSON contract, `StdioJsonAdapter` handles
it with **no code at all** — see its class doc for the vocabulary.

Adapters are unit-testable with a fake `SandboxExecutor` replaying canned JSONL — no binary, no
container, no network. See `src/__tests__/cli-adapter-executor.test.ts`.

---

## 9. Known gaps

Stated plainly so nobody designs around a guarantee that does not exist yet:

- **`PermissionHooks: false` everywhere.** The `strict` posture needs an MCP permission-prompt tool
  that does not exist. Until it does, strict cannot be enforced adapter-side.
- **`networkPolicy` `mcp-only` / `allowlist` are not packet-enforced** under Docker. Only `'none'` is.
- **MCP loopback is not wired.** `HarnessSessionConfig` carries the fields; the server and per-run
  scoped credential are still to come. Harness agents can *act* (turn-end actions and sub-agents) but
  cannot *read* MJ data mid-turn.
- **`ModelID` uses the declared model**, not the one the harness reported for the turn.

---

## 10. Why there is no SDK adapter

An adapter built on the Claude Agent SDK was **deliberately removed**. The SDK offers a programmatic
permission callback and in-process MCP tools — genuinely useful — but it runs **in-process in Node**,
so no sandbox executor can place it inside a container.

That trade does not survive scrutiny: better permission *hooks* at the cost of any process
*isolation*, for a feature whose purpose is running an autonomous agent's shell commands. And an
SDK-backed agent configured `provider: 'docker'` would run outside its sandbox while the config
claimed otherwise.

The asymmetry decided it: **the CLI's missing permission hook is fixable; the SDK's missing
containment is not.**

Two findings removed the remaining arguments: the typing advantage was largely illusory (its message
union is too broad to narrow against, so the adapter read fields structurally anyway), and the SDK is
not dependency-free — it ships a ~259 MB platform-specific `claude` binary, wrapping the same program
the CLI adapter invokes.
