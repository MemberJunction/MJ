---
'@memberjunction/remote-browser-base': minor
'@memberjunction/remote-browser-cdp': minor
'@memberjunction/remote-browser-server': minor
'@memberjunction/computer-use-engine': minor
'@memberjunction/server': minor
'@memberjunction/ng-conversations': minor
---

Goal-driven browser control — blend computer-use with the remote browser so a realtime agent (or human) sets a high-level goal ("log into this site and open the latest invoice") and computer-use plans + executes it, instead of issuing granular actions.

- **`@memberjunction/remote-browser-base`**: `IRemoteBrowserSession.RunComputerUseGoal(goal, options)` + `RemoteBrowserGoalResult` / `RunComputerUseGoalOptions` (with `OnProgress`, `Signal`, and `ContextUser` for narration, barge-in, and per-user prompt execution). The `ComputerUse` vs `NativeAI` strategy is resolved by the existing `resolveControlStrategy`.
- **`@memberjunction/remote-browser-cdp`**: `CdpRemoteBrowserSession.RunComputerUseGoal` drives MJ computer-use against the session's **own** already-attached `PlaywrightBrowserAdapter` (the same instance/CDP connection the human watches — no second browser), behind an injectable `ComputerUseGoalRun` seam (`SetGoalEngineFactory`). **Model-blind credential injection**: a `Context` object's `{{label}}` tokens are substituted with real values in a *cloned* action at the CDP boundary, so neither the realtime model nor the computer-use controller ever sees the value (the recorded/logged action stays templated).
- **`@memberjunction/remote-browser-server`**: `RemoteBrowserEngine.AchieveGoal(agentSessionID, goal, opts)` + the pure, testable `dispatchRemoteBrowserGoal()` strategy switch. **Collaborative pause-on-takeover**: a granted human takeover (or session end) aborts the in-flight goal so the computer-use loop pauses cooperatively rather than racing the human on the shared browser.
- **`@memberjunction/computer-use-engine`**: controller auto-selection now prefers the highest-power LLM that advertises **Image input** modality (vision-capable), falling back to the plain highest-power LLM so selection never hard-fails.
- **`@memberjunction/server`**: `ExecuteRemoteBrowserGoal` GraphQL mutation **+ production binding** — `MJProgressComputerUseEngine` (MJ prompt-runner routing, vision-model auto-selection, media persistence, progress narration) is bound to the CDP goal-engine seam at startup.
- **`@memberjunction/ng-conversations`**: `browser_AchieveGoal` realtime tool + channel route to the goal mutation.

23 new unit tests (cdp 16, server 7). Credentials use MJ's model-blind context-variable injection. No migrations. Live browser + LLM validation is the only step deferred — see `plans/realtime/computer-use-remote-browser-blend.md`.
