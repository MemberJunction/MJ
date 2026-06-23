# @memberjunction/remote-browser-cdp

## 5.42.0

### Minor Changes

- e7c2437: Goal-driven browser control — blend computer-use with the remote browser so a realtime agent (or human) sets a high-level goal ("log into this site and open the latest invoice") and computer-use plans + executes it, instead of issuing granular actions.
  - **`@memberjunction/remote-browser-base`**: `IRemoteBrowserSession.RunComputerUseGoal(goal, options)` + `RemoteBrowserGoalResult` / `RunComputerUseGoalOptions` (with `OnProgress`, `Signal`, `ContextUser`, and `AgentRunID`/`AgentRunStepID` for narration, barge-in, per-user execution, and run-step observability). The `ComputerUse` vs `NativeAI` strategy is resolved by the existing `resolveControlStrategy`.
  - **`@memberjunction/remote-browser-cdp`**: `CdpRemoteBrowserSession.RunComputerUseGoal` drives MJ computer-use against the session's **own** already-attached `PlaywrightBrowserAdapter` (the same instance/CDP connection the human watches — no second browser), behind an injectable `ComputerUseGoalRun` seam (`SetGoalEngineFactory`). **Model-blind credential injection**: a `Context` object's `{{label}}` tokens are substituted with real values in a _cloned_ action at the CDP boundary, so neither the realtime model nor the computer-use controller ever sees the value (the recorded/logged action stays templated).
  - **`@memberjunction/remote-browser-server`**: `RemoteBrowserEngine.AchieveGoal(agentSessionID, goal, opts)` + the pure, testable `dispatchRemoteBrowserGoal()` strategy switch. **Collaborative pause-on-takeover**: a granted human takeover (or session end) aborts the in-flight goal so the computer-use loop pauses cooperatively rather than racing the human on the shared browser.
  - **`@memberjunction/computer-use-engine`**: controller auto-selection now prefers the highest-power LLM that advertises **Image input** modality (vision-capable), falling back to the plain highest-power LLM so selection never hard-fails (`pickHighestPowerVisionLLM`). New `AgentRunStepTracker` nests a child `Prompt` step per controller/judge prompt under the goal's parent step (linking each prompt run via `TargetLogID`), with the per-prompt step writes **fire-and-forget** (queued, flushed once at goal end) so an N-iteration goal pays no synchronous DB round-trips on its hot loop.
  - **`@memberjunction/ai-core-plus`**: new shared, single-source-of-truth step machinery — `initAgentRunStep` / `finalizeAgentRunStep` (field-level create/finalize semantics) AND `AgentRunStepSaveQueue` (the fire-and-forget INSERT/chained-UPDATE/`IgnoreDirtyState`/flush orchestration), reused by both `BaseAgent` and the Computer Use tracker (no copy-paste).
  - **`@memberjunction/ai-agents`**: `BaseAgent` refactored to delegate step field population to the shared helpers AND its save orchestration to the shared `AgentRunStepSaveQueue` (behavior-preserving; full 1348-test suite green).
  - **`@memberjunction/server`**: `ExecuteRemoteBrowserGoal` GraphQL mutation **+ production binding** — `MJProgressComputerUseEngine` (MJ prompt-runner routing, vision-model auto-selection, media persistence, progress narration) is bound to the CDP goal-engine seam at startup via `BindRemoteBrowserGoalEngine`. **Run-step observability**: the resolver creates one parent "Browser goal" `Tool` step on the realtime co-agent run (`beginBrowserGoalStep`) and threads it down so the goal's prompt runs nest under it.
  - **`@memberjunction/ng-conversations`**: `browser_AchieveGoal` realtime tool + channel route to the goal mutation.

  77 new unit tests (cdp 22, remote-browser-server 7, computer-use-engine 15, ai-core-plus 16 step helpers + save-queue, @memberjunction/server 15 goal-engine glue, ai-agents 2 createStepEntity nesting/target/InputData paths) plus the full 1350-test ai-agents suite green after the behavior-preserving refactor. Credentials use MJ's model-blind context-variable injection. No migrations. Live browser + LLM validation is the only step deferred — see `plans/realtime/computer-use-remote-browser-blend.md`.

### Patch Changes

- 3080b58: Computer Use goal loop now defaults to the stored metadata prompts + their model selection, and the prompt text is single-sourced across both layers.
  - **Default flip:** `MJComputerUseEngine.Run` defaults the controller + judge to the stored `Computer Use - Controller` / `Computer Use - Judge` metadata prompts (via new `DEFAULT_CONTROLLER_PROMPT_NAME` / `DEFAULT_JUDGE_PROMPT_NAME`) when the caller pins neither a prompt nor a model — routing through `AIPromptRunner` with the prompt's configured models (default Gemini 3.1 Flash-Lite → Gemini 3.5 Flash → Claude Haiku 4.5 → GPT 5.5, each on two vendors for failover). Resolution order: explicit override → stored default prompt → `autoSelectControllerModel()` (non-throwing fallback, so standalone/no-metadata callers degrade cleanly). Model choice is now a metadata edit, not code.
  - **Single source of truth:** the behavioral core of the controller/judge prompts lives once in `metadata/prompts/templates/computer-use/_includes/*.md`, pulled into the Layer-2 metadata templates via the push-time `{@include}` directive and generated into the Layer-1 standalone fallback (`@memberjunction/computer-use`) by a `prebuild` (`scripts/generate-prompt-parts.mjs` → `prompt-parts.generated.ts`). A drift-guard test asserts both layers stay in sync.
  - READMEs (computer-use-engine, computer-use, remote-browser-cdp/server) and `REMOTE_BROWSER_GUIDE.md` §9e updated.

- e4235fd: Add clipboard paste-in and copy-out to the remote-browser human-control (Self-Hosted Chrome canvas viewer), which previously couldn't bridge the local and remote clipboards.
  - **Paste-in:** a new `'text'` `RemoteBrowserHumanInput` kind, mapped (CDP) to the existing text-insertion path (`TypeAction` / `Input.insertText`) — no clipboard sync needed. The viewer captures the local `paste`, reads `clipboardData`, and relays the text to the remote page's focused element.
  - **Copy-out:** a new capability-gated `IRemoteBrowserSession.GetSelectionText()` (CDP `page.evaluate(window.getSelection())`) + a `GetRemoteBrowserSelection` GraphQL query; the viewer captures the local `copy`, fetches the remote selection, and writes it to the local clipboard via `navigator.clipboard.writeText` (best-effort, gated on `HumanTakeover`).

  Lets a human controlling the remote browser paste credentials in and copy text out. Tests added for the `'text'` mapping, `GetSelectionText`, and the channel relay.

- Updated dependencies [9b9b484]
- Updated dependencies [3080b58]
- Updated dependencies [e7c2437]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
- Updated dependencies [e4235fd]
  - @memberjunction/core@5.42.0
  - @memberjunction/computer-use@5.42.0
  - @memberjunction/remote-browser-base@5.42.0
  - @memberjunction/global@5.42.0

## 5.41.0

### Minor Changes

- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/computer-use@5.41.0
  - @memberjunction/remote-browser-base@5.41.0
  - @memberjunction/global@5.41.0
