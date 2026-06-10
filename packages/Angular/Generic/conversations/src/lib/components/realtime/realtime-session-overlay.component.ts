import { Component, EventEmitter, Input, Output, OnDestroy, AfterViewInit, ChangeDetectorRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { UserInfo } from '@memberjunction/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { VoiceConnectionState, VoiceSessionService } from '../../services/voice-session.service';
import { ParsedDelegationArtifact } from '../../services/delegation-result-parser';
import { RealtimeSessionState } from './realtime-session-state';
import { RealtimeAgentBannerComponent } from './realtime-agent-banner.component';
import { RealtimeSessionThreadComponent } from './realtime-session-thread.component';
import { RealtimeChannelStripComponent } from './realtime-channel-strip.component';
import { RealtimeComposerComponent } from './realtime-composer.component';
import { RealtimeControlsComponent } from './realtime-controls.component';
import { RealtimeSurfaceTabsComponent } from './realtime-surface-tabs.component';
import { RealtimeChannelTabRegistration } from './realtime-surface-tabs.model';
import { BaseRealtimeChannelClient } from './channels/base-realtime-channel-client';

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
 * The "call mode" overlay for a live real-time voice session. Hosted by the
 * conversation chat area (`<mj-conversation-chat-area>`) behind `Active$`, it fills the
 * conversation panel IN PLACE (`position:absolute; inset:0` over the panel — not a
 * fixed app-wide dialog), replacing the conversation view including the composer.
 *
 * Two-column layout:
 *  - MAIN column — {@link RealtimeAgentBannerComponent} (compact identity + turn-state),
 *    the unified {@link RealtimeSessionThreadComponent}, the channel strip, the in-call
 *    {@link RealtimeComposerComponent} and {@link RealtimeControlsComponent}.
 *  - RIGHT PANEL — {@link RealtimeSurfaceTabsComponent}: the TABBED surface panel.
 *    Tab 1 "Activity" hosts the session activity rail; one tab opens per ARTIFACT a
 *    delegated run produces (auto-focused + flashed on arrival, viewed read-only via the
 *    standard artifact viewer); ONE TAB PER INTERACTIVE CHANNEL the session resolved from
 *    the `MJ: AI Agent Channels` registry. Collapsible to a slim strip at the panel level.
 *
 * INTERACTIVE CHANNELS ARE PLUGINS — this shell is channel-agnostic. It subscribes
 * {@link VoiceSessionService.ActiveChannels$} and registers one surface tab per
 * {@link BaseRealtimeChannelClient} (key/title/icon from the plugin); the tab pane creates
 * the plugin's surface component dynamically and the PLUGIN wires its own inputs/outputs.
 * The only channel-generic affordance the shell owns is the FOCUS layout: any channel may
 * request it (via its context's `SetFocusMode` → {@link VoiceSessionService.ChannelFocus$}),
 * which collapses the main call column (`.board-focus`) and shows the floating call pill.
 *
 * Owns the shared {@link RealtimeSessionState} — the SINGLE merge of the service's
 * caption/delegation/narration streams — and passes it to both thread and rail via
 * inputs, so neither duplicates subscription logic.
 *
 * DEVELOPER MODE: the controls row's gear toggles {@link DevMode} (per-session, off by
 * default, never persisted), revealing "Open run" links on delegation cards / rail items
 * and an "Open session" link in the banner. Clicking one emits {@link NavigateRequest}
 * and MINIMIZES the call (via {@link VoiceSessionService.SetMinimized}) — the session
 * stays live while the host navigates to the record.
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
    RealtimeControlsComponent,
    RealtimeSurfaceTabsComponent
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

  /** Emitted after the call ends so the host can react (visibility is driven by Active$). */
  @Output() Ended = new EventEmitter<void>();

  /**
   * Emitted when a gear-gated developer link asks to open an entity record. The host is
   * expected to bubble this through its standard record-open path (the chat area re-emits
   * it on `openEntityRecord`, which Explorer routes via `NavigationService`). The overlay
   * minimizes itself first so the live call survives the navigation.
   */
  @Output() NavigateRequest = new EventEmitter<RealtimeNavigateRequest>();

  private voice = inject(VoiceSessionService);
  private cdr = inject(ChangeDetectorRef);

  /** Shared session state — single source for the thread AND the activity rail. */
  public readonly State = new RealtimeSessionState();

  /** Live turn-state from the session service — drives the banner + connecting screen. */
  public readonly ConnectionState$ = this.voice.ConnectionState$;

  /** Server-reported realtime model name for the active session — shown subtly in the banner. */
  public readonly ModelName$ = this.voice.ModelName$;

  /** Whether caption bubbles are shown in the thread (toggled from the controls). */
  public ShowCaptions = true;

  /**
   * Whether developer affordances (open-record links) are revealed. Per-session view
   * state on this shell — off by default, reset with the overlay, never persisted.
   */
  public DevMode = false;

  /** ID of the live server-side agent session record, for the banner's dev link. */
  public get SessionID(): string | null {
    return this.voice.CurrentAgentSessionId;
  }

  /** The tabbed surface panel (right panel) — channel registrations are forwarded to it. */
  @ViewChild(RealtimeSurfaceTabsComponent) private surfaceTabs?: RealtimeSurfaceTabsComponent;

  /** Channel registrations received before the surface panel rendered (flushed in ngAfterViewInit). */
  private pendingChannelTabs: RealtimeChannelTabRegistration[] = [];

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
    this.State.Attach(this.voice);
    this.subs.push(
      this.State.Changed$.subscribe(() => this.cdr.markForCheck()),
      // One surface tab per registry-resolved channel plugin (replays the current set).
      this.voice.ActiveChannels$.subscribe(channels => this.registerChannelTabs(channels)),
      // Any channel may request the focus layout through its host context.
      this.voice.ChannelFocus$.subscribe(event => this.onChannelFocus(event.Channel, event.Focused))
    );
  }

  ngAfterViewInit(): void {
    this.flushPendingChannelTabs();
  }

  ngOnDestroy(): void {
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

  /** A done delegation card / rail entry asked to view a produced artifact's tab. */
  public OnOpenArtifactRequested(artifact: ParsedDelegationArtifact): void {
    this.surfaceTabs?.FocusArtifact(artifact);
  }

  /** Registers one surface tab per active channel plugin (key/title/icon from the plugin). */
  private registerChannelTabs(channels: BaseRealtimeChannelClient[]): void {
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

  /** Forwards channel registrations that arrived before the panel existed. */
  private flushPendingChannelTabs(): void {
    if (this.surfaceTabs && this.pendingChannelTabs.length > 0) {
      for (const reg of this.pendingChannelTabs) {
        this.surfaceTabs.RegisterChannelTab(reg);
      }
      this.pendingChannelTabs = [];
    }
  }

  /** Reflect the captions toggle from the controls into the thread. */
  public OnCaptionsToggled(on: boolean): void {
    this.ShowCaptions = on;
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

  /** Bubble up the end-of-call. */
  public OnEnded(): void {
    this.Ended.emit();
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
