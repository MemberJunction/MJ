# Whiteboard: realtime agents operate the HTML widgets they build

**Status:** Proposed, plan only (no code in this PR)
**Builder:** Ethan. Builds and tests on MJ `next`.
**LXP review:** Jason. Reviews with Ethan before LXP integration.
**Target:** shipped in MJ and integrated into LXP by end of 2026
**Packages:** `@memberjunction/ng-whiteboard`, `@memberjunction/ng-conversations` (whiteboard channel)

---

## 1. The problem

A realtime agent can **build** an HTML widget on the whiteboard (`Whiteboard_AddHtml`) and can **rewrite** it (`Whiteboard_UpdateContent`). Once the widget is running, though, the agent can neither **see** it nor **operate** it:

- It cannot click a button, choose an option, fill a field or call a function inside a live widget.
- It cannot read what the widget currently shows or holds. It finds out what the user did only from two signals: an explicit `MJWhiteboard.submit`, and the throttled ambient-activity notes.
- Its one lever is to rewrite the HTML. That reloads the iframe and throws away whatever the user had done in the widget.

So in a tutoring session the agent cannot say "let me show you" and step through its own explainer. It cannot set a slider to the value it is talking about. And it cannot answer "what did I pick?" unless the user pressed a submit button.

A realtime session proposed an outline: a `postMessage` bus into the widget, `DispatchWidgetAction`, `TriggerWidgetElement`, `QueryWidgetState`, and non-destructive state sync. The direction is right. §9 reviews that outline item by item. This plan is the version to build.

---

## 2. What exists today

All references are to `next` at the time of writing.

| Area | Where | What it does |
|---|---|---|
| Widget rendering | `whiteboard-board.component.html` (`iframe.html-card__frame`) | Each widget is an iframe with `sandbox="allow-scripts"` only, so it runs in an opaque origin. Its `srcdoc` is built by the view-scoped `wbWidgetSrcdoc` pipe (`whiteboard-srcdoc.pipe.ts`). |
| Lazy mount | `whiteboard-board.component.ts:1233` `IsNearViewport` | Only widgets near the viewport get a live iframe. The rest render a placeholder. **When a widget is re-mounted (scrolled back into view, page switch), its internal state resets** (whiteboard `README.md`, "Off-screen widgets"). |
| Injected helper | `whiteboard-widget-bridge.ts`, `WHITEBOARD_SUBMIT_HELPER` | One `<script>` is prepended to every widget, exactly once. It provides `MJWhiteboard.submit`, the ambient recorder (click/change/input/focus, batched, skips password and hidden fields, clips values to 120 chars) and the auto-submit fallback. **It only sends outward.** It never listens for messages from the parent. |
| Host listener | `whiteboard-board.component.ts:1158` `onWindowMessage`, `:1207` `resolveWidgetFromSource` | One window `message` listener. It checks the bridge marker and requires `event.source` to be the `contentWindow` of a tracked widget iframe. Messages that pass come out as `WidgetSubmitting`/`WidgetSubmitted` and `WidgetInteraction`. |
| Agent tools | `whiteboard-tools.ts` | 14 `Whiteboard_*` tools. `ApplyWhiteboardAgentTool(state, name, argsJson): string` is **synchronous** and works on board state only. Nothing reaches into a widget. |
| Host tool entry | `whiteboard-host.component.ts:336` `ApplyAgentTool(): string` | Runs the pure tool, then shows the presence cursor and the toast with Undo. |
| Channel | `ng-conversations` `components/realtime/whiteboard/whiteboard-channel.ts` | `ApplyAgentTool(): string` (`:438`). It forwards `WidgetSubmitted` as a context note followed by `RequestSpokenResponse` (`:334`). It forwards `WidgetInteraction` as a background note, throttled to one per widget every 4 s (`:111`, `:374`). |
| Runtime | `RealtimeRuntime/src/session/RealtimeSessionRuntime.ts:197` | `RealtimeClientToolHandler` returns `string \| Promise<string>`, so async tools already work. **There is no timeout:** a handler that never settles means the model never gets a `tool_response`. Calls are not serialized. |
| Verb proxy | `base-realtime-channel-client.ts:838` `ApplyVerb` | Accepts `string \| Promise<string>` from `ApplyAgentTool`, so new tools reached through the `ContextTool` proxy also work async. |
| What the agent sees | `whiteboard-state.ts:2087` (`compact`, `'html'` case), `whiteboard-export.ts:550` | In the scene delta, an HTML widget is position, size, title and **the first 200 characters of its source**. In video frames it is **a dashed placeholder box**. Nothing describes the widget's live state. |
| Timeout precedent | `realtime-channels/src/lib/angular-component-channel.ts:99, :237, :303, :469` | `VERB_TIMEOUT_MS = 15000`, a serial `verbChain`, `whenSurfaceBound` (5 s) and `runWithTimeout`, which returns a `verb_timeout` failure the model can act on. Copy this shape. |

