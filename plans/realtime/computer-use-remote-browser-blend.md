# Goal-Driven Browser Control — Blending Computer-Use with the Remote Browser

**Status:** Plan / RFC. To be implemented by a follow-up effort.
**Motivation:** Let a realtime voice agent (or a human) set a *high-level goal* — "log into this site with these
creds", "find the latest invoice and download it" — and have **computer-use** autonomously plan and execute it
against the **remote browser** the human is watching, instead of the realtime agent issuing granular
`click`/`type` commands. Computer-use uses a stronger, independently-selected vision/action model; the realtime
agent stays in its lane (conversation + intent + narration).

This is **~80% wiring**: both autonomous halves already exist; the join point between them is a function that is
defined but currently called nowhere.

---

## 0. What already exists (the two halves + the empty seam)

| Piece | Where | State |
|---|---|---|
| **Autonomous goal loop** — `ComputerUseEngine.Run({ Goal, StartUrl, ControllerModel, JudgeModel, MaxSteps, Tools })`: screenshot → controller-LLM picks actions → execute → judge (done/impossible/feedback) → loop. Own vision/action model + judge. | `@memberjunction/computer-use` (`ComputerUseEngine`), MJ layer `@memberjunction/mj-computer-use` (`MJComputerUseEngine` — routes prompts through `AIPromptRunner`, resolves MJ credentials/actions) | ✅ exists |
| **Shared-browser injection** — `ComputerUseEngine.SetBrowserAdapter(adapter)` accepts a `PlaywrightBrowserAdapter`. | `@memberjunction/computer-use` | ✅ exists |
| **The live browser** — `CdpRemoteBrowserSession` wraps **a `PlaywrightBrowserAdapter`** over the session's CDP endpoint (the same type computer-use drives). Screencast / live-view show that page. | `@memberjunction/remote-browser-cdp` | ✅ exists |
| **Session lifecycle + control arbiter** — `RemoteBrowserEngine` (lazy-start by agent-session id, screencast pipe, modes `AgentOnly`/`ViewOnly`/`Collaborative`, request/grant/yield floor). | `@memberjunction/remote-browser-server` | ✅ exists |
| **Control-strategy resolver** — `resolveControlStrategy(features, preferred?) → 'ComputerUse' \| 'NativeAI'`. | `@memberjunction/remote-browser-base` `control.ts` | ⚠️ **defined, called nowhere** |
| **Native-AI per-backend** — `IRemoteBrowserSession.InvokeNativeAIControl(intent)` (Stagehand `Act`, Hyperbrowser `RunAgentTask`). | base + Browserbase/Hyperbrowser providers | ✅ implemented per-backend, **never invoked** |
| **Granular action path** — `ExecuteRemoteBrowserAction` mutation → `liveSession.ExecuteAction(action)`. | `MJServer/.../RemoteBrowserActionResolver.ts` | ✅ exists (granular only) |
| **Realtime tool dispatch + delegation** — `RealtimeToolBroker.ExecuteToolCall` routes tool calls; `invoke-target-agent` delegates server-side with a per-call `AbortController` (barge-in) + `OnProgress`; extra tools injected via `ExtraTools` at session start. | `@memberjunction/ai-agents` (`realtime-tool-broker.ts`, `realtime-session-runner.ts`, `base-agent.ts`) | ✅ exists |
| **Progress narration** — `IRealtimeSession.SendContextNote(text)` (silent background) + `RequestSpokenUpdate(instructions)` (paced ~8s spoken digest). | `@memberjunction/ai` `baseRealtime.ts` + runner | ✅ exists |
| **Model-blind context injection** — run-level **context/data object**; tool/action params reference it via `{{ path }}` templates resolved **server-side at execution** by `resolveTemplates` / `resolveValueFromContext` / `getValueFromPath`. The model emits the *path/label*, never the *value*. | `@memberjunction/ai-agents` `base-agent.ts` | ✅ exists (this is the credentials mechanism — §4) |
| **Vision-model metadata** — `MJ: AI Models` + `MJ: AI Model Modality` (`Direction='Input'`, modality `Vision`), `PowerRank`. | `@memberjunction/core-entities` + `metadata/ai-models` | ✅ exists |

**The only missing piece is the goal-level execution path that joins computer-use's loop to the remote-browser
session — i.e., the body behind `resolveControlStrategy`.**

---

## 1. Target architecture (one new path through existing layers)

