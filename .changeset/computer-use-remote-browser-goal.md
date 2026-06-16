---
'@memberjunction/remote-browser-base': minor
'@memberjunction/remote-browser-cdp': minor
'@memberjunction/remote-browser-server': minor
'@memberjunction/computer-use-engine': minor
'@memberjunction/ai-core-plus': minor
'@memberjunction/server': minor
'@memberjunction/ng-conversations': minor
'@memberjunction/ai-agents': patch
---

Goal-driven browser control — blend computer-use with the remote browser so a realtime agent (or human) sets a high-level goal ("log into this site and open the latest invoice") and computer-use plans + executes it, instead of issuing granular actions.

- **`@memberjunction/remote-browser-base`**: `IRemoteBrowserSession.RunComputerUseGoal(goal, options)` + `RemoteBrowserGoalResult` / `RunComputerUseGoalOptions` (with `OnProgress`, `Signal`, `ContextUser`, and `AgentRunID`/`AgentRunStepID` for narration, barge-in, per-user execution, and run-step observability). The `ComputerUse` vs `NativeAI` strategy is resolved by the existing `resolveControlStrategy`.
- **`@memberjunction/remote-browser-cdp`**: `CdpRemoteBrowserSession.RunComputerUseGoal` drives MJ computer-use against the session's **own** already-attached `PlaywrightBrowserAdapter` (the same instance/CDP connection the human watches — no second browser), behind an injectable `ComputerUseGoalRun` seam (`SetGoalEngineFactory`). **Model-blind credential injection**: a `Context` object's `{{label}}` tokens are substituted with real values in a *cloned* action at the CDP boundary, so neither the realtime model nor the computer-use controller ever sees the value (the recorded/logged action stays templated).
- **`@memberjunction/remote-browser-server`**: `RemoteBrowserEngine.AchieveGoal(agentSessionID, goal, opts)` + the pure, testable `dispatchRemoteBrowserGoal()` strategy switch. **Collaborative pause-on-takeover**: a granted human takeover (or session end) aborts the in-flight goal so the computer-use loop pauses cooperatively rather than racing the human on the shared browser.
- **`@memberjunction/computer-use-engine`**: controller auto-selection now prefers the highest-power LLM that advertises **Image input** modality (vision-capable), falling back to the plain highest-power LLM so selection never hard-fails (`pickHighestPowerVisionLLM`). New `AgentRunStepTracker` nests a child `Prompt` step per controller/judge prompt under the goal's parent step (linking each prompt run via `TargetLogID`).
- **`@memberjunction/ai-core-plus`**: new shared, single-source-of-truth step helpers `initAgentRunStep` / `finalizeAgentRunStep` — the field-level create/finalize semantics for `MJ: AI Agent Run Steps`, reused by both `BaseAgent` and the Computer Use tracker (no copy-paste).
- **`@memberjunction/ai-agents`**: `BaseAgent.createStepEntity`/`finalizeStepEntity` refactored to delegate field population to the shared helpers (behavior-preserving; keeps its own save orchestration).
- **`@memberjunction/server`**: `ExecuteRemoteBrowserGoal` GraphQL mutation **+ production binding** — `MJProgressComputerUseEngine` (MJ prompt-runner routing, vision-model auto-selection, media persistence, progress narration) is bound to the CDP goal-engine seam at startup via `BindRemoteBrowserGoalEngine`. **Run-step observability**: the resolver creates one parent "Browser goal" `Tool` step on the realtime co-agent run (`beginBrowserGoalStep`) and threads it down so the goal's prompt runs nest under it.
- **`@memberjunction/ng-conversations`**: `browser_AchieveGoal` realtime tool + channel route to the goal mutation.

68 new unit tests (cdp 22, remote-browser-server 7, computer-use-engine 14, ai-core-plus 10 step-helpers, @memberjunction/server 15 goal-engine glue) plus the full 1348-test ai-agents suite green after the behavior-preserving refactor. Credentials use MJ's model-blind context-variable injection. No migrations. Live browser + LLM validation is the only step deferred — see `plans/realtime/computer-use-remote-browser-blend.md`.
