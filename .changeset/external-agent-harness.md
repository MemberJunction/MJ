---
"@memberjunction/ai-agent-harness": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-agents": patch
---

External agent harnesses as a new MJ agent type — plus a cost-guardrail fix that affects every agent

An MJ agent can now be executed by an **external agent harness** (Claude Code, Codex CLI, OpenCode,
Gemini CLI, Pi) running in a sandbox, while MemberJunction keeps identity, permissions, governed data
access, payload contracts, HITL, cost control and run-level audit.

**A harness turn is protocol-identical to a Loop iteration.** The harness reasons freely inside its
sandbox, then ends its turn by emitting the same next-step JSON envelope a Loop model emits. MJ
executes any actions, sub-agents or skills through its own validated machinery and resumes the
session with the results. That is why every existing guarantee — next-step validation, per-action
`MaxExecutionsPerRun`, skill gates, plan-mode blocking, `PayloadManager` ACLs,
`checkExecutionGuardrails`, run-step recording — applies with no new enforcement code, and why there
is one authority channel to audit rather than two. `HarnessAgentBase` overrides exactly one method,
`executePrompt`.

New schema, all additive: `MJ: AI Agent Harnesses` (the registry of launchable harnesses),
`MJ: AI Agent Credentials` (the grant edge for secrets an agent carries into its sandbox — custody
stays in `MJ: Credentials`), and `AIAgentRun.ExternalSessionID`. `CapabilitySettings` is a
strongly-typed JSONType declaring what each adapter **actually implements**, because the runtime
*emulates what is missing* — an over-claim is a silent behavioural gap, not an error.

**Also fixes `MaxCostPerRun` / `MaxTokensPerRun` for every agent type, not just harness agents.**
The limits are static on the agent and were compared correctly, but the run's accumulated
`TotalCost` / `TotalTokensUsed` were only written on terminal paths — so mid-run they sat at 0 and
the checks short-circuited on a falsy zero. The ceilings were evaluated as a run *ended*: reporting,
not guardrails. A runaway agent burned its whole budget and was told afterwards. Only the iteration
and time limits actually interrupted a run. The totals are now refreshed before the comparison, with
regression coverage verified to fail without the fix.

Sandboxes: the **provider owns process placement**, delivered to adapters as a `SandboxExecutor`, so
the same adapter runs on a laptop or inside a per-run container without knowing the difference. The
local provider scopes a workspace directory but does **not** contain the process — `networkPolicy` is
advisory there, which is documented rather than implied. `DockerSandboxProvider` enforces
`networkPolicy: 'none'` for real.

Known gaps, documented in the guide so nobody designs around a guarantee that does not exist:
`PermissionHooks` is false on every adapter (the `strict` posture needs an MCP permission-prompt tool
that is a later phase), `mcp-only`/`allowlist` are not packet-enforced, the MCP loopback is not yet
wired, and `ModelID` uses the declared rather than the harness-reported model.

Ships **not live**: every harness row is `Inactive` and `Demo Harness Agent` is `Pending`, because
they depend on external binaries a fresh install will not have.

See [`guides/AGENT_HARNESS_GUIDE.md`](../guides/AGENT_HARNESS_GUIDE.md).
