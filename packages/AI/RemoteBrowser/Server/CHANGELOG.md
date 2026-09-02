# @memberjunction/remote-browser-server

## 6.1.0-edge.5

### Minor Changes

- 0d1f748: Remote Browser: a dead browser handle now heals instead of poisoning the session (#3598)

  A surface's browser can disappear without the engine being told — an external Chrome closed, a
  backend container recycled, a CDP target lost. `RemoteBrowserEngine` kept the handle in its live map,
  so `StartSessionForAgentSession` handed back the corpse and every later call threw
  `Browser not launched. Call Launch() before using the adapter.` for the rest of the session. Observed
  live: 232 of them in one MJAPI run, with the voice agent saying "the shared browser session isn't
  launched right now" indefinitely while the pane sat frozen on its last good frame.

  `RecoverDeadAgentSession(agentSessionID, error, opts)` discards the dead mapping, launches one
  replacement, and re-attaches the screencast. The caller hands over the error it already caught and
  does not decide what "dead" means — that lives in `IsDeadBrowserHandleError`, a closed list of
  "the browser or its transport is gone". Anything unrecognised is treated as a real answer from a live
  browser and reported exactly as it is today, because the false-positive cost is a healthy browser
  losing its cookies, login and scroll position over a bad selector.

  Re-attaching the view is half the fix, not a nicety: healing the backend alone is worse than the
  original bug, because the client asked for a screencast once at bind time and would keep watching the
  discarded session while the agent truthfully narrated a page the person could not see. The engine now
  remembers each session's frame sink so the replacement can be re-piped to it — and a screencast the
  host deliberately stopped is never resurrected.

  Bounded in both directions: concurrent fault reports (the ~700ms snapshot poll and the next agent
  action both meet the dead handle) coalesce onto one relaunch rather than each launching their own,
  and a surface gets at most `MAX_DEAD_HANDLE_RECOVERIES` (3) before the engine logs that it is giving
  up. A browser that dies on arrival should surface as a visible fault, never as a hang plus a stream
  of orphaned Chromes.

  Both callers that meet a dead handle report it. `RemoteBrowserSnapshot` — the poll that almost always
  discovers the fault first — now reports it instead of only degrading around it, and
  `ExecuteRemoteBrowserAction` reports it too and re-runs the action against the replacement. The action
  path matters on its own: a surface nobody is watching has no poll to discover anything, so wiring only
  the poll would leave exactly the agent-driven case in the issue unhealed. Re-running is safe precisely
  because the handle was dead — the action never reached a browser, so it cannot run twice — and a
  `navigate` therefore heals in place, while a click or a type is told, in words the agent can act on,
  that its browser was replaced and is now on a blank page.

- 6a06c80: Remote Browser: an agent session can now hold more than one browser, named by `instanceKey` (#3531)

  `RemoteBrowserEngine` keyed its agent-session map on the agent session id alone, which made "one
  remote browser per agent session" a framework invariant nothing could opt out of. A second surface's
  lazy start found the first one's mapping and returned it, so both surfaces drove the same Chrome:
  one live view, one screencast, one audio stream, and a `StopScreencast` from either tore down the
  other's. Callers had no way to say which browser they meant, because there was only ever one.

  `StartSessionForAgentSession`, `GetSessionForAgentSession`, `EndSessionForAgentSession` and
  `AchieveGoal` (via `AchieveGoalParams.InstanceKey`) now take an optional `instanceKey` that names a
  browser _within_ the agent session, and the six `RemoteBrowserActionResolver` mutations that address
  a live session — `InterpretRemoteBrowserPage`, `RemoteBrowserSnapshot`, `StopRemoteBrowserScreencast`,
  `StopRemoteBrowserAudioStream`, `RelayRemoteBrowserHumanInput`, `GetRemoteBrowserSelection` — accept
  and forward it.

  **Omitting it is exactly today's behaviour**, and that is load-bearing rather than incidental: the
  key is composed as `agentSessionID` alone when no name is given, so every existing caller keeps
  resolving the single unnamed instance and the pre-existing agent-session tests pass unchanged. An
  empty or whitespace key is the unnamed instance too, so a caller threading an absent value through
  as `''` lands where it did before the argument existed. Keys are trimmed and lowercased — the value
  is typed by hand into a channel config, and `Primary` versus `primary` being two browsers would be a
  spelling trap.

  The composite stays scoped to the agent session (`id::name`), so two concurrent sessions that both
  name their second surface `resume` get their own browsers rather than colliding. Start coalescing —
  the fix that stopped four near-simultaneous callers launching four Chromes — is keyed the same way,
  so it still collapses a race on one instance without collapsing two _different_ surfaces into one.

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/remote-browser-base@6.1.0-edge.5

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
  - @memberjunction/remote-browser-base@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
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
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/remote-browser-base@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/remote-browser-base@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

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
  - @memberjunction/remote-browser-base@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/remote-browser-base@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/remote-browser-base@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/remote-browser-base@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/remote-browser-base@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/remote-browser-base@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/remote-browser-base@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/remote-browser-base@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/remote-browser-base@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ai@5.45.1
- @memberjunction/remote-browser-base@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/remote-browser-base@5.45.0
  - @memberjunction/ai@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/remote-browser-base@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/remote-browser-base@5.43.0

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

- Updated dependencies [9b9b484]
- Updated dependencies [e7c2437]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [e4235fd]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/remote-browser-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Minor Changes

- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

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
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/remote-browser-base@5.41.0
  - @memberjunction/global@5.41.0
