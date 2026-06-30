# @memberjunction/computer-use-engine

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/actions@5.43.0
  - @memberjunction/ai-prompts@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/computer-use@5.43.0
  - @memberjunction/aiengine@5.43.0
  - @memberjunction/actions-base@5.43.0
  - @memberjunction/testing-engine@5.43.0

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

- Updated dependencies [256ab06]
- Updated dependencies [c871a4d]
- Updated dependencies [9b9b484]
- Updated dependencies [d185a5c]
- Updated dependencies [3080b58]
- Updated dependencies [e7c2437]
- Updated dependencies [37c73f6]
- Updated dependencies [0c6bf61]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [e4235fd]
- Updated dependencies [da5a3dd]
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/ai-prompts@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/computer-use@5.42.0
  - @memberjunction/actions@5.42.0
  - @memberjunction/aiengine@5.42.0
  - @memberjunction/actions-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/testing-engine@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
- Updated dependencies [4b3fb9d]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/aiengine@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/computer-use@5.41.0
  - @memberjunction/ai-prompts@5.41.0
  - @memberjunction/actions-base@5.41.0
  - @memberjunction/actions@5.41.0
  - @memberjunction/testing-engine@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/testing-engine@5.40.2
- @memberjunction/computer-use@5.40.2
- @memberjunction/ai@5.40.2
- @memberjunction/ai-core-plus@5.40.2
- @memberjunction/aiengine@5.40.2
- @memberjunction/ai-prompts@5.40.2
- @memberjunction/actions-base@5.40.2
- @memberjunction/actions@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/computer-use@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/ai-prompts@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/actions@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/testing-engine@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/computer-use@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-prompts@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/actions@5.40.0
  - @memberjunction/testing-engine@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- f1e52fa: Propagate external Playwright/CDP attach support up through ComputerUse and MJComputerUse. Adds optional `Connect` / `ConnectType` / `ReuseExistingContext` fields to `BrowserConfig`, threads attach mode through both `PlaywrightBrowserAdapter` and `HeadlessBrowserEngine`, and exposes the same three fields on `ComputerUseTestConfig` so test-driver configs can declare attach mode declaratively. Ownership tracking ensures `Close()`/`Shutdown()` never tear down a browser or context the caller owns. All fields are optional — existing callers are unaffected.
- Updated dependencies [26761b8]
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [8c39dd9]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [a2aecc7]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [f1e52fa]
- Updated dependencies [a101a34]
  - @memberjunction/actions@5.39.0
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ai-prompts@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/computer-use@5.39.0
  - @memberjunction/testing-engine@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/actions-base@5.39.0

## 5.38.0

### Patch Changes

- 67d6562: Add full-stack MJ Explorer regression test suite — Docker-based runner with Computer Use engine, parallel workers via HeadlessBrowserEngine, bacpac mode, standalone compose for external use, and `mj test regression init` templates (remote-mj, generic-web, bring-your-own-app, static-file-server). Includes ephemeral workspace guard for cross-test isolation and stabilizes the suite at 25/25.
- 48dc77a: Add full-stack regression test suite for MJ Explorer driven by the Computer Use engine. New `Drag` browser action with smooth multi-step mouse motion, parallel browser worker contexts shared across tests with auto-rotation after 20 uses, JSON-on-disk run comparison via `mj test compare --from-json`, and `--dry-run` / `--parallel` / `--flaky-check` flags on the testing CLI.
- Updated dependencies [6b6c321]
- Updated dependencies [67d6562]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [48dc77a]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/computer-use@5.38.0
  - @memberjunction/testing-engine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ai-prompts@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/actions@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [22b775f]
- Updated dependencies [1af94d0]
- Updated dependencies [4f15f31]
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/actions@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/ai-prompts@5.37.0
  - @memberjunction/testing-engine@5.37.0
  - @memberjunction/computer-use@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/ai-prompts@5.36.0
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/actions@5.36.0
  - @memberjunction/testing-engine@5.36.0
  - @memberjunction/computer-use@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/ai-prompts@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/computer-use@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/actions@5.35.0
  - @memberjunction/testing-engine@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/computer-use@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/ai-prompts@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/actions@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/testing-engine@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/computer-use@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/ai-prompts@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/actions@5.34.0
  - @memberjunction/testing-engine@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
- Updated dependencies [7716c98]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ai-prompts@5.33.0
  - @memberjunction/computer-use@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/actions@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/testing-engine@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/computer-use@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/ai-prompts@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/actions@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/testing-engine@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [84494bb]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/computer-use@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/ai-prompts@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/actions@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/testing-engine@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/computer-use@5.30.1
- @memberjunction/ai@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/ai-prompts@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/actions@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/testing-engine@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/aiengine@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/actions@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/testing-engine@5.30.0
  - @memberjunction/ai-prompts@5.30.0
  - @memberjunction/computer-use@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/computer-use@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/ai-prompts@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/actions@5.29.0
  - @memberjunction/testing-engine@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [fdab4bb]
- Updated dependencies [115e4da]
  - @memberjunction/ai-prompts@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/actions@5.28.0
  - @memberjunction/testing-engine@5.28.0
  - @memberjunction/computer-use@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/computer-use@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/ai-prompts@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/actions@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/testing-engine@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/computer-use@5.27.0
