import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RealtimeSessionService } from '../../services/realtime-session.service';

/**
 * The call overlay's BOTTOM DOCK — the progressive-disclosure composer
 * (`plans/realtime/mockups/redesign-a-progressive.html`). One component, two shapes,
 * keyed off the overlay's disclosure {@link Level}:
 *
 *  - **Levels 0–1 (phone-call strip)** — big round call controls, centered: Mute, the
 *    Captions toggle (level 1+, arriving WITH the text it controls), the Details peek
 *    (level 0 paths where the surface panel isn't earned yet — lets the user look at the
 *    Activity/Whiteboard panels on demand), the Type control, and End call. There's no visible
 *    composer yet — the Type control opens it, and so does simply starting to type (the overlay
 *    captures the first printable keystroke and seeds it via {@link AppendAndFocus}).
 *  - **Level 2+ (the dock)** — mute/captions shrink to compact minis and the in-call text
 *    input docks beside them (one bottom bar, per Redesign A's fused composer+controls).
 *    Submit calls {@link RealtimeSessionService.SendText}, which injects the text as a user
 *    turn into the SAME live voice call.
 *
 * Mute (mic) and Speaker (the agent's voice, a local output mute that never reaches the
 * provider — the demo-call control) talk to the session service directly (pure local
 * toggles); captions / Details / End are emitted up so the overlay shell owns that state
 * and lifecycle.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-composer',
  imports: [CommonModule, FormsModule],
  templateUrl: './realtime-composer.component.html',
  styleUrl: './realtime-composer.component.css'
})
export class RealtimeComposerComponent {
  /**
   * Whether the typed-input dock is OPEN. A two-way door owned by the user: the strip's
   * Type control (or the T hotkey) opens it; the dock's hide control closes it — typing
   * never becomes permanent chrome. Default closed (voice-first), reset per session.
   */
  @Input() Open = false;

  /**
   * COMPACT (Calm Orb · overlay) presentation: collapse the phone-call strip to the
   * mockup's lean dock — **Mute + End + a "•••"** overflow button. The "•••" blooms a small
   * sheet hosting the secondary actions (Captions / Details / Type). The fused level-2 dock
   * (minis + text input) is unchanged. Fed from the overlay's resolved `Ui.compact`.
   * Default `false` (the full 5-button strip is unchanged).
   */
  @Input() Compact = false;

  /** Emitted when the user opens (Type control / typing) or closes (hide control) the dock. */
  @Output() OpenChanged = new EventEmitter<boolean>();

  /** Whether captions are currently shown (drives the captions control's active state). */
  @Input() CaptionsOn = true;

  /** Whether the Details peek control renders (true until the surface panel is earned). */
  @Input() ShowDetails = false;

  /** Whether the Details peek is currently open (active state on the control). */
  @Input() DetailsOn = false;

  /** Emitted when the user toggles captions; the overlay flips its caption state. */
  @Output() CaptionsToggled = new EventEmitter<boolean>();

  /** Emitted when the user toggles the Details peek (the on-demand surface panel). */
  @Output() DetailsToggled = new EventEmitter<void>();

  /** Emitted when the user ends the call from the strip's End control. */
  @Output() EndRequested = new EventEmitter<void>();

  /** Emitted with the new muted state whenever the user toggles the mic from the dock. */
  @Output() MuteChanged = new EventEmitter<boolean>();

  /** Emitted with the new speaker-muted state whenever the user toggles the agent's sound from the dock. */
  @Output() OutputMuteChanged = new EventEmitter<boolean>();

  /** Current draft text in the dock's composer input. */
  public Draft = '';

  /**
   * The mic mute state. A two-way reflection: the overlay may push it down (e.g. its
   * `SetMuted()` / focus-pill toggle) so all mute affordances stay in sync, and this
   * component updates it locally + emits {@link MuteChanged} when its own button is used.
   */
  @Input() IsMuted = false;

  /**
   * The speaker (agent output) mute state — same two-way reflection as {@link IsMuted}. While
   * on, the agent keeps talking (captions, orb and tool calls continue); the listener just
   * doesn't hear it. Nothing is sent to the provider, so it never interrupts the agent.
   */
  @Input() IsOutputMuted = false;

  @ViewChild('dockInput') private dockInput?: ElementRef<HTMLInputElement | HTMLTextAreaElement>;

  private realtime = inject(RealtimeSessionService);

  /** True when there's non-whitespace text to send. */
  public get CanSend(): boolean {
    return this.Draft.trim().length > 0;
  }

  /** True while the big-controls phone-call strip renders (instead of the dock). */
  public get StripMode(): boolean {
    return !this.Open;
  }

  /**
   * Whether the compact "•••" overflow sheet (Captions / Details / Type) is open. Only used
   * in {@link Compact} strip mode; any outside click or action selection closes it.
   */
  public MoreOpen = false;

  /** Open/close the compact overflow sheet (stops propagation so the outside-click close skips it). */
  public ToggleMore(event: MouseEvent): void {
    event.stopPropagation();
    this.MoreOpen = !this.MoreOpen;
  }

  /** Any outside click closes the compact overflow sheet. */
  @HostListener('document:click')
  public OnDocumentClick(): void {
    if (this.MoreOpen) {
      this.MoreOpen = false;
    }
  }

  /** Toggle the local microphone mute and surface the new state to the overlay. */
  public ToggleMute(): void {
    this.IsMuted = this.realtime.ToggleMute();
    this.MuteChanged.emit(this.IsMuted);
  }

  /** Toggle the local speaker mute (the agent's voice) and surface the new state to the overlay. */
  public ToggleOutputMute(): void {
    this.IsOutputMuted = this.realtime.ToggleOutputMute();
    this.OutputMuteChanged.emit(this.IsOutputMuted);
  }

  /** Tooltip for the speaker control — spells out that muting does NOT stop the agent. */
  public get OutputMuteTitle(): string {
    return this.IsOutputMuted ? 'Unmute speaker' : 'Mute speaker (the agent keeps going, you just won\'t hear it)';
  }

  /** Toggle captions visibility and notify the overlay. */
  public ToggleCaptions(): void {
    this.CaptionsOn = !this.CaptionsOn;
    this.CaptionsToggled.emit(this.CaptionsOn);
  }

  /** Focuses the dock's text input (the overlay's Type control lands here). */
  public FocusInput(): void {
    this.dockInput?.nativeElement.focus();
  }

  /**
   * TYPE-TO-COMPOSE: the overlay captured a printable keystroke while nothing was focused, so seed
   * the draft with that character, focus the input, and put the caret at the end — the user just
   * keeps typing and their first key isn't lost. Appends (rather than replaces) so a leftover draft
   * is preserved. The native value is synced inline so the caret math is correct before Angular's
   * next change-detection pass reconciles ngModel.
   *
   * @param text the character(s) to seed (typically the single key that opened the composer).
   */
  public AppendAndFocus(text: string): void {
    this.Draft = (this.Draft ?? '') + text;
    const el = this.dockInput?.nativeElement;
    if (el) {
      el.value = this.Draft;
      el.focus();
      el.setSelectionRange(this.Draft.length, this.Draft.length);
      this.AutoResize();
    }
  }

  /** Auto-resizes the textarea up to 140px height as text grows or contracts. */
  public AutoResize(): void {
    const el = this.dockInput?.nativeElement;
    if (el && el instanceof HTMLTextAreaElement) {
      el.style.height = 'auto';
      const newHeight = Math.max(24, Math.min(el.scrollHeight, 140));
      el.style.height = `${newHeight}px`;
    }
  }

  /** Send the typed text into the live session, then clear the input. */
  public Send(): void {
    if (!this.CanSend) {
      return;
    }
    this.realtime.SendText(this.Draft);
    this.Draft = '';
    const el = this.dockInput?.nativeElement;
    if (el && el instanceof HTMLTextAreaElement) {
      el.style.height = 'auto';
    }
  }

  /** Enter sends (Shift+Enter inserts a newline in textarea). */
  public OnKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.Send();
    }
  }
}