The standalone web widget (`packages/Web/RealtimeWidget`) has its own small whiteboard channel that renders no HTML widgets. Its voice controller sends tool results **without awaiting them** (`realtime-voice-controller.ts:154`). It is out of scope, but if it ever adopts these tools it needs an `await` there.

---

## 3. Goals and non-goals

**Goals**
1. The agent can **inspect** a live widget: a short outline of its controls, labels, current values and visible text.
2. The agent can **operate** a live widget (click, set, select, check, focus) with no cooperation from whoever wrote the widget. It must work on every widget already on a board.
3. Widgets can **expose named actions** that the agent discovers and calls, with a return value.
4. Widget **state survives** re-mounts, page switches, session resume and `UpdateContent`.
5. The user can always **see** when the agent acts inside a widget. A widget's own logic, and anything listening to its submits, can always tell an agent action from a user action.
6. The host decides how much of this the agent may use. LXP assessments are the obvious case for limiting it.

**Non-goals**
- Hot-patching a widget's code while keeping its JavaScript heap. A new `srcdoc` is a new document; no generic mechanism can carry arbitrary runtime state across that. Goal 4 is the achievable version: the widget declares its state and gets it back.
- Any new privilege for widgets. The sandbox stays `allow-scripts` only, and `allow-same-origin` stays ruled out.
- Showing the agent widget pixels. Inspect closes that gap in text. A visual path, such as rendering widgets into exported frames, is a separate effort.

---

## 4. Design

### 4.1 Protocol

Every message is a plain object with one marker property. Messages in **both** directions are validated, the same way the existing bridge validates.

| Direction | Marker | Payload | Sent when |
|---|---|---|---|
| widget → host | `__mjWhiteboardReady` | `{ actions: ActionInfo[], hasStateApi: boolean }` | The helper finishes loading (each mount) |
| widget → host | `__mjWhiteboardActions` | `{ actions: ActionInfo[] }` | The widget registers or removes actions (debounced) |
| widget → host | `__mjWhiteboardState` | `{ state: string }` (JSON, capped) | The widget calls `MJWhiteboard.setState` (debounced) |
| widget → host | `__mjWhiteboardReply` | `{ id, ok, result?, error?, code? }` | A host command finishes |
| host → widget | `__mjWhiteboardCommand` | `{ id, op: 'inspect' \| 'operate' \| 'call' \| 'restoreState', args }` | Agent tool calls, and state restore on ready |
| widget → host (existing) | `__mjWhiteboardSubmit` / `__mjWhiteboardInteraction` | **Add `by?: 'agent'`** | As today, tagged when caused by an agent operation (§4.5) |

`ActionInfo = { name: string; description?: string }`.

**Validation rules**
- **In the helper:** accept a command only if `event.source === window.parent` and the marker is present.
- **On the host:** accept a reply only if its `event.source` is the `contentWindow` the command was posted to **and** its `id` is pending. Ready, actions and state messages go through the same `resolveWidgetFromSource` check as today.
- **Size caps:** replies use the submit cap (8000 chars). An inspect outline is capped at about 3000 chars, with a "… truncated" marker. State is capped at 4000 chars.
- **Target origin:** the host posts with `'*'`. That is correct here: the host addresses a window object it holds, and an opaque origin has no name to address it by. The helper already posts to the parent the same way.