```
Realtime voice agent  ──"log into X using {{creds.username}}/{{creds.password}}"──►
   tool: achieve_browser_goal(goal, url?)        (registered via ExtraTools — no protocol change)
        │
        ▼   RealtimeToolBroker.ExecuteToolCall — NEW route (server-side; AbortSignal + OnProgress)
        ▼
   RemoteBrowserEngine.AchieveGoal(agentSessionID, goal, opts)        ◄── NEW: the strategy switch
        │   resolveControlStrategy(session.Features, opts.preferred):
        │     • 'NativeAI'    → session.InvokeNativeAIControl(goal)               (already per-backend)
        │     • 'ComputerUse' → MJComputerUseEngine
        │                         .SetBrowserAdapter(session.adapter)             ◄── the key handoff
        │                         .Run({ Goal, ControllerModel:<best vision model>, JudgeModel,
        │                                Context, onProgress, Stop:AbortSignal })
        ▼
   computer-use drives the SAME CDP page the human watches (screencast / live-view)
        │   onProgress("opening login…","submitting…") ─► SendContextNote / RequestSpokenUpdate (paced)
        ▼
   DelegatedResult { Success, Output(narration), RunID } ─► voice narrates outcome; run linked for observability
```

**The single most important seam:** handing the remote-browser session's `PlaywrightBrowserAdapter` to
`ComputerUseEngine.SetBrowserAdapter()`. Both live server-side in the same tier; the session already holds the
adapter. Because they share one adapter, "the human watches while computer-use drives" falls out for free, and
**Collaborative** mode's existing arbiter lets the human grab the wheel mid-goal (we pause the loop on takeover — §5).

---

## 2. The strategy switch — `RemoteBrowserEngine.AchieveGoal()` (NEW, small)

```ts
// pseudocode — the body behind the existing resolveControlStrategy
async AchieveGoal(agentSessionID, goal, opts): Promise<AchieveGoalResult> {
    const session = await this.StartSessionForAgentSession(agentSessionID, opts.contextUser, opts.providerName);
    const strategy = resolveControlStrategy(session.Features, opts.preferredStrategy);
    if (strategy === 'NativeAI') {
        return toResult(await session.InvokeNativeAIControl(goal));     // Stagehand / Hyperbrowser
    }
    // ComputerUse (default, works on every backend):
    const engine = new MJComputerUseEngine();
    engine.SetBrowserAdapter(session.GetBrowserAdapter());              // NEW accessor on the CDP session
    return toResult(await engine.Run({
        Goal: goal, ControllerModel: opts.visionModel, JudgeModel: opts.judgeModel,
        Context: opts.context, MaxSteps: opts.maxSteps ?? 30,
        OnProgress: opts.onProgress, /* Stop wired to opts.abortSignal */
    }));
}
```
- Add `GetBrowserAdapter()` (or `RunWithAdapter(fn)`) to `CdpRemoteBrowserSession` so the engine receives the live adapter.
- `ComputerUseEngine` already exposes `Stop()` and `SetBrowserAdapter()`; thread the broker's `AbortSignal` to `Stop()`.

## 3. Realtime tool + delegation + narration (mostly reuse)

- **Tool:** register `achieve_browser_goal(goal: string, url?: string)` as an `ExtraTool` at realtime session
  start (the Whiteboard/remote-browser channel path), so no realtime protocol change.
- **Dispatch:** add a route in `RealtimeToolBroker.ExecuteToolCall` (sibling to `invoke-target-agent`) that calls
  the new `ExecuteRemoteBrowserGoal` resolver / `RemoteBrowserEngine.AchieveGoal`, passing the per-call
  `AbortSignal` and an `OnProgress` callback.
- **Narration:** map `OnProgress` → `SendContextNote` (silent) for fine-grained steps and `RequestSpokenUpdate`
  (paced) for periodic spoken digests — reusing the existing pacing (`NarrationPaceMs`). A goal takes many
  seconds; this keeps the voice channel alive without blocking.
- **Barge-in:** "stop" already aborts the broker's `AbortController` → `ComputerUseEngine.Stop()`.

## 4. Credentials — model-blind via the agent context-variable pattern (REQUIRED)

Secrets must **never** enter the voice transcript, the realtime model, **or the computer-use controller model**
(which plans from screenshots). Use MJ's existing **context-variable injection** pattern:

- The run/session carries a **context object** (e.g. `{ creds: { username, password } }`) supplied out-of-band
  (resolved from the MJ credential system — never spoken/typed by the user into chat).
- The **goal text and any action arguments reference values by label**, e.g.
  `"log in using {{creds.username}} and {{creds.password}}"`. The realtime model only ever sees the labels.
- **Injection happens at the action-execution boundary, not in any prompt.** When the computer-use controller
  emits a `type` action whose text is `{{creds.password}}` (it is just echoing the label it was instructed to
  use), the executor resolves it against the context via `resolveValueFromContext`/`getValueFromPath`
  **immediately before** the keystrokes hit CDP. Neither the realtime model nor the controller model ever holds
  the value.
- **Where it plugs in:** thread a `Context` object into `ComputerUseEngine.Run(...)`, and resolve `{{...}}`
  templates inside action execution (the `MJComputerUseEngine`/adapter `ExecuteAction` path) — mirroring how
  `BaseAgent` resolves templated action params today. Redact resolved values from step records / logs.
