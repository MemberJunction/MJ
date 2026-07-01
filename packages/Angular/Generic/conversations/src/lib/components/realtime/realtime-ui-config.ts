/**
 * @fileoverview Declarative UI configuration for the realtime voice widget.
 *
 * The realtime widget historically decided *what to show* from an internal
 * "disclosure ratchet" ({@link import('./realtime-disclosure').RealtimeDisclosureModel})
 * plus a handful of scattered getters. That made it impossible for a host
 * (the chat overlay, a full-screen route, an embedded demo surface, a kiosk,
 * a mobile sheet…) to tailor the surface to its context.
 *
 * This module introduces a single, pure, side-effect-free resolution step that
 * sits between three concerns:
 *
 * 1. **{@link RealtimeUiInputs}** — the *consumer's intent*. A flat bag of
 *    `@Input()`-friendly feature switches ("show the surface panel?",
 *    "allow text?", "which chrome?") with documented defaults. A host sets
 *    only what it cares about; everything else stays on its sensible default,
 *    so the widget behaves exactly as before when no inputs are provided.
 *
 * 2. **{@link RealtimeUiSignals}** — the *live runtime state*. Read-only facts
 *    the widget already knows: how wide its container is, whether the user has
 *    revealed text, what the disclosure model currently permits, whether a
 *    surface/channel/activity exists, the connection state, review/focus modes.
 *
 * 3. **{@link ResolvedRealtimeUi}** — the *answer*. A fully-resolved, boolean
 *    view-model the template binds to directly. No `&&` chains in the HTML; no
 *    business logic in getters. One source of truth, trivially unit-testable.
 *
 * ## The headline behaviour: auto orb ↔ console
 *
 * The default {@link RealtimeChromeMode} is `'auto'`. In auto mode the widget is
 * a calm **orb** until *two* things are true at once:
 *
 *   - the container is at least {@link RealtimeUiInputs.consoleBreakpointPx}
 *     wide (there's room for a structured console), **and**
 *   - the user has actually asked to see text (`textRevealed`), or the widget
 *     is reviewing a past session (which always shows the transcript).
 *
 * In other words: **getting bigger is not enough — if the user hasn't asked for
 * text, we keep the orb.** This preserves the loved "ambient by default"
 * feeling while letting the experience graduate to a full command console the
 * moment it earns the space *and* the intent. Hosts that want to force one
 * chrome forever can pass `chrome: 'orb'` or `chrome: 'console'`.
 *
 * The resolver is intentionally framework-free (no Angular import) so it can be
 * unit-tested in isolation and reused by any host.
 *
 * @module realtime-ui-config
 */

import { RealtimeUxDensity } from './realtime-disclosure';

/**
 * Which visual chrome the widget renders.
 *
 * - `'orb'` — the ambient hero orb. Minimal controls; transcript/console hidden
 *   unless the user reveals them. Best for narrow/overlay/mobile contexts.
 * - `'console'` — the structured command console: header, transcript, composer
 *   dock, and (when room allows) the surface panel. Best for full-screen.
 * - `'auto'` — *(default)* start as an orb; graduate to a console when the
 *   container is wide enough **and** the user has revealed text. See the module
 *   docs for the exact rule.
 */
export type RealtimeChromeMode = 'orb' | 'console' | 'auto';

/**
 * Identifies a control the user invoked. Emitted by the widget's `ControlInvoked`
 * output so a host can observe (or react to) any control — even one it has hidden
 * via inputs and re-rendered itself. Extend the union as new controls are added.
 */
export type RealtimeControlId =
  | 'mute'
  | 'captions'
  | 'type'
  | 'end'
  | 'minimize'
  | 'surface'
  | 'gear'
  | 'reveal-text'
  | 'pure-audio'
  | 'density';

/**
 * The connection lifecycle states the widget cares about for layout decisions.
 * Mirrors the widget's runtime `RealtimeConnectionState`; duplicated as a string
 * union here so this module stays import-free of the Angular component.
 */
export type RealtimeUiConnectionState =
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'idle'
  | 'error';

/**
 * The default container width (px) at or above which `'auto'` chrome is *allowed*
 * to graduate from orb to console — provided the user has also revealed text.
 * Chosen so a typical 390px chat overlay stays an orb, while a half-screen or
 * full-screen surface can become a console. Override per-host via
 * {@link RealtimeUiInputs.consoleBreakpointPx}.
 */
export const REALTIME_CONSOLE_BREAKPOINT_DEFAULT = 560;

