# @memberjunction/ai-agent-harness

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [b545842]
- Updated dependencies [24ddecc]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [4840fff]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ai-agents@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/templates@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- 200e634: Round 16 memory-leak audit fixes: bound three previously-unbounded caches and fix a dead process-kill escalation.
  - `RealtimeClientSessionService`'s `sessionWireActionMaps`/`targetWireActionMaps`/`sessionDirectConfigs` and `bridge-room-transcript-sink.ts`'s `roomToConversation`/`writeChains` were plain `Map`s on process-lifetime objects with no session/room-ended hook to evict on — every realtime voice session or meeting room ever handled left a permanent entry. Converted to `MJLruCache` (bounded, TTL'd), mirroring the same file's existing `promptRunWriteChains` pattern.
  - `EntityActionEngineServer.RunEntityAction()` constructed a fresh `EntityActionInvocationBase` on every single dispatch instead of reusing one per invocation type, silently discarding the Script invocation type's own `_scriptCache` before a second lookup could ever hit it. Added an instance cache keyed by `InvocationType.Name`.
  - `ChildProcessExecutor`'s `Kill()` sent only `SIGTERM` with no `SIGKILL` follow-up, on the hot path of every AI-agent CLI turn. Added a `SIGTERM`→5s grace→`SIGKILL` escalation.
  - While testing that escalation, found `WorkerPool.Shutdown()`'s own `SIGTERM`→`SIGKILL` escalation — believed correct since this audit's Round 10 — was dead code: `ChildProcess.killed` is set `true` synchronously once `kill()` sends a signal, not once the process exits, so the old `if (!worker.process.killed)` guard never actually fired `SIGKILL`. Fixed to key off the process's `exit` event instead.

  No behavior changes on any success path; all four packages' full test suites pass with new coverage for each fix.

- Updated dependencies [ca853fc]
- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [672b4c6]
- Updated dependencies [f3c6161]
- Updated dependencies [0e5ad68]
- Updated dependencies [5148534]
- Updated dependencies [50ba290]
- Updated dependencies [ffb3c0f]
- Updated dependencies [0adaf76]
- Updated dependencies [ce1a5c3]
- Updated dependencies [ef43cf3]
- Updated dependencies [b03a928]
- Updated dependencies [b44c7cf]
- Updated dependencies [0d61b53]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [705ab4e]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [f3fa01e]
- Updated dependencies [3276daa]
- Updated dependencies [d0cea53]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [200e634]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [bb33c77]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/ai-agents@6.2.0-edge.2
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/templates@6.2.0-edge.2

## 6.2.0-edge.1

### Minor Changes

- 0eeb89d: **AI usage analytics: a trustworthy cost basis, and the dimensions to slice it by (#4396)**

  Cost reporting was wrong in both directions and could not be sliced by the dimensions anyone
  actually asks about. This settles the basis, gives runs the keys they were missing, and rebuilds
  the reporting layer on top.
  - **Cost doctrine.** `guides/AI_USAGE_AND_COST_ANALYTICS_GUIDE.md` states the rules every consumer
    now follows: the additive basis is own cost at the prompt-run grain, `Cost IS NULL` means
    unpriced and is never coalesced to zero, rollups are derived from the hierarchy at query time and
    never summed from stored inclusive columns, and coverage ships beside every cost figure.
  - **Attribution.** `AIPromptRun` gains `UserID`, written when the run is created. The agent run a
    prompt run belongs to is not stored on it: the agent layer owns that link as
    `AIAgentRunStep.TargetLogID`, now indexed, and the fact view resolves it at query time. Cost
    precision is aligned on `decimal(19,8)` across both run tables, and six analytics indexes are
    added. Sub-agent runs now inherit `CompanyID`.
  - **Parallel execution accounting.** The consolidated parent is created before its arms run, so the
    arms persist as `ParallelChild` rows with their own cost and the parent carries none — previously
    the losing arms were never recorded at all.
  - **Semantic layer.** `vwAIUsageFacts` gives one row per prompt run over the base tables, with
    time buckets, every dimension, and the flags that carry semantics no column expresses
    (`IsPriced`, `IsParallelParent`, `IsUnmeasured`, `SourceKind`).
  - **Aggregates.** Eight saved queries in the `AI` category, every cost figure grouped by currency
    and carried with its priced/unpriced counts. They run live; materializing the hourly and daily
    grains is a follow-up.
  - **Honest dashboards.** The seven analytics surfaces read the aggregates instead of pulling
    unbounded raw rows, unpriced cost renders as an em dash rather than `$0.00`, and coverage is
    shown beside every total.
  - **`mj-query-pivot`.** A generic pivot over any saved Query in `@memberjunction/ng-query-viewer`;
    the AI Usage Explorer is a thin configuration of it. `ColumnLabels` titles columns, and
    `HiddenColumns` lets a host group by an ID it does not display (so two records that share a name
    stay apart while only the name shows).

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [15a4333]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [5da3ad2]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [c261eb8]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
- Updated dependencies [c4993f3]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-agents@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/templates@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [abf8778]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [e3db74f]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/ai-agents@6.2.0-edge.0
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/templates@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

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
- Updated dependencies [634aa8c]
- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [79483bf]
- Updated dependencies [4586215]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [f6a4341]
- Updated dependencies [67e4c9e]
- Updated dependencies [8206993]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [5ecfdb4]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [59def38]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [ada8784]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [11de1a3]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [a723521]
- Updated dependencies [5f33ca8]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [9fc0e2d]
- Updated dependencies [97cbf5f]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [9a29da4]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [c11f8c6]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [29c3dc8]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [394d276]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [d8adda1]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [394d276]
- Updated dependencies [1c0d586]
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/ai-agents@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/templates@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai-agents@6.1.0-edge.7
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/templates@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [f6a4341]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [a723521]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [c11f8c6]
- Updated dependencies [1748491]
- Updated dependencies [0db6105]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ai-agents@6.1.0-edge.6
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/templates@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [79483bf]
- Updated dependencies [22ec804]
- Updated dependencies [8206993]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [5f33ca8]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [29c3dc8]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-agents@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/templates@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-agents@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/templates@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [199eb2b]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai-agents@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/templates@6.1.0-edge.3

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