- **Net-new:** a small "resolve `{{ctx.path}}` in action args at execution, with redaction" hook in the
  computer-use execution path (the resolver functions themselves are reused from the agents package / re-implemented
  minimally in the base package to avoid an Angular/agent dependency).

> This is the crux: the *label* travels through every model; the *value* only appears at the CDP keystroke.

## 5. Control-mode interplay (NEW coordination)

While computer-use drives, the arbiter floor is `Agent`. In **Collaborative** mode the human may request the
wheel mid-goal: on `GrantControl(→Human)`, **pause** the computer-use loop (`Stop()` or a cooperative pause flag),
let the human act, then resume or re-issue the goal on `YieldControl(→Agent)`. In `AgentOnly`/`ViewOnly` the human
can't grab the wheel, so no pause logic fires. This is the one genuinely new bit of coordination beyond the switch.

## 6. Vision/action model selection

`ComputerUse` should not reuse the realtime model. Select the controller model by metadata: active models with an
**Input modality = `Vision`**, ranked by `PowerRank` (or an explicit per-agent override). Config lives in the
agent's `TypeConfiguration.remoteBrowser` (`controllerModel`, `judgeModel`, `preferredStrategy`,
`maxSteps`). `MJComputerUseEngine` already auto-selects the highest-power LLM when none is set; tighten it to
require the Vision modality.

## 7. Phasing

1. **Strategy switch + adapter handoff (ComputerUse path):** `GetBrowserAdapter()` on the CDP session +
   `RemoteBrowserEngine.AchieveGoal()` running `MJComputerUseEngine` against the live session. Drive it from a
   server-side test/CLI with a hardcoded goal (no realtime yet). *Proves the core blend.*
2. **Credentials context injection (§4)** + redaction. Test "log in" with a credential reference.
3. **Realtime tool + narration + barge-in (§3):** `achieve_browser_goal` ExtraTool, broker route,
   `ExecuteRemoteBrowserGoal` mutation, progress→narration, abort→Stop.
4. **NativeAI path (§2):** wire `InvokeNativeAIControl` for Stagehand/Hyperbrowser backends behind the same switch.
5. **Collaborative pause/resume (§5)** + vision-model selection tightening (§6).
6. **Observability + Explorer surface:** link the delegated run (`RunID`/`ParentRunID`/`AgentSessionID`); show
   goal + step trace in the room UI.

## 8. Net-new vs. reuse

| Net-new (small/focused) | Reuse (exists) |
|---|---|
| `RemoteBrowserEngine.AchieveGoal()` strategy switch | `ComputerUseEngine.Run()` loop + judge, `SetBrowserAdapter()`, `Stop()` |
| `GetBrowserAdapter()` accessor on `CdpRemoteBrowserSession` | `PlaywrightBrowserAdapter`, CDP lifecycle, screencast/live-view |
| `ExecuteRemoteBrowserGoal` resolver + `achieve_browser_goal` ExtraTool + broker route | `RemoteBrowserActionResolver` pattern, `RealtimeToolBroker`, `ExtraTools` |
| `{{ctx.path}}` resolution at action execution + redaction | `resolveValueFromContext`/`getValueFromPath`, MJ context/credential plumbing |
| Collaborative pause/resume; vision-model gate | control modes + arbiter; `AIModel`/`AIModalities` metadata, `AIPromptRunner` |
| progress→narration glue; abort→Stop | `OnProgress`, `SendContextNote`/`RequestSpokenUpdate`, `AbortController` |

## 9. Risks / open questions

- **Two model layers:** the realtime model narrates; the computer-use controller acts. Make sure the controller
  prompt never receives the secret values (only labels) and that step screenshots don't capture typed secrets in
  plaintext fields where avoidable (most password fields mask).
- **Latency/UX:** goals run many seconds; rely on narration + a visible step indicator so the user isn't staring
  at silence. Consider a soft max-duration + "still working…" cadence.
- **Where the engine runs vs. where the session lives:** both server-side in the remote-browser tier — confirm
  `MJComputerUseEngine` can be instantiated in that process and share the session's adapter without a second
  browser connection.
- **NativeAI vs ComputerUse parity:** native backends return a coarse result; computer-use returns a rich step
  trace + judge verdict. Normalize both into one `AchieveGoalResult`.
- **Cost controls:** `MaxSteps`, max duration, and a judge "impossible" early-exit to avoid runaway loops.

## 10. Deliverables

`RemoteBrowserEngine.AchieveGoal` + `GetBrowserAdapter` (+ tests), the context-injection/redaction hook (+ tests),
the `ExecuteRemoteBrowserGoal` resolver + `achieve_browser_goal` tool + broker route, narration/barge-in glue,
Collaborative pause/resume, vision-model selection, and observability wiring. Each phase its own PR; phase 1 lands
and is proven before realtime is layered on.
