import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeConnectionState } from '../../services/realtime-session.service';
import { RealtimeUxDensity } from './realtime-disclosure';

/**
 * The call overlay's UNIFIED APP-BAR (per Redesign A — `plans/realtime/mockups/redesign-a.html`):
 * ONE header that owns identity, state, and every session action.
 *
 *  - LEFT: the glowing agent orb (motion = turn-state), agent name + "Co-Agent" badge,
 *    "speaking as" subline (+ subtle realtime-model suffix), and the state pill that swaps
 *    between a waveform (speaking/listening) and a spinner (connecting/thinking).
 *  - RIGHT (live): STATE + WINDOW-CHROME only — the gear (level 2+, opens a popover hosting the
 *    Simple/Standard/Pro/Auto INTERFACE DENSITY control — the progressive-disclosure escape hatch,
 *    where Simple IS the pure-audio surface — plus the developer-links toggle) and Minimize (hide
 *    the call view, call stays live). Call actions (Mute / Captions / Details / Type / End) live in
 *    the bottom dock, the single home for each; Captions & End used to duplicate here and were
 *    removed, and the standalone pure-audio headphones was folded into the gear's Density = Simple.
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
   * row. The duplicate orb, the redundant state pill, and the headphones / gear / expand
   * controls are dropped — the body already shows the big orb + name + state, and the lean
   * bottom dock (Mute / End / •••) owns the session actions. Minimize stays reachable so the
   * user can hide the call without ending it. Fed from the overlay's resolved `Ui.compact`.
   * Default `false` (the full console banner is unchanged).
   */
  @Input() Compact = false;

  /** Display name of the agent the voice session fronts (e.g. "Sage"). */
  @Input() AgentName = 'the agent';

  /**
   * Display name of the realtime model the live session runs on (e.g. "GPT Realtime 2").
   * Rendered as a subtle suffix in the identity line; hidden when null/empty.
   */
  @Input() ModelName: string | null = null;

  /** Whether developer affordances (the "Open session" link) are revealed (gear-gated). */
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

  /** When reviewing: why the past session closed (`Explicit` | `Janitor` | `Shutdown` | `Error`), when known. */
  @Input() ReviewCloseReason: string | null = null;

  // ── App-bar action cluster (disclosure-gated by the overlay) ────────────────
  // STATE + WINDOW-CHROME only. Captions & End were removed (they duplicated the bottom dock's
  // controls — one home per control), and "pure audio" was folded into the gear's Density = Simple.

  /** Whether the gear (density escape hatch + dev toggle) renders (disclosure level 2+). */
  @Input() ShowGear = false;

  /**
   * Whether the interface-density segmented control renders inside the gear popover.
   * Default `true` (historical behaviour); a host may hide it via the overlay's
   * `[ShowDensityPicker]` input. The gear itself (and its developer-links toggle) still
   * renders when {@link ShowGear} is true even if the density picker is hidden.
   */
  @Input() ShowDensityPicker = true;

  /** Whether the Minimize control renders (live sessions only). */
  @Input() ShowMinimize = false;

  /** The user's current interface-density override (selected state in the gear popover). */
  @Input() Density: RealtimeUxDensity = 'auto';

  /** Emitted with the session record's ID when the dev "Open session" link is clicked. */
  @Output() OpenSessionRequested = new EventEmitter<string>();

  /** Emitted when the user toggles developer links from the gear popover. */
  @Output() DevModeToggled = new EventEmitter<boolean>();

  /** Emitted when the user picks an interface density in the gear popover. */
  @Output() DensityChanged = new EventEmitter<RealtimeUxDensity>();

  /** Emitted when the user minimizes the call view (the call stays live). */
  @Output() MinimizeRequested = new EventEmitter<void>();

  /** Review only: the user asked to RESUME the reviewed session as a new live call. */
  @Output() StartLiveRequested = new EventEmitter<void>();

  /** Review only: the user asked to close the review and return to the conversation. */
  @Output() CloseRequested = new EventEmitter<void>();

  /** Whether the gear popover is open (closed by any outside click). */
  public GearOpen = false;

  /** The density choices the gear popover offers, in display order. */
  public readonly Densities: ReadonlyArray<{ Key: RealtimeUxDensity; Label: string }> = [
    { Key: 'simple', Label: 'Simple' },
    { Key: 'standard', Label: 'Standard' },
    { Key: 'pro', Label: 'Pro' },
    { Key: 'auto', Label: 'Auto' }
  ];

  /** True when the dev "Open session" link should render (gear on + session id known). */
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

  /** Gear popover: pick an interface density (the overlay applies + persists it). */
  public SelectDensity(density: RealtimeUxDensity): void {
    this.DensityChanged.emit(density);
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
      case 'error': return 'Connection error';
      case 'closed': return 'Call ended';
      default: return '';
    }
  }

  /** True while the state pill should show a spinner instead of the waveform. */
  public IsBusy(state: RealtimeConnectionState): boolean {
    return state === 'connecting' || state === 'thinking';
  }
}
