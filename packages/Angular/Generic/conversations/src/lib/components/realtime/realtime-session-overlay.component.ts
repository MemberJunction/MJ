import { Component, ElementRef, EventEmitter, HostListener, Input, Output, OnDestroy, AfterViewInit, ChangeDetectorRef, NgZone, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJStorageMediaPlayerComponent, MediaTranscriptCue } from '@memberjunction/ng-media-player';
import { RealtimeConnectionState, RealtimeSessionService } from '../../services/realtime-session.service';
import { ParsedDelegationArtifact } from '../../services/delegation-result-parser';
import { BuildReviewThreadItems, RealtimeSessionReview, RealtimeSessionReviewTurn } from '../../services/realtime-session-review.service';
import { RealtimeSessionState } from './realtime-session-state';
import { RealtimeAgentBannerComponent } from './realtime-agent-banner.component';
import { RealtimeSessionThreadComponent } from './realtime-session-thread.component';
import { RealtimeChannelStripComponent } from './realtime-channel-strip.component';
import { RealtimeComposerComponent } from './realtime-composer.component';
import { RealtimeSurfaceTabsComponent } from './realtime-surface-tabs.component';
import {
  ClampSurfacePanelWidth, DefaultSurfacePanelWidth, IsSurfacePanelDrag, ParseSurfacePanelPref,
  SerializeSurfacePanelPref, SurfacePanelDragWidth,
  SURFACE_PANEL_COLLAPSED_WIDTH, SURFACE_PANEL_DEFAULT_WIDTH, SURFACE_PANEL_PREF_KEY
} from './realtime-surface-panel-prefs';
import { RealtimeDisclosureModel, RealtimeUxDensity, SerializeUxMilestones, REALTIME_UX_PREF_KEY } from './realtime-disclosure';
import {
  resolveRealtimeUi, DEFAULT_REALTIME_UI_INPUTS, DEFAULT_REALTIME_UI_SIGNALS,
  RealtimeUiInputs, RealtimeUiSignals, ResolvedRealtimeUi,
  RealtimeChromeMode, RealtimeControlId, RealtimeUiConnectionState
} from './realtime-ui-config';
import { RealtimeAudioVisualFrame, RealtimeAudioVisualSmoother, RealtimeDirection } from './realtime-audio-visuals';
import { RealtimeChannelTabRegistration, ShouldRemoveReviewWhiteboardTab } from './realtime-surface-tabs.model';
import { ShouldRegisterChannelTabUpFront } from './realtime-surface-tab-style';
import { BaseRealtimeChannelClient } from './channels/base-realtime-channel-client';
import { RealtimeWhiteboardBoardComponent, WhiteboardState } from '@memberjunction/ng-whiteboard';

/**
 * A request to open an entity record, emitted by the call overlay's gear-gated developer
 * links ("Open run" / "Open session"). The Generic host (chat area) converts it onto its
 * existing `openEntityRecord` output chain — the package never navigates itself (no Router).
 */
export interface RealtimeNavigateRequest {
  /** Entity to open (e.g. `MJ: AI Agent Runs`, `MJ: AI Agent Sessions`). */
  EntityName: string;
  /** ID of the record to open. */
  RecordID: string;
}

/**
 * A request to RESUME a reviewed session as a NEW live call, emitted by review mode's
 * "Start live session" button. The host (chat area) clears its review state and starts a
 * voice session through the same path the composer's mic uses, passing
 * {@link LastSessionId} so the server chains the new session to the reviewed one
 * (restoring saved channel states such as the whiteboard via `PriorChannelStatesJson`).
 */
export interface RealtimeStartLiveRequest {
  /** Agent the resumed session should front (review Config `targetAgentID`, else the session's `AgentID`). */
  TargetAgentId: string;
  /** Conversation the reviewed session was bound to, when any. */
  ConversationId: string | null;
  /** The reviewed session's id — chained as the new session's `lastSessionId`. */
  LastSessionId: string;
}


