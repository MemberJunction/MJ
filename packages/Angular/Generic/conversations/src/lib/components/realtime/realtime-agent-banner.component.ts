import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeConnectionState } from '@memberjunction/realtime-runtime';
import { RealtimeUxDensity } from './realtime-disclosure';

/**
 * The call overlay's UNIFIED APP-BAR (per Redesign A — `plans/realtime/mockups/redesign-a.html`):
 * ONE header that owns identity, state, and every session action.
 *
 *  - LEFT: the glowing agent orb (motion = turn-state), the agent's name, and the state pill
 *    that swaps between a waveform (speaking/listening) and a spinner (connecting/thinking).
 *  - RIGHT (live): Details (opens the side panels), the gear (opens a "This call" popover with
 *    the call details — agent, who voices it, model — the "Open session record" dev link and the
 *    developer-links toggle) and Minimize (hide the call view, call stays live). Call actions
 *    (Mute / Captions / Type / End) live in the bottom dock.
 *  - RIGHT (review): "Start live session" (resume, affirmative leads) + Close — the
 *    review session's exit lives up here in the header bar, not floating in the body.
 *
 * Which controls render is decided by the OVERLAY (it owns the disclosure model) and
 * passed down as booleans — this component stays purely presentational.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-agent-banner',
  imports: [CommonModule],
  templateUrl: './realtime-agent-banner.component.html',
  styleUrl: './realtime-agent-banner.component.css'
})
export class RealtimeAgentBannerComponent {
  /** Current connection / turn state — drives the orb animation + state label. */
  @Input({ required: true }) State!: RealtimeConnectionState;

  /**
   * COMPACT (orb/overlay) presentation: collapse the app-bar to a minimal identity + state
   * row (avatar initial, name, state chip) with Details, the gear and Minimize on the right.
   * The body already shows the big orb + name + state, and the lean bottom dock owns the
   * call actions. Fed from the overlay's resolved `Ui.compact`.
   * Default `false` (the full console banner is unchanged).
   */
  @Input() Compact = false;

  /**
   * Whether to suppress the turn-state pill in the banner
   * because the center hero orb is already displaying the agent's name and live turn state.
   */
  @Input() HideState = false;

  /** Display name of the agent the voice session fronts (e.g. "Sage"). */
  @Input() AgentName = 'the agent';

  /**
   * What the state label says in the `'error'` state when the call said why it ended (`DescribeCallEnd`'s `Label`, such
   * as "Time limit reached"); `null` keeps "Connection error".
   */
  @Input() ErrorLabel: string | null = null;

  /**
   * Display name of the realtime model the live session runs on (e.g. "GPT Realtime 2").
   * Shown as the "Model" row in the gear popover's call details; the row is omitted when null/empty.
   */
  @Input() ModelName: string | null = null;

  /** Whether developer affordances (the "Open session record" link) are revealed (gear-gated). */
  @Input() DevMode = false;

  /** ID of the server-side agent session record (`MJ: AI Agent Sessions`), when known. */
  @Input() SessionID: string | null = null;

  /**
   * SESSION REVIEW presentation: the banner shows the past session's identity
   * (review badge, started→closed range, close-reason chip) instead of live turn-state,
   * and the action cluster swaps to Start-live + Close.
   */
  @Input() ReviewMode = false;

  /** When reviewing: when the past session started (`__mj_CreatedAt`). */
  @Input() ReviewStartedAt: Date | null = null;

  /** When reviewing: when the past session closed (null while it is still open). */
  @Input() ReviewClosedAt: Date | null = null;

  /** When reviewing: why the past session closed (`Explicit` | `Janitor` | `Shutdown` | `Error` | `TimeLimit` | `Idle`), when known. */
  @Input() ReviewCloseReason: string | null = null;

  // ── App-bar action cluster (disclosure-gated by the overlay) ────────────────

  /** Whether the Details button (opens/closes the transcript + session side panels) renders. */
  @Input() ShowDetails = false;

  /** Whether the side panels are currently shown (the Details button's pressed state). */
  @Input() DetailsOn = false;

  /**
   * Whether the gear (call details + dev links) renders (disclosure level 2+). Taking the
   * gear away also closes its popover, so no empty popover outlives the button that opened it.
   */
  @Input()
  set ShowGear(value: boolean) {
    this._showGear = value;
    if (!value) {
      this.GearOpen = false;
    }
  }
  get ShowGear(): boolean {
    return this._showGear;
  }
  private _showGear = false;

  /**
   * @deprecated The call has one layout; this no longer has any effect.
   */
  @Input() ShowDensityPicker = true;

  /**
   * Host ceiling for developer links: `false` removes the gear's "Developer links" toggle.
   * Per-session {@link DevMode} still decides whether links render when allowed.
   */
  @Input() AllowDevLinks = true;

  /** Whether the Minimize control renders (live sessions only). */
  @Input() ShowMinimize = false;

  /** Review only: whether the "Start live session" action renders. */
  @Input() ShowStartLive = true;

  /**
   * @deprecated The call has one layout; this no longer has any effect.
   */
  @Input() Density: RealtimeUxDensity = 'auto';

  /** Emitted with the session record's ID when the dev "Open session" link is clicked. */
  @Output() OpenSessionRequested = new EventEmitter<string>();

  /** Emitted when the user toggles developer links from the gear popover. */
  @Output() DevModeToggled = new EventEmitter<boolean>();

  /**
   * @deprecated The call has one layout; this no longer has any effect. Never emitted.
   */
  @Output() DensityChanged = new EventEmitter<RealtimeUxDensity>();

  /** Emitted when the user clicks Details to show or hide the side panels. */
  @Output() DetailsToggled = new EventEmitter<void>();

  /** Emitted when the user minimizes the call view (the call stays live). */
  @Output() MinimizeRequested = new EventEmitter<void>();

  /** Review only: the user asked to RESUME the reviewed session as a new live call. */
  @Output() StartLiveRequested = new EventEmitter<void>();

  /** Review only: the user asked to close the review and return to the conversation. */
  @Output() CloseRequested = new EventEmitter<void>();

  /** Whether the gear popover is open (closed by any outside click). */
  public GearOpen = false;

  /** Tooltip for the Details button, by its pressed state. */
  public get DetailsTitle(): string {
    return this.DetailsOn ? 'Hide the session panels' : 'Show the session panels';
  }

  /** True when the dev "Open session record" link should render (gear on + session id known). */
  public get ShowOpenSession(): boolean {
    return this.DevMode && !!this.SessionID;
  }

  /** Emits the open-session request for the live agent session record. */
  public OpenSession(): void {
    if (this.SessionID) {
      this.OpenSessionRequested.emit(this.SessionID);
    }
  }

  /** Opens/closes the gear popover (stops propagation so the outside-click close skips it). */
  public ToggleGear(event: MouseEvent): void {
    event.stopPropagation();
    this.GearOpen = !this.GearOpen;
  }

  /** Any outside click closes the gear popover. */
  @HostListener('document:click')
  public OnDocumentClick(): void {
    if (this.GearOpen) {
      this.GearOpen = false;
    }
  }

  /** Gear popover: toggle developer links. */
  public ToggleDev(): void {
    this.DevMode = !this.DevMode;
    this.DevModeToggled.emit(this.DevMode);
  }

  /** The review banner's "started → closed" time-range label (empty when the start is unknown). */
  public get ReviewRangeLabel(): string {
    if (!this.ReviewStartedAt) {
      return '';
    }
    const start = this.formatStamp(this.ReviewStartedAt);
    if (!this.ReviewClosedAt) {
      return start;
    }
    return `${start} → ${this.formatStamp(this.ReviewClosedAt, this.ReviewStartedAt)}`;
  }

  /** Human label for the close-reason chip (empty hides the chip). */
  public get ReviewCloseReasonLabel(): string {
    switch (this.ReviewCloseReason) {
      case 'Explicit': return 'Ended by user';
      case 'Janitor': return 'Closed by janitor';
      case 'TimeLimit': return 'Time limit';
      case 'Idle': return 'Idle — no activity';
      case 'Shutdown': return 'Closed at shutdown';
      case 'Error': return 'Ended with error';
      default: return '';
    }
  }

  /** Compact date+time stamp; same-day end stamps drop the redundant date part. */
  private formatStamp(date: Date, sameDayAs?: Date | null): string {
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
    if (sameDayAs && date.toDateString() === sameDayAs.toDateString()) {
      return time;
    }
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  }

  /** Maps the realtime state to the orb's `data-state` (the orb only models active turn-states). */
  public OrbState(state: RealtimeConnectionState): 'speaking' | 'listening' | 'thinking' {
    switch (state) {
      case 'speaking': return 'speaking';
      case 'thinking': return 'thinking';
      default: return 'listening';
    }
  }

  /** Human-readable state label, agent-aware where it reads better. */
  public StateLabel(state: RealtimeConnectionState): string {
    switch (state) {
      case 'connecting': return 'Connecting…';
      case 'listening': return 'Listening';
      case 'speaking': return `${this.AgentName} is speaking…`;
      case 'thinking': return 'Working on it…';
      case 'error': return this.ErrorLabel ?? 'Connection error';
      case 'closed': return 'Call ended';
      default: return '';
    }
  }

  /** True while the state pill should show a spinner instead of the waveform. */
  public IsBusy(state: RealtimeConnectionState): boolean {
    return state === 'connecting' || state === 'thinking';
  }
}
