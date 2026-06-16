---
'@memberjunction/remote-browser-base': minor
'@memberjunction/remote-browser-cdp': minor
'@memberjunction/remote-browser-server': minor
'@memberjunction/server': minor
'@memberjunction/ng-conversations': minor
---

Goal-driven browser control — blend computer-use with the remote browser so a realtime agent (or human) sets a high-level goal ("log into this site and open the latest invoice") and computer-use plans + executes it, instead of issuing granular actions.

- **`@memberjunction/remote-browser-base`**: `IRemoteBrowserSession.RunComputerUseGoal(goal, options)` + `RemoteBrowserGoalResult` / `RunComputerUseGoalOptions` (with `OnProgress` + `Signal` for narration + barge-in). The `ComputerUse` vs `NativeAI` strategy is resolved by the existing `resolveControlStrategy`.
- **`@memberjunction/remote-browser-cdp`**: `CdpRemoteBrowserSession.RunComputerUseGoal` drives MJ computer-use against the session's **own** already-attached `PlaywrightBrowserAdapter` (the same instance/CDP connection the human watches — no second browser), behind an injectable `ComputerUseGoalRun` seam (`SetGoalEngineFactory`; default `ProgressComputerUseEngine` forwards per-step progress; abort → engine `Stop()`). Bind `MJComputerUseEngine` at startup for vision-model auto-selection.
- **`@memberjunction/remote-browser-server`**: `RemoteBrowserEngine.AchieveGoal(agentSessionID, goal, opts)` + the pure, testable `dispatchRemoteBrowserGoal()` strategy switch.
- **`@memberjunction/server`**: `ExecuteRemoteBrowserGoal` GraphQL mutation.
- **`@memberjunction/ng-conversations`**: `browser_AchieveGoal` realtime tool + channel route to the goal mutation.

8 new unit tests (cdp 4 + server 4). Credentials use MJ's model-blind context-variable injection (planned, §4) — see `plans/realtime/computer-use-remote-browser-blend.md`. No migrations.