/**
 * Consumer-facing configuration for the realtime widget — every field is a
 * declarative switch a host can set via an `@Input()`. **All fields are
 * optional**; omitted fields fall back to {@link DEFAULT_REALTIME_UI_INPUTS},
 * which reproduces the widget's historical behaviour. This is the surface that
 * lets the chat overlay slim the widget down, a full-screen route open it up,
 * and unexpected hosts (kiosks, demos, embeds) compose their own variant.
 *
 * A `false` here is a **hard disable** — it removes the affordance regardless of
 * what the disclosure model or runtime state would otherwise permit. A `true`
 * means "allow it"; the affordance still only appears when it's also *earned* by
 * the runtime (e.g. a surface panel only renders once a channel actually exists).
 */
export interface RealtimeUiInputs {
  /** Which chrome to render. Default `'auto'`. */
  chrome?: RealtimeChromeMode;
  /**
   * In `'auto'` chrome, the container width (px) at/above which the widget may
   * graduate to a console (still gated on text being revealed). Default
   * {@link REALTIME_CONSOLE_BREAKPOINT_DEFAULT}.
   */
  consoleBreakpointPx?: number;
  /**
   * Force compact spacing/typography regardless of size — useful for dense
   * mobile sheets. Default `false` (the widget infers compactness from width).
   */
  compact?: boolean;
  /**
   * Fade non-essential controls when the session is idle (orb chrome only), for
   * a cinematic feel. Default `true`.
   */
  autoHideControls?: boolean;
  /**
   * May the user reveal the transcript at all? When `false`, the widget is a
   * pure voice orb with no path to text (and therefore never graduates to a
   * console in `'auto'` mode). Default `true`.
   */
  allowTextReveal?: boolean;

  /** Show the captions toggle. Default `true`. */
  showCaptionsControl?: boolean;
  /** Show the density picker inside the gear menu. Default `true`. */
  showDensityPicker?: boolean;
  /** Show the minimize control (collapse the call without ending it). Default `true`. */
  showMinimize?: boolean;
  /** Show the end-call control. Default `true`. (Hosts that own their own end button may hide it.) */
  showEnd?: boolean;
  /**
   * Show the right-hand surface panel (whiteboard / browser / interactive
   * channels). Default `true`. Only renders in console chrome and once a panel
   * is actually earned.
   */
  showSurfacePanel?: boolean;
  /** Show the channel strip (active interactive channels). Default `true`. */
  showChannels?: boolean;
  /** Show the Activity rail/tab (delegations, artifacts timeline). Default `true`. */
  showActivityRail?: boolean;
  /**
   * Show developer affordances ("open session / open run" links, dev-only
   * panels). Default `true`, but still additionally gated by the per-session
   * dev-mode toggle, so this is a hard *ceiling*, not a force-on.
   */
  showDevLinks?: boolean;
  /** Allow drag-to-resize of the surface panel. Default `true`. */
  allowResize?: boolean;
}

/**
 * The complete, defaulted input set. Spreading this over a partial
 * {@link RealtimeUiInputs} yields a fully-populated config; the resolver does
 * exactly that, so callers never deal with `undefined`.
 */
export const DEFAULT_REALTIME_UI_INPUTS: Required<RealtimeUiInputs> = {
  chrome: 'auto',
  consoleBreakpointPx: REALTIME_CONSOLE_BREAKPOINT_DEFAULT,
  compact: false,
  autoHideControls: true,
  allowTextReveal: true,
  showCaptionsControl: true,
  showDensityPicker: true,
  showMinimize: true,
  showEnd: true,
  showSurfacePanel: true,
  showChannels: true,
  showActivityRail: true,
  showDevLinks: true,
  allowResize: true,
};

/**
 * Live runtime facts the widget feeds into the resolver. These are *observed*,
 * not configured — they come from the disclosure model, a `ResizeObserver`, and
 * the session/channel state. Pure data so the resolver stays testable.
 */
export interface RealtimeUiSignals {
  /** Current width of the widget's container, in px (from a `ResizeObserver`). */
  containerWidthPx: number;
  /**
   * Has the user revealed text this session? (i.e. tapped "show the
   * conversation" / engaged the composer — disclosure level ≥ 1.) This is the
   * intent half of the auto orb↔console rule.
   */
  textRevealed: boolean;
  /** Disclosure model says a transcript may be shown. */
  disclosureShowThread: boolean;
  /** Disclosure model says the composer/text dock may be shown. */
  disclosureShowComposer: boolean;
  /** Disclosure model says a surface panel may be shown. */
  disclosureShowPanel: boolean;
  /** Disclosure model says the gear/settings menu may be shown. */
  disclosureShowGear: boolean;
  /** A surface/channel actually exists to populate the panel. */
  surfacePanelEarned: boolean;
  /** ≥ 1 interactive channel is active. */
  hasChannels: boolean;
  /** ≥ 1 delegation/activity has occurred (Activity rail has content). */
  hasActivity: boolean;
  /** Per-session developer mode is on. */
  devMode: boolean;
  /** The widget is reviewing a past (recorded) session, not a live call. */
  isReviewing: boolean;
  /** A single channel surface is maximized (focus mode); the main column is hidden. */
  channelFocus: boolean;
  /** Current connection lifecycle state. */
  connectionState: RealtimeUiConnectionState;
}

