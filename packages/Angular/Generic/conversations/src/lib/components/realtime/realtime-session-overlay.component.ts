import { Component, ElementRef, EventEmitter, HostListener, Input, Output, OnDestroy, AfterViewInit, ChangeDetectorRef, NgZone, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { VoiceConnectionState, RealtimeSessionService } from '../../services/realtime-session.service';
import { ParsedDelegationArtifact } from '../../services/delegation-result-parser';
import { BuildReviewThreadItems, RealtimeSessionReview } from '../../services/realtime-session-review.service';
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
import { RealtimeAudioVisualFrame, RealtimeAudioVisualSmoother, RealtimeVoiceDirection } from './realtime-audio-visuals';
import { RealtimeChannelTabRegistration, ShouldRemoveReviewWhiteboardTab } from './realtime-surface-tabs.model';
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
    RealtimeWhiteboardBoardComponent
  ],
  templateUrl: './realtime-session-overlay.component.html',
  styleUrl: './realtime-session-overlay.component.css'
})
export class RealtimeSessionOverlayComponent implements AfterViewInit, OnDestroy {
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
    if (value && !this.voice.IsActive) {
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

  private voice = inject(RealtimeSessionService);
  private cdr = inject(ChangeDetectorRef);

  private _reviewData: RealtimeSessionReview | null = null;

  /**
   * Set by {@link OnStartLive} just before emitting {@link StartLiveRequested}, so the
   * ReviewData→null transition that follows is recognized as a REVIEW→LIVE CONTINUATION
   * (keep the historical thread + append the "Resumed live session" divider) rather than
   * a plain review close (clear everything).
   */
  private pendingLiveContinuation = false;

  /** The reviewed chain's history artifacts, registered as unfocused surface tabs. */
  private reviewArtifacts: ParsedDelegationArtifact[] = [];

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
    return this._reviewData !== null && !this.voice.IsActive;
  }

  /**
   * The reviewed session's rehydrated whiteboard, when it saved a parseable Whiteboard
   * channel state — rendered read-only by the review whiteboard tab. Null = no tab.
   */
  public ReviewWhiteboard: WhiteboardState | null = null;

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
  public readonly ConnectionState$ = this.voice.ConnectionState$;

  /** Server-reported realtime model name for the active session — shown subtly in the banner. */
  public readonly ModelName$ = this.voice.ModelName$;

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
    return this.voice.CurrentAgentSessionId;
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
      // A (re)created panel starts with a FRESH tab model: artifact tabs self-recover
      // (the panel re-scans the session state) but CHANNEL tabs only registered when
      // ActiveChannels$ emitted at session start — re-register the live set here so
      // hiding the panel (pure-audio return, Details off) never loses the Whiteboard.
      this.registerChannelTabs([...this.voice.ActiveChannels]);
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
    this.loadPanelWidthPref();
    this.loadDisclosurePref();
    this.loadCaptionsPref();
    this.State.Attach(this.voice);
    this.subs.push(
      // Re-render on merged-state changes; content arrival raises the disclosure level.
      this.State.Changed$.subscribe(() => this.onSessionStateChanged()),
      this.Disclosure.Changed$.subscribe(() => this.cdr.markForCheck()),
      // One surface tab per registry-resolved channel plugin (replays the current set).
      this.voice.ActiveChannels$.subscribe(channels => this.registerChannelTabs(channels)),
      // Any channel may request the focus layout through its host context.
      this.voice.ChannelFocus$.subscribe(event => this.onChannelFocus(event.Channel, event.Focused)),
      // The agent ACTED on a channel — auto-reveal its surface tab on first activity.
      this.voice.ChannelActivity$.subscribe(plugin => this.onChannelActivity(plugin)),
      // Live/idle flips: reset/ratchet disclosure + re-evaluate the review-vs-live branch.
      this.voice.Active$.subscribe(active => this.onActiveChanged(active))
    );
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.flushPendingChannelTabs();
    this.registerReviewBoardTab();
    this.registerReviewArtifactTabs();
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

  /** Resizing is meaningless while collapsed or when the surface fills (focus mode). */
  public get PanelResizeDisabled(): boolean {
    return this.PanelCollapsed || this.ChannelFocusMode;
  }

