# Realtime Voice Widget (`<mj-realtime-overlay>`)

A self-contained, embeddable live‑voice agent surface. It renders a calm ambient **orb** by default and graduates to a structured **command console** when there's room *and* the user asks for text — and **every part of that UI is controllable by the host** through declarative inputs, observable through outputs, and drivable through an imperative method API.

> The widget's *what‑to‑show* decisions are resolved by a single pure function,
> [`resolveRealtimeUi()`](./realtime-ui-config.ts) — fully unit‑tested in
> [`realtime-ui-config.test.ts`](../../../__tests__/realtime-ui-config.test.ts).
> The component is a thin Angular shell over that resolver plus a `ResizeObserver`.

---

## The chrome model (orb ↔ console)

| `[Chrome]` | Behaviour |
|---|---|
| `'auto'` *(default)* | Start as an **orb**. Graduate to a **console** only when the container is ≥ `[ConsoleBreakpointPx]` **and** the user has revealed text (or we're reviewing a recording). **Wider alone is not enough — no text intent ⇒ stay an orb.** |
| `'orb'` | Always the ambient orb. |
| `'console'` | Always the structured console. |

This is exactly the behaviour the design review landed on: *Calm Orb for the overlay; flip to Command Console past a certain size — but keep the orb if the user hasn't asked to see text.*

---

## Inputs — control every aspect of the UI

All inputs are optional and default to the historical behaviour, so existing call sites need no changes. PascalCase per MJ convention. A `false` is a **hard disable**; a `true` means *allow* (the affordance still only appears when the runtime earns it).

| Input | Type | Default | Purpose |
|---|---|---|---|
| `[Chrome]` | `'orb'\|'console'\|'auto'` | `'auto'` | Which chrome (see above). |
| `[ConsoleBreakpointPx]` | `number` | `560` | Width at/above which `auto` may become a console. |
| `[Compact]` | `boolean` | `false` | Force dense spacing/type (else inferred from width). |
| `[AutoHideControls]` | `boolean` | `true` | Fade non‑essential controls when idle (orb only). |
| `[AllowTextReveal]` | `boolean` | `true` | Can the user open the transcript? `false` ⇒ pure voice, never consoles. |
| `[ShowCaptionsControl]` | `boolean` | `true` | Captions toggle. |
| `[ShowDensityPicker]` | `boolean` | `true` | Density picker (in the gear). |
| `[ShowMinimize]` | `boolean` | `true` | Minimize (collapse call, keep it live). |
| `[ShowEnd]` | `boolean` | `true` | End‑call control. |
| `[ShowSurfacePanel]` | `boolean` | `true` | Right surface panel (whiteboard/browser/channels). Console + earned only. |
| `[ShowChannels]` | `boolean` | `true` | Channel strip. |
| `[ShowActivityRail]` | `boolean` | `true` | Activity rail/tab (delegations, artifacts). |
| `[ShowDevLinks]` | `boolean` | `true` | Developer links/panels (still gated by per‑session dev mode). |
| `[AllowResize]` | `boolean` | `true` | Drag‑to‑resize the surface panel. |
| `[UiConfig]` | `RealtimeUiInputs` | — | Programmatic override bag; merged under the individual inputs. |
| `[Hidden]` | `boolean` | `false` | Minimized (kept alive, CSS‑hidden). |
| `[AgentName]` | `string` | — | Display name. |
| `[CurrentUser]` | `UserInfo \| null` | `null` | Threaded to artifact viewers. |
| `[EnvironmentID]` | `string` | `''` | Threaded to artifact viewers. |
| `[ReviewData]` | `RealtimeSessionReview \| null` | `null` | Switches to read‑only review of a past session. |

---

## Outputs — observe everything

| Output | Payload | Fires when |
|---|---|---|
| `(Ended)` | `void` | The call ended. |
| `(Minimized)` | `void` | Minimize requested (call stays live). |
| `(TextRevealed)` | `void` | User opened the transcript. |
| `(ChromeChanged)` | `'orb' \| 'console'` | The *effective* chrome flipped. |
| `(ConnectionStateChanged)` | `RealtimeUiConnectionState` | Connection lifecycle changed. |
| `(MuteChanged)` | `boolean` | Mic mute toggled. |
| `(DensityChanged)` | `RealtimeUxDensity` | Density changed. |
| `(SurfacePanelResized)` | `number` (px) | User resized the surface panel. |
| `(ControlInvoked)` | `RealtimeControlId` | **Any** control was used — a generic hook (`'mute'\|'captions'\|'type'\|'end'\|'minimize'\|'surface'\|'gear'\|'reveal-text'\|'pure-audio'`). Lets a host react to controls it doesn't even render. |
| `(NavigateRequest)` | `RealtimeNavigateRequest` | A dev link was followed. |
| `(StartLiveRequested)` | `RealtimeStartLiveRequest` | "Start live" pressed in review. |
| `(ReviewClosed)` | `void` | Review closed. |

---

## Methods — drive it imperatively

Grab the component via `@ViewChild` and call:

```ts
@ViewChild(RealtimeSessionOverlayComponent) voice!: RealtimeSessionOverlayComponent;

this.voice.SetChrome('console');     // force a chrome at runtime
this.voice.RevealText();             // open the transcript programmatically
this.voice.SetMuted(true);           // mute the mic
this.voice.SetCaptions(true);        // turn captions on
this.voice.SetDensity('pro');
this.voice.OpenSurfacePanel();       // / CollapseSurfacePanel()
this.voice.Minimize();               // collapse, keep the call live
this.voice.EndSession();             // tear down
```

| Method | Effect |
|---|---|
| `SetChrome(mode)` | Override `[Chrome]` at runtime. |
| `RevealText()` | Reveal the transcript (raises disclosure, emits `TextRevealed`). |
| `SetMuted(b)` / `ToggleMute()` | Mic mute. |
| `SetCaptions(b)` / `ToggleCaptions()` | Captions on/off. |
| `SetDensity(d)` | Set UX density. |
| `OpenSurfacePanel(channelId?)` / `CollapseSurfacePanel()` | Show/hide the surface panel. |
| `Minimize()` | Collapse without ending. |
| `EndSession()` | End the call. |
| `Ui` *(getter)* | The current resolved `ResolvedRealtimeUi` view‑model (read‑only). |

---

## Recipes

**Chat overlay — lean & ambient (the default host):**
```html
<mj-realtime-overlay
  [Chrome]="'auto'"
  [Compact]="true"
  [ShowSurfacePanel]="false"
  [ShowActivityRail]="false"
  [ShowChannels]="false"
  [ShowDevLinks]="false"
  [ShowDensityPicker]="false"
  [AutoHideControls]="true">
</mj-realtime-overlay>
```

**Full‑screen route — rich console:**
```html
<mj-realtime-overlay
  [Chrome]="'auto'" [ConsoleBreakpointPx]="480"
  [ShowSurfacePanel]="true" [ShowActivityRail]="true"
  [ShowDevLinks]="devMode">
</mj-realtime-overlay>
```

**Immersive / surface‑led demo (always console, panel front‑and‑centre):**
```html
<mj-realtime-overlay [Chrome]="'console'" [ShowActivityRail]="true"></mj-realtime-overlay>
```

**Pure‑voice kiosk (no text, ever):**
```html
<mj-realtime-overlay [Chrome]="'orb'" [AllowTextReveal]="false"
  [ShowMinimize]="false" [ShowDensityPicker]="false"></mj-realtime-overlay>
```

**Unexpected use — host owns the End button + reacts to every control:**
```html
<mj-realtime-overlay #voice [ShowEnd]="false"
  (ControlInvoked)="onAnyControl($event)"
  (ChromeChanged)="onChrome($event)">
</mj-realtime-overlay>
<button (click)="voice.EndSession()">Hang up</button>
```

---

## Architecture

```
RealtimeUiInputs  ─┐
                   ├─► resolveRealtimeUi()  ─►  ResolvedRealtimeUi  ─►  template bindings
RealtimeUiSignals ─┘        (pure, tested)        (single source of truth)
   ▲
   └─ disclosure model + ResizeObserver(width) + session/channel state
```

- **`realtime-ui-config.ts`** — the pure resolver + all types + defaults. No Angular. Unit‑tested.
- **`realtime-session-overlay.component.ts`** — the shell: declares the inputs/outputs/methods, observes container width, builds `RealtimeUiSignals` each pass, exposes `Ui`. No layout logic in getters — they read `Ui`.
- The **disclosure model** (`realtime-disclosure.ts`) still owns the per‑session "earned" progression; the config layer *composes* it with host intent and size. Nothing about the ratchet changes.