/**
 * The resolved, render-ready view-model. Every field is a final boolean (or the
 * effective chrome) — the template binds straight to these with no further
 * logic. This is the single source of truth for "what is on screen right now".
 */
export interface ResolvedRealtimeUi {
  /** The effective chrome after resolving `'auto'`. */
  chrome: 'orb' | 'console';
  /** Whether compact spacing/typography applies. */
  compact: boolean;
  /** True while connecting — hosts can show a single, size-independent loader. */
  connecting: boolean;

  /** The big ambient hero orb is the primary surface. */
  showHero: boolean;
  /** The transcript/thread is visible. */
  showThread: boolean;
  /** The text composer dock is visible. */
  showComposer: boolean;
  /** The right-hand surface panel is visible. */
  showSurfacePanel: boolean;
  /** The Activity tab/rail is available. */
  showActivityTab: boolean;
  /** The channel strip is visible. */
  showChannelStrip: boolean;

  /** The captions toggle is available. */
  showCaptionsControl: boolean;
  /** The density picker is available (inside the gear). */
  showDensityPicker: boolean;
  /** The gear/settings affordance is available. */
  showGear: boolean;
  /** Developer links/panels are available. */
  showDevLinks: boolean;
  /** The minimize control is available. */
  showMinimize: boolean;
  /** The end-call control is available. */
  showEnd: boolean;

  /** The surface panel may be drag-resized. */
  allowResize: boolean;
  /** The user has a path to reveal text. */
  allowTextReveal: boolean;
  /** Non-essential controls should auto-fade when idle. */
  autoHideControls: boolean;
}

/**
 * A safe, dependency-free baseline {@link RealtimeUiSignals}. Use this to seed a
 * resolved view-model **before** the component's runtime dependencies (the
 * disclosure model, the session state, the `ResizeObserver`) exist — e.g. in a
 * field initializer. It describes a freshly-connecting widget at zero width with
 * nothing earned yet, so the first paint is a calm orb until `recomputeUi()`
 * runs with real signals. Never read `this` to build the first value.
 */
export const DEFAULT_REALTIME_UI_SIGNALS: RealtimeUiSignals = {
  containerWidthPx: 0,
  textRevealed: false,
  disclosureShowThread: false,
  disclosureShowComposer: false,
  disclosureShowPanel: false,
  disclosureShowGear: false,
  surfacePanelEarned: false,
  hasChannels: false,
  hasActivity: false,
  devMode: false,
  isReviewing: false,
  channelFocus: false,
  connectionState: 'connecting',
};

/**
 * Resolve the consumer config + live signals into a render-ready view-model.
 *
 * Pure and deterministic: same inputs ⇒ same output, no side effects, no clock,
 * no DOM. Safe to call on every change-detection pass and trivial to unit test.
 *
 * The resolution order is:
 *  1. fill defaults,
 *  2. decide the effective {@link RealtimeChromeMode} (the orb↔console rule),
 *  3. for each affordance, AND the consumer's switch with the runtime gate.
 *
 * @param inputs  consumer configuration (partial; defaults fill the rest)
 * @param signals live runtime facts
 * @returns the fully-resolved {@link ResolvedRealtimeUi}
 *
 * @example Chat overlay (lean, ambient):
 * ```ts
 * resolveRealtimeUi(
 *   { chrome: 'auto', showSurfacePanel: false, showActivityRail: false, showDevLinks: false },
 *   signals
 * );
 * ```
 *
 * @example Full-screen route (rich console):
 * ```ts
 * resolveRealtimeUi({ chrome: 'auto', consoleBreakpointPx: 480 }, wideSignals);
 * ```
 */
