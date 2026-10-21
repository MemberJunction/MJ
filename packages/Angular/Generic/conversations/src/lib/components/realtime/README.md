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

---

## "Agent can see" (`<mj-realtime-perception-chip>`)

When the model can be shown pictures of the call's surfaces (a whiteboard, a remote browser, a component, a shared screen), a small chip above the channel strip says so: **Agent can see: Whiteboard**, **Agent can see 2 sources**, or **Agent view off**. It opens a panel with one switch per source, each saying whether the agent is viewing it now, could view it, or is off. A switch off removes that source from the model's view and tells the agent; the choice is remembered per user per channel (`UserInfoEngine`, key `mj.realtime.visualPerception.v1`; in memory for anonymous or connect-only sessions). The chip is presentational (input `Sources`, output `SourceToggled`); the overlay wires it to `RealtimeSessionService.VideoSources$` / `SetVideoSourceEnabled`, and reports which channel tab the user is on (`SetFocusedChannel`) so that, when the model can watch only one source, it is the one the user is looking at. Design tokens only; keyboard and screen-reader operable.

## Interactive Component channel (`interactive-component/`)

Shows the user any **component artifact** (a dashboard, report, chart or form built by Skip, Sage or a person) next to the call and lets the agent operate it. Registry key `RealtimeInteractiveComponentChannel` (server half `InteractiveComponentChannelServer` in `@memberjunction/ai-agents`); `DefaultAvailability: 'opt-in'`, `DisplayPolicy: 'on-demand'`, `MultiInstance: true`, `MaxExposure: 'pixels'`.

**The contract is derived from the component's spec**, so a component nobody wrote channel code for is operable:

| Component spec | Channel contract |
|---|---|
| `methods.customMethods[]` | a verb per method; parameters schema from the declared parameter types (`name?`, an `undefined` type or an "Optional" description makes a parameter optional; a required function-typed parameter cannot be passed by a model, so that method is listed as unavailable) |
| `methods.standardMethodsSupported` | `refresh`, `print`, `validate`, `is_dirty`, `reset`, `scroll_to`, `focus`, and `get_data_state` for those the spec supports |
| `getCurrentDataState` | the instance's `data` in the channel's state (a bounded summary: counts, columns, the first N rows) |
| `events[]` | channel events (the user's selections and edits reach the model as part of the state it perceives) |
| `properties[]` | the schema of the `inputs` accepted when opening it |

Built-ins: `open { artifactId | artifactVersionId, inputs? }` (the dispatcher's reserved action; an artifact that is already open is brought forward instead of opened twice), `show_version { versionId }` (swaps an open instance to another version of **its own** artifact **in place**: same instance id, same inputs, `version_changed` event) and `close`. Several components can be open at once (`maxInstances`, default 4); a verb addresses one with `target.instance`, otherwise the one the user is looking at is used when it supports the verb, else the only one that does, else the call is refused with the candidates listed. The verbs the channel declares are the built-ins plus those of whatever is open (identical verbs from two components are declared once with both signatures; each call is checked against the addressed component's own schema).

**Access.** Artifacts are loaded through the signed-in user's own session and read permission (`RunViewComponentArtifactSource`: ids are validated as UUIDs, the artifact must be a `Component` type, access is the same owner / explicit grant / collection rule the rest of the conversation UI applies). The agent cannot open anything the user cannot. Content stored as a file rather than inline is not supported.

**Delegated artifacts.** When a delegated run produces artifacts: one that is already open moves to the newer version in place (`swapToNewerVersions`, default on; otherwise the agent is only told one exists); with `autoOpenDelegatedComponents: true` a component that is not open is opened. Auto-open is off by default, and the channel cannot tell a component from another artifact until it has loaded it, so with it on the channel is mounted for any delegated artifact and quietly ignores those that are not components.

**Configuration** (`channels.config.InteractiveComponent` in the config cascade, all optional): `autoOpenDelegatedComponents`, `swapToNewerVersions`, `maxInstances` (1-8), `maxStateRows` (default 25), `maxStateChars` (default 6000), and the runtime-level `maxExposure`. A value of the wrong type falls back to its default with a console warning.

**What the model perceives** is gated by exposure policy like every channel. At `'state'` it receives which version each component shows, what the user last did in it, and the bounded data summary. Pixels flow only while the user allows them and the model has a video track, and only if the host opted in to a rasterizer: Explorer calls `EnableChannelFrameCapture()` from `@memberjunction/ng-realtime-channels` at startup (before a session is minted: whether the channel can source video is decided at mint), which registers an `html-to-image` based capturer, bounded (node cap, timeout, one capture at a time, a size ceiling) and failing softly with one logged reason. MemberJunction core ships no rasterizer by default, so a host that does not call it keeps state-only perception. The verbs that return the component's data (the standard `GetDataState`, `Validate` and `IsDirty`, and a custom method whose declared return type is not void) declare `ReturnsChannelData: 'state'`, so below `'state'` exposure the agent is told they are unavailable and the call is refused whole (a method that returns nothing, such as `Refresh`, `Reset` or `Focus`, is never withheld; when several open components offer the same verb it is withheld only if every offer is flagged). Open components are live-only: they are not saved with the session and are not restored on resume.

**Placement.** The channel lives in `@memberjunction/ng-conversations`, next to the other channels, rather than in its own package. The deciding facts: the realtime overlay already resolves channel plugins from this package, `@memberjunction/ng-artifacts` (whose Component viewer hosts `mj-react-component`) is already a dependency, so the new dependency is the single `@memberjunction/ng-react` (which `ng-artifacts` already pulls in transitively, so embed weight is unchanged in practice), and a separate package would have to be loaded by every host that wants the channel and kept in step with the overlay. Layering (`guides/UI_LAYERING_GUIDE.md`): the spec-to-contract derivation, configuration parsing, data-state bounding, the instance engine and the artifact-source port are L0 (framework-free, tested without a DOM, with an import-boundary test); the channel is an L1 plugin; the surface (`mj-realtime-interactive-component-surface`) and per-instance host (`mj-interactive-component-host`) are standalone L1 leaf components that import no router and no Explorer package.