### 4.2 Widget side: the injected helper

The new behavior is added to the existing helper. Keep it **one** `<script>` block; `whiteboard-widget-interaction.test.ts` asserts that.

**Outline (`inspect`)**
- Walk the document for interactive elements: `button`, `a[href]`, `input`, `select`, `textarea`, `[role=button|checkbox|radio|tab|switch|slider|option]`, `[contenteditable]`. Add headings and short visible text blocks for context.
- Skip invisible elements.
- Give each element a short ref (`e1`, `e2`, …). Keep the ref-to-element map inside the helper (a `Map`, rebuilt on each inspect) and **do not stamp attributes into the widget's DOM**. A ref whose element is gone returns `code: 'stale_ref'` with "inspect again".
- Labels come from the recorder's existing `labelOf`/`fieldLabel`, so what the agent reads matches what ambient notes report.
- One line per element. Examples:
  - `e3 button "Playful pink"`
  - `e5 select "vibe" = "pink" (pink | blue | green)`
  - `e6 checkbox "Email me" = unchecked`
  - `e7 range "Volume" = 40 (0–100)`
- **Privacy:** password and hidden inputs are omitted entirely, as the recorder does, and values are clipped to 120 chars.
- The outline also lists registered actions and, when the widget uses the state API, its clipped current state.

**Operate (`operate`)**
- The target resolves in order: ref, then an exact visible label, then a unique contains-match on the label, then a CSS selector. An ambiguous match returns `code: 'ambiguous_target'` with the candidate refs.
- Ops:
  - `click`: `el.click()`.
  - `set`: text, number, range, date or textarea. Use the native value setter (`Object.getOwnPropertyDescriptor(proto, 'value').set`) so framework-wrapped inputs notice, then dispatch bubbling `input` and `change`.
  - `select`: by option value or label.
  - `check` / `uncheck`.
  - `focus`.
  - Elements carrying `data-mj-agent="off"`, and widgets that set `MJWhiteboard.configure({ agentOperable: false })`, refuse with `code: 'not_operable'`.
- **Visible feedback:** briefly outline the target element (inline style, restored after about 800 ms) so the user sees what the agent touched.
- **Settle, then report:** wait two animation frames plus about 250 ms. That is long enough for the auto-submit fallback (150 ms) and typical re-renders. Then reply with the updated outline and `submitted: <data>` if a submit fired in that window. The model sees the result without a second call.

**Actions (`call`)**
- Widget API: `MJWhiteboard.onAction(name, handler, description?)` and `MJWhiteboard.offAction(name)`. Registrations are reported through `__mjWhiteboardActions`.
- `call` runs `await handler(payload)`, JSON-serializes the return value (capped), and replies. A thrown handler error becomes `ok: false` with its message.
- An unknown action returns `code: 'unknown_action'` with the registered names.

**State**
- `MJWhiteboard.setState(obj)` is debounced (about 500 ms) and posts `__mjWhiteboardState`. Oversize state is refused with a console warning; it is never silently clipped.
- `MJWhiteboard.onRestore(fn)` fires **once** after mount, with the stored state or `null`.
- This has to be callback-based. The `srcdoc` cannot carry the state: changing it would reload the frame on every `setState`. So state arrives through a `restoreState` command after the ready handshake, and a widget that reads state synchronously at load would see nothing. Document this pattern in the `AddHtml` description and the README.

**Agent-origin tagging**
- While an `operate` or `call` runs, and for a short window afterwards (start with 750 ms, as a constant), the helper sets an `agentDriving` flag.
- Recorder events pushed during that window carry `by: 'agent'`.
- The auto-submit fallback records `by` when it **schedules**, not when it fires.
- An explicit `MJWhiteboard.submit` inside the window is tagged too.
- `isTrusted` alone cannot do this, because widget code that calls `el.click()` also produces untrusted events.
- Known limitation: real user input inside the window is mis-tagged as the agent's. That is acceptable, and the window is tunable.