export function resolveRealtimeUi(
  inputs: RealtimeUiInputs | null | undefined,
  signals: RealtimeUiSignals,
): ResolvedRealtimeUi {
  const cfg: Required<RealtimeUiInputs> = { ...DEFAULT_REALTIME_UI_INPUTS, ...(inputs ?? {}) };

  const connecting = signals.connectionState === 'connecting';
  const allowTextReveal = cfg.allowTextReveal;
  const chrome = resolveChrome(cfg, signals, allowTextReveal);
  const isConsole = chrome === 'console';
  const compact = cfg.compact || signals.containerWidthPx < cfg.consoleBreakpointPx;

  // The transcript shows when the user has EXPLICITLY revealed text this session
  // (`textRevealed`), OR we're in a console (consoles always carry the thread), OR we're
  // reviewing a recording. We deliberately do NOT consult the disclosure ratchet here: a
  // power user with a high base level still opens to the calm orb, exactly like the historical
  // `ShowHero = !ShowCaptions` behaviour — "keep the orb until the user asks for text".
  const showThread = allowTextReveal && (signals.textRevealed || isConsole || signals.isReviewing);

  // The hero orb owns the surface in orb chrome (and there's nothing else to show).
  const showHero = chrome === 'orb' && !showThread;

  const showComposer = isConsole && allowTextReveal && signals.disclosureShowComposer && !signals.isReviewing;

  // The surface/Details panel opens ON DEMAND when earned (the Details peek, the agent's
  // OpenSurfacePanel, content auto-reveal — all set surfacePanelEarned). It is an INDEPENDENT
  // right-hand peek that rides ALONGSIDE whatever the main column shows — it must NOT require the
  // cross-session disclosure ratchet (disclosureShowPanel = SessionLevel >= 2), and it must NOT
  // require the user to have revealed text.
  //
  // It was previously gated on `isConsole`, which bundled TWO things: "there's room" (legitimate —
  // don't cram a side panel into a narrow overlay) AND "the user revealed text" (wrong for a peek).
  // The text-reveal coupling meant opening Details with captions OFF flipped the whole left column
  // from the hero orb to an empty transcript (the orb vanished), and toggling captions back off
  // yanked the panel out from under an open peek. The design intent (see the auto-reveal comment in
  // the overlay component: "the left column stays exactly as it was, pure audio included") is a peek
  // beside the orb. So we keep only the ROOM half: the panel shows when earned and either the chrome
  // is already a console (incl. review / forced-console at any width) OR the container is at least as
  // wide as the console breakpoint — never in a cramped narrow overlay, and never dependent on text.
  const roomForSurfacePanel = isConsole || signals.containerWidthPx >= cfg.consoleBreakpointPx;
  const showSurfacePanel =
    cfg.showSurfacePanel && signals.surfacePanelEarned && !signals.channelFocus && roomForSurfacePanel;

  const showActivityTab = cfg.showActivityRail && (signals.hasActivity || signals.isReviewing) && isConsole;

  const showChannelStrip = cfg.showChannels && signals.hasChannels && isConsole && !signals.channelFocus;

  const showGear = signals.disclosureShowGear || isConsole;

  return {
    chrome,
    compact,
    connecting,
    showHero,
    showThread,
    showComposer,
    showSurfacePanel,
    showActivityTab,
    showChannelStrip,
    showCaptionsControl: cfg.showCaptionsControl,
    showDensityPicker: cfg.showDensityPicker && showGear,
    showGear,
    showDevLinks: cfg.showDevLinks && signals.devMode,
    showMinimize: cfg.showMinimize && !signals.isReviewing,
    showEnd: cfg.showEnd,
    allowResize: cfg.allowResize && showSurfacePanel,
    allowTextReveal,
    autoHideControls: cfg.autoHideControls && chrome === 'orb',
  };
}

/**
 * Decide the effective chrome. Forced modes win outright; `'auto'` graduates to a
 * console only when there's both **room** (width ≥ breakpoint) and **intent**
 * (text revealed) — or when reviewing, which always wants the transcript.
 *
 * @internal
 */
function resolveChrome(
  cfg: Required<RealtimeUiInputs>,
  signals: RealtimeUiSignals,
  allowTextReveal: boolean,
): 'orb' | 'console' {
  if (cfg.chrome === 'orb') {
    return 'orb';
  }
  if (cfg.chrome === 'console') {
    return 'console';
  }
  // auto
  if (signals.isReviewing) {
    return 'console';
  }
  if (!allowTextReveal) {
    return 'orb';
  }
  // Intent is the USER explicitly revealing text this session — NOT the disclosure ratchet.
  // Wider-alone keeps the orb; a power user who hasn't asked for text keeps the orb too.
  const hasRoom = signals.containerWidthPx >= cfg.consoleBreakpointPx;
  return hasRoom && signals.textRevealed ? 'console' : 'orb';
}