- @memberjunction/ai@5.27.0
- @memberjunction/ai-core-plus@5.27.0
- @memberjunction/aiengine@5.27.0
- @memberjunction/ai-prompts@5.27.0
- @memberjunction/actions-base@5.27.0
- @memberjunction/actions@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/testing-engine@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/testing-engine@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/ai-prompts@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/actions@5.26.0
  - @memberjunction/computer-use@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/actions@5.25.0
  - @memberjunction/computer-use@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/ai-prompts@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/testing-engine@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/ai-prompts@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/testing-engine@5.24.0
  - @memberjunction/aiengine@5.24.0
  - @memberjunction/actions@5.24.0
  - @memberjunction/computer-use@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- c17be20: no migration/metadata
- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
- Updated dependencies [c17be20]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/ai-prompts@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/computer-use@5.23.0
  - @memberjunction/aiengine@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/actions@5.23.0
  - @memberjunction/testing-engine@5.23.0
  - @memberjunction/ai@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/ai-prompts@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/aiengine@5.22.0
  - @memberjunction/actions@5.22.0
  - @memberjunction/testing-engine@5.22.0
  - @memberjunction/computer-use@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/ai@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
- Updated dependencies [845c980]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ai-prompts@5.21.0
  - @memberjunction/aiengine@5.21.0
  - @memberjunction/computer-use@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/actions@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/testing-engine@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/testing-engine@5.20.0
  - @memberjunction/computer-use@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/aiengine@5.20.0
  - @memberjunction/ai-prompts@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/actions@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/testing-engine@5.19.0
- @memberjunction/computer-use@5.19.0
- @memberjunction/ai@5.19.0
- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/aiengine@5.19.0
- @memberjunction/ai-prompts@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/actions@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
- Updated dependencies [48f7296]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ai-prompts@5.18.0
  - @memberjunction/testing-engine@5.18.0
  - @memberjunction/aiengine@5.18.0
  - @memberjunction/actions@5.18.0
  - @memberjunction/computer-use@5.18.0
  - @memberjunction/ai@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/computer-use@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/aiengine@5.17.0
  - @memberjunction/ai-prompts@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/actions@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/testing-engine@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/computer-use@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/aiengine@5.16.0
  - @memberjunction/ai-prompts@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/actions@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/testing-engine@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-prompts@5.15.0
  - @memberjunction/computer-use@5.15.0
  - @memberjunction/aiengine@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/actions@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/testing-engine@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/actions@5.14.0
  - @memberjunction/computer-use@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/aiengine@5.14.0
  - @memberjunction/ai-prompts@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/testing-engine@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/computer-use@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/aiengine@5.13.0
  - @memberjunction/ai-prompts@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/actions@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/testing-engine@5.13.0
  - @memberjunction/ai@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/aiengine@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/computer-use@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/ai-prompts@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/actions@5.12.0
  - @memberjunction/testing-engine@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/computer-use@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/aiengine@5.11.0
  - @memberjunction/ai-prompts@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/actions@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/testing-engine@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/computer-use@5.10.1
- @memberjunction/ai@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/aiengine@5.10.1
- @memberjunction/ai-prompts@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/actions@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/testing-engine@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/computer-use@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/aiengine@5.10.0
  - @memberjunction/ai-prompts@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/actions@5.10.0
  - @memberjunction/testing-engine@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/aiengine@5.9.0
  - @memberjunction/ai-prompts@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/actions@5.9.0
  - @memberjunction/testing-engine@5.9.0
  - @memberjunction/computer-use@5.9.0
  - @memberjunction/ai@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/computer-use@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/aiengine@5.8.0
  - @memberjunction/ai-prompts@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/actions@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/testing-engine@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/ai-prompts@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/computer-use@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/aiengine@5.7.0
  - @memberjunction/actions@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/testing-engine@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/computer-use@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/aiengine@5.6.0
  - @memberjunction/ai-prompts@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/actions@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/testing-engine@5.6.0
  - @memberjunction/ai@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/computer-use@5.5.0
  - @memberjunction/ai@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/aiengine@5.5.0
  - @memberjunction/ai-prompts@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/actions@5.5.0
  - @memberjunction/testing-engine@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/computer-use@5.4.1
- @memberjunction/ai@5.4.1
- @memberjunction/ai-core-plus@5.4.1
- @memberjunction/aiengine@5.4.1
- @memberjunction/ai-prompts@5.4.1
- @memberjunction/actions-base@5.4.1
- @memberjunction/actions@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/testing-engine@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/aiengine@5.4.0
  - @memberjunction/ai-prompts@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/actions@5.4.0
  - @memberjunction/testing-engine@5.4.0
  - @memberjunction/computer-use@5.4.0
  - @memberjunction/ai@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- Updated dependencies [7b23b88]
  - @memberjunction/computer-use@5.3.1
  - @memberjunction/ai@5.3.1
  - @memberjunction/ai-core-plus@5.3.1
  - @memberjunction/aiengine@5.3.1
  - @memberjunction/ai-prompts@5.3.1
  - @memberjunction/actions-base@5.3.1
  - @memberjunction/actions@5.3.1
  - @memberjunction/core@5.3.1
  - @memberjunction/core-entities@5.3.1
  - @memberjunction/global@5.3.1
  - @memberjunction/testing-engine@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/testing-engine@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/aiengine@5.3.0
  - @memberjunction/ai-prompts@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/actions@5.3.0
  - @memberjunction/computer-use@5.3.0
  - @memberjunction/ai@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0