**Testability.** Today the helper is a hand-written string literal. Tests only check that it contains certain substrings; none run it. With this much new behavior that is no longer enough. Pick one of these:
- (a) Keep the string, and add DOM tests (`*.dom.test.ts`) that run it in a document and drive it through synthetic `message` events.
- (b) Write the helper as a real, self-contained TS function and inline it with `(${fn.toString()})()`. This must survive library and app minification: no references to module scope, and no down-level helpers.

(a) is lower risk. (b) gives type-checking. This is the builder's call; the answer goes in the PR.

### 4.3 Host side: board component

- **`SendWidgetCommand(itemId, op, args, timeoutMs): Promise<WidgetCommandOutcome>`**, steps in order:
  1. Validate: the item exists on the **active** page and is `Kind: 'html'`. Otherwise fail (`widget_not_found` / `not_html`), naming `Whiteboard_SwitchPage` for items on other pages, like the existing tools do.
  2. Make sure it is mounted. If it isn't near the viewport, pan to center it (add a `RevealItem` helper next to the existing `viewportCenter`/`zoomCentered` logic). Then wait up to 5 s for that frame's `__mjWhiteboardReady`. Timeout: `widget_not_ready`.
  3. Queue it on a **per-widget serial chain**, since the runtime does not serialize calls.
  4. Post the command with an id (`crypto.randomUUID()`). Await the matching reply or the timeout. Defaults: 5 s for inspect and operate, 10 s for call. Timeout returns `widget_timeout` with a message the model can act on.
- **Ready tracking:** keep a map from item to `{ window, actions, ready }`. A new `contentWindow` for an item, meaning it was re-mounted, replaces the entry. Pending commands for a window that unmounts reject with `widget_unmounted`. Clear everything in `ngOnDestroy`, along with the existing listener cleanup.
- **Message routing:** extend `onWindowMessage` with evaluators for ready, actions, state and reply. Write them as pure functions in `whiteboard-widget-bridge.ts`, like `EvaluateWidgetSubmitMessage`. Keep the listener-attach rule (only while widgets exist) as it is.
- **Origin passthrough:** add `Origin: 'user' | 'agent'` to `WhiteboardWidgetSubmitEvent` and `WhiteboardWidgetInteractionEvent`, defaulting to `'user'` when `by` is absent. This is an additive field, so `WidgetSubmitting` handlers can veto agent-origin submits. That matters for any host that grades submissions.

### 4.4 Tools

The proposed names map to these (the reasons are in §9):