  public OnPanelCollapsedChange(collapsed: boolean): void {
    this.PanelCollapsed = collapsed;
    this.cdr.markForCheck();
  }

  /** Wide-tier flips only move the DEFAULT width — an explicit user width always wins. */
  public OnPanelWideChanged(wide: boolean): void {
    this.PanelWide = wide;
    if (this.userPanelWidth === null) {
      this.PanelWidthPx = DefaultSurfacePanelWidth(wide, this.hostWidth());
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
    if (IsSurfacePanelDrag(this.panelResizeStartX, event.clientX)) {
      this.userPanelWidth = this.PanelWidthPx;
      this.persistPanelWidth(this.PanelWidthPx);
    } else {
      this.PanelWidthPx = this.panelResizeStartWidth;
    }
    this.ngZone.run(() => {
      this.IsPanelResizing = false;
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
   * True while the PURE-AUDIO hero (the orb) owns the main column. The captions
   * preference IS the text-vs-orb switch: captions off (the voice-first default) shows
   * the breathing orb at ANY disclosure level; captions on shows the thread. Review
   * always shows the thread.
   */
  public get ShowHero(): boolean {
    return !this.IsReviewing && !this.ShowCaptions;
  }

  /**
   * Whether the surface-panel area renders. The tabs have their OWN control (the
   * Details toggle, plus the board auto-reveal and artifact-view requests) — they are
   * deliberately DECOUPLED from typing/disclosure levels: revealing the composer must
   * never surprise the user with the whole tab panel.
   */
  public get ShowPanelArea(): boolean {
    return this.IsReviewing || this.DetailsPeek;
  }

  /** The Details (tabs) toggle is always offered while live — it's the panel's one door. */
  public get ShowDetailsControl(): boolean {
    return !this.IsReviewing;
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
    this.cdr.markForCheck();
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
    if (this.surfaceTabs) {
      // Stream handler (a tool call), not a change-detection pass — reveal synchronously
      // so the board is the visible tab the instant the agent's first stroke lands.
      this.surfaceTabs.RevealChannel(plugin.ChannelName);
    } else {
      // Panel not rendered yet (the peek just created it) — reveal once it exists.
      this.pendingRevealKey = plugin.ChannelName;
    }
    this.cdr.markForCheck();
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
  private lastVoiceDirection: RealtimeVoiceDirection | null = null;

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
        const frame = this.audioSmoother.Next(this.voice.GetAudioActivity(), performance.now());
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
    this.lastVoiceDirection = null;
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
    if (frame.Direction !== this.lastVoiceDirection) {
      this.lastVoiceDirection = frame.Direction;
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
    this.cdr.markForCheck();
  }

  /** The gear popover picked an interface density — apply + persist immediately. */
  public OnDensityChanged(density: RealtimeUxDensity): void {
    this.Disclosure.SetDensity(density);
    this.persistDisclosure(SerializeUxMilestones(this.Disclosure.Milestones));
  }

  /** The hero's "Show the conversation" affordance — turns the text preference on. */
  public OnTextReveal(): void {
    this.OnCaptionsToggled(true);
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
    this.cdr.markForCheck();
  }

  /** App-bar Minimize: hide the call view (CSS) — the call stays fully live. */
  public OnMinimize(): void {
    this.voice.SetMinimized(true);
  }

  /** App-bar / strip End: tear the session down, then notify the host. */
  public async OnEndCall(): Promise<void> {
    await this.voice.EndVoiceSession();
    this.Ended.emit();
  }

  /** Maps the realtime state onto the hero orb's `data-state` (active turn-states only). */
  public HeroOrbState(state: VoiceConnectionState): 'speaking' | 'listening' | 'thinking' {
    switch (state) {
      case 'speaking': return 'speaking';
      case 'thinking': return 'thinking';
      default: return 'listening';
    }
  }

  /** Short first-person status line for the pure-audio hero. */
  public HeroStateLabel(state: VoiceConnectionState): string {
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
    if (this.Hidden || this.IsReviewing || !this.voice.IsActive) {
      return;
    }
    if ((event.key !== 't' && event.key !== 'T') || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    event.preventDefault();
    this.OnComposerOpenChanged(true);
    // The dock may have just been created — focus after this CD pass.
    setTimeout(() => this.composer?.FocusInput());
  }

  /**
   * The composer dock opened (strip Type control / T hotkey) or closed (the dock's hide
   * control). Opening raises the 'engaged' milestone for the cross-session ratchet —
   * but the dock itself stays a per-session, user-owned toggle either way.
   */
  public OnComposerOpenChanged(open: boolean): void {
    this.ComposerOpen = open;
    if (open) {
      this.Disclosure.Raise('engaged');
      setTimeout(() => this.composer?.FocusInput());
    }
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.stopAudioVisualLoop();
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

  /** Registers one surface tab per active channel plugin (key/title/icon from the plugin). */
  private registerChannelTabs(channels: BaseRealtimeChannelClient[]): void {
    this.cleanupStaleReviewBoardTab(channels);
    for (const plugin of channels) {
      this.RegisterChannelTab({
        Key: plugin.ChannelName,
        Title: plugin.TabTitle,
        Icon: plugin.TabIcon,
        Plugin: plugin
      });
    }
    this.cdr.markForCheck();
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
    if (ShouldRemoveReviewWhiteboardTab(this.voice.IsActive, this.reviewWhiteboardTabRegistered, channels)) {
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
      this.Disclosure.Raise('text');
    }
    this.persistCaptionsPref();
    this.cdr.markForCheck();
  }

  /** Reflect the gear toggle from the controls into the dev affordances. */
  public OnDevModeToggled(on: boolean): void {
    this.DevMode = on;
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
    if (this.viewReady) {
      // Let this CD pass create/refresh the surface panel before registering the tabs.
      // ngZone.run is REQUIRED: review often opens through the deep-link/query-param
      // path (a plain RxJS stream outside Angular's zone) — without re-entering the
      // zone, the registration's markForCheck never gets a change-detection pass and
      // the Whiteboard tab stays invisible until the user's next click.
      setTimeout(() => this.ngZone.run(() => {
        this.registerReviewBoardTab();
        this.registerReviewArtifactTabs();
      }), 0);
    }
    this.cdr.markForCheck();
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
    if (this.pendingLiveContinuation) {
      this.pendingLiveContinuation = false;
      this.State.StartLiveContinuation();
    } else {
      this.reviewArtifacts = [];
      this.State.Clear();
    }
    this.cdr.markForCheck();
  }

  /** Registers the reviewed chain's history artifacts as UNFOCUSED artifact tabs (idempotent). */
  private registerReviewArtifactTabs(): void {
    if (!this.surfaceTabs || this.reviewArtifacts.length === 0) {
      return;
    }
    for (const artifact of this.reviewArtifacts) {
      this.surfaceTabs.RegisterArtifactTab(artifact, false);
    }
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
   * A working delegation card's ✕ asked to cancel that delegated run — EXPLICIT user
   * intent (barge-in never cancels work, by deliberate policy). The service calls the
   * server cancel channel and flips the card to a failed "Cancelled by user" result.
   */
  public OnCancelDelegation(callId: string): void {
    void this.voice.CancelDelegation(callId);
  }

  /** Minimizes the live call (it stays running) and asks the host to open the record. */
  private requestNavigate(entityName: string, recordId: string): void {
    this.voice.SetMinimized(true);
    this.NavigateRequest.emit({ EntityName: entityName, RecordID: recordId });
  }

  // ── Focus layout + pill ────────────────────────────────────────────────────

  /** A channel requested (or released) the focus layout via its host context. */
  private onChannelFocus(channel: BaseRealtimeChannelClient, focused: boolean): void {
    this.ChannelFocusMode = focused;
    this.focusChannel = focused ? channel : null;
    this.cdr.markForCheck();
  }

  /** Focus pill: toggle the mic mute. */
  public OnFocusPillMute(): void {
    this.FocusPillMuted = this.voice.ToggleMute();
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
    await this.voice.EndVoiceSession();
    this.Ended.emit();
  }

  /** Short status line for the focus pill (first person — the co-agent owns the work). */
  public FocusStateLabel(state: VoiceConnectionState): string {
    switch (state) {
      case 'speaking': return `${this.AgentName} is speaking…`;
      case 'thinking': return `${this.AgentName} is working…`;
      case 'listening': return 'Listening';
      case 'connecting': return 'Connecting…';
      default: return '';
    }
  }
}
