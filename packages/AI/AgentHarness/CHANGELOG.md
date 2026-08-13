# @memberjunction/ai-agent-harness

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [9fc0e2d]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/ai-agents@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/templates@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: External agent harnesses as a new MJ agent type — plus a cost-guardrail fix that affects every agent

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
  _emulates what is missing_ — an over-claim is a silent behavioural gap, not an error.

  **Also fixes `MaxCostPerRun` / `MaxTokensPerRun` for every agent type, not just harness agents.**
  The limits are static on the agent and were compared correctly, but the run's accumulated
  `TotalCost` / `TotalTokensUsed` were only written on terminal paths — so mid-run they sat at 0 and
  the checks short-circuited on a falsy zero. The ceilings were evaluated as a run _ended_: reporting,
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

### Patch Changes

- 394d276: Harness permissions: make policy enforcement a declared capability, and stop trusting prefix-matched command patterns

  MJ's harness permission policy was already abstract — declared in agent metadata, overridable at runtime, translated per-harness through `BaseHarnessAdapter.ApplyPermissionPolicy`. But only `ClaudeCodeCliAdapter` overrode that seam. The other four adapters inherited the inert base default, so a configured `strict` posture was **silently ignored**, and the runtime's warning checked `PermissionHooks` — a different question — so it never fired.

  **New `IHarnessCapabilitySettings.PermissionPolicy`** declares that an adapter actually translates the policy into flags the harness honours. Deliberately separate from `PermissionHooks`, which is about _interactive_ mid-turn approval: Claude Code enforces a static policy while having no hook to pause on, and conflating the two is precisely what hid this. `HarnessAgentBase` now logs an error when a policy is configured against an adapter reporting `false`, so an operator is never left believing something is gated. It warns rather than refusing — an unenforced policy on a properly-provisioned sandbox is still contained by the sandbox, and failing the run would take every unverified adapter offline.

  **Pi now enforces**, using flags verified against a real install (`--tools` / `--exclude-tools`): `strict` → `read,grep,find`; `auto` → additionally `edit,write` but no shell (the `acceptEdits` analogue); `dangerous` → no flag at all. Because Pi gates on **exact tool names**, `strict` is genuinely enforceable there, unlike on Claude Code where it degrades to prompts that have nowhere to go headlessly. MJ's tool vocabulary is translated to Pi's (`Glob`→`find`, `Bash`→`bash`) by the adapter, so a policy is authored once regardless of harness.

  Pi cannot express command-scoped patterns like `Bash(git:*)`, and those **fail closed in both directions**: a command-scoped _allow_ is dropped, because granting the whole tool would hand over strictly more authority than the policy asked for; a command-scoped _deny_ is widened to the whole tool, because denying more than asked is the safe direction.

  Codex, Gemini CLI, OpenCode and the generic stdio adapter declare `PermissionPolicy: false`. Their CLIs' permission flags could not be verified against a real install, and guessing them produces exactly the failure this capability exists to surface — a policy that looks applied and is not.

  **Claude Code's Bash patterns are PREFIX-LITERAL, and that is now documented as a rule rather than a caveat.** Proven live: a `Bash(git:*)` allow paired with a `Bash(git commit:*)` deny let `git -C <path> commit` execute, because any flag before the subcommand defeats the prefix. The run failed only because nothing happened to be staged. So: deny whole tool names — an exact match, no prefix involved — or allow fully-specified commands; never carve dangerous subcommands out of a broad allow. Tool-pattern lists are hygiene, not a security boundary. Real containment comes from the sandbox provider, and the `local` provider offers none.

  The shipped `Demo Harness Agent` follows its own advice: `Read`/`Grep`/`Glob` allowed, `Bash`/`Write`/`Edit`/`NotebookEdit` denied outright.

- 394d276: Harness turns: supply the real response contract, and record inputs/outputs

  Three defects found by running the Demo Harness Agent against Claude Code and asking it "what can you do?" — a one-turn question that took **6 iterations and 152 seconds**.

  **The harness was never shown the response schema.** `HarnessAgentBase` bypasses `AIPromptRunner`, so the agent-type template's `_OUTPUT_EXAMPLE` was never rendered and the harness had to guess. It emitted well-formed JSON with invented step names (`complete`, `respond`, `result`, `undefined`), and `BaseAgent`'s retry feedback taught it the vocabulary one rejection at a time. A model inventing plausible values for a schema it was never shown reads as a sloppy model; it is actually a missing prompt. The turn-end contract now states the real shape explicitly — `taskComplete` for completion, and `nextStep.TYPE` (not `step`) with the actual `Actions | Sub-Agent | Chat | Retry | …` vocabulary — carried directly rather than depending on template rendering.

  **Prompt-step inputs and outputs were blank in the UI.** The synthesized `AIPromptRun` reproduced the accounting fields and dropped the observability ones: `Messages` and `Result` were never set, so every harness prompt step rendered empty while its tokens and cost were correct.

  **Runs reported zero tokens.** `calculateTokenStats` sums the `*Rollup` columns, which were left NULL while only `TokensUsed` was set — a confusing half-truth that looks like a free run rather than an unaccounted one.

  Also corrects `ClaudeCodeCliAdapter.StructuredOutput` to **false**: `--output-format stream-json` structures the transport, not the model's content. Claiming true told the runtime it need not compensate.

  Result on the same prompt: **1 iteration, 9.7s, $0.001056** — down from 6 iterations, 152.8s, $0.029266.

- 394d276: Fix multi-provider and UUID-comparison compliance violations that failed the repo-wide MJGlobal compliance scanners. `HarnessAgentBase` now uses its bound provider (`this.ProviderToUse`) instead of `new Metadata()` and `UUIDsEqual` for the template-ID lookup; the task-graph orchestration integration checks use `ctx.Provider.EntityByName(...)` instead of `new Metadata()`.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-agents@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/templates@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