| Tool | Args | Returns (beyond `success`/`itemId`/`summary`/`error`) |
|---|---|---|
| `Whiteboard_InspectWidget` | `itemId` | `outline`, `actions`, `state?` |
| `Whiteboard_OperateWidget` | `itemId`, `target` (ref / label / selector), `op` (`click` \| `set` \| `select` \| `check` \| `uncheck` \| `focus`), `value?` | `outline` after the settle, `submitted?` |
| `Whiteboard_CallWidget` | `itemId`, `action`, `payload?` (object) | `result` (the handler's return value) |

- Add a `code?: string` to `WhiteboardToolResult` so failures are machine-distinguishable: `widget_not_found`, `not_html`, `widget_not_ready`, `widget_timeout`, `widget_unmounted`, `stale_ref`, `ambiguous_target`, `target_not_found`, `unknown_action`, `not_operable`, `access_denied`.
- Descriptions should say:
  - inspect before you operate, unless you just wrote the widget and know its labels;
  - refs stay valid until the widget reloads;
  - every result includes the post-action outline, so you don't need to inspect again;
  - item tools target the active page (the shared sentence is appended automatically, as today).
- Update the `Whiteboard_AddHtml` description to teach:
  - giving controls `aria-label`/`name` so they inspect well;
  - `MJWhiteboard.onAction` for anything the agent should drive by meaning ("next step", "reset", "show answer");
  - `setState` plus `onRestore` for anything worth keeping.
- `ApplyWhiteboardAgentTool` stays **pure and synchronous**. Called with a widget tool and no board, which happens on the channel's no-surface fallback path, it returns a clear failure: "widgets can only be operated while the board is on screen".

### 4.5 Execution path

1. **Host** `ApplyAgentTool(toolName, argsJson): string | Promise<string>`:
   - Widget tools go to `Board.SendWidgetCommand`.
   - The other 14 tools run synchronously, unchanged.
   - Garnish for widget tools: the presence cursor glides to the widget, and a toast reads "{AgentName} clicked 'Next' in Quiz", from a new `toolPhrase` entry built from the result. Widget operations are **not** board edits, so there is no Undo on that toast.
2. **Channel** `ApplyAgentTool(): string | Promise<string>`. Await the host. **Do not** call `ConfirmVisualChange` for widget tools: the exported frame shows a placeholder, so the frame would be identical.
3. **Channel notes, by origin:**
   - Agent-origin interactions: **no ambient note**, because the tool result already reported the outcome.
   - Agent-origin submit: no `RequestSpokenResponse` and no "the user submitted" note, because the operate result already carries `submitted`.
   - User-origin events: unchanged.
4. **Runtime:** no change. Async handlers are supported, and `ApplyVerb` awaits.

### 4.6 What the agent sees passively

Extend `compact()` for `'html'` items with `actions` (names only) and `state` (clipped to about 300 chars) when present. The scene delta then tells the agent what each widget can do and what it holds, before it inspects anything. Keep the existing 200-char source excerpt.

### 4.7 State persistence

- Add an optional field: `WhiteboardHtmlItem.WidgetState?: string`, a JSON string capped at 4000 chars.
- Add `WhiteboardState.SetWidgetState(itemId, json)`:
  - included in `ToJSON` (persisted through the channel's existing `RequestSave`), and journaled so scene deltas carry it;
  - **not** on the undo stack, and raises **no** `ContentChanging`/`ContentChanged` (it is not a content edit);
  - saves are debounced on the host, about 1 s, so a chatty widget can't flood session saves.
- Restore: on each `__mjWhiteboardReady`, if the item has `WidgetState`, send `restoreState`. Otherwise send `restoreState` with `null` so `onRestore` always fires exactly once.
- `UpdateContent` with new HTML keeps `WidgetState`. New code that reads the same keys continues where the user was, which is the achievable form of "hot reload".
- **Compatibility needs no server change:**
  - `normalizePersisted` passes item objects through as they are, so the additive field round-trips.
  - `WhiteboardChannelServer.OnChannelStateSave` only checks for a JSON object and re-serializes it.
  - Old saves without the field load as "no state".

### 4.8 Host control: `AgentWidgetAccess`

Add a host input, following the host-controllable `ToolRoster` precedent:

```
AgentWidgetAccess: 'full' | 'inspect-only' | 'off'   // default 'full'
```

- The channel filters `GetToolDefinitions()` so the model never sees a tool it can't use:
  - `'inspect-only'` hides Operate and Call;
  - `'off'` hides all three, and also removes the `actions`/`state` additions from scene deltas.
- The host still refuses calls it receives (`code: 'access_denied'`), in case the definitions were registered before a change.
- Widget-level opt-out (`data-mj-agent="off"`, `MJWhiteboard.configure`) works under `'full'` as described in §4.2.

### 4.9 Security and privacy

- **No new capabilities inside the sandbox.** Commands only invoke code that the helper or the widget already contains.
- **Commands in:** accepted only from `window.parent`. **Replies out:** accepted only from the exact window that was asked, for a pending id.
- **Reads** follow the recorder's privacy rules: password and hidden inputs are omitted, values are clipped, outlines are capped.
- **Widget text is untrusted content once it reaches the model.** The widget may have been written by the user or by an earlier agent turn, and the same is already true of the 200-char source excerpt. Frame tool results as data.
- **Agent actions never impersonate the user.** The `Origin` tag reaches every consumer, and hosts can veto agent-origin submits in `WidgetSubmitting`.

---

## 5. Phases and acceptance criteria

The dates are proposed so that LXP integration lands by end of year. Ethan and Jason should adjust them after their review.

| Phase | Scope | Proposed date |
|---|---|---|
| **1** | Protocol + helper (inspect, operate, tagging, feedback); host `SendWidgetCommand`, ready tracking, reveal, timeouts; `Whiteboard_InspectWidget` + `Whiteboard_OperateWidget`; origin-aware channel notes; `AgentWidgetAccess` | built by Nov 6, tested on MJ by Nov 13 |
| **2** | `onAction`/`offAction`, action discovery, `Whiteboard_CallWidget`, `actions` in scene deltas, `AddHtml` description update | Nov 20 |
| **3** | `setState`/`onRestore`, `WidgetState` persistence, `state` in scene deltas, restore on mount | Dec 4 |
| **4** | Review with Jason; LXP integration (§7) | Dec 7 – Dec 18; buffer to Dec 31 |

**Phase 1 is done when:**
- [ ] The agent inspects a widget it just built and reads back the current value of every visible control. Password fields are absent.
- [ ] The agent clicks, sets, selects and checks by ref and by label. Ambiguous labels return candidates instead of guessing.
- [ ] Operating an off-screen widget on the active page pans to it and succeeds. Operating a widget on another page fails and names `Whiteboard_SwitchPage`.
- [ ] A widget whose helper never replies produces `widget_timeout` within the timeout, and the session keeps working.
- [ ] Agent-driven clicks on a Submit button produce **no** "the user submitted" note and no spoken-response request. The operate result carries `submitted`.
- [ ] The user sees the presence cursor, the toast, and the in-widget outline on every operation.
- [ ] `'inspect-only'` and `'off'` hide the corresponding tools from the model and refuse direct calls.
- [ ] All 14 existing tools behave exactly as before.

**Phase 2 is done when:** a widget registers `next`/`reset`. The agent sees those action names in the scene delta without inspecting, calls them, and gets back the handler's return value. A handler that throws returns its message. A handler that never resolves times out.

**Phase 3 is done when:** a widget that saves state keeps it across:
- page switch and back,
- scrolling it out of and back into view,
- `UpdateContent` with new HTML that reads the same keys,
- ending and resuming the session.

Undo/redo of other items never reverts widget state.

---

## 6. Testing

**Unit tests (vitest, pure)**
- Message evaluators: ready, actions, state, reply. Cover marker, source, pending id and size caps.
- Tool definitions and names.
- `ApplyWhiteboardAgentTool` returns the no-board failure for the three widget tools.
- `compact()` additions.
- `SetWidgetState`: not undoable, round-trips through `ToJSON`/`LoadFromJSON`, legacy saves load.

**DOM tests (`*.dom.test.ts`)**
- The helper, actually **executed**:
  - outline contents and privacy;
  - ref resolution and staleness;
  - `set` firing `input` + `change` with the native setter;
  - agent tagging of recorder and auto-submit events;
  - `onAction`/`call`;
  - `onRestore` firing exactly once.
- The board:
  - commands posted to the right `contentWindow`;
  - replies from the wrong window ignored;
  - timeouts;
  - remount invalidating pending commands;
  - per-widget serialization.
- The channel:
  - async `ApplyAgentTool`;
  - notes suppressed by origin;
  - tool definitions filtered by `AgentWidgetAccess`.

**Manual, on MJ** (Explorer, a realtime session with the whiteboard), on **both** OpenAI Realtime and Gemini Live, since tool latency and async results behave differently per provider:
1. "Build me a three-question quiz." Then "pick B on question 1 and submit." No echo should follow.
2. Answer a question yourself, then ask "what did I pick?" The agent inspects and answers.
3. Scroll the widget off-screen and ask the agent to press "Next". It pans and clicks.
4. Ask the agent to rewrite the widget's styling (`UpdateContent`). With phase 3 in, progress survives.
5. Paste in a widget with an action that never resolves. The call times out cleanly and the session keeps going.
6. Set `AgentWidgetAccess = 'inspect-only'` and confirm the agent can no longer operate.

Run each package's tests (`pnpm test` in `packages/Angular/Generic/whiteboard` and `packages/Angular/Generic/conversations`), plus the deterministic integration tier, per the repo's definition of done.

---

## 7. LXP integration

Everything here lands in MJ's generic packages, so LXP gets it through an MJ upgrade. Things to settle in Jason's review:

- **Which MJ line LXP runs.** If LXP is on an LTS line rather than `next`, this needs the `backport lts/6.1` label (or a hand-port PR) and a patch release before LXP can take it. Plan the dates around that.
- **Assessments.** Should the agent ever operate a graded widget? The likely answer:
  - `AgentWidgetAccess = 'inspect-only'` during assessments, or `data-mj-agent="off"` on graded controls;
  - plus a `WidgetSubmitting` handler that vetoes or labels `Origin: 'agent'` submits.
- **LXP-authored widgets.** Course widgets that LXP generates or stores should adopt `onAction` (step, reset, reveal) and `setState`/`onRestore` (learner progress).
- **Persistence.** `WidgetState` rides in the whiteboard's session channel state. Decide whether LXP wants learner widget progress anywhere more durable than the session.

---

## 8. Files expected to change

| File | Change |
|---|---|
| `packages/Angular/Generic/whiteboard/src/lib/whiteboard-widget-bridge.ts` | Helper additions (§4.2); new markers, types and pure evaluators; `Origin` on the existing events |
| `packages/Angular/Generic/whiteboard/src/lib/whiteboard-board.component.ts` | `SendWidgetCommand`, ready tracking, `RevealItem`, message routing, cleanup |
| `packages/Angular/Generic/whiteboard/src/lib/whiteboard-host.component.ts` | Async `ApplyAgentTool`, widget-tool garnish, `AgentWidgetAccess` input, state-save debounce |
| `packages/Angular/Generic/whiteboard/src/lib/whiteboard-tools.ts` | Three definitions and names, `code` on results, no-board failure, `AddHtml` description |
| `packages/Angular/Generic/whiteboard/src/lib/whiteboard-state.ts` | `WidgetState`, `SetWidgetState`, `compact()` additions |
| `packages/Angular/Generic/conversations/src/lib/components/realtime/whiteboard/whiteboard-channel.ts` | Async `ApplyAgentTool`, origin-aware notes, tool-definition filtering |
| `packages/Angular/Generic/whiteboard/README.md` | Document the two-way bridge, the widget API and the "state resets on remount" change |
| `guides/REALTIME_CO_AGENTS_GUIDE.md` | Widget section; also fix the stale "11 tools" count (14 today, 17 after this) |
| Tests under both packages | §6 |

No migrations, no metadata, no server changes.

---

## 9. Review of the original proposal

| Proposed | Verdict |
|---|---|
| Two-way `postMessage` bus with `MJWhiteboard.onMessage` | **Kept,** as named actions (`onAction`) that the helper **reports** to the host. The agent does not have to remember or guess action names, which it would lose after compaction or across sessions. |
| `Whiteboard_DispatchWidgetAction(itemId, action, payload)` | **Kept** as `Whiteboard_CallWidget`. Added: a return value, timeouts, and error codes. |
| `Whiteboard_TriggerWidgetElement(itemId, selector, eventType)` | **Reshaped** into `Whiteboard_OperateWidget`. The model never sees the widget's DOM, so it cannot write reliable CSS selectors, and a raw `change` event without a value change does nothing useful. Targets are refs from inspect (or labels), and ops are semantic (`click`/`set`/`select`/`check`). |
| `Whiteboard_QueryWidgetState(itemId, selector?)` | **Kept** as `Whiteboard_InspectWidget`, which returns an outline of refs, labels, values, actions and state. Today the agent cannot see inside widgets at all. |
| Shared state store + hot-reload of styles/logic keeping canvas state | **Partly.** Widget-declared state (`setState`/`onRestore`) persisted on the item: yes. It also fixes the existing reset-on-remount behavior. Hot-patching arbitrary widget code while keeping its heap: no (§3). |
| *(missing)* | The agent answering itself: agent clicks fire "the user submitted" plus a spoken response (§4.2, §4.5). Unmounted widgets and the ready handshake (§4.3). The runtime has no timeout (§4.3). Read privacy (§4.9). Visible feedback (§4.2, §4.5). Host and widget opt-out for assessments (§4.8). |
