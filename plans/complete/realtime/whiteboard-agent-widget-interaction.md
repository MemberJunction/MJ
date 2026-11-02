# Whiteboard: realtime agents inspect, operate and persist live HTML widgets

**Status:** Shipped (as-built record). Original plan: #5716. Implementation: `feat/whiteboard-agent-widget-ops`.
**Packages:** `@memberjunction/ng-whiteboard`, `@memberjunction/ng-conversations` (whiteboard channel).
**Not changed:** `RealtimeRuntime`, server, migrations, metadata.

The how-to for widget authors and hosts lives in the [whiteboard README](../../../packages/Angular/Generic/whiteboard/README.md#agents-and-live-widgets) and the [Realtime Channels Guide](../../../guides/REALTIME_CHANNELS_GUIDE.md). This document records **why** it is built this way.

---

## 1. Problem

A realtime agent could build an HTML widget (`Whiteboard_AddHtml`) and rewrite it (`Whiteboard_UpdateContent`), but it could not see or drive a live one. It heard about a widget only through `MJWhiteboard.submit` and throttled ambient notes. The only lever it had was a rewrite, which reloaded the frame and wiped what the user had done. A widget also lost its state whenever it scrolled out of view or the user switched pages.

## 2. What it does now

| Moment | Before | After |
|---|---|---|
| "Pick Mars and submit for me" | Impossible | The agent operates the widget. The user sees the agent cursor, a highlight ring and a toast. The submit is tagged `Author: 'agent'`, so the agent is not told "the user submitted" and does not reply to its own action. |
| "What did I pick?" | The agent guessed from ambient notes | The agent inspects the live widget and reads its current values |
| A widget offers "next" / "reset" | — | The widget registers `MJWhiteboard.onAction`; the agent is told which actions exist and calls them |
| Scroll away, switch page, restyle, resume | Widget state reset | Restored: declared state, or automatic form state plus the last submit. Undo never rewinds it, and it never enters `ToJSON` |
| Assessment integrity | Prompt-only | The host caps the agent per session or per call (`off` / `inspect-only`); widgets opt out per control |

## 3. Architecture

```
in-frame helper (one <script>, ES5)  ⇄  protocol (pure)  ⇄  WhiteboardWidgetBroker (L0)
      outline · operate · actions ·                         deadlines from enqueue,
      state · authorship · ring                             per-widget queue, generations
                                                                    ▲
           Board (mount tracking via MutationObserver, PinMount, RevealItem, Author gate)
                                                                    ▲
           Host (ApplyAgentToolAsync, AgentWidgetAccess, garnish)
                                                                    ▲
           RealtimeWhiteboardChannel (policy, exposure, notes by Author, save/restore)
```

- **Protocol** (`whiteboard-widget-protocol.ts`): marker messages (ready, actions, state, reply, command), tolerant validators, caps (reply 8000, outline 3000, state 4000), error codes, deadlines.
- **Broker** (`whiteboard-widget-broker.ts`): one deadline per call measured from enqueue (inspect 6 s, operate 9 s, call 12 s, all under the 15 s tool-result barrier of the Gemini Live and GPT-Live drivers). Commands to one widget are serialized and different widgets run in parallel. A per-document token detects reloads, since a new `srcdoc` keeps the same window object. A `hello` recovers a missed ready.
- **Helper:**
  - **Outline:** refs `f#`/`a#`, rebuilt each inspect and never stamped into the DOM. Visibility is judged by computed style, not geometry, because a hidden pane measures 0×0. Fields read by their visible label.
  - **Privacy:** password and hidden fields are omitted, and protected fields are redacted and refused.
  - **Operate:** a macrotask yield and a fresh target lookup between steps; settling uses timers, not `requestAnimationFrame`.

## 4. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Widget state lives in a side map outside undo snapshots and outside `ToJSON`; the channel saves it as a sibling key next to the board JSON | Undo restores whole-board snapshots, so state on the item would be rewound. `ToJSON` feeds LiveKit sync and artifacts, so state there would leak learner answers. A sibling key is ignored by old readers. |
| D2 | Authorship comes from `isTrusted` first, then the agent window, then a host gate | A window-only flag mislabels real user input, and the channel would then drop it |
| D3 | Access: config `widgetAccess`, plus protected hooks `MaxWidgetAccess` (declared tools), `ResolveWidgetAccess()` (per call) and `OnBeforeWidgetCommand()` (veto), plus widget opt-outs and exposure | Tools are minted before channel config exists, and hosts such as an LMS need per-call control without restarting the session |
| D4 | `ApplyAgentToolAsync` was added and the sync host method kept | Changing the host return type would break typed callers |
| D5 | Deadlines are measured from enqueue and stay ≤ 12 s | Slow results past 15 s are dropped by the provider drivers |
| D6 | Inspect pin-mounts without panning; operate and call reveal the widget | Reading must never move the user's view, and acting should be visible |
| D7 | Timers instead of `requestAnimationFrame`, and computed-style visibility | Widgets must work while the board pane is collapsed |
| D8 | Per-document generations, `hello`, reload and unmount handling | Each failure maps to a precise code the model can act on |
| D9 | `ReturnsChannelData: 'state'` on all three widget tools; protected-field redaction | Fits MJ's exposure model |
| D10 | `steps[]` (1–5) | Realtime round trips are expensive |
| D11 | The helper stays a string, tested by executing it in a fresh jsdom frame per test | Option (a) of the original plan; an executed harness already existed |
| D12 | No metadata or prompt changes (`patch`) | Tool descriptions teach the API |
| D13 | Automatic form state and last submit for widgets without `onRestore` (`data-mj-keep-live` opts out; channel `persistWidgetState`) | Agent-generated widgets never call `setState` |

## 5. Differences from the original plan (#5716)

| Plan | Built |
|---|---|
| `WidgetState` on the item | Side map plus a sibling save key (D1) |
| Origin from an agent-window flag | `isTrusted` first (D2) |
| Filter tool definitions by `AgentWidgetAccess` from config | Declared set from `MaxWidgetAccess`; config narrows it per call (D3) |
| Host `ApplyAgentTool` becomes async | New `ApplyAgentToolAsync` (D4) |
| 5 s / 10 s timeouts, copying `VERB_TIMEOUT_MS = 15 s` | Deadline from enqueue, ≤ 12 s (D5) |
| Pan to reveal for every command | Inspect pin-mounts without panning (D6) |
| Settle with animation frames | Timers (D7) |
| `actions`/`state` in `compact()` scene deltas | An exposure-gated "offers actions" note; state through inspect |
| Opt-in state only | Plus automatic form state (D13) |
| One op per call | `steps[]` (D10) |
| Host debounces saves ~1 s | The channel throttles widget-state saves to ≤ 1 per 5 s, because the runtime's 3 s debounce re-arms on every request |

## 6. Verification

- **Unit and DOM:** `ng-whiteboard` 641 passing, `ng-conversations` 3002 passing. The helper is executed in jsdom, the broker is tested with fake timers, and a subclass contract test covers `ApplyAgentTool`.
- **Live** (Explorer on a clean-room DB), on Gemini 3.8 Live and GPT Realtime 2.1, with typed input to the live session and a spoken pass on OpenAI:
  - agent operate with no self-echo, and "what did I pick?";
  - off-screen inspect and operate, and operate with the panel collapsed;
  - actions, including a 12 s timeout;
  - persistence across page switch, remount, `UpdateContent` and undo;
  - widget state saved to the DB;
  - access levels and privacy redaction.
- **Found and fixed during review and E2E**, each with a regression test that fails before the fix:
  - a protected-value leak into saved answers;
  - redaction gaps;
  - auto-state key collisions;
  - off-screen inspect failing (frame unmounts went unseen after local re-renders; now a `MutationObserver`);
  - named fields reading by `name` instead of their visible label.

**Code review, round 1 (Robert):** focus and blur no longer report protected fields (now `isGuarded`, like change and input); a call that only waited in a widget's queue returns `widget_busy` instead of `widget_not_ready`; the toast tolerates a widget reporting more step outcomes than were sent; `RestoreState` holds saves while it loads and then requests one save with the board and widget states together (round 2: it also cancels a pending trailing widget-state save first). Each has a regression test that fails without it.

## 7. Follow-ups

- Gate the pre-existing whiteboard notes (scene deltas, submits, ambient) on `Exposure`.
- `Web/RealtimeWidget`: async tool results.
- `livekit-room`: widget events and per-peer widget state.
- Migrate the whiteboard's interface-style events to class-based `Before*`/`After*`.
- A public programmatic host API for non-agent widget control.
- Minify the injected helper (~33 KB per widget).
- Scrub protected keys from explicit `MJWhiteboard.submit` payloads.
