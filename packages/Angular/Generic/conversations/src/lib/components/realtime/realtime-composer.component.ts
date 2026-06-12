import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VoiceSessionService } from '../../services/voice-session.service';

/**
 * The call overlay's BOTTOM DOCK — the progressive-disclosure composer
 * (`plans/realtime/mockups/redesign-a-progressive.html`). One component, two shapes,
 * keyed off the overlay's disclosure {@link Level}:
 *
 *  - **Levels 0–1 (phone-call strip)** — big round call controls, centered: Mute, the
 *    Captions toggle (level 1+, arriving WITH the text it controls), the Details peek
 *    (level 0 paths where the surface panel isn't earned yet — lets the user look at the
 *    Activity/Whiteboard panels on demand), and End call. Level 1 adds the whispered
 *    "press T to type" hint — typing exists, but there's no visible composer yet.
 *  - **Level 2+ (the dock)** — mute/captions shrink to compact minis and the in-call text
 *    input docks beside them (one bottom bar, per Redesign A's fused composer+controls).
 *    Submit calls {@link VoiceSessionService.SendText}, which injects the text as a user
 *    turn into the SAME live voice call.
 *
 * Mute talks to the session service directly (pure local toggle); captions / Details /
 * End are emitted up so the overlay shell owns that state and lifecycle.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-composer',
  imports: [CommonModule, FormsModule],
  templateUrl: './realtime-composer.component.html',
  styleUrl: './realtime-composer.component.css'
})
export class RealtimeComposerComponent {
  /** The overlay's current disclosure level (0–4) — picks the strip vs dock shape. */
  @Input() Level = 0;

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

  /** Current draft text in the dock's composer input. */
  public Draft = '';

  /** Local mic mute state, reflected from the service. */
  public IsMuted = false;

  @ViewChild('dockInput') private dockInput?: ElementRef<HTMLInputElement>;

  private voice = inject(VoiceSessionService);

  /** True when there's non-whitespace text to send. */
  public get CanSend(): boolean {
    return this.Draft.trim().length > 0;
  }

  /** True while the big-controls phone-call strip renders (instead of the dock). */
  public get StripMode(): boolean {
    return this.Level < 2;
  }

  /** Toggle the local microphone mute. */
  public ToggleMute(): void {
    this.IsMuted = this.voice.ToggleMute();
  }

  /** Toggle captions visibility and notify the overlay. */
  public ToggleCaptions(): void {
    this.CaptionsOn = !this.CaptionsOn;
    this.CaptionsToggled.emit(this.CaptionsOn);
  }

  /** Focuses the dock's text input (the overlay's T-to-type hotkey lands here). */
  public FocusInput(): void {
    this.dockInput?.nativeElement.focus();
  }

  /** Send the typed text into the live session, then clear the input. */
  public Send(): void {
    if (!this.CanSend) {
      return;
    }
    this.voice.SendText(this.Draft);
    this.Draft = '';
  }

  /** Enter sends (Shift+Enter is free for future multiline if the input becomes a textarea). */
  public OnKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.Send();
    }
  }
}