/**
 * The "call mode" overlay for a live real-time voice session. Hosted by the
 * conversation chat area (`<mj-conversation-chat-area>`) behind `Active$`, it fills the
 * conversation panel IN PLACE (`position:absolute; inset:0` over the panel — not a
 * fixed app-wide dialog), replacing the conversation view including the composer.
 *
 * Two-column layout:
 *  - MAIN column — {@link RealtimeAgentBannerComponent} (the unified APP-BAR: identity +
 *    turn-state + the disclosure-gated action cluster), the unified
 *    {@link RealtimeSessionThreadComponent} (or the level-0 pure-audio hero), the channel
 *    strip, and {@link RealtimeComposerComponent} (the bottom dock: phone-call strip ⇄
 *    fused minis+composer).
 *  - RIGHT PANEL — {@link RealtimeSurfaceTabsComponent}: the TABBED surface panel.
 *    Tab 1 "Activity" hosts the session activity rail; one tab opens per ARTIFACT a
 *    delegated run produces (auto-focused + flashed on arrival, viewed read-only via the
 *    standard artifact viewer); ONE TAB PER INTERACTIVE CHANNEL the session resolved from
 *    the `MJ: AI Agent Channels` registry. Collapsible to a slim strip at the panel level.
 *
 * INTERACTIVE CHANNELS ARE PLUGINS — this shell is channel-agnostic. It subscribes
 * {@link RealtimeSessionService.ActiveChannels$} and registers one surface tab per
 * {@link BaseRealtimeChannelClient} (key/title/icon from the plugin); the tab pane creates
 * the plugin's surface component dynamically and the PLUGIN wires its own inputs/outputs.
 * The only channel-generic affordance the shell owns is the FOCUS layout: any channel may
 * request it (via its context's `SetFocusMode` → {@link RealtimeSessionService.ChannelFocus$}),
 * which collapses the main call column (`.board-focus`) and shows the floating call pill.
 *
 * Owns the shared {@link RealtimeSessionState} — the SINGLE merge of the service's
 * caption/delegation/narration streams — and passes it to both thread and rail via
 * inputs, so neither duplicates subscription logic.
 *
 * DEVELOPER MODE: the controls row's gear toggles {@link DevMode} (per-session, off by
 * default, never persisted), revealing "Open run" links on delegation cards / rail items
 * and an "Open session" link in the banner. Clicking one emits {@link NavigateRequest}
 * and MINIMIZES the call (via {@link RealtimeSessionService.SetMinimized}) — the session
 * stays live while the host navigates to the record.
 *
 * SESSION REVIEW MODE: when the host supplies {@link ReviewData} (a loaded
 * `RealtimeSessionReview`) and NO live session is active, the overlay renders what went
 * down in that PAST session instead of a live call: the banner shows a "Session review"
 * badge + lifecycle range + close-reason chip; the SAME thread/rail components render the
 * historical caption turns and delegated-run cards (via
 * {@link RealtimeSessionState.LoadHistoricalItems}); a read-only Whiteboard tab is
 * registered ONLY when the session saved a parseable Whiteboard channel state. Everything
 * live is DEAD in review — no mic, no captions stream, no composer, no channel strip; the
 * controls collapse to a single "Start live session" button ({@link StartLiveRequested},
 * which resumes by chaining `lastSessionId`) and a Close button ({@link ReviewClosed}).
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-session-overlay',
  imports: [
    CommonModule,
    SharedGenericModule,
    RealtimeAgentBannerComponent,
    RealtimeSessionThreadComponent,
    RealtimeChannelStripComponent,
    RealtimeComposerComponent,
    RealtimeSurfaceTabsComponent,
    RealtimeWhiteboardBoardComponent,
    MJStorageMediaPlayerComponent
  ],
  templateUrl: './realtime-session-overlay.component.html',
  styleUrl: './realtime-session-overlay.component.css'
})
export class RealtimeSessionOverlayComponent extends BaseAngularComponent implements AfterViewInit, OnDestroy {
  private _agentName = 'Sage';

  /**
   * True while the call is MINIMIZED: the overlay hides itself (CSS, not destruction) so
   * the host can show its floating "on call" pill WITHOUT losing this shell's merged
   * session state (delegation cards ride non-replaying streams) or view state (dev mode,
   * expanded chips, scroll position). The host binds this from `Minimized$`.
   */
  @Input() Hidden = false;

  /** Display name of the agent the voice session fronts (e.g. "Sage"). */
  @Input()
  set AgentName(value: string) {
    this._agentName = value || 'Sage';
    this.State.AgentName = this._agentName;
  }
  get AgentName(): string {
    return this._agentName;
  }

  /** The signed-in user, threaded to the surface panel's artifact viewer. */
  @Input() CurrentUser: UserInfo | null = null;

  /** The active environment id, threaded to the surface panel's artifact viewer. */
  @Input() EnvironmentID = '';

  // ── Declarative UI configuration (host controls every aspect of the surface) ──
  //
  // Each input is a thin, PascalCase setter over a private slot in {@link _uiInputs}.
  // When a host binds it, that field wins over the {@link UiConfig} bag (individual
  // input precedence). Setting any of these recomputes the resolved view-model so the
  // change takes effect on the next CD pass. Every field is optional and defaults to
  // the historical behaviour via {@link DEFAULT_REALTIME_UI_INPUTS}, so existing call
  // sites that bind none of them behave exactly as before.
  //
  // See {@link RealtimeUiInputs} / the package README for the full contract + recipes.

  /**
   * The chrome the widget renders: the ambient `'orb'`, the structured `'console'`, or
   * `'auto'` (default) which starts as an orb and graduates to a console once the
   * container is wide enough AND the user has revealed text. Mirrors
   * {@link RealtimeUiInputs.chrome}.
   *
   * @example Force the rich console for a full-screen route:
   * ```html
   * <mj-realtime-session-overlay [Chrome]="'console'"></mj-realtime-session-overlay>
   * ```
   */
  @Input()
  set Chrome(value: RealtimeChromeMode | undefined) { this.setUiInput('chrome', value); }
  get Chrome(): RealtimeChromeMode | undefined { return this._uiInputs.chrome; }

  /**
   * In `'auto'` chrome, the container width (px) at/above which the widget may graduate
   * to a console (still gated on text being revealed). Default `560`. Mirrors
   * {@link RealtimeUiInputs.consoleBreakpointPx}.
   */
  @Input()
  set ConsoleBreakpointPx(value: number | undefined) { this.setUiInput('consoleBreakpointPx', value); }
  get ConsoleBreakpointPx(): number | undefined { return this._uiInputs.consoleBreakpointPx; }

  /**
   * Force dense spacing/typography regardless of width (useful for tight mobile sheets).
   * Default `false` — compactness is otherwise inferred from the container width.
   */
  @Input()
  set Compact(value: boolean | undefined) { this.setUiInput('compact', value); }
  get Compact(): boolean | undefined { return this._uiInputs.compact; }

  /** Fade non-essential controls when the session is idle (orb chrome only). Default `true`. */
  @Input()
  set AutoHideControls(value: boolean | undefined) { this.setUiInput('autoHideControls', value); }
  get AutoHideControls(): boolean | undefined { return this._uiInputs.autoHideControls; }

  /**
   * May the user reveal the transcript at all? `false` makes the widget a pure voice orb
   * with no path to text (and never graduates to a console in `'auto'`). Default `true`.
   */
  @Input()
  set AllowTextReveal(value: boolean | undefined) { this.setUiInput('allowTextReveal', value); }
  get AllowTextReveal(): boolean | undefined { return this._uiInputs.allowTextReveal; }

  /** Show the captions toggle. Default `true`. */
  @Input()
  set ShowCaptionsControl(value: boolean | undefined) { this.setUiInput('showCaptionsControl', value); }
  get ShowCaptionsControl(): boolean | undefined { return this._uiInputs.showCaptionsControl; }

  /** Show the density picker inside the gear menu. Default `true`. */
  @Input()
  set ShowDensityPicker(value: boolean | undefined) { this.setUiInput('showDensityPicker', value); }
  get ShowDensityPicker(): boolean | undefined { return this._uiInputs.showDensityPicker; }

  /** Show the minimize control (collapse the call without ending it). Default `true`. */
  @Input()
  set ShowMinimize(value: boolean | undefined) { this.setUiInput('showMinimize', value); }
  get ShowMinimize(): boolean | undefined { return this._uiInputs.showMinimize; }

  /** Show the end-call control. Default `true` (hosts that own their own end button may hide it). */
  @Input()
  set ShowEnd(value: boolean | undefined) { this.setUiInput('showEnd', value); }
  get ShowEnd(): boolean | undefined { return this._uiInputs.showEnd; }

  /**
   * Show the right-hand surface panel (whiteboard / browser / interactive channels).
   * Default `true`; only renders in console chrome and once a panel is actually earned.
   */
  @Input()
  set ShowSurfacePanel(value: boolean | undefined) { this.setUiInput('showSurfacePanel', value); }
  get ShowSurfacePanel(): boolean | undefined { return this._uiInputs.showSurfacePanel; }

  /** Show the channel strip (active interactive channels). Default `true`. */
  @Input()
  set ShowChannels(value: boolean | undefined) { this.setUiInput('showChannels', value); }
  get ShowChannels(): boolean | undefined { return this._uiInputs.showChannels; }

  /** Show the Activity rail/tab (delegations, artifacts timeline). Default `true`. */
  @Input()
  set ShowActivityRail(value: boolean | undefined) { this.setUiInput('showActivityRail', value); }
  get ShowActivityRail(): boolean | undefined { return this._uiInputs.showActivityRail; }

  /**
   * Show developer affordances ("open session / open run" links). Default `true`, but
   * still additionally gated by the per-session dev-mode toggle — a hard ceiling, not a
   * force-on.
   */
  @Input()
  set ShowDevLinks(value: boolean | undefined) { this.setUiInput('showDevLinks', value); }
  get ShowDevLinks(): boolean | undefined { return this._uiInputs.showDevLinks; }

  /** Allow drag-to-resize of the surface panel. Default `true`. */
  @Input()
  set AllowResize(value: boolean | undefined) { this.setUiInput('allowResize', value); }
  get AllowResize(): boolean | undefined { return this._uiInputs.allowResize; }

  /**
   * A programmatic override bag, merged UNDER the individual inputs — any field also set
   * via a dedicated `@Input()` wins over its entry here. Lets a host configure the whole
   * surface in one binding (e.g. a saved per-context preset) without enumerating a dozen
   * attributes.
   *
   * @example
   * ```html
   * <mj-realtime-session-overlay [UiConfig]="leanOverlayPreset"></mj-realtime-session-overlay>
   * ```
   */
  @Input()
  set UiConfig(value: RealtimeUiInputs | null | undefined) {
    this._uiConfigBag = value ?? null;
    this.recomputeUi();
  }
  get UiConfig(): RealtimeUiInputs | null | undefined { return this._uiConfigBag; }

  /**
   * SESSION REVIEW data: when set (and no live session is active) the overlay renders
   * the reviewed past session instead of a live call. Setting it populates the shared
   * {@link State} with the historical thread and prepares the read-only whiteboard tab;
   * clearing it returns the state to its live-merge baseline.
   */
  @Input()
  set ReviewData(value: RealtimeSessionReview | null) {
    if (value === this._reviewData) {
      return;
    }
    this._reviewData = value;
    if (value && !this.realtime.IsActive) {
      this.enterReview(value);
    } else if (!value) {
      this.exitReview();
    }
  }
  get ReviewData(): RealtimeSessionReview | null {
    return this._reviewData;
  }

  /** Emitted after the call ends so the host can react (visibility is driven by Active$). */
  @Output() Ended = new EventEmitter<void>();

  /**
   * Emitted when a gear-gated developer link asks to open an entity record. The host is
   * expected to bubble this through its standard record-open path (the chat area re-emits
   * it on `openEntityRecord`, which Explorer routes via `NavigationService`). The overlay
   * minimizes itself first so the live call survives the navigation.
   */
  @Output() NavigateRequest = new EventEmitter<RealtimeNavigateRequest>();

  /**
   * Review mode's "Start live session": the host clears its review state and resumes the
   * reviewed session as a new live call (chaining `LastSessionId` to restore channel states).
   */
  @Output() StartLiveRequested = new EventEmitter<RealtimeStartLiveRequest>();

  /** Review mode's Close: the host clears its review state, returning to the conversation. */
  @Output() ReviewClosed = new EventEmitter<void>();

  // ── Declarative UI outputs (observe everything the surface does) ─────────────

  /** Emitted when the user minimizes the call view (the call stays live). */
  @Output() Minimized = new EventEmitter<void>();

  /** Emitted when the user reveals the transcript (opens text from the orb). */
  @Output() TextRevealed = new EventEmitter<void>();

  /** Emitted whenever the EFFECTIVE chrome flips between `'orb'` and `'console'`. */
  @Output() ChromeChanged = new EventEmitter<'orb' | 'console'>();

  /** Emitted when the connection lifecycle state changes (e.g. connecting → listening). */
  @Output() ConnectionStateChanged = new EventEmitter<RealtimeUiConnectionState>();

  /** Emitted when the mic mute is toggled; payload is the new muted state. */
  @Output() MuteChanged = new EventEmitter<boolean>();

  /** Emitted when the interface density changes. */
  @Output() DensityChanged = new EventEmitter<RealtimeUxDensity>();

  /** Emitted (px) when the user finishes resizing the surface panel. */
  @Output() SurfacePanelResized = new EventEmitter<number>();

  /**
   * A generic hook fired when ANY control is invoked — even one the host hid via inputs
   * and re-rendered itself. Lets a host observe/react to the full control surface from a
   * single binding.
   */
  @Output() ControlInvoked = new EventEmitter<RealtimeControlId>();

  private realtime = inject(RealtimeSessionService);
  private cdr = inject(ChangeDetectorRef);

  /**
   * The consumer's individually-bound UI inputs (each dedicated `@Input()` writes its own
   * slot here). Starts empty; only fields a host actually binds appear, so the resolver's
   * defaults fill the rest. Merged OVER {@link _uiConfigBag} (individual inputs win).
   */
  private _uiInputs: RealtimeUiInputs = {};

  /** The programmatic {@link UiConfig} override bag, merged UNDER the individual inputs. */
  private _uiConfigBag: RealtimeUiInputs | null = null;

  /**
   * The latest measured width (px) of the rendered overlay element, fed to the resolver as
   * {@link RealtimeUiSignals.containerWidthPx}. Maintained by a {@link ResizeObserver}; 0
   * until the first measurement (the resolver treats 0 as "narrow", i.e. an orb in auto).
   */
  private containerWidthPx = 0;

  /** Observes the rendered overlay element so chrome re-resolves as the host resizes. */
  private resizeObserver: ResizeObserver | null = null;

  /** The last connection state seen on {@link RealtimeSessionService.ConnectionState$}. */
  private currentConnectionState: RealtimeConnectionState = 'closed';

  /**
   * The resolved, render-ready view-model — the SINGLE source of truth the template binds
   * to (no `&&` chains in HTML). Rebuilt by {@link recomputeUi} whenever an input, the
   * disclosure model, the connection state, the container width, or the channel/activity
   * set changes. Read-only to consumers via the {@link Ui} getter.
   */
  // Seed from a dependency-free baseline — this runs as a field initializer, BEFORE the
  // disclosure model / session state / ResizeObserver exist. recomputeUi() produces the real
  // value once dependencies are ready (post-init + on every wired change source).
  private _ui: ResolvedRealtimeUi = resolveRealtimeUi(DEFAULT_REALTIME_UI_INPUTS, DEFAULT_REALTIME_UI_SIGNALS);

  /**
   * The current resolved UI view-model. Every visibility/affordance decision the template
   * makes reads from this — bind to its boolean fields rather than composing logic inline.
   *
   * @example
   * ```ts
   * if (this.voice.Ui.chrome === 'console') { ... }
   * ```
   */
  public get Ui(): ResolvedRealtimeUi {
    return this._ui;
  }

  /** Local mic-muted state, the single source the resolver-independent controls reflect. */
  public Muted = false;

  private _reviewData: RealtimeSessionReview | null = null;

  /**
   * Set by {@link OnStartLive} just before emitting {@link StartLiveRequested}, so the
   * ReviewData→null transition that follows is recognized as a REVIEW→LIVE CONTINUATION
   * (keep the historical thread + append the "Resumed live session" divider) rather than
   * a plain review close (clear everything).
   */
  private pendingLiveContinuation = false;

  /**
   * The reviewed chain's history artifacts, surfaced inside the Activity tab's "Session
   * artifacts" group (no longer their own tabs). Bound into the surface panel via
   * {@link ReviewArtifacts}. Empty for a live session.
   */
  private reviewArtifacts: ParsedDelegationArtifact[] = [];

  /** The reviewed chain's history artifacts for the surface panel's Activity tab. */
  public get ReviewArtifacts(): ParsedDelegationArtifact[] {
    return this.reviewArtifacts;
  }

  /**
   * True while the surface panel carries the REVIEW-registered (template-based, read-only)
   * Whiteboard tab. Drives the review→live continuation edge: when the resumed live
   * session's channel set resolves WITHOUT a Whiteboard channel, the stale review tab is
   * removed (see {@link cleanupStaleReviewBoardTab}); when it resolves WITH one, the live
   * plugin re-registers the same key and the tab upgrades in place.
   */
  private reviewWhiteboardTabRegistered = false;

  /** True while the overlay renders a PAST session (review data set, no live call). */
  public get IsReviewing(): boolean {
    return this._reviewData !== null && !this.realtime.IsActive;
  }

  /**
   * The reviewed session's rehydrated whiteboard, when it saved a parseable Whiteboard
   * channel state — rendered read-only by the review whiteboard tab. Null = no tab.
   */
  public ReviewWhiteboard: WhiteboardState | null = null;

  /**
   * The `MJ: Files` id of the reviewed session's recording, or null when nothing was recorded.
   * Bound into the storage media player, which resolves the authenticated audio itself.
   */
  public get ReviewRecordingFileID(): string | null {
    return this._reviewData?.RecordingFileID ?? null;
  }

  /**
   * The reviewed session's transcript cues (built from its turns) for the recording player's
   * transcript panel. Empty outside review.
   */
  public ReviewCues: MediaTranscriptCue[] = [];

  /** True while the Recording tab is registered (a recording exists for the reviewed session). */
  private reviewRecordingTabRegistered = false;

  /** Shared session state — single source for the thread AND the activity rail. */
  public readonly State = new RealtimeSessionState();

  /**
   * PROGRESSIVE DISCLOSURE: the levels/milestones model behind the pure-audio-first UX
   * (see {@link RealtimeDisclosureModel}). Loaded from UserInfoEngine at construction;
   * content events ({@link onSessionStateChanged}, {@link onChannelActivity}) raise the
   * volatile session level; milestones ratchet + persist when the call ends. REVIEW mode
   * bypasses disclosure entirely — a past session always renders the full console.
   */
  public readonly Disclosure = new RealtimeDisclosureModel();

  /**
   * The strip's Details peek: shows the surface panel ON DEMAND while it isn't earned yet
   * (disclosure level < 2) — Activity and channel surfaces exist before their content
   * does. Cleared automatically once content earns the panel for real.
   */
  public DetailsPeek = false;

  /**
   * Whether the typed-input dock is open — a TWO-WAY user door (the strip's Type
   * control / the T hotkey open it; the dock's hide control closes it), volatile and
   * reset per session. Typing never becomes permanent chrome.
   */
  public ComposerOpen = false;

  /** Live turn-state from the session service — drives the banner + connecting screen. */
  public readonly ConnectionState$ = this.realtime.ConnectionState$;

  /** Server-reported realtime model name for the active session — shown subtly in the banner. */
  public readonly ModelName$ = this.realtime.ModelName$;

  /**
   * Whether the conversation renders as TEXT (the thread) or stays voice-first (the
   * orb hero). A PERSISTED per-user preference (`mj.realtimeVoice.captions.v1`) —
   * default OFF: voice-first, the orb owns the screen until the user opts into text.
   */
  public ShowCaptions = false;

  /** UserInfoEngine key for the persisted captions (text-vs-orb) preference. */
  private static readonly CaptionsPrefKey = 'mj.realtimeVoice.captions.v1';

  /**
   * Whether developer affordances (open-record links) are revealed. Per-session view
   * state on this shell — off by default, reset with the overlay, never persisted.
   */
  public DevMode = false;

  /** ID of the live server-side agent session record, for the banner's dev link. */
  public get SessionID(): string | null {
    return this.realtime.CurrentAgentSessionId;
  }

  /**
   * The tabbed surface panel (right panel) — channel registrations are forwarded to it.
   * A SETTER because the panel is disclosure-gated (`@if`): it can be created LATE (the
   * first delegation / channel activity reveals it mid-call), at which point any queued
   * channel registrations and a pending auto-reveal must flush to the fresh instance.
   */
  private surfaceTabs?: RealtimeSurfaceTabsComponent;
  @ViewChild(RealtimeSurfaceTabsComponent)
  private set surfaceTabsRef(ref: RealtimeSurfaceTabsComponent | undefined) {
    this.surfaceTabs = ref;
    if (ref) {
      // A (re)created panel starts with a FRESH tab model. Re-register the live channel set
      // here (gated to whiteboard + already-used channels) so hiding the panel (pure-audio
      // return, Details off) never loses the Whiteboard or an already-used channel's tab.
      // Artifacts live in the Activity rail now (driven by session state), so there's
      // nothing artifact-specific to recover on the panel.
      this.registerChannelTabs([...this.realtime.ActiveChannels]);
      this.flushPendingChannelTabs();
      const reveal = this.pendingRevealKey;
      this.pendingRevealKey = null;
      // Deferred: focus/expand feed the parent's width bindings (wide tier) — never
      // mutate those inside the change-detection pass that created the panel.
      setTimeout(() => {
        if (reveal) {
          // The agent's first channel activity caused this creation — land ON the board.
          ref.RevealChannel(reveal);
        } else {
          // Default for a fresh panel (live AND review): the marquee surface — channels
          // lead the strip — NOT the Activity rail; agent-run plumbing is opt-in only.
          // (Review channel tabs register a beat later and take focus themselves.)
          ref.FocusFirstTab();
        }
      });
    }
  }

  /** The bottom dock — the T-to-type hotkey focuses its input. */
  @ViewChild(RealtimeComposerComponent) private composer?: RealtimeComposerComponent;

  /** Channel keys already auto-revealed this session (first activity only). */
  private revealedChannelKeys = new Set<string>();

  /** Auto-reveal that arrived before the (disclosure-gated) panel rendered. */
  private pendingRevealKey: string | null = null;

  /** Previous Active$ value — edges drive disclosure session begin/ratchet. */
  private prevActive = false;

  /** Template hosting the read-only review whiteboard (root-level, so always resolvable). */
  @ViewChild('reviewBoardTpl') private reviewBoardTpl?: TemplateRef<unknown>;

  /** Template hosting the review-mode recording player (root-level, so always resolvable). */
  @ViewChild('recordingTpl') private recordingTpl?: TemplateRef<unknown>;

  /** Channel registrations received before the surface panel rendered (flushed in ngAfterViewInit). */
  private pendingChannelTabs: RealtimeChannelTabRegistration[] = [];

  /** True once the view (and the review-board template ref) exists. */
  private viewReady = false;

  // ── Channel FOCUS layout (channel-generic — any plugin may request it) ─────

  /**
   * True while a channel surface is in FOCUS mode: the main call column collapses
   * (`.board-focus` on the overlay) and a compact floating call pill (orb + state +
   * mute / show-thread / end) rides over the surface.
   */
  public ChannelFocusMode = false;

  /** Mic-muted state reflected on the focus pill's mute button. */
  public FocusPillMuted = false;

  /** The channel currently holding the focus layout (the pill's exit routes back to it). */
  private focusChannel: BaseRealtimeChannelClient | null = null;

  private subs: Subscription[] = [];

  constructor() {
    super();
    this.loadPanelWidthPref();
    this.loadDisclosurePref();
    this.loadCaptionsPref();
    this.State.Attach(this.realtime);
    this.subs.push(
      // Re-render on merged-state changes; content arrival raises the disclosure level.
      this.State.Changed$.subscribe(() => this.onSessionStateChanged()),
      // Disclosure ratchet moved — re-resolve the view-model (thread/composer/gear gates).
      this.Disclosure.Changed$.subscribe(() => this.recomputeUi()),
      // One surface tab per registry-resolved channel plugin (replays the current set).
      this.realtime.ActiveChannels$.subscribe(channels => { this.registerChannelTabs(channels); this.recomputeUi(); }),
      // Any channel may request the focus layout through its host context.
      this.realtime.ChannelFocus$.subscribe(event => this.onChannelFocus(event.Channel, event.Focused)),
      // The agent ACTED on a channel — auto-reveal its surface tab on first activity.
      this.realtime.ChannelActivity$.subscribe(plugin => this.onChannelActivity(plugin)),
      // Live/idle flips: reset/ratchet disclosure + re-evaluate the review-vs-live branch.
      this.realtime.Active$.subscribe(active => this.onActiveChanged(active)),
      // Connection lifecycle drives chrome (the `connecting` loader) + the public output.
      this.realtime.ConnectionState$.subscribe(state => this.onConnectionStateChanged(state))
    );
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.startResizeObserver();
    this.flushPendingChannelTabs();
    this.registerReviewBoardTab();
    this.registerReviewArtifactTabs();
    // Cues were already built by enterReview() when ReviewData was set; here we only need to
    // (re)register the recording tab now that the #recordingTpl ref exists. The storage media
    // player resolves the authenticated audio itself from the RecordingFileID.
    this.registerReviewRecordingTab();
  }

  // ── Declarative UI config: inputs → signals → resolved view-model ────────────

  /**
   * Writes one individually-bound UI input into {@link _uiInputs} and re-resolves the
   * view-model. `undefined` clears the slot (so the {@link UiConfig} bag / default applies).
   * Called by every dedicated `@Input()` setter.
   *
   * @param key   the {@link RealtimeUiInputs} field to set
   * @param value the bound value, or `undefined` to clear the override
   */
  private setUiInput<K extends keyof RealtimeUiInputs>(key: K, value: RealtimeUiInputs[K] | undefined): void {
    if (value === undefined) {
      delete this._uiInputs[key];
    } else {
      this._uiInputs[key] = value;
    }
    this.recomputeUi();
  }

  /**
   * The effective consumer inputs: the {@link UiConfig} bag with the individually-bound
   * inputs layered ON TOP, so a dedicated `@Input()` always wins over its bag entry.
   */
  private get mergedUiInputs(): RealtimeUiInputs {
    return { ...(this._uiConfigBag ?? {}), ...this._uiInputs };
  }

  /**
   * Maps the runtime {@link RealtimeConnectionState} onto the resolver's
   * {@link RealtimeUiConnectionState}. `'closed'` (no live call) maps to `'idle'`; the
   * other states pass through 1:1.
   */
  private mapConnectionState(state: RealtimeConnectionState): RealtimeUiConnectionState {
    return state === 'closed' ? 'idle' : state;
  }

  /**
   * Builds the live {@link RealtimeUiSignals} the resolver consumes, reading current facts
   * from the disclosure model, the session/channel state, review mode, focus mode, and the
   * {@link ResizeObserver}-measured width. Pure read — no side effects.
   */
  private buildSignals(): RealtimeUiSignals {
    // Defensive: this can be reached before every dependency is wired (field-init / early
    // change-detection). Fall back to the dependency-free baseline rather than throw — the
    // next recompute, once everything exists, produces the real value.
    const disclosure = this.Disclosure;
    if (!disclosure) {
      return DEFAULT_REALTIME_UI_SIGNALS;
    }
    const reviewing = this.IsReviewing;
    return {
      containerWidthPx: this.containerWidthPx ?? 0,
      // Text intent = the user EXPLICITLY asked to see text this session — i.e. captions are on
      // (the captions toggle, the hero's "Show the conversation", RevealText(), and SetCaptions()
      // all route through ShowCaptions). NOT the disclosure ratchet: a power user still opens to
      // the calm orb until they ask for text, matching the historical ShowHero = !ShowCaptions.
      textRevealed: this.ShowCaptions,
      disclosureShowThread: disclosure.ShowThread,
      disclosureShowComposer: disclosure.ShowComposer,
      disclosureShowPanel: disclosure.ShowPanel,
      disclosureShowGear: disclosure.ShowGear,
      // A surface to populate: the on-demand Details peek, or review (always has a surface).
      surfacePanelEarned: this.DetailsPeek || reviewing,
      hasChannels: (this.realtime?.ActiveChannels ?? []).some(c => c.HasSurface()),
      hasActivity: (this.State?.Cards?.length ?? 0) > 0,
      devMode: this.DevMode,
      isReviewing: reviewing,
      channelFocus: this.ChannelFocusMode,
      connectionState: this.mapConnectionState(this.currentConnectionState)
    };
  }

  /**
   * Re-resolves {@link Ui} from the merged inputs + current signals and emits the chrome /
   * connection-state outputs when they actually change. Safe to call on any of the wired
   * change sources (input write, disclosure ratchet, connection flip, resize, channel set);
   * the resolver is pure so redundant calls are cheap. Always marks for check.
   */
  private recomputeUi(): void {
    const next = resolveRealtimeUi(this.mergedUiInputs, this.buildSignals());
    const prevChrome = this._ui.chrome;
    this._ui = next;
    if (next.chrome !== prevChrome) {
      this.ChromeChanged.emit(next.chrome);
    }
    this.cdr.markForCheck();
  }

  /** Connection lifecycle changed: store it, re-resolve chrome, and surface the public output. */
  private onConnectionStateChanged(state: RealtimeConnectionState): void {
    if (state === this.currentConnectionState) {
      return;
    }
    this.currentConnectionState = state;
    this.ConnectionStateChanged.emit(this.mapConnectionState(state));
    this.recomputeUi();
  }

  // ── Container-width observation (drives the auto orb ↔ console graduation) ────

  /**
   * Starts observing the rendered overlay element's width so the resolver can graduate
   * `'auto'` chrome to a console when the host gives it room. Guards SSR / environments
   * without `ResizeObserver` (plain-node tests) — there the width simply stays 0 (an orb in
   * auto), which is the safe ambient default. Idempotent.
   */
  private startResizeObserver(): void {
    if (this.resizeObserver || typeof ResizeObserver !== 'function') {
      return;
    }
    const el = this.overlayElement() ?? (this.hostRef.nativeElement as HTMLElement);
    if (!el) {
      return;
    }
    // Seed an immediate measurement so the first resolve sees a real width, then observe.
    this.applyContainerWidth(el.getBoundingClientRect ? el.getBoundingClientRect().width : 0);
    this.resizeObserver = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect?.width ?? 0;
      this.ngZone.run(() => this.applyContainerWidth(width));
    });
    this.resizeObserver.observe(el);
  }

  /** Adopts a new measured width and re-resolves only when it actually changed. */
  private applyContainerWidth(width: number): void {
    const rounded = Math.round(width);
    if (rounded === this.containerWidthPx) {
      return;
    }
    this.containerWidthPx = rounded;
    this.recomputeUi();
  }

  /** Disconnects the container-width observer. */
  private stopResizeObserver(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  // ── Surface-panel sizing (flex layout + pointer-drag handle; width persisted per-user) ──
  //
  // The panel width is a PLAIN FIELD rendered via [style.width.px] — there is no split
  // library with its own internal size state to fight. The resize handle uses the same
  // mechanics as ui-components' slide-panel (`MjSlidePanelComponent`): mousedown →
  // document mousemove/mouseup registered OUTSIDE Angular, live clamp while dragging,
  // adopt + persist on release. A bare CLICK cannot move the panel by construction
  // (width follows the pointer delta) and the click-vs-drag guard keeps it from being
  // adopted or persisted.

  /** Whether the surface panel is collapsed to its slim strip (reported by the panel). */
  public PanelCollapsed = false;
  /** Wide tier active (a content tab is focused) — drives the DEFAULT width only. */
  public PanelWide = false;
  /** The user's explicit dragged width (persisted); null = follow the default tiers. */
  private userPanelWidth: number | null = null;
  /** Current expanded panel width in px (rendered as the panel's inline width). */
  public PanelWidthPx = SURFACE_PANEL_DEFAULT_WIDTH;
  /** True while the resize handle is mid-drag (brand-tints the handle). */
  public IsPanelResizing = false;
  private panelResizeStartX = 0;
  private panelResizeStartWidth = 0;
  private boundPanelResizeMove = this.onPanelResizeMove.bind(this);
  private boundPanelResizeEnd = this.onPanelResizeEnd.bind(this);
  private hostRef = inject(ElementRef);
  private ngZone = inject(NgZone);

  /** The panel's rendered width: slim strip when collapsed, otherwise the current width. */
  public get PanelAreaSize(): number {
    return this.PanelCollapsed ? SURFACE_PANEL_COLLAPSED_WIDTH : this.PanelWidthPx;
  }

  /**
   * Resizing is meaningless while collapsed or when the surface fills (focus mode), and a
   * host may hard-disable it via `[AllowResize]="false"` — in review the resolver's
   * `allowResize` is false (no live surface to resize), so this also reads the host flag
   * directly (defaulting to the historical `true`) rather than the resolved value, keeping
   * drag available in review exactly as before.
   */
  public get PanelResizeDisabled(): boolean {
    const hostAllows = this.mergedUiInputs.allowResize ?? DEFAULT_REALTIME_UI_INPUTS.allowResize;
    return this.PanelCollapsed || this.ChannelFocusMode || !hostAllows;
  }

  public OnPanelCollapsedChange(collapsed: boolean): void {
    this.PanelCollapsed = collapsed;
    this.cdr.markForCheck();
  }

  /** Wide-tier flips only move the DEFAULT width — an explicit user width always wins. */
  public OnPanelWideChanged(wide: boolean): void {
    this.PanelWide = wide;
    if (this.userPanelWidth === null) {
      // This can fire synchronously from the surface-tabs child during the FIRST change-detection
      // pass, while hostWidth() transitions 0 → real across that same pass — setting the bound width
      // inline then trips ExpressionChangedAfterItHasBeenCheckedError (380 → 308). Defer to a
      // microtask so the recompute lands in a fresh CD cycle. (Drag/reset handlers stay synchronous —
      // those run on real user events, not during CD.)
      Promise.resolve().then(() => {
        if (this.userPanelWidth === null) {
          this.PanelWidthPx = DefaultSurfacePanelWidth(this.PanelWide, this.hostWidth());
          this.cdr.markForCheck();
        }
      });
      return;
    }
    this.cdr.markForCheck();
  }

  /** Mousedown on the resize handle: capture the start state and track the pointer document-wide. */
  public OnPanelResizeStart(event: MouseEvent): void {
    if (this.PanelResizeDisabled) {
      return;
    }
    event.preventDefault();
    this.IsPanelResizing = true;
    this.panelResizeStartX = event.clientX;
    this.panelResizeStartWidth = this.PanelWidthPx;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this.boundPanelResizeMove);
      document.addEventListener('mouseup', this.boundPanelResizeEnd);
    });
    this.cdr.markForCheck();
  }

  /** Live drag: panel width follows the pointer delta, clamped to [min, 70% of the overlay]. */
  private onPanelResizeMove(event: MouseEvent): void {
    if (!this.IsPanelResizing) {
      return;
    }
    this.PanelWidthPx = SurfacePanelDragWidth(
      this.panelResizeStartWidth, this.panelResizeStartX, event.clientX, this.hostWidth()
    );
    this.ngZone.run(() => this.cdr.markForCheck());
  }

  /**
   * Release: a genuine DRAG adopts the width as the user's explicit preference and
   * persists it (debounced); a bare CLICK (movement under the tolerance) restores the
   * start width and persists nothing — the handle never snaps on a click.
   */
  private onPanelResizeEnd(event: MouseEvent): void {
    if (!this.IsPanelResizing) {
      return;
    }
    this.teardownPanelResize();
    let resizedTo: number | null = null;
    if (IsSurfacePanelDrag(this.panelResizeStartX, event.clientX)) {
      this.userPanelWidth = this.PanelWidthPx;
      this.persistPanelWidth(this.PanelWidthPx);
      resizedTo = this.PanelWidthPx;
    } else {
      this.PanelWidthPx = this.panelResizeStartWidth;
    }
    this.ngZone.run(() => {
      this.IsPanelResizing = false;
      // Surface the new width to the host only on a genuine drag (not a bare click).
      if (resizedTo !== null) {
        this.SurfacePanelResized.emit(resizedTo);
      }
      this.cdr.markForCheck();
    });
  }

  /** Double-click the handle: back to the default tier width; persist the reset. */
  public OnPanelResizeReset(): void {
    this.userPanelWidth = null;
    this.PanelWidthPx = DefaultSurfacePanelWidth(this.PanelWide, this.hostWidth());
    this.persistPanelWidth(null);
    this.cdr.markForCheck();
  }

  /** Removes the document-wide drag listeners and restores the body cursor/selection. */
  private teardownPanelResize(): void {
    document.removeEventListener('mousemove', this.boundPanelResizeMove);
    document.removeEventListener('mouseup', this.boundPanelResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  /**
   * The overlay's measurable width for clamping. The component host is
   * `display: contents` (zero rect) — measure the rendered `.call-overlay` div instead.
   */
  private hostWidth(): number {
    const host = this.hostRef.nativeElement as HTMLElement;
    const el = (host.firstElementChild as HTMLElement | null) ?? host;
    return el.getBoundingClientRect ? el.getBoundingClientRect().width : 0;
  }

  /** Reads the persisted width once per overlay instance (no-op when the engine isn't configured). */
  private loadPanelWidthPref(): void {
    try {
      const pref = ParseSurfacePanelPref(UserInfoEngine.Instance.GetSetting(SURFACE_PANEL_PREF_KEY));
      if (pref) {
        this.userPanelWidth = pref.Width;
        // hostWidth() is 0 before first layout — the clamp then enforces only the
        // minimum, and the 70% cap re-applies on the next real drag.
        this.PanelWidthPx = ClampSurfacePanelWidth(pref.Width, this.hostWidth());
        this.cdr.markForCheck();
      }
    } catch {
      // UserInfoEngine not configured (plain-node tests / early bootstrap) — default tiers apply.
    }
  }

  /** Persists the width preference server-side (debounced); reset serializes {"width":null}. */
  private persistPanelWidth(width: number | null): void {
    try {
      UserInfoEngine.Instance.SetSettingDebounced(SURFACE_PANEL_PREF_KEY, SerializeSurfacePanelPref(width));
    } catch {
      // engine unavailable — width still applies for this session
    }
  }

  // ── Progressive disclosure (the console that grows with you) ────────────────

  /**
   * True while the PURE-AUDIO hero (the orb) owns the main column. Now reads from the
   * resolved view-model ({@link Ui}): the resolver decides hero-vs-thread from the
   * effective chrome + text intent + review, so host inputs (`[Chrome]`,
   * `[AllowTextReveal]`, the breakpoint) gate it. Review still always shows the thread.
   */
  public get ShowHero(): boolean {
    return this._ui.showHero;
  }

  /**
   * Whether the surface-panel area renders. Driven by the resolved {@link Ui.showSurfacePanel}
   * (console + earned + host's `[ShowSurfacePanel]`) OR review mode, which always carries the
   * panel. The Details toggle still earns the panel on demand (it flips `surfacePanelEarned`).
   */
  public get ShowPanelArea(): boolean {
    return this._ui.showSurfacePanel || this.IsReviewing;
  }

  /** The Details (tabs) toggle is offered while live — it's the panel's one door. */
  public get ShowDetailsControl(): boolean {
    return !this.IsReviewing;
  }

  /**
   * Whether the active-channels strip renders. Preserves the historical disclosure gate
   * (level 2+, {@link RealtimeDisclosureModel.ShowComposer}) AND honours the host's
   * `[ShowChannels]` input + the resolver's focus rule: a host that sets `[ShowChannels]`
   * false hard-disables the strip, and channel-focus mode hides it. The strip component
   * itself self-hides when no channels are active, so this stays decluttered.
   */
  public get ChannelStripVisible(): boolean {
    return this.Disclosure.ShowComposer
      && (this.mergedUiInputs.showChannels ?? DEFAULT_REALTIME_UI_INPUTS.showChannels)
      && !this.ChannelFocusMode;
  }

  /**
   * Whether the surface panel's Activity tab should be shown. Reads the resolved
   * {@link Ui.showActivityTab} (host's `[ShowActivityRail]` AND activity/review AND console)
   * OR review mode — a past session's activity is always relevant even before the resolver's
   * console gate would otherwise allow it.
   */
  public get ShowActivityTab(): boolean {
    return this._ui.showActivityTab || this.IsReviewing;
  }

  /** Reads the persisted disclosure milestones (tolerant; defaults to day one). */
  private loadDisclosurePref(): void {
    try {
      this.Disclosure.Load(UserInfoEngine.Instance.GetSetting(REALTIME_UX_PREF_KEY));
    } catch {
      // UserInfoEngine not configured (plain-node tests / early bootstrap) — day-one defaults.
      this.Disclosure.Load(null);
    }
  }

  /** Reads the persisted text-vs-orb preference (tolerant; default = voice-first OFF). */
  private loadCaptionsPref(): void {
    try {
      this.ShowCaptions = UserInfoEngine.Instance.GetSetting(RealtimeSessionOverlayComponent.CaptionsPrefKey) === 'true';
    } catch {
      // UserInfoEngine not configured — voice-first default applies.
    }
  }

  /** Persists the text-vs-orb preference (debounced, best-effort). */
  private persistCaptionsPref(): void {
    try {
      UserInfoEngine.Instance.SetSettingDebounced(RealtimeSessionOverlayComponent.CaptionsPrefKey, String(this.ShowCaptions));
    } catch {
      // engine unavailable — the preference still applies for this session
    }
  }

  /** Persists the disclosure milestones server-side (debounced, best-effort). */
  private persistDisclosure(serialized: string): void {
    try {
      UserInfoEngine.Instance.SetSettingDebounced(REALTIME_UX_PREF_KEY, serialized);
    } catch {
      // engine unavailable — the ratchet still applies for this browser session
    }
  }

  /**
   * Merged-state change: re-render only. DELIBERATELY no disclosure raise — per product
   * direction, content never flips the console open: a running delegation is narrated
   * aloud, a finished artifact lands as a GLOWING (unfocused) tab, and the ONLY thing
   * that auto-reveals is a channel's first agent activity (the whiteboard demands eyes).
   * A pure-audio user stays in pure audio until THEY ask for more.
   */
  private onSessionStateChanged(): void {
    // State.Cards drives the resolver's hasActivity signal — re-resolve (also marks for check).
    this.recomputeUi();
  }

  /**
   * The agent ACTED on a channel (a tool call routed to its local executor — e.g. the
   * first whiteboard write). THE ONE AUTO-REVEAL: the surface panel opens (as a peek —
   * the left column stays exactly as it was, pure audio included) with the channel's tab
   * focused and flashed, exactly once per channel — so the user discovers the board the
   * moment it comes alive. Disclosure levels are NOT raised: no text, no composer, no
   * extra chrome — just the board.
   */
  private onChannelActivity(plugin: BaseRealtimeChannelClient): void {
    if (this.IsReviewing || this.revealedChannelKeys.has(plugin.ChannelName)) {
      return;
    }
    this.revealedChannelKeys.add(plugin.ChannelName);
    this.DetailsPeek = true; // the panel shows via the same on-demand mechanism Details uses
    // FIRST USE: a non-whiteboard channel was tab-less until now — register its tab
    // SYNCHRONOUSLY (before the reveal/focus below) so the channel exists to be revealed.
    // The whiteboard already has its tab from session start; re-registering is idempotent.
    if (plugin.HasSurface()) {
      this.registerPluginChannelTab(plugin);
    }
    if (this.surfaceTabs) {
      // Stream handler (a tool call), not a change-detection pass — reveal synchronously
      // so the board is the visible tab the instant the agent's first stroke lands. The
      // microtask-deferred RegisterChannelTab above is ordered before this RevealChannel,
      // so the tab is in place when the focus lands.
      this.surfaceTabs.RevealChannel(plugin.ChannelName);
    } else {
      // Panel not rendered yet (the peek just created it) — reveal once it exists.
      this.pendingRevealKey = plugin.ChannelName;
    }
    // DetailsPeek flipped — surfacePanelEarned changed; re-resolve (marks for check).
    this.recomputeUi();
  }

  /** Active$ edges: session start resets the volatile level; session end ratchets + persists. */
  private onActiveChanged(active: boolean): void {
    if (active && !this.prevActive) {
      this.Disclosure.BeginSession();
      this.DetailsPeek = false;
      this.ComposerOpen = false; // typing is opt-in per session (voice-first)
      this.revealedChannelKeys.clear();
      this.pendingRevealKey = null;
      this.startAudioVisualLoop();
    } else if (!active && this.prevActive) {
      this.persistDisclosure(this.Disclosure.RatchetOnSessionEnd());
      this.stopAudioVisualLoop();
    }
    this.prevActive = active;
    this.cdr.markForCheck();
  }

  // ── Audio-reactive visuals (the orb that vibrates like a speaker cone) ──────
  //
  // A requestAnimationFrame loop OUTSIDE Angular samples the client's audio meters
  // (RealtimeSessionService.GetAudioActivity → driver AnalyserNodes), runs the frame through
  // the smoothing state machine, and writes CSS custom properties + data attributes
  // straight onto the rendered overlay element — zero change detection per frame. CSS
  // gates on [data-audio-live]: with real metering the orb/EQ follow the waveform; when
  // the driver attached no meters the attribute stays 'false' and the turn-state-driven
  // keyframe animations keep working unchanged.

  /** Per-frame smoothing state (attack/decay envelopes + direction hysteresis). */
  private readonly audioSmoother = new RealtimeAudioVisualSmoother();
  private audioRafHandle: number | null = null;
  /** Last attribute values written (attributes are only touched on change). */
  private lastAudioLive: boolean | null = null;
  private lastDirection: RealtimeDirection | null = null;

  /** Starts the sampling loop (idempotent). Runs outside Angular — no CD per frame. */
  private startAudioVisualLoop(): void {
    if (this.audioRafHandle !== null || typeof requestAnimationFrame !== 'function') {
      return;
    }
    this.audioSmoother.Reset();
    this.ngZone.runOutsideAngular(() => {
      const tick = (): void => {
        this.audioRafHandle = requestAnimationFrame(tick);
        if (this.Hidden) {
          return; // minimized — skip the work, keep the loop armed
        }
        const frame = this.audioSmoother.Next(this.realtime.GetAudioActivity(), performance.now());
        this.applyAudioVisualFrame(frame);
      };
      this.audioRafHandle = requestAnimationFrame(tick);
    });
  }

  /** Stops the loop and returns the overlay to turn-state-driven animation. */
  private stopAudioVisualLoop(): void {
    if (this.audioRafHandle !== null) {
      cancelAnimationFrame(this.audioRafHandle);
      this.audioRafHandle = null;
    }
    this.audioSmoother.Reset();
    this.lastAudioLive = null;
    this.lastDirection = null;
    this.overlayElement()?.setAttribute('data-audio-live', 'false');
  }

  /** The rendered `.call-overlay` element (the :host is display:contents). */
  private overlayElement(): HTMLElement | null {
    const host = this.hostRef.nativeElement as HTMLElement;
    return (host.firstElementChild as HTMLElement | null) ?? null;
  }

  /** Writes one smoothed frame as CSS vars/attributes (attributes only on change). */
  private applyAudioVisualFrame(frame: RealtimeAudioVisualFrame | null): void {
    const el = this.overlayElement();
    if (!el) {
      return;
    }
    const live = frame !== null;
    if (live !== this.lastAudioLive) {
      this.lastAudioLive = live;
      el.setAttribute('data-audio-live', String(live));
    }
    if (!frame) {
      return;
    }
    el.style.setProperty('--voice-out', frame.OutputLevel.toFixed(3));
    el.style.setProperty('--voice-in', frame.InputLevel.toFixed(3));
    for (let i = 0; i < frame.Bins.length; i++) {
      el.style.setProperty(`--eq-${i + 1}`, frame.Bins[i].toFixed(3));
    }
    if (frame.Direction !== this.lastDirection) {
      this.lastDirection = frame.Direction;
      el.setAttribute('data-voice-dir', frame.Direction);
    }
  }

  /** The strip's Details control: peek at (or hide) the surface panel on demand. */
  public OnDetailsToggled(): void {
    this.DetailsPeek = !this.DetailsPeek;
    if (this.DetailsPeek) {
      // Land on the marquee surface (channels lead the strip; Activity is pinned last).
      setTimeout(() => this.surfaceTabs?.FocusFirstTab());
    }
    this.ControlInvoked.emit('surface');
    // DetailsPeek drives surfacePanelEarned — re-resolve (marks for check).
    this.recomputeUi();
  }

  /** The gear popover picked an interface density — apply + persist + emit. */
  public OnDensityChanged(density: RealtimeUxDensity): void {
    this.Disclosure.SetDensity(density);
    this.persistDisclosure(SerializeUxMilestones(this.Disclosure.Milestones));
    this.DensityChanged.emit(density);
    this.ControlInvoked.emit('density');
  }

  /** The hero's "Show the conversation" affordance — turns the text preference on. */
  public OnTextReveal(): void {
    this.OnCaptionsToggled(true);
    this.TextRevealed.emit();
    this.ControlInvoked.emit('reveal-text');
  }

  /**
   * The app-bar's "Pure audio": returns to the orb-only surface AND makes it stick —
   * it sets the persisted interface density to `simple` (the same setting the gear
   * writes), so a refresh / next call still opens pure audio. In-session reveals
   * ("Show the conversation", T-to-type, Details) remain available and stay ephemeral;
   * the gear's density control switches back to Standard/Pro/Auto whenever wanted.
   */
  public OnPureAudio(): void {
    this.Disclosure.SetDensity('simple');
    this.persistDisclosure(SerializeUxMilestones(this.Disclosure.Milestones));
    this.DetailsPeek = false;
    this.ControlInvoked.emit('pure-audio');
    // DetailsPeek + density changed — re-resolve (marks for check).
    this.recomputeUi();
  }

  /** App-bar Minimize: hide the call view (CSS) — the call stays fully live. */
  public OnMinimize(): void {
    this.realtime.SetMinimized(true);
    this.Minimized.emit();
    this.ControlInvoked.emit('minimize');
  }

  /** App-bar / strip End: tear the session down, then notify the host. */
  public async OnEndCall(): Promise<void> {
    this.ControlInvoked.emit('end');
    await this.realtime.EndRealtimeSession();
    this.Ended.emit();
  }

  /** Maps the realtime state onto the hero orb's `data-state` (active turn-states only). */
  public HeroOrbState(state: RealtimeConnectionState): 'speaking' | 'listening' | 'thinking' {
    switch (state) {
      case 'speaking': return 'speaking';
      case 'thinking': return 'thinking';
      default: return 'listening';
    }
  }

  /** Short first-person status line for the pure-audio hero. */
  public HeroStateLabel(state: RealtimeConnectionState): string {
    switch (state) {
      case 'speaking': return `${this.AgentName} is speaking…`;
      case 'thinking': return `${this.AgentName} is working…`;
      case 'listening': return 'Listening';
      case 'connecting': return 'Connecting…';
      case 'error': return 'Connection error';
      default: return 'On call';
    }
  }

  /**
   * T-TO-TYPE: pressing T during a live call reveals the composer (raising disclosure to
   * the engaged level when needed) and focuses its input — typing always exists, it just
   * whispers until used. Ignored while review/minimized, with modifiers, or when an
   * editable element already has focus.
   */
  @HostListener('document:keydown', ['$event'])
  public OnDocumentKeydown(event: KeyboardEvent): void {
    if (this.Hidden || this.IsReviewing || !this.realtime.IsActive) {
      return;
    }
    if ((event.key !== 't' && event.key !== 'T') || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (this.isEditableTarget(event.target) || this.isKeyboardCapturingSurfaceFocused()) {
      return;
    }
    event.preventDefault();
    this.OnComposerOpenChanged(true);
    // The dock may have just been created — focus after this CD pass.
    setTimeout(() => this.composer?.FocusInput());
  }

  /**
   * True when the event target is a native text-editing element (an input, textarea, or contentEditable),
   * where a bare letter should type — not trigger the T-to-type shortcut.
   *
   * @param eventTarget The keydown event's target.
   * @returns Whether the target is an editable element.
   */
  private isEditableTarget(eventTarget: EventTarget | null): boolean {
    const target = eventTarget as HTMLElement | null;
    return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  }

  /**
   * True when a surface that opts into capturing keyboard input currently holds focus — notably the Remote
   * Browser live canvas, which marks itself with `data-mj-capture-keys` while the user is driving it. When it
   * has focus, the overlay's global shortcuts (T-to-type) must stand down so the user's keystrokes land in the
   * remote browser, not the local composer. Decoupled by an attribute contract so the overlay needs no direct
   * reference to the surface component.
   *
   * @returns Whether a keyboard-capturing surface is focused.
   */
  private isKeyboardCapturingSurfaceFocused(): boolean {
    const active = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    return !!active && active.hasAttribute('data-mj-capture-keys');
  }

  /**
   * The composer dock opened (strip Type control / T hotkey) or closed (the dock's hide
   * control). Opening raises the 'engaged' milestone for the cross-session ratchet —
   * but the dock itself stays a per-session, user-owned toggle either way.
   */
  public OnComposerOpenChanged(open: boolean): void {
    this.ComposerOpen = open;
    if (open) {
      this.Disclosure.Raise('engaged'); // emits Changed$ → recomputeUi()
      this.ControlInvoked.emit('type');
      setTimeout(() => this.composer?.FocusInput());
    }
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.stopAudioVisualLoop();
    this.stopResizeObserver();
    if (this.IsPanelResizing) {
      this.teardownPanelResize();
      this.IsPanelResizing = false;
    }
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
    this.subs = [];
    this.State.Detach();
  }

  /**
   * Registers (or updates) an INTERACTIVE-CHANNEL tab on the surface panel. The overlay
   * calls it for every registry-resolved plugin; hosts may also call it for bespoke
   * template-based panes. Until a registration supplies a plugin / template, the tab
   * renders the "coming online…" placeholder (re-register the same `Key` to upgrade).
   * Safe to call before the panel has rendered — registrations are queued and flushed.
   */
  public RegisterChannelTab(registration: RealtimeChannelTabRegistration): void {
    if (this.surfaceTabs) {
      this.surfaceTabs.RegisterChannelTab(registration);
    } else {
      this.pendingChannelTabs.push(registration);
    }
  }

  /**
   * A done delegation card / rail entry asked to view a produced artifact's tab — an
   * EXPLICIT user request, so it may open the (otherwise Details-controlled) panel.
   */
  public OnOpenArtifactRequested(artifact: ParsedDelegationArtifact): void {
    if (this.surfaceTabs) {
      this.surfaceTabs.FocusArtifact(artifact);
      return;
    }
    // Panel hidden — open it (Details mechanism) and focus once it exists.
    this.DetailsPeek = true;
    this.cdr.markForCheck();
    setTimeout(() => this.surfaceTabs?.FocusArtifact(artifact));
  }

  /**
   * Registers a surface tab per active channel plugin THAT HAS A SURFACE — but ONLY for
   * channels already in play: the WHITEBOARD tabs immediately (a user may be the first to
   * draw), every OTHER channel stays tab-less until the agent first USES it (its first
   * {@link onChannelActivity}). This keeps the strip decluttered to surfaces actually in
   * play instead of pre-listing every registry-resolved channel.
   *
   * Server-only channels ({@link BaseRealtimeChannelClient.HasSurface} === `false`) render no
   * tab — their tools + perception are wired by the session service regardless.
   */
  private registerChannelTabs(channels: BaseRealtimeChannelClient[]): void {
    this.cleanupStaleReviewBoardTab(channels);
    for (const plugin of channels) {
      if (!plugin.HasSurface()) {
        continue; // server-only channel — no surface to tab.
      }
      if (!ShouldRegisterChannelTabUpFront(plugin.ChannelName, this.realtime.HasChannelBeenUsed(plugin.ChannelName))) {
        continue; // not the whiteboard and not used yet — it earns its tab on first activity.
      }
      this.registerPluginChannelTab(plugin);
    }
    this.cdr.markForCheck();
  }

  /** Registers (or upgrades) one channel plugin's surface tab on the panel. */
  private registerPluginChannelTab(plugin: BaseRealtimeChannelClient): void {
    this.RegisterChannelTab({
      Key: plugin.ChannelName,
      Title: plugin.TabTitle,
      Icon: plugin.TabIcon,
      Color: plugin.TabColor,
      Plugin: plugin
    });
  }

  /**
   * REVIEW→LIVE continuation edge: when the resumed live session resolves its channel set
   * WITHOUT a Whiteboard channel, the review-registered read-only board tab is now a dead
   * surface — remove it (Activity regains focus if it was active). When the set HAS a
   * Whiteboard channel, the plugin registration above upgrades the same tab key in place,
   * so the review flag is simply released. Review ARTIFACT tabs are deliberately kept —
   * they are wanted carryover into the live session.
   */
  private cleanupStaleReviewBoardTab(channels: BaseRealtimeChannelClient[]): void {
    if (!this.reviewWhiteboardTabRegistered) {
      return;
    }
    if (ShouldRemoveReviewWhiteboardTab(this.realtime.IsActive, this.reviewWhiteboardTabRegistered, channels)) {
      this.surfaceTabs?.RemoveTab('Whiteboard');
      // Also drop a still-queued review registration (panel not rendered yet — rare but possible).
      this.pendingChannelTabs = this.pendingChannelTabs.filter(r => !(r.Key === 'Whiteboard' && r.Content));
      this.reviewWhiteboardTabRegistered = false;
    } else if (channels.some(c => c.ChannelName === 'Whiteboard')) {
      this.reviewWhiteboardTabRegistered = false; // live plugin owns the tab now (upgraded in place)
    }
  }

  /** Forwards channel registrations that arrived before the panel existed. */
  private flushPendingChannelTabs(): void {
    if (this.surfaceTabs && this.pendingChannelTabs.length > 0) {
      for (const reg of this.pendingChannelTabs) {
        this.surfaceTabs.RegisterChannelTab(reg);
      }
      this.pendingChannelTabs = [];
    }
  }

  /**
   * The captions toggle = the persisted text-vs-orb switch: on → the thread renders
   * (raising the text disclosure milestone); off → the orb hero owns the screen again,
   * at any level. Persisted per-user so the choice survives refresh and devices.
   */
  public OnCaptionsToggled(on: boolean): void {
    this.ShowCaptions = on;
    if (on) {
      this.Disclosure.Raise('text'); // emits Changed$ → recomputeUi()
    }
    this.persistCaptionsPref();
    this.ControlInvoked.emit('captions');
    this.cdr.markForCheck();
  }

  /** Reflect the gear toggle from the controls into the dev affordances. */
  public OnDevModeToggled(on: boolean): void {
    this.DevMode = on;
    this.ControlInvoked.emit('gear');
    // devMode drives the resolver's showDevLinks signal — re-resolve (marks for check).
    this.recomputeUi();
  }

  /** A dev link asked to open a delegated agent run record. */
  public OnOpenRunRequested(runId: string): void {
    this.requestNavigate('MJ: AI Agent Runs', runId);
  }

  /** The banner's dev link asked to open the live agent session record. */
  public OnOpenSessionRequested(sessionId: string): void {
    this.requestNavigate('MJ: AI Agent Sessions', sessionId);
  }

  // ── Session review mode ────────────────────────────────────────────────────

  /** Review banner convenience accessors (null-safe against the review data). */
  public get ReviewStartedAt(): Date | null {
    return this._reviewData?.StartedAt ?? null;
  }
  public get ReviewClosedAt(): Date | null {
    return this._reviewData?.ClosedAt ?? null;
  }
  public get ReviewCloseReason(): string | null {
    return this._reviewData?.CloseReason ?? null;
  }

  /** The reviewed session record's id — feeds the banner's dev "Open session" link. */
  public get ReviewSessionID(): string | null {
    return this._reviewData?.SessionID ?? null;
  }

  /**
   * Review controls: resume the reviewed session as a NEW live call (host handles the
   * start). Flags the upcoming ReviewData→null transition as a CONTINUATION so the
   * historical thread is kept (divider appended) instead of cleared.
   */
  public OnStartLive(): void {
    const review = this._reviewData;
    if (!review) {
      return;
    }
    this.pendingLiveContinuation = true;
    this.StartLiveRequested.emit({
      TargetAgentId: review.TargetAgentID,
      ConversationId: review.ConversationID,
      LastSessionId: review.SessionID
    });
  }

  /** Review controls: close the review (host clears its review state). */
  public OnReviewClose(): void {
    this.ReviewClosed.emit();
  }

  /**
   * Enters review: replaces the shared state's thread with the historical items (all
   * chain legs, dividers between legs), names the cards after the reviewed agent,
   * rehydrates the saved whiteboard (when any), and registers the chain's history
   * ARTIFACTS as unfocused surface tabs.
   */
  private enterReview(review: RealtimeSessionReview): void {
    this.State.AgentName = review.AgentName;
    this.State.LoadHistoricalItems(BuildReviewThreadItems(review));
    this.ReviewWhiteboard = this.parseReviewWhiteboard(review);
    this.reviewArtifacts = review.Artifacts ?? [];
    this.ReviewCues = this.buildReviewCues(review);
    if (this.viewReady) {
      // Let this CD pass create/refresh the surface panel before registering the tabs.
      // ngZone.run is REQUIRED: review often opens through the deep-link/query-param
      // path (a plain RxJS stream outside Angular's zone) — without re-entering the
      // zone, the registration's markForCheck never gets a change-detection pass and
      // the Whiteboard tab stays invisible until the user's next click.
      setTimeout(() => this.ngZone.run(() => {
        this.registerReviewBoardTab();
        this.registerReviewArtifactTabs();
        this.registerReviewRecordingTab();
      }), 0);
    }
    // isReviewing flipped on — review always wants the console (marks for check).
    this.recomputeUi();
  }

  /**
   * Builds time-aligned {@link MediaTranscriptCue}s from the reviewed session's turns, for the
   * storage media player's transcript panel. Skips turns with no text; derives each cue's start from
   * `UtteranceStartMs`, falling back to (turn-created − recording-start) ms, else 0. Sorts by start.
   */
  private buildReviewCues(review: RealtimeSessionReview): MediaTranscriptCue[] {
    const startedAt = review.RecordingStartedAt;
    const cues: MediaTranscriptCue[] = [];
    (review.Turns ?? []).forEach((turn, index) => {
      const text = (turn.Text ?? turn.Message ?? '').trim();
      if (text.length === 0) {
        return;
      }
      cues.push({
        Id: turn.ID || `turn-${index}`,
        StartMs: this.reviewCueStartMs(turn, startedAt),
        EndMs: turn.UtteranceEndMs ?? undefined,
        SpeakerLabel: turn.Role === 'User' ? 'You' : review.AgentName,
        Text: text
      });
    });
    cues.sort((a, b) => a.StartMs - b.StartMs);
    return cues;
  }

  /** A review turn's media-relative start (ms): precise offset, else derived from t0, else 0. */
  private reviewCueStartMs(turn: RealtimeSessionReviewTurn, startedAt: Date | null): number {
    if (turn.UtteranceStartMs != null) {
      return turn.UtteranceStartMs;
    }
    if (startedAt && turn.__mj_CreatedAt) {
      return Math.max(0, turn.__mj_CreatedAt.getTime() - startedAt.getTime());
    }
    return 0;
  }

  /**
   * Leaves review. Two distinct exits:
   *  - REVIEW→LIVE CONTINUATION ({@link OnStartLive} was clicked): KEEP the historical
   *    thread and append the "Resumed live session" divider so the new live items read
   *    as a new section of the same conversation. Artifact tabs are left in place — the
   *    chain's artifacts carry into the live session.
   *  - plain CLOSE: clear everything so the conversation view returns clean.
   */
  private exitReview(): void {
    this.ReviewWhiteboard = null;
    this.ReviewCues = [];
    if (this.reviewRecordingTabRegistered) {
      this.surfaceTabs?.RemoveTab('Recording');
      this.pendingChannelTabs = this.pendingChannelTabs.filter(r => r.Key !== 'Recording');
      this.reviewRecordingTabRegistered = false;
    }
    if (this.pendingLiveContinuation) {
      this.pendingLiveContinuation = false;
      this.State.StartLiveContinuation();
    } else {
      this.reviewArtifacts = [];
      this.State.Clear();
    }
    // isReviewing flipped off — re-resolve the chrome/gates (marks for check).
    this.recomputeUi();
  }

  /**
   * Surfaces the reviewed chain's history artifacts inside the Activity tab. In the redesign
   * there are no per-artifact tabs — the artifacts ride the {@link ReviewArtifacts} input into
   * the rail's "Session artifacts" group, so this only needs to ensure the Activity tab is
   * shown (it carries the carryover artifacts). Idempotent; no-op without any review artifacts.
   */
  private registerReviewArtifactTabs(): void {
    if (!this.surfaceTabs || this.reviewArtifacts.length === 0) {
      return;
    }
    // Show the Activity tab (where the carryover artifacts now live); RegisterArtifactTab
    // flips the gate on without opening any tab of its own.
    this.surfaceTabs.RegisterArtifactTab(this.reviewArtifacts[0], false);
    this.cdr.markForCheck();
  }

  /**
   * Rehydrates the reviewed session's saved Whiteboard channel state. TOLERANT: a missing
   * or malformed state returns null — review simply shows no whiteboard tab.
   */
  private parseReviewWhiteboard(review: RealtimeSessionReview): WhiteboardState | null {
    const channel = review.ChannelStates.find(c => c.ChannelName.toLowerCase() === 'whiteboard');
    if (!channel?.StateJson) {
      return null;
    }
    try {
      return WhiteboardState.FromJSON(channel.StateJson);
    } catch {
      console.warn('[RealtimeSessionReview] Saved whiteboard state was malformed — skipping the board tab.');
      return null;
    }
  }

  /**
   * Registers the read-only review whiteboard tab (no-op without a board / template) —
   * FOCUSED: the session's channel surface is what the reviewer came to see; the
   * Activity rail stays available but is never the default focus.
   */
  private registerReviewBoardTab(): void {
    if (!this.ReviewWhiteboard || !this.reviewBoardTpl) {
      return;
    }
    this.RegisterChannelTab({
      Key: 'Whiteboard',
      Title: 'Whiteboard',
      Icon: 'fa-solid fa-chalkboard',
      Content: this.reviewBoardTpl,
      Focus: true
    });
    this.reviewWhiteboardTabRegistered = true;
    this.cdr.markForCheck();
  }

  /**
   * Registers the read-only review RECORDING tab (the time-aligned storage media player) — ONLY when
   * the reviewed session carried a `RecordingFileID`. Idempotent (re-registering the same key updates
   * it in place). The player resolves the authenticated audio itself from the `RecordingFileID` and
   * shows its own no-access / loading states; the click-to-seek transcript is usable immediately.
   * NOT focused — the channel surface / Activity rail keeps the default focus.
   */
  private registerReviewRecordingTab(): void {
    if (!this._reviewData?.RecordingFileID || !this.recordingTpl) {
      return;
    }
    this.RegisterChannelTab({
      Key: 'Recording',
      Title: 'Recording',
      Icon: 'fa-solid fa-circle-play',
      Content: this.recordingTpl
    });
    this.reviewRecordingTabRegistered = true;
    this.cdr.markForCheck();
  }

  /**
   * A working delegation card's ✕ asked to cancel that delegated run — EXPLICIT user
   * intent (barge-in never cancels work, by deliberate policy). The service calls the
   * server cancel channel and flips the card to a failed "Cancelled by user" result.
   */
  public OnCancelDelegation(callId: string): void {
    void this.realtime.CancelDelegation(callId);
  }

  /** Minimizes the live call (it stays running) and asks the host to open the record. */
  private requestNavigate(entityName: string, recordId: string): void {
    this.realtime.SetMinimized(true);
    this.NavigateRequest.emit({ EntityName: entityName, RecordID: recordId });
  }

  // ── Focus layout + pill ────────────────────────────────────────────────────

  /** A channel requested (or released) the focus layout via its host context. */
  private onChannelFocus(channel: BaseRealtimeChannelClient, focused: boolean): void {
    this.ChannelFocusMode = focused;
    this.focusChannel = focused ? channel : null;
    // channelFocus drives the resolver (hides panel + strip) — re-resolve (marks for check).
    this.recomputeUi();
  }

  /** Focus pill: toggle the mic mute (routes through the overlay's single mute path). */
  public OnFocusPillMute(): void {
    this.ToggleMute();
  }

  /** Focus pill: leave focus mode (show the thread column again). */
  public OnFocusPillExit(): void {
    // Route through the focus-holding channel so ITS surface toggle stays in sync — it
    // re-emits SetFocusMode(false) → onChannelFocus. Defensively clear the layout flag
    // too (idempotent), covering channels whose surface isn't instantiated.
    this.focusChannel?.RequestFocusExit();
    this.ChannelFocusMode = false;
    this.focusChannel = null;
  }

  /** Focus pill: end the call (mirrors the controls row's End button). */
  public async OnFocusPillEnd(): Promise<void> {
    await this.realtime.EndRealtimeSession();
    this.Ended.emit();
  }

  /** Short status line for the focus pill (first person — the co-agent owns the work). */
  public FocusStateLabel(state: RealtimeConnectionState): string {
    switch (state) {
      case 'speaking': return `${this.AgentName} is speaking…`;
      case 'thinking': return `${this.AgentName} is working…`;
      case 'listening': return 'Listening';
      case 'connecting': return 'Connecting…';
      default: return '';
    }
  }

  /**
   * The composer dock toggled the mic. Syncs the overlay's single {@link Muted} source (and
   * the focus pill) and surfaces the {@link MuteChanged} / {@link ControlInvoked} outputs.
   */
  public OnComposerMuteChanged(muted: boolean): void {
    if (muted !== this.Muted) {
      this.Muted = muted;
      this.FocusPillMuted = muted;
      this.cdr.markForCheck();
    }
    this.MuteChanged.emit(muted);
    this.ControlInvoked.emit('mute');
  }

  // ── Imperative API — drive the surface from a host via @ViewChild ────────────
  //
  // Each method maps to an existing internal handler/service so behaviour matches the
  // user clicking the corresponding control. See the package README's "Methods" table.

  /**
   * Override the chrome at runtime (equivalent to binding `[Chrome]`). Pass `'auto'` to
   * return to the size/intent-driven default.
   *
   * @param mode the chrome to force.
   * @example `voice.SetChrome('console');`
   */
  public SetChrome(mode: RealtimeChromeMode): void {
    this.setUiInput('chrome', mode);
  }

  /**
   * Reveal the transcript programmatically — the imperative twin of the orb's "Show the
   * conversation" affordance. Raises the text disclosure level, turns captions on, and
   * emits {@link TextRevealed}.
   */
  public RevealText(): void {
    this.OnTextReveal();
  }

  /**
   * Set the mic mute to an explicit state (no-op when already there). Drives the session
   * service, syncs every mute affordance, and emits {@link MuteChanged}.
   *
   * @param muted the desired muted state.
   */
  public SetMuted(muted: boolean): void {
    if (muted === this.Muted) {
      return;
    }
    this.ToggleMute();
  }

  /**
   * Toggle the mic mute. Drives the session service, syncs the overlay's {@link Muted}
   * source + the composer/focus-pill affordances, and emits {@link MuteChanged} +
   * {@link ControlInvoked}.
   */
  public ToggleMute(): void {
    this.Muted = this.realtime.ToggleMute();
    this.FocusPillMuted = this.Muted;
    this.MuteChanged.emit(this.Muted);
    this.ControlInvoked.emit('mute');
    this.cdr.markForCheck();
  }

  /**
   * Set captions (the text-vs-orb preference) to an explicit state. Persisted per-user;
   * turning them on also raises the text disclosure level.
   *
   * @param on whether captions/text should be shown.
   */
  public SetCaptions(on: boolean): void {
    if (on === this.ShowCaptions) {
      return;
    }
    this.OnCaptionsToggled(on);
  }

  /** Toggle captions (the text-vs-orb preference). */
  public ToggleCaptions(): void {
    this.OnCaptionsToggled(!this.ShowCaptions);
  }

  /**
   * Set the UX interface density (the gear's escape hatch). Applied + persisted immediately;
   * emits {@link DensityChanged}.
   *
   * @param density the density to apply.
   */
  public SetDensity(density: RealtimeUxDensity): void {
    this.OnDensityChanged(density);
  }

  /**
   * Open the surface panel (the on-demand Details peek), optionally focusing a specific
   * channel's tab. Equivalent to the strip's Details control plus a channel reveal.
   *
   * @param channelId when supplied, the channel tab to reveal once the panel is shown.
   */
  public OpenSurfacePanel(channelId?: string): void {
    if (!this.DetailsPeek) {
      this.DetailsPeek = true;
      this.ControlInvoked.emit('surface');
      this.recomputeUi();
    }
    setTimeout(() => {
      if (channelId) {
        this.surfaceTabs?.RevealChannel(channelId);
      } else {
        this.surfaceTabs?.FocusFirstTab();
      }
    });
  }

  /** Collapse the surface panel (hide the Details peek). No-op in review (always shown). */
  public CollapseSurfacePanel(): void {
    if (this.IsReviewing || !this.DetailsPeek) {
      return;
    }
    this.DetailsPeek = false;
    this.ControlInvoked.emit('surface');
    this.recomputeUi();
  }

  /** Minimize the call (it stays live) — the imperative twin of the app-bar Minimize. */
  public Minimize(): void {
    this.OnMinimize();
  }

  /** End the session (tear down the call) — the imperative twin of the End control. */
  public EndSession(): void {
    void this.OnEndCall();
  }
}
